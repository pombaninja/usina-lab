-- Cadastro de tanques: formato físico (cilindro vertical | horizontal) para o
-- desenho na tela "Situação dos tanques", e cadastro dos materiais controlados
-- em estoque (insumo_produtos) com a COR de exibição de cada um.

-- ===== TANQUES: formato =====
alter table tanques add column formato text not null default 'vertical'
  check (formato in ('vertical','horizontal'));

-- ===== MATERIAIS CONTROLADOS (cores) =====
-- Espelha os valores do check de tanques.produto; a cor pinta o líquido nos
-- desenhos dos tanques e é editável pelo admin de insumos.
create table insumo_produtos (
  produto text primary key check (produto in ('cap','oleo_queima','oleo_termico')),
  rotulo text not null,
  cor text not null check (cor ~* '^#[0-9a-f]{6}$')
);

-- Auditoria: fn_auditoria() padrão lê new.id, e esta tabela tem PK "produto".
-- Função dedicada com o mesmo formato de retorno das demais (convenção:
-- return case when tg_op = 'DELETE' then old else new end).
create or replace function fn_auditoria_insumo_produtos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (tabela, registro_id, acao, dados_antes, dados_depois)
  values (
    tg_table_name,
    (case when tg_op = 'DELETE' then old else new end).produto,
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger trg_aud_insumo_produtos after insert or update or delete on insumo_produtos
  for each row execute function fn_auditoria_insumo_produtos();

-- ===== RLS (mesmo desenho de tanques: leitura geral, escrita só admin de insumos) =====
alter table insumo_produtos enable row level security;
create policy sel_insumo_produtos on insumo_produtos for select using (usuario_ativo());
create policy wr_insumo_produtos on insumo_produtos for all
  using (tem_papel('insumos', array['admin']))
  with check (tem_papel('insumos', array['admin']));

-- ===== SEED: os 3 materiais atuais =====
insert into insumo_produtos (produto, rotulo, cor) values
  ('cap', 'CAP', '#1f2937'),
  ('oleo_queima', 'Óleo de queima', '#b45309'),
  ('oleo_termico', 'Óleo térmico (caldeira)', '#0e7490');
