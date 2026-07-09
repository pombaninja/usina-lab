-- Dosagem Marshall do projeto (curvas de projeto multi-teor) — Módulo 1 do
-- Projeto CAUQ completo. Distinta do ensaio Marshall diário (cauq_marshall/
-- cauq_marshall_cp), que testa um único teor; aqui testam-se vários teores
-- (3 CPs cada) para levantar as curvas de dosagem e sugerir o teor ótimo.

create table projeto_marshall (
  dosagem_id uuid primary key references dosagens(id) on delete cascade,
  densidade_real_cap numeric not null default 1.004,
  constante_prensa numeric not null default 1.79,
  correcao_fluencia numeric not null default 1,
  criado_em timestamptz not null default now()
);

create table projeto_marshall_cp (
  id uuid primary key default gen_random_uuid(),
  dosagem_id uuid not null references dosagens(id) on delete cascade,
  teor numeric not null,
  cp int not null check (cp between 1 and 4),
  peso_ar numeric, peso_imerso numeric, rice_teorica numeric,
  leitura_estabilidade numeric, fator_correcao numeric, altura_cm numeric, leitura_fluencia numeric,
  unique (dosagem_id, teor, cp)
);

alter table projeto_marshall enable row level security;
alter table projeto_marshall_cp enable row level security;

create policy sel_pm on projeto_marshall for select using (usuario_ativo());
create policy sel_pmcp on projeto_marshall_cp for select using (usuario_ativo());
create policy wr_pm on projeto_marshall for all using (tem_papel('ensaios_usina', array['avaliador','admin'])) with check (tem_papel('ensaios_usina', array['avaliador','admin']));
create policy wr_pmcp on projeto_marshall_cp for all using (tem_papel('ensaios_usina', array['avaliador','admin'])) with check (tem_papel('ensaios_usina', array['avaliador','admin']));

-- Cascata de imutabilidade de revisão antiga (mesmo padrão de dosagem_composicao,
-- ver fn_bloqueia_composicao_revisao_antiga em 20260708000014): a dosagem Marshall
-- de projeto de uma revisão que não é mais a mais recente da família fica congelada.
create or replace function fn_bloqueia_pm_revisao_antiga() returns trigger language plpgsql as $$
declare v_dos uuid; v_familia uuid; v_max int; v_rev int;
begin
  v_dos := (case when tg_op='DELETE' then old else new end).dosagem_id;
  select revisao, coalesce(projeto_pai_id, id) into v_rev, v_familia from dosagens where id=v_dos;
  if v_familia is null then return case when tg_op='DELETE' then old else new end; end if;
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id)=v_familia;
  if v_rev < v_max then raise exception 'Dosagem Marshall de revisão antiga é imutável. Edite a revisão mais recente ou crie uma nova.'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger trg_pm_rev before update or delete on projeto_marshall for each row execute function fn_bloqueia_pm_revisao_antiga();
create trigger trg_pmcp_rev before update or delete on projeto_marshall_cp for each row execute function fn_bloqueia_pm_revisao_antiga();

-- criar_revisao_projeto passa a copiar também a dosagem Marshall de projeto
-- (mirror da cópia de dosagem_composicao já existente).
create or replace function criar_revisao_projeto(p_dosagem uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_familia uuid; v_novo uuid; v_max int;
begin
  if not tem_papel('ensaios_usina', array['avaliador','admin']) then
    raise exception 'Apenas avaliador ou admin pode criar revisão de projeto';
  end if;
  perform pg_advisory_xact_lock(hashtext(coalesce((select coalesce(projeto_pai_id, id) from dosagens where id = p_dosagem)::text, p_dosagem::text)));
  select coalesce(projeto_pai_id, id) into v_familia from dosagens where id = p_dosagem;
  if v_familia is null then raise exception 'Projeto inexistente'; end if;
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id) = v_familia;
  insert into dosagens (contexto, tipo, nome, empresa_id, especificacao_id, teor_otimo,
    dens_max_teorica_projeto, densidade_aparente_projeto, densidade_ligante,
    curva_projeto, curva_tolerancias, parametros_projeto, ativa, projeto_pai_id, revisao)
  select contexto, tipo, nome, empresa_id, especificacao_id, teor_otimo,
    dens_max_teorica_projeto, densidade_aparente_projeto, densidade_ligante,
    curva_projeto, curva_tolerancias, parametros_projeto, true, v_familia, v_max + 1
  from dosagens where id = p_dosagem
  returning id into v_novo;
  insert into dosagem_composicao (dosagem_id, silo, material_id, percentual, densidade, origem, material_nome, local, pct_seca)
  select v_novo, silo, material_id, percentual, densidade, origem, material_nome, local, pct_seca
  from dosagem_composicao where dosagem_id = p_dosagem;
  insert into projeto_marshall (dosagem_id, densidade_real_cap, constante_prensa, correcao_fluencia)
  select v_novo, densidade_real_cap, constante_prensa, correcao_fluencia
  from projeto_marshall where dosagem_id = p_dosagem;
  insert into projeto_marshall_cp (dosagem_id, teor, cp, peso_ar, peso_imerso, rice_teorica,
    leitura_estabilidade, fator_correcao, altura_cm, leitura_fluencia)
  select v_novo, teor, cp, peso_ar, peso_imerso, rice_teorica,
    leitura_estabilidade, fator_correcao, altura_cm, leitura_fluencia
  from projeto_marshall_cp where dosagem_id = p_dosagem;
  return v_novo;
end $$;
