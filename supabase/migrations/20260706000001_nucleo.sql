-- ===== EMPRESAS EMISSORAS =====
create table empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_exibicao text not null,
  cnpj text,
  logo_url text,
  cabecalho text,
  rodape text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ===== PERFIS DE ACESSO (papel por módulo) =====
create table perfis_acesso (
  user_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null check (modulo in ('cadastros','ensaios_usina','ensaios_obra','insumos','pedreira')),
  papel text not null check (papel in ('lancador','avaliador','leitura','admin')),
  primary key (user_id, modulo)
);

create or replace function papel_no_modulo(p_modulo text)
returns text language sql stable security definer set search_path = public as $$
  select papel from perfis_acesso where user_id = auth.uid() and modulo = p_modulo
$$;

create or replace function tem_papel(p_modulo text, p_papeis text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfis_acesso
    where user_id = auth.uid() and modulo = p_modulo and papel = any(p_papeis)
  )
$$;

-- ===== CADASTROS =====
create table clientes_obras (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  obra text,
  local_aplicacao text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table materiais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('agregado','ligante','solo','filler')),
  procedencia text,
  fornecedor text,
  densidade_real numeric,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table equipamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('prensa','usina','estufa','balanca','outro')),
  constante numeric,          -- constante da prensa
  observacoes text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ===== ESPECIFICAÇÕES NORMATIVAS =====
create table especificacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                 -- ex.: FAIXA III DER/SP
  norma text,                         -- ex.: ET-DE-P00/027
  tipo_mistura text not null check (tipo_mistura in ('cauq','bgs','solo_brita','agregado')),
  descricao text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table especificacao_peneiras (
  id uuid primary key default gen_random_uuid(),
  especificacao_id uuid not null references especificacoes(id) on delete cascade,
  peneira text not null,              -- ex.: 3/8", N. 200
  abertura_mm numeric not null,
  passante_min numeric not null,
  passante_max numeric not null,
  tolerancia_trabalho numeric not null default 0  -- ex.: 7, 5, 4, 3, 2
);

create table especificacao_parametros (
  id uuid primary key default gen_random_uuid(),
  especificacao_id uuid not null references especificacoes(id) on delete cascade,
  parametro text not null,            -- ex.: vazios, rbv, vam, estabilidade, fluencia_mm, rtd, filler_ligante, teor_ligante
  valor_min numeric,
  valor_max numeric,
  unidade text
);

-- ===== AUDITORIA =====
create table auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  acao text not null,
  usuario uuid default auth.uid(),
  dados_antes jsonb,
  dados_depois jsonb,
  em timestamptz not null default now()
);

create or replace function fn_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (tabela, registro_id, acao, dados_antes, dados_depois)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old else new end).id::text, '?'),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$ declare t text;
begin
  foreach t in array array['empresas','clientes_obras','materiais','equipamentos',
                           'especificacoes','especificacao_peneiras','especificacao_parametros']
  loop
    execute format('create trigger trg_aud_%I after insert or update or delete on %I
                    for each row execute function fn_auditoria()', t, t);
  end loop;
end $$;

-- ===== RLS =====
alter table empresas enable row level security;
alter table perfis_acesso enable row level security;
alter table clientes_obras enable row level security;
alter table materiais enable row level security;
alter table equipamentos enable row level security;
alter table especificacoes enable row level security;
alter table especificacao_peneiras enable row level security;
alter table especificacao_parametros enable row level security;
alter table auditoria enable row level security;

-- leitura: qualquer usuário autenticado com algum perfil
create or replace function usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis_acesso where user_id = auth.uid())
$$;

do $$ declare t text;
begin
  foreach t in array array['empresas','clientes_obras','materiais','equipamentos',
                           'especificacoes','especificacao_peneiras','especificacao_parametros']
  loop
    execute format('create policy sel_%I on %I for select using (usuario_ativo())', t, t);
    execute format('create policy ins_%I on %I for insert with check (tem_papel(''cadastros'', array[''admin'']))', t, t);
    execute format('create policy upd_%I on %I for update using (tem_papel(''cadastros'', array[''admin'']))', t, t);
    execute format('create policy del_%I on %I for delete using (tem_papel(''cadastros'', array[''admin'']))', t, t);
  end loop;
end $$;

create policy sel_perfis on perfis_acesso for select using (user_id = auth.uid() or tem_papel('cadastros', array['admin']));
create policy adm_perfis on perfis_acesso for all using (tem_papel('cadastros', array['admin'])) with check (tem_papel('cadastros', array['admin']));
create policy sel_auditoria on auditoria for select using (tem_papel('cadastros', array['admin']));
