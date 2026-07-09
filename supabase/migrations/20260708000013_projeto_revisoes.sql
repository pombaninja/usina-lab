-- Revisões de Projeto de Materiais (dosagens): cada projeto passa a ter uma
-- família de revisões (Rev. 0, 1, 2…), mirror do padrão já usado em laudos.
-- Nota: a coluna "revisao" já existe em dosagens desde a migração inicial
-- (20260706000002_ensaios_usina.sql), não precisa ser criada aqui.
alter table dosagens add column projeto_pai_id uuid references dosagens(id);

-- família de revisões = coalesce(projeto_pai_id, id); uma linha por (família, revisao)
create unique index dosagens_familia_revisao_unq on dosagens ((coalesce(projeto_pai_id, id)), revisao);

-- Cria uma nova revisão copiando o projeto atual (campos + composição). Só avaliador/admin.
create or replace function criar_revisao_projeto(p_dosagem uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_familia uuid; v_novo uuid; v_max int;
begin
  if not tem_papel('ensaios_usina', array['avaliador','admin']) then
    raise exception 'Apenas avaliador ou admin pode criar revisão de projeto';
  end if;
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

-- Só a revisão MAIS RECENTE da família é editável (revisões antigas ficam congeladas)
create or replace function fn_bloqueia_revisao_antiga() returns trigger
language plpgsql as $$
declare v_familia uuid; v_max int;
begin
  v_familia := coalesce(old.projeto_pai_id, old.id);
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id) = v_familia;
  if old.revisao < v_max then
    raise exception 'Revisão antiga de projeto é imutável. Edite a revisão mais recente ou crie uma nova.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger trg_projeto_revisao_antiga before update or delete on dosagens
  for each row execute function fn_bloqueia_revisao_antiga();
