-- Garante consistência entre contexto (obra/usina) e tipo do projeto de
-- materiais no nível do banco: cbuq/cbuqf só em usina, e os tipos de obra
-- só em obra. Verificado antes da aplicação: nenhuma linha existente viola.
alter table dosagens add constraint dosagens_contexto_tipo_check check (
  contexto is null
  or (contexto = 'usina' and tipo in ('cbuq','cbuqf'))
  or (contexto = 'obra'  and tipo in ('solo_brita','solo_cimento','bgtc','bgs'))
);
