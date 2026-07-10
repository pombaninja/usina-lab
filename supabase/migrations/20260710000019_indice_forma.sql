-- Índice de forma / Lamelaridade do projeto (Módulo 5b do Projeto CAUQ completo):
-- NBR 7809 (2008) / DNIT 425/2020. Uma linha por dosagem (mesmo padrão de
-- projeto_complementares / projeto_marshall).

create table projeto_indice_forma (
  dosagem_id uuid primary key references dosagens(id) on delete cascade,
  material_nome text,
  graos jsonb,          -- [{espessura, comprimento}]
  media_il numeric,
  pct_lamelar numeric,
  criado_em timestamptz not null default now()
);

alter table projeto_indice_forma enable row level security;

create policy sel_if on projeto_indice_forma for select using (usuario_ativo());
create policy wr_if on projeto_indice_forma for all using (tem_papel('ensaios_usina', array['avaliador','admin'])) with check (tem_papel('ensaios_usina', array['avaliador','admin']));

-- Cascata de imutabilidade de revisão antiga (mesmo padrão das demais tabelas do
-- projeto): índice de forma de uma revisão que não é mais a mais recente da
-- família de projeto fica congelado.
create or replace function fn_bloqueia_if_revisao_antiga() returns trigger language plpgsql as $$
declare v_familia uuid; v_max int; v_rev int;
begin
  select revisao, coalesce(projeto_pai_id, id) into v_rev, v_familia from dosagens where id=(case when tg_op='DELETE' then old else new end).dosagem_id;
  if v_familia is null then return case when tg_op='DELETE' then old else new end; end if;
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id)=v_familia;
  if v_rev < v_max then raise exception 'Índice de forma de revisão antiga é imutável. Edite a revisão mais recente ou crie uma nova.'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger trg_if_rev before update or delete on projeto_indice_forma for each row execute function fn_bloqueia_if_revisao_antiga();

-- criar_revisao_projeto passa a copiar também o índice de forma do projeto
-- (mirror da cópia de projeto_complementares já existente).
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
  insert into agregado_granulometria (dosagem_id, material_nome, origem, data, peneiras, determinacoes, ordem)
  select v_novo, material_nome, origem, data, peneiras, determinacoes, ordem
  from agregado_granulometria where dosagem_id = p_dosagem;
  insert into projeto_densidades (dosagem_id, tipo, material_nome, entradas, ordem)
  select v_novo, tipo, material_nome, entradas, ordem
  from projeto_densidades where dosagem_id = p_dosagem;
  insert into projeto_complementares (dosagem_id, ea_determinacoes, ea_resultado, adesividade, adesividade_obs, durabilidade_sulfato)
  select v_novo, ea_determinacoes, ea_resultado, adesividade, adesividade_obs, durabilidade_sulfato
  from projeto_complementares where dosagem_id = p_dosagem;
  insert into projeto_indice_forma (dosagem_id, material_nome, graos, media_il, pct_lamelar)
  select v_novo, material_nome, graos, media_il, pct_lamelar
  from projeto_indice_forma where dosagem_id = p_dosagem;
  return v_novo;
end $$;
