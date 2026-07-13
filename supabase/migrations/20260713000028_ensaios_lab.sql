-- Ensaios de Laboratório AVULSOS (fora do projeto) por material — F3-A da spec
-- docs/superpowers/plans/2026-07-13-ensaios-avulsos-laudo.md.
--
-- `ensaios_lab` guarda UM ensaio por linha: material (agregado/cbuq/cbuqf), tipo
-- de ensaio e as ENTRADAS BRUTAS em `dados` jsonb (mesmos shapes que os módulos
-- do projeto persistem; o cálculo é sempre refeito pelas libs de src/lib/calculos).
-- O laudo REUSA a tabela `laudos` e a numeração única (`laudo_numeracao`): laudos
-- ganha `ensaio_lab_id` e `ensaio_id` vira nullable, com CHECK de exatamente-um-de.
-- `emitir_laudo` não depende de ensaio_id e continua servindo os dois fluxos.

-- ===== ENSAIOS DE LABORATÓRIO (avulsos) =====
create table ensaios_lab (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  data date not null default current_date,
  material_tipo text not null check (material_tipo in ('agregado','cbuq','cbuqf')),
  material_nome text,
  origem text,
  tipo_ensaio text not null,
  dados jsonb not null default '{}'::jsonb,   -- entradas brutas, mesmo shape dos módulos do projeto
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

-- Auditoria (mesmo padrão de ensaios_cauq/laudos)
create trigger trg_aud_ensaios_lab after insert or update or delete on ensaios_lab
  for each row execute function fn_auditoria();

-- RLS — ESPELHO das políticas de ensaios_cauq (20260706000002):
-- select = usuário ativo; escrita = lançador/avaliador/admin de ensaios_usina.
alter table ensaios_lab enable row level security;
create policy sel_ensaios_lab on ensaios_lab for select using (usuario_ativo());
create policy wr_ensaios_lab on ensaios_lab for all
  using (tem_papel('ensaios_usina', array['lancador','avaliador','admin']))
  with check (tem_papel('ensaios_usina', array['lancador','avaliador','admin']));

-- ===== LAUDOS GENERALIZADOS: CBUQ diário (ensaio_id) OU laboratório (ensaio_lab_id) =====
alter table laudos add column ensaio_lab_id uuid references ensaios_lab(id);
alter table laudos alter column ensaio_id drop not null;
alter table laudos add constraint laudos_exatamente_um_ensaio
  check (num_nonnulls(ensaio_id, ensaio_lab_id) = 1);

-- Imutabilidade: ensaio de laboratório com laudo EMITIDO não muda — espelho de
-- fn_bloqueia_ensaio_emitido (20260706000002), apontando via ensaio_lab_id.
-- (fn_bloqueia_emitido em `laudos` já cobre o laudo em si, qualquer que seja o tipo.)
create or replace function fn_bloqueia_ensaio_lab_emitido() returns trigger
language plpgsql as $$
declare v_row record;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if exists (select 1 from laudos where ensaio_lab_id = v_row.id and status = 'emitido') then
    raise exception 'Ensaio pertence a laudo emitido e é imutável.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger trg_lock_ensaio_lab before update or delete on ensaios_lab
  for each row execute function fn_bloqueia_ensaio_lab_emitido();

-- RPC: exclui um ensaio de laboratório + laudos não emitidos vinculados.
-- Bloqueada se houver laudo emitido — ESPELHO de excluir_ensaio (20260710000022).
create or replace function excluir_ensaio_lab(p_ensaio uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('ensaios_usina', array['avaliador','admin']) then
    raise exception 'Apenas avaliador ou admin pode excluir ensaio.';
  end if;
  if exists (select 1 from laudos where ensaio_lab_id = p_ensaio and status = 'emitido') then
    raise exception 'Este ensaio possui laudo emitido e não pode ser excluído.';
  end if;
  -- Só restam laudos não emitidos (emitidos já foram bloqueados acima). O FK
  -- laudos.ensaio_lab_id -> ensaios_lab(id) não tem cascade, então apagamos antes.
  delete from laudos where ensaio_lab_id = p_ensaio;
  delete from ensaios_lab where id = p_ensaio;
end $$;
