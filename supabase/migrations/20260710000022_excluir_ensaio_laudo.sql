-- Exclusão segura de ensaios diários (ensaios_cauq) e de laudos, a partir da UI.
-- Regra do dono: bloquear SOMENTE quando existe laudo EMITIDO (oficial, numerado).
-- Laudos não emitidos (rascunho/aprovado) são excluídos junto com o ensaio, e há
-- também uma opção direta de "Excluir" no próprio laudo (exceto emitido).
--
-- CORREÇÃO DE BUG: fn_bloqueia_emitido() terminava com `return new;`. Em um trigger
-- BEFORE DELETE de linha, NEW é NULL, então retornar NEW cancela silenciosamente
-- TODO DELETE de laudo (inclusive não emitidos). Correção: retornar OLD no DELETE.
-- A trava de laudo emitido (raise) é preservada exatamente; a fiação do trigger
-- (trg_laudo_imutavel) não é tocada. fn_bloqueia_ensaio_emitido já retorna old no
-- delete corretamente e não é alterada aqui.

create or replace function fn_bloqueia_emitido() returns trigger
language plpgsql as $$
begin
  if old.status = 'emitido' then
    raise exception 'Laudo emitido é imutável. Crie uma revisão.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- RPC: exclui um ensaio do dia + seus filhos (cauq_* via ON DELETE CASCADE) e os
-- laudos não emitidos vinculados. Bloqueada se houver laudo emitido no ensaio.
create or replace function excluir_ensaio(p_ensaio uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('ensaios_usina', array['avaliador','admin']) then
    raise exception 'Apenas avaliador ou admin pode excluir ensaio.';
  end if;
  if exists (select 1 from laudos where ensaio_id = p_ensaio and status = 'emitido') then
    raise exception 'Este ensaio possui laudo emitido e não pode ser excluído. Revise ou exclua pelo laudo.';
  end if;
  -- Só restam laudos não emitidos (emitidos já foram bloqueados acima). O FK
  -- laudos.ensaio_id -> ensaios_cauq(id) não tem cascade, então apagamos antes.
  delete from laudos where ensaio_id = p_ensaio;
  delete from ensaios_cauq where id = p_ensaio;  -- cascade remove os filhos cauq_*
end $$;

-- RPC: exclui um laudo individual, exceto emitido (imutável).
create or replace function excluir_laudo(p_laudo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not tem_papel('ensaios_usina', array['avaliador','admin']) then
    raise exception 'Apenas avaliador ou admin pode excluir laudo.';
  end if;
  select status into v_status from laudos where id = p_laudo;
  if not found then
    raise exception 'Laudo não encontrado.';
  end if;
  if v_status = 'emitido' then
    raise exception 'Laudo emitido é imutável e não pode ser excluído. Crie uma revisão.';
  end if;
  -- O FK laudo_original_id pode bloquear se uma revisão referenciar este laudo;
  -- isso é aceitável e o erro é repassado à UI.
  delete from laudos where id = p_laudo;
end $$;
