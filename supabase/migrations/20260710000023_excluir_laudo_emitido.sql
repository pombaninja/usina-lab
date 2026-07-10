-- Torna laudos EMITIDOS deletáveis via a RPC explícita excluir_laudo (avaliador/admin),
-- mantendo-os IMUTÁVEIS A EDIÇÕES (UPDATE): "crie uma revisão".
--
-- Espelha o padrão de flag de escape local à transação usado em 20260710000021
-- (excluir_projeto), com um NOVO nome de flag: app.excluindo_laudo. A flag é setada
-- SOMENTE pela RPC excluir_laudo (set_config(..., true) => is_local=true, ou seja,
-- válida apenas até o fim da transação). Um flag de sessão vazaria pela conexão do
-- pooler e permitiria silenciosamente a exclusão de laudos emitidos por statements
-- não relacionados — por isso o terceiro argumento é OBRIGATORIAMENTE `true`.
--
-- fn_bloqueia_emitido ganha, como PRIMEIRA instrução, um escape que só age no DELETE:
-- um UPDATE de laudo emitido continua levantando exceção (imutabilidade de edição
-- preservada); um DELETE de laudo emitido continua levantando exceção EXCETO quando
-- a RPC excluir_laudo setou a flag nesta transação. A fiação do trigger
-- (trg_laudo_imutavel) e a fn_bloqueia_ensaio_emitido NÃO são tocadas.

create or replace function fn_bloqueia_emitido() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.excluindo_laudo', true), '') = 'on' then
    return old;
  end if;
  if old.status = 'emitido' then
    raise exception 'Laudo emitido é imutável. Crie uma revisão.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- RPC: exclui um laudo individual (inclusive EMITIDO). A confirmação reforçada é
-- responsabilidade da UI. Usa a flag de escape (transaction-local via
-- set_config(..., true)) para liberar o DELETE de laudo emitido só dentro desta
-- transação. O FK laudos.laudo_original_id (uma revisão que referencia este laudo)
-- não tem cascade e levantará erro se este laudo for o original de uma revisão
-- existente; isso é aceitável e o erro é repassado à UI.
create or replace function excluir_laudo(p_laudo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not tem_papel('ensaios_usina', array['avaliador','admin']) then
    raise exception 'Apenas avaliador ou admin pode excluir laudo.';
  end if;
  select status into v_status from laudos where id = p_laudo;
  if v_status is null then
    raise exception 'Laudo não encontrado.';
  end if;
  perform set_config('app.excluindo_laudo', 'on', true);  -- transaction-local (is_local=true)
  delete from laudos where id = p_laudo;
end $$;
