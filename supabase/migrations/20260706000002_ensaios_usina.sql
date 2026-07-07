-- ===== DOSAGENS (traços) =====
create table dosagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  especificacao_id uuid not null references especificacoes(id),
  nome text not null,                       -- ex.: CAUQ FX III DER - Olímpia
  tipo text not null check (tipo in ('cauq','bgs','solo_brita')),
  teor_otimo numeric,                       -- % ligante de projeto
  densidade_aparente_projeto numeric,
  dens_max_teorica_projeto numeric,         -- Gmm de projeto
  densidade_ligante numeric default 1.009,
  curva_projeto jsonb,                      -- {"3/4\"":100, "1/2\"":98.5, ...} % passando de projeto
  revisao int not null default 0,
  ativa boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create table dosagem_composicao (
  id uuid primary key default gen_random_uuid(),
  dosagem_id uuid not null references dosagens(id) on delete cascade,
  silo int not null,
  material_id uuid references materiais(id),
  percentual numeric not null,
  densidade numeric
);

-- ===== ENSAIO CAUQ (registro do dia) =====
create table ensaios_cauq (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  periodo text check (periodo in ('manha','tarde','noite')),
  empresa_id uuid not null references empresas(id),
  dosagem_id uuid not null references dosagens(id),
  cliente_obra_id uuid references clientes_obras(id),
  usina_equipamento_id uuid references equipamentos(id),
  prensa_equipamento_id uuid references equipamentos(id),
  placa_caminhao text,
  local_extracao text,
  operador text,
  temperatura_cap numeric,
  observacoes text,
  resultados jsonb,        -- snapshot calculado pela aplicação a cada salvamento
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create table cauq_marshall (
  ensaio_id uuid primary key references ensaios_cauq(id) on delete cascade,
  n_golpes int not null default 75,
  diametro_max text,
  constante_prensa numeric not null,
  gmm_ensaio numeric                -- Rice do dia; se nulo, usa o de projeto
);

create table cauq_marshall_cp (
  id uuid primary key default gen_random_uuid(),
  ensaio_id uuid not null references ensaios_cauq(id) on delete cascade,
  cp int not null check (cp between 1 and 3),
  peso_ar numeric not null,
  peso_imerso numeric not null,
  leitura_estabilidade numeric not null,
  fator_correcao numeric,           -- se nulo, calculado pela tabela NBR 12891
  leitura_fluencia_mm numeric not null,
  unique (ensaio_id, cp)
);

create table cauq_granulometria (
  ensaio_id uuid primary key references ensaios_cauq(id) on delete cascade,
  peso_total numeric not null,
  leituras jsonb not null           -- [{"peneira":"1/2\"","abertura_mm":12.7,"retido_acum":64.95}, ...]
);

create table cauq_teor_betume (
  ensaio_id uuid primary key references ensaios_cauq(id) on delete cascade,
  metodo text not null check (metodo in ('rotarex','soxleth')),
  amostra_com_betume numeric,
  amostra_sem_betume numeric,
  umidade_pct numeric default 0,
  rice_peso_amostra numeric,        -- Determinação Rice do dia (opcional)
  rice_frasco_agua numeric,
  rice_frasco_amostra_agua numeric,
  rice_temperatura numeric,
  rice_fator_temp numeric default 1
);

create table cauq_rtd_cp (
  id uuid primary key default gen_random_uuid(),
  ensaio_id uuid not null references ensaios_cauq(id) on delete cascade,
  cp int not null,
  diametro_cm numeric not null default 10,
  altura_cm numeric not null default 6,
  leitura numeric not null,
  constante_prensa numeric not null,
  unique (ensaio_id, cp)
);

-- ===== LAUDOS =====
create table laudos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  ensaio_id uuid not null references ensaios_cauq(id),
  ano int not null,
  seq int not null,
  numero text not null unique,      -- ex.: SULPAV-2026-0147
  revisao int not null default 0,
  laudo_original_id uuid references laudos(id),
  status text not null default 'rascunho' check (status in ('rascunho','aprovado','emitido')),
  avaliador uuid,
  aprovado_em timestamptz,
  emitido_em timestamptz,
  snapshot jsonb,                   -- dados congelados na emissão (para o PDF)
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create table laudo_numeracao (
  empresa_id uuid not null references empresas(id),
  ano int not null,
  ultimo_seq int not null default 0,
  primary key (empresa_id, ano)
);

create or replace function emitir_laudo(p_laudo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_ano int; v_seq int; v_sigla text; v_num text;
begin
  if not tem_papel('ensaios_usina', array['avaliador','admin']) then
    raise exception 'Apenas avaliador ou admin pode emitir laudo';
  end if;
  select empresa_id into v_emp from laudos where id = p_laudo and status = 'aprovado' for update;
  if v_emp is null then raise exception 'Laudo inexistente ou não está aprovado'; end if;
  v_ano := extract(year from now())::int;
  insert into laudo_numeracao (empresa_id, ano, ultimo_seq) values (v_emp, v_ano, 1)
    on conflict (empresa_id, ano) do update set ultimo_seq = laudo_numeracao.ultimo_seq + 1
    returning ultimo_seq into v_seq;
  select upper(regexp_replace(nome_exibicao, '\W', '', 'g')) into v_sigla from empresas where id = v_emp;
  v_num := format('%s-%s-%s', v_sigla, v_ano, lpad(v_seq::text, 4, '0'));
  update laudos set status = 'emitido', emitido_em = now(), ano = v_ano, seq = v_seq, numero = v_num
    where id = p_laudo;
  return v_num;
end $$;

-- Imutabilidade: laudo emitido não muda; ensaio de laudo emitido não muda
create or replace function fn_bloqueia_emitido() returns trigger
language plpgsql as $$
begin
  if old.status = 'emitido' then
    raise exception 'Laudo emitido é imutável. Crie uma revisão.';
  end if;
  return new;
end $$;
create trigger trg_laudo_imutavel before update or delete on laudos
  for each row execute function fn_bloqueia_emitido();

create or replace function fn_bloqueia_ensaio_emitido() returns trigger
language plpgsql as $$
declare v_ensaio uuid; v_row record;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if tg_table_name = 'ensaios_cauq' then
    v_ensaio := v_row.id;
  else
    v_ensaio := v_row.ensaio_id;
  end if;
  if exists (select 1 from laudos where ensaio_id = v_ensaio and status = 'emitido') then
    raise exception 'Ensaio pertence a laudo emitido e é imutável.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$ declare t text;
begin
  foreach t in array array['cauq_marshall','cauq_granulometria','cauq_teor_betume']
  loop
    execute format('create trigger trg_lock_%I before update or delete on %I
                    for each row execute function fn_bloqueia_ensaio_emitido()', t, t);
  end loop;
end $$;
create trigger trg_lock_ensaio before update or delete on ensaios_cauq
  for each row execute function fn_bloqueia_ensaio_emitido();
create trigger trg_lock_mcp before update or delete on cauq_marshall_cp
  for each row execute function fn_bloqueia_ensaio_emitido();
create trigger trg_lock_rtd before update or delete on cauq_rtd_cp
  for each row execute function fn_bloqueia_ensaio_emitido();

-- Auditoria
do $$ declare t text;
begin
  foreach t in array array['dosagens','dosagem_composicao','ensaios_cauq','cauq_marshall_cp','laudos']
  loop
    execute format('create trigger trg_aud_%I after insert or update or delete on %I
                    for each row execute function fn_auditoria()', t, t);
  end loop;
end $$;

-- RLS
do $$ declare t text;
begin
  foreach t in array array['dosagens','dosagem_composicao','ensaios_cauq','cauq_marshall',
                           'cauq_marshall_cp','cauq_granulometria','cauq_teor_betume','cauq_rtd_cp','laudos','laudo_numeracao']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy sel_%I on %I for select using (usuario_ativo())', t, t);
  end loop;
end $$;

-- lançador/avaliador/admin escrevem ensaios e dosagens
do $$ declare t text;
begin
  foreach t in array array['dosagens','dosagem_composicao','ensaios_cauq','cauq_marshall',
                           'cauq_marshall_cp','cauq_granulometria','cauq_teor_betume','cauq_rtd_cp']
  loop
    execute format('create policy wr_%I on %I for all
      using (tem_papel(''ensaios_usina'', array[''lancador'',''avaliador'',''admin'']))
      with check (tem_papel(''ensaios_usina'', array[''lancador'',''avaliador'',''admin'']))', t, t);
  end loop;
end $$;

-- laudos: criar = lançador+; aprovar = update por avaliador/admin; emitir só via função
create policy ins_laudos on laudos for insert
  with check (tem_papel('ensaios_usina', array['lancador','avaliador','admin']));
create policy upd_laudos on laudos for update
  using (tem_papel('ensaios_usina', array['avaliador','admin']));
