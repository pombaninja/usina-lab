-- Revisões compartilham o número do laudo original: unicidade passa a ser (numero, revisao)
alter table laudos drop constraint laudos_numero_key;
create unique index laudos_numero_revisao_unq on laudos (numero, revisao);

-- Trava do ensaio: bloqueia apenas quando a revisão MAIS RECENTE do laudo do ensaio está emitida.
-- Criar uma revisão (novo rascunho revisao+1) passa a destravar o ensaio para correção.
create or replace function fn_bloqueia_ensaio_emitido() returns trigger
language plpgsql as $$
declare v_ensaio uuid; v_status text;
begin
  if tg_table_name = 'ensaios_cauq' then
    v_ensaio := (case when tg_op = 'DELETE' then old else new end).id;
  else
    v_ensaio := (case when tg_op = 'DELETE' then old else new end).ensaio_id;
  end if;
  select status into v_status from laudos where ensaio_id = v_ensaio
    order by revisao desc limit 1;
  if v_status = 'emitido' then
    raise exception 'Ensaio pertence a laudo emitido e é imutável. Crie uma revisão do laudo para corrigir.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Emissão de revisão reaproveita o número do laudo original
create or replace function emitir_laudo(p_laudo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_orig uuid; v_ano int; v_seq int; v_sigla text; v_num text;
begin
  if not tem_papel('ensaios_usina', array['avaliador','admin']) then
    raise exception 'Apenas avaliador ou admin pode emitir laudo';
  end if;
  select empresa_id, laudo_original_id into v_emp, v_orig
    from laudos where id = p_laudo and status = 'aprovado' for update;
  if v_emp is null then raise exception 'Laudo inexistente ou não está aprovado'; end if;
  if v_orig is not null then
    select numero, ano, seq into v_num, v_ano, v_seq from laudos where id = v_orig;
  else
    v_ano := extract(year from now())::int;
    insert into laudo_numeracao (empresa_id, ano, ultimo_seq) values (v_emp, v_ano, 1)
      on conflict (empresa_id, ano) do update set ultimo_seq = laudo_numeracao.ultimo_seq + 1
      returning ultimo_seq into v_seq;
    select upper(regexp_replace(nome_exibicao, '\W', '', 'g')) into v_sigla from empresas where id = v_emp;
    v_num := format('%s-%s-%s', v_sigla, v_ano, lpad(v_seq::text, 4, '0'));
  end if;
  update laudos set status = 'emitido', emitido_em = now(), ano = v_ano, seq = v_seq, numero = v_num
    where id = p_laudo;
  return v_num;
end $$;
