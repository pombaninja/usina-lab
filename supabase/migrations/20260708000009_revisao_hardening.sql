-- Uma única corrente de revisões por ensaio: (ensaio_id, revisao) é única
create unique index laudos_ensaio_revisao_unq on laudos (ensaio_id, revisao);

-- Emissão de revisão valida o laudo original: precisa estar emitido e ser do mesmo ensaio
create or replace function emitir_laudo(p_laudo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_ensaio uuid; v_orig uuid; v_ano int; v_seq int; v_sigla text; v_num text;
begin
  if not tem_papel('ensaios_usina', array['avaliador','admin']) then
    raise exception 'Apenas avaliador ou admin pode emitir laudo';
  end if;
  select empresa_id, ensaio_id, laudo_original_id into v_emp, v_ensaio, v_orig
    from laudos where id = p_laudo and status = 'aprovado' for update;
  if v_emp is null then raise exception 'Laudo inexistente ou não está aprovado'; end if;
  if v_orig is not null then
    select numero, ano, seq into v_num, v_ano, v_seq
      from laudos
      where id = v_orig and status = 'emitido' and ensaio_id = v_ensaio and empresa_id = v_emp;
    if v_num is null then
      raise exception 'Laudo original da revisão inválido: precisa estar emitido e pertencer ao mesmo ensaio';
    end if;
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
