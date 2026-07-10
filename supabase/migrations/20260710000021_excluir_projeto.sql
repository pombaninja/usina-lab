-- Exclusão segura de projeto (família de revisões de dosagens): remove a
-- família inteira (todas as revisões) + todos os dados filhos, mas é
-- BLOQUEADA se existir qualquer ensaio/laudo vinculado (protege laudos/auditoria).
--
-- Problema: as travas de imutabilidade de revisão antiga (fn_bloqueia_revisao_antiga
-- em dosagens e fn_bloqueia_*_revisao_antiga nas tabelas filhas) impedem DELETE de
-- revisões que não são a mais recente da família. Uma exclusão de família inclui
-- revisões antigas, então essas travas bloqueariam a exclusão. Solução: uma flag de
-- escape local à transação (app.excluindo_projeto = 'on'), setada SOMENTE pela RPC
-- excluir_projeto abaixo, checada como primeira instrução de cada função de trava.
--
-- As travas de laudo/ensaio emitido (fn_bloqueia_emitido / fn_bloqueia_ensaio_emitido)
-- NÃO são tocadas aqui: laudos/ensaios continuam totalmente imutáveis; a exclusão de
-- projeto é bloqueada a montante se existir qualquer ensaio vinculado à família.

create or replace function fn_bloqueia_revisao_antiga() returns trigger
language plpgsql as $$
declare v_familia uuid; v_max int;
begin
  if coalesce(current_setting('app.excluindo_projeto', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_familia := coalesce(old.projeto_pai_id, old.id);
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id) = v_familia;
  if old.revisao < v_max then
    raise exception 'Revisão antiga de projeto é imutável. Edite a revisão mais recente ou crie uma nova.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function fn_bloqueia_composicao_revisao_antiga() returns trigger
language plpgsql as $$
declare v_dos uuid; v_familia uuid; v_max int; v_rev int;
begin
  if coalesce(current_setting('app.excluindo_projeto', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
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

create or replace function fn_bloqueia_pm_revisao_antiga() returns trigger language plpgsql as $$
declare v_dos uuid; v_familia uuid; v_max int; v_rev int;
begin
  if coalesce(current_setting('app.excluindo_projeto', true), '') = 'on' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  v_dos := (case when tg_op='DELETE' then old else new end).dosagem_id;
  select revisao, coalesce(projeto_pai_id, id) into v_rev, v_familia from dosagens where id=v_dos;
  if v_familia is null then return case when tg_op='DELETE' then old else new end; end if;
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id)=v_familia;
  if v_rev < v_max then raise exception 'Dosagem Marshall de revisão antiga é imutável. Edite a revisão mais recente ou crie uma nova.'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function fn_bloqueia_ag_revisao_antiga() returns trigger language plpgsql as $$
declare v_dos uuid; v_familia uuid; v_max int; v_rev int;
begin
  if coalesce(current_setting('app.excluindo_projeto', true), '') = 'on' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  v_dos := (case when tg_op='DELETE' then old else new end).dosagem_id;
  select revisao, coalesce(projeto_pai_id, id) into v_rev, v_familia from dosagens where id=v_dos;
  if v_familia is null then return case when tg_op='DELETE' then old else new end; end if;
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id)=v_familia;
  if v_rev < v_max then raise exception 'Granulometria de agregado de revisão antiga é imutável. Edite a revisão mais recente ou crie uma nova.'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function fn_bloqueia_pd_revisao_antiga() returns trigger language plpgsql as $$
declare v_dos uuid; v_familia uuid; v_max int; v_rev int;
begin
  if coalesce(current_setting('app.excluindo_projeto', true), '') = 'on' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  v_dos := (case when tg_op='DELETE' then old else new end).dosagem_id;
  select revisao, coalesce(projeto_pai_id, id) into v_rev, v_familia from dosagens where id=v_dos;
  if v_familia is null then return case when tg_op='DELETE' then old else new end; end if;
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id)=v_familia;
  if v_rev < v_max then raise exception 'Densidade de revisão antiga é imutável. Edite a revisão mais recente ou crie uma nova.'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function fn_bloqueia_pc_revisao_antiga() returns trigger language plpgsql as $$
declare v_familia uuid; v_max int; v_rev int;
begin
  if coalesce(current_setting('app.excluindo_projeto', true), '') = 'on' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  select revisao, coalesce(projeto_pai_id, id) into v_rev, v_familia from dosagens where id=(case when tg_op='DELETE' then old else new end).dosagem_id;
  if v_familia is null then return case when tg_op='DELETE' then old else new end; end if;
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id)=v_familia;
  if v_rev < v_max then raise exception 'Ensaios complementares de revisão antiga são imutáveis. Edite a revisão mais recente ou crie uma nova.'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function fn_bloqueia_if_revisao_antiga() returns trigger language plpgsql as $$
declare v_familia uuid; v_max int; v_rev int;
begin
  if coalesce(current_setting('app.excluindo_projeto', true), '') = 'on' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  select revisao, coalesce(projeto_pai_id, id) into v_rev, v_familia from dosagens where id=(case when tg_op='DELETE' then old else new end).dosagem_id;
  if v_familia is null then return case when tg_op='DELETE' then old else new end; end if;
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id)=v_familia;
  if v_rev < v_max then raise exception 'Índice de forma de revisão antiga é imutável. Edite a revisão mais recente ou crie uma nova.'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function fn_bloqueia_visc_revisao_antiga() returns trigger language plpgsql as $$
declare v_familia uuid; v_max int; v_rev int;
begin
  if coalesce(current_setting('app.excluindo_projeto', true), '') = 'on' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  select revisao, coalesce(projeto_pai_id, id) into v_rev, v_familia from dosagens where id=(case when tg_op='DELETE' then old else new end).dosagem_id;
  if v_familia is null then return case when tg_op='DELETE' then old else new end; end if;
  select max(revisao) into v_max from dosagens where coalesce(projeto_pai_id, id)=v_familia;
  if v_rev < v_max then raise exception 'Viscosidade de revisão antiga é imutável. Edite a revisão mais recente ou crie uma nova.'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

-- Nota: todos os FKs das tabelas filhas (dosagem_composicao, projeto_marshall,
-- projeto_marshall_cp, agregado_granulometria, projeto_densidades,
-- projeto_complementares, projeto_indice_forma, projeto_viscosidade) para
-- dosagens(id) já foram criados com "on delete cascade" em suas migrações de
-- origem — confirmado por grep, nenhuma alteração de FK é necessária aqui.

-- RPC de exclusão: só avaliador/admin, bloqueia se houver ensaio vinculado à
-- família, e usa a flag de escape (transaction-local via set_config(..., true))
-- para permitir a exclusão de revisões antigas só dentro desta transação.
create or replace function excluir_projeto(p_dosagem uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_familia uuid;
begin
  if not tem_papel('ensaios_usina', array['avaliador','admin']) then
    raise exception 'Apenas avaliador ou admin pode excluir projeto';
  end if;
  select coalesce(projeto_pai_id, id) into v_familia from dosagens where id = p_dosagem;
  if v_familia is null then raise exception 'Projeto inexistente'; end if;
  if exists (
    select 1 from ensaios_cauq e join dosagens d on d.id = e.dosagem_id
    where coalesce(d.projeto_pai_id, d.id) = v_familia
  ) then
    raise exception 'Este projeto possui ensaios ou laudos vinculados e não pode ser excluído. Exclua os ensaios primeiro.';
  end if;
  perform set_config('app.excluindo_projeto', 'on', true);  -- transaction-local
  delete from dosagens where coalesce(projeto_pai_id, id) = v_familia;
end $$;
