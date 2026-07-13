-- Índice de Lamelaridade POR FRAÇÃO (DAER/RS-EL 108/01 — planilha da Pedreira
-- "8 - ÍNDICE DE LAMELARIDADE"): cada MATERIAL/AMOSTRA do projeto é peneirado na
-- sequência fixa 2" … 1/4"; cada fração entre peneiras consecutivas é ensaiada na
-- fenda e o IL final é ΣM/ΣI das frações ensaiadas (src/lib/calculos/lamelaridade.ts,
-- golden-testado). DISTINTO do índice de forma grão a grão (projeto_indice_forma,
-- NBR 7809) — os dois ensaios coexistem no projeto.

create table projeto_lamelaridade (
  id uuid primary key default gen_random_uuid(),
  dosagem_id uuid not null references dosagens(id) on delete cascade,
  material_nome text not null,
  origem text,
  data date,
  peso_total numeric,
  granulometria jsonb not null default '{}'::jsonb,  -- peneira -> peso acumulado retido (g)
  fracoes jsonb not null default '[]'::jsonb,        -- [{passando, retido, pesoFracao, pesoLamelar}]
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

alter table projeto_lamelaridade enable row level security;

create policy sel_lam on projeto_lamelaridade for select using (usuario_ativo());
create policy wr_lam on projeto_lamelaridade for all using (tem_papel('ensaios_usina', array['avaliador','admin'])) with check (tem_papel('ensaios_usina', array['avaliador','admin']));

-- Cascata de imutabilidade de revisão antiga — ESPELHO de fn_bloqueia_rt_revisao_antiga
-- (20260710000025): a lamelaridade de uma revisão que não é mais a mais recente da
-- família fica congelada. A PRIMEIRA instrução é a flag de escape app.excluindo_projeto
-- (setada só pela RPC excluir_projeto): é OBRIGATÓRIA porque excluir_projeto faz DELETE
-- em cascata nesta tabela filha; sem ela, excluir um projeto cuja revisão antiga tenha
-- linhas de lamelaridade seria bloqueado.
create or replace function fn_bloqueia_lam_revisao_antiga() returns trigger language plpgsql as $$
declare v_dos uuid; v_familia uuid; v_max int; v_rev int;
begin
  if coalesce(current_setting('app.excluindo_projeto', true), '') = 'on' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  v_dos := (case when tg_op='DELETE' then old else new end).dosagem_id;
  select revisao, coalesce(projeto_pai_id, id) into v_rev, v_familia from dosagens where id=v_dos;
  if v_familia is null then return case when tg_op='DELETE' then old else new end; end if;
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id)=v_familia;
  if v_rev < v_max then raise exception 'Lamelaridade de revisão antiga é imutável. Edite a revisão mais recente ou crie uma nova.'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger trg_lam_rev before update or delete on projeto_lamelaridade for each row execute function fn_bloqueia_lam_revisao_antiga();

-- criar_revisao_projeto passa a copiar também a lamelaridade ao clonar o projeto.
-- Corpo reproduzido VERBATIM da versão de 20260711000026; ÚNICA mudança: um novo
-- insert copiando projeto_lamelaridade (colocado após a cópia de projeto_rtd_cp).
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
  insert into agregado_granulometria (dosagem_id, material_nome, origem, data, peneiras, determinacoes, ordem, pct_na_mistura)
  select v_novo, material_nome, origem, data, peneiras, determinacoes, ordem, pct_na_mistura
  from agregado_granulometria where dosagem_id = p_dosagem;
  insert into projeto_rice_teor (dosagem_id, teor, peso_amostra, frasco_agua, frasco_amostra_agua, fator_temp, ordem)
  select v_novo, teor, peso_amostra, frasco_agua, frasco_amostra_agua, fator_temp, ordem
  from projeto_rice_teor where dosagem_id = p_dosagem;
  insert into projeto_rtd_cp (dosagem_id, cp, leitura, diametro_cm, altura_cm, ordem)
  select v_novo, cp, leitura, diametro_cm, altura_cm, ordem
  from projeto_rtd_cp where dosagem_id = p_dosagem;
  insert into projeto_lamelaridade (dosagem_id, material_nome, origem, data, peso_total, granulometria, fracoes, ordem)
  select v_novo, material_nome, origem, data, peso_total, granulometria, fracoes, ordem
  from projeto_lamelaridade where dosagem_id = p_dosagem;
  insert into projeto_densidades (dosagem_id, tipo, material_nome, entradas, ordem)
  select v_novo, tipo, material_nome, entradas, ordem
  from projeto_densidades where dosagem_id = p_dosagem;
  insert into projeto_complementares (dosagem_id, ea_determinacoes, ea_resultado, adesividade, adesividade_obs, durabilidade_sulfato)
  select v_novo, ea_determinacoes, ea_resultado, adesividade, adesividade_obs, durabilidade_sulfato
  from projeto_complementares where dosagem_id = p_dosagem;
  insert into projeto_indice_forma (dosagem_id, material_nome, graos, media_il, pct_lamelar)
  select v_novo, material_nome, graos, media_il, pct_lamelar
  from projeto_indice_forma where dosagem_id = p_dosagem;
  insert into projeto_viscosidade (dosagem_id, material, pontos, faixas, ponto_fulgor, ponto_amolecimento,
    penetracao, temp_usinagem_min, temp_usinagem_max, temp_compactacao_min, temp_compactacao_max)
  select v_novo, material, pontos, faixas, ponto_fulgor, ponto_amolecimento,
    penetracao, temp_usinagem_min, temp_usinagem_max, temp_compactacao_min, temp_compactacao_max
  from projeto_viscosidade where dosagem_id = p_dosagem;
  return v_novo;
end $$;
