-- Batch A dos Ensaios Lab — A1: cadastro de FORNECEDOR/ORIGEM + MATERIAIS com
-- histórico. Os campos livres material_nome/origem de ensaios_lab ganham um
-- cadastro estruturado (FKs ADITIVAS e nullable — linhas legadas seguem valendo
-- só com o texto; a UI grava os NOMES selecionados de volta nos campos TEXT para
-- exibição/impressão/filtros continuarem funcionando). ensaios_lab também ganha
-- numeração sequencial própria (`numero` identity — o backfill numera as linhas
-- existentes automaticamente).

create table fornecedores_lab (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table materiais_lab (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores_lab(id),
  nome text not null,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (fornecedor_id, nome)
);

-- Auditoria padrão (PK é id; mesmo fn_auditoria das demais tabelas)
create trigger trg_aud_fornecedores_lab after insert or update or delete on fornecedores_lab
  for each row execute function fn_auditoria();
create trigger trg_aud_materiais_lab after insert or update or delete on materiais_lab
  for each row execute function fn_auditoria();

-- RLS: leitura geral; escrita lancador+ de ensaios_usina. Decisão PRAGMÁTICA:
-- o LANÇADOR cria fornecedor/material NA HORA do lançamento (quick-add "+ novo"
-- na tela do ensaio), então a escrita fica no MESMO nível de wr_ensaios_lab em
-- vez de exigir admin de cadastros.
alter table fornecedores_lab enable row level security;
create policy sel_fornecedores_lab on fornecedores_lab for select using (usuario_ativo());
create policy wr_fornecedores_lab on fornecedores_lab for all
  using (tem_papel('ensaios_usina', array['lancador','avaliador','admin']))
  with check (tem_papel('ensaios_usina', array['lancador','avaliador','admin']));

alter table materiais_lab enable row level security;
create policy sel_materiais_lab on materiais_lab for select using (usuario_ativo());
create policy wr_materiais_lab on materiais_lab for all
  using (tem_papel('ensaios_usina', array['lancador','avaliador','admin']))
  with check (tem_papel('ensaios_usina', array['lancador','avaliador','admin']));

-- ensaios_lab: FKs opcionais para o cadastro + número sequencial único.
alter table ensaios_lab add column fornecedor_id uuid references fornecedores_lab(id);
alter table ensaios_lab add column material_lab_id uuid references materiais_lab(id);
alter table ensaios_lab add column numero bigint generated always as identity;
alter table ensaios_lab add constraint ensaios_lab_numero_unico unique (numero);

-- SEED: fornecedor da casa + materiais atuais.
insert into fornecedores_lab (nome) values ('Pedreira Viradouro');
insert into materiais_lab (fornecedor_id, nome)
select f.id, m.nome
from fornecedores_lab f
cross join (values ('Brita 1.19'), ('Pedrisco 9mm'), ('Pó de Brita')) as m(nome)
where f.nome = 'Pedreira Viradouro';
