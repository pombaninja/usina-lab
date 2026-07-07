-- Impede emissao direta via UPDATE (so a funcao emitir_laudo, security definer do dono da tabela, pode emitir)
drop policy upd_laudos on laudos;
create policy upd_laudos on laudos for update
  using (tem_papel('ensaios_usina', array['avaliador','admin']))
  with check (status <> 'emitido');

-- Trigger de imutabilidade: DELETE de laudo nao-emitido deve funcionar (return old), nao ser cancelado em silencio
create or replace function fn_bloqueia_emitido() returns trigger
language plpgsql as $$
begin
  if old.status = 'emitido' then
    raise exception 'Laudo emitido é imutável. Crie uma revisão.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Dedupe de faixas de especificacao
create unique index especificacao_peneiras_unq on especificacao_peneiras (especificacao_id, peneira);
create unique index especificacao_parametros_unq on especificacao_parametros (especificacao_id, parametro);
