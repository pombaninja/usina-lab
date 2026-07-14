-- Parte 1 — Produtos de insumo LIVRES: o cadastro (insumo_produtos) deixa de ser
-- travado em cap/oleo_queima/oleo_termico (ex.: emulsão entra sem migração nova).
-- O vínculo tanque→produto passa a ser garantido por FK em vez de CHECK duplicado;
-- as 3 linhas seed existentes satisfazem a FK.
-- RLS de insumo_produtos permanece como está (leitura geral, escrita só admin de
-- insumos): criar produto novo é tarefa administrativa.

alter table insumo_produtos drop constraint insumo_produtos_produto_check;
alter table tanques drop constraint tanques_produto_check;
alter table tanques add constraint tanques_produto_fk
  foreign key (produto) references insumo_produtos(produto);

-- Parte 2 — BAIAS DE AGREGADOS (pátio da usina): estoque a granel por baia.
create table baias (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  material text not null,            -- ex.: Brita 1, Pó de pedra, Areia
  cor text not null default '#64748b',
  capacidade numeric,                -- na unidade abaixo
  unidade text not null default 't' check (unidade in ('t','m3')),
  estoque_atual numeric not null default 0,
  estoque_minimo numeric not null default 0,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Auditoria padrão (PK é id, fn_auditoria serve como nas demais tabelas).
create trigger trg_aud_baias after insert or update or delete on baias
  for each row execute function fn_auditoria();

-- RLS: leitura geral; escrita lancador+ — o estoque muda no dia a dia (quem lança
-- insumos atualiza) e, decisão pragmática, o cadastro fica no mesmo nível.
alter table baias enable row level security;
create policy sel_baias on baias for select using (usuario_ativo());
create policy wr_baias on baias for all
  using (tem_papel('insumos', array['lancador','avaliador','admin']))
  with check (tem_papel('insumos', array['lancador','avaliador','admin']));
