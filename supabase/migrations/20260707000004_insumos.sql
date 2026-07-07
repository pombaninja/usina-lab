-- ===== TANQUES =====
create table tanques (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,          -- TQ-01
  nome text not null,                   -- CAP Tanque 01
  produto text not null check (produto in ('cap','oleo_queima','oleo_termico')),
  unidade text not null check (unidade in ('t','litros')),
  capacidade numeric,
  estoque_minimo numeric not null default 0,
  tem_horimetro boolean not null default false,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ===== LANÇAMENTO DIÁRIO (1 por dia) =====
create table insumos_lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null unique,
  producao_ton numeric,
  producao_descricao text,              -- ex.: FX D manhã / FX III tarde
  observacoes text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create table insumos_leituras (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references insumos_lancamentos(id) on delete cascade,
  tanque_id uuid not null references tanques(id),
  volume_inicial numeric,
  volume_final numeric,
  horimetro_ligou numeric,              -- só caldeira
  horimetro_desligou numeric,
  observacoes text,
  unique (lancamento_id, tanque_id)
);

-- ===== ENTRADAS (recebimentos) =====
create table insumos_entradas (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  tanque_id uuid not null references tanques(id),
  quantidade numeric not null check (quantidade > 0),
  fornecedor text,
  nf_numero text,
  nf_anexo_path text,                   -- caminho no bucket notas-fiscais
  observacoes text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

-- ===== AUDITORIA =====
do $$ declare t text;
begin
  foreach t in array array['tanques','insumos_lancamentos','insumos_leituras','insumos_entradas']
  loop
    execute format('create trigger trg_aud_%I after insert or update or delete on %I
                    for each row execute function fn_auditoria()', t, t);
  end loop;
end $$;

-- ===== RLS =====
do $$ declare t text;
begin
  foreach t in array array['tanques','insumos_lancamentos','insumos_leituras','insumos_entradas']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy sel_%I on %I for select using (usuario_ativo())', t, t);
  end loop;
end $$;

-- tanques: só admin de insumos gerencia o cadastro
create policy wr_tanques on tanques for all
  using (tem_papel('insumos', array['admin']))
  with check (tem_papel('insumos', array['admin']));

-- lançamentos/leituras/entradas: lancador+
do $$ declare t text;
begin
  foreach t in array array['insumos_lancamentos','insumos_leituras','insumos_entradas']
  loop
    execute format('create policy wr_%I on %I for all
      using (tem_papel(''insumos'', array[''lancador'',''avaliador'',''admin'']))
      with check (tem_papel(''insumos'', array[''lancador'',''avaliador'',''admin'']))', t, t);
  end loop;
end $$;

-- ===== STORAGE: bucket privado para NFs =====
insert into storage.buckets (id, name, public) values ('notas-fiscais', 'notas-fiscais', false)
  on conflict (id) do nothing;
create policy nf_read on storage.objects for select
  using (bucket_id = 'notas-fiscais' and usuario_ativo());
create policy nf_write on storage.objects for insert
  with check (bucket_id = 'notas-fiscais' and tem_papel('insumos', array['lancador','avaliador','admin']));

-- ===== SEED: 5 tanques atuais =====
insert into tanques (codigo, nome, produto, unidade, estoque_minimo, tem_horimetro) values
  ('TQ-01', 'CAP Tanque 01', 'cap', 't', 5, false),
  ('TQ-02', 'CAP Tanque 02', 'cap', 't', 5, false),
  ('TQ-03', 'CAP Tanque Vertical', 'cap', 't', 10, false),
  ('TQ-04', 'Óleo de Queima', 'oleo_queima', 'litros', 3000, false),
  ('TQ-05', 'Caldeira (óleo térmico)', 'oleo_termico', 'litros', 500, true);

-- ===== SEED: perfil do Cristhian no módulo =====
insert into perfis_acesso (user_id, modulo, papel)
select id, 'insumos', 'lancador' from auth.users where email = 'usina@gruporibeiroporto.com'
on conflict (user_id, modulo) do nothing;
