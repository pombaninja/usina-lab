-- Projetos de Materiais: contexto Obra/Usina + taxonomia de tipo ampliada +
-- características de projeto (parametros_projeto) + composição da mistura ampliada.

alter table dosagens add column contexto text check (contexto in ('obra','usina'));
alter table dosagens add column parametros_projeto jsonb;

-- remove a constraint antiga antes da migração de dados (o valor 'cbuq' ainda
-- não é aceito por ela, e as linhas antigas ainda não batem com a nova lista)
alter table dosagens drop constraint dosagens_tipo_check;

-- migração de dados existentes
update dosagens set contexto = 'usina', tipo = 'cbuq' where tipo = 'cauq';
update dosagens set contexto = 'obra' where tipo in ('bgs','solo_brita');

-- nova taxonomia de tipo, aplicada já com os dados migrados
alter table dosagens add constraint dosagens_tipo_check
  check (tipo in ('cbuq','cbuqf','solo_brita','solo_cimento','bgtc','bgs'));

-- composição da mistura (amplia a tabela existente, ainda sem uso na UI)
alter table dosagem_composicao add column origem text;
alter table dosagem_composicao add column material_nome text;
alter table dosagem_composicao add column local text;
alter table dosagem_composicao add column pct_seca numeric;

-- silo/material_id deixam de ser obrigatórios: composição do CBUQ na tela de
-- Projetos de Materiais é digitada em texto livre (origem/material/local), sem
-- vínculo obrigatório a silo físico ou material cadastrado.
alter table dosagem_composicao alter column silo drop not null;
