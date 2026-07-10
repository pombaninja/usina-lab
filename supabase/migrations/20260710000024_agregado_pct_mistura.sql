-- Persistir a "% na mistura" de cada agregado na própria granulometria do agregado.
-- Antes, o percentual digitado ("% na mistura") nunca era gravado: a combinada
-- dependia de casar o material com dosagem_composicao, então ao recarregar a
-- página a % sumia e a curva combinada desaparecia. Agora cada linha de
-- agregado_granulometria guarda seu próprio pct_na_mistura (aditivo, nullable —
-- seguro para linhas existentes e demais leitores).
alter table agregado_granulometria add column pct_na_mistura numeric;

-- criar_revisao_projeto passa a copiar também o pct_na_mistura ao clonar as
-- granulometrias de agregado (única mudança em relação à versão anterior; todo o
-- restante do corpo é idêntico byte a byte).
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
