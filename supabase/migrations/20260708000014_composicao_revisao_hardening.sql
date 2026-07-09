-- Hardening: cascata de imutabilidade de revisão antiga para dosagem_composicao
-- (mirror do padrão fn_bloqueia_ensaio_emitido, que cascateia a imutabilidade
-- de laudo emitido para as tabelas de ensaio filhas) + lock de concorrência
-- em criar_revisao_projeto.

-- Composição de uma revisão que não é mais a mais recente da família também
-- fica congelada (hoje só `dosagens` era protegida por trg_projeto_revisao_antiga;
-- dosagem_composicao ficava livre para UPDATE/DELETE via RLS wr_dosagem_composicao).
create or replace function fn_bloqueia_composicao_revisao_antiga() returns trigger
language plpgsql as $$
declare v_dos uuid; v_familia uuid; v_max int; v_rev int;
begin
  v_dos := (case when tg_op = 'DELETE' then old else new end).dosagem_id;
  select revisao, coalesce(projeto_pai_id, id) into v_rev, v_familia from dosagens where id = v_dos;
  if v_familia is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id) = v_familia;
  if v_rev < v_max then
    raise exception 'Composição de revisão antiga de projeto é imutável. Edite a revisão mais recente ou crie uma nova.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger trg_composicao_revisao_antiga before update or delete on dosagem_composicao
  for each row execute function fn_bloqueia_composicao_revisao_antiga();

-- Concorrência: duas chamadas quase simultâneas de criar_revisao_projeto para a
-- mesma família calculavam o mesmo v_max e colidiam no índice único com erro
-- opaco. Lock advisory por família serializa o cálculo do max + insert.
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
  return v_novo;
end $$;
