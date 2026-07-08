-- Tolerâncias (± range) por peneira definidas na própria dosagem;
-- quando presentes, sobrepõem a tolerancia_trabalho da especificação.
alter table dosagens add column curva_tolerancias jsonb;

-- Traço é responsabilidade do avaliador: escrita restrita a avaliador/admin
drop policy wr_dosagens on dosagens;
create policy wr_dosagens on dosagens for all
  using (tem_papel('ensaios_usina', array['avaliador','admin']))
  with check (tem_papel('ensaios_usina', array['avaliador','admin']));
drop policy wr_dosagem_composicao on dosagem_composicao;
create policy wr_dosagem_composicao on dosagem_composicao for all
  using (tem_papel('ensaios_usina', array['avaliador','admin']))
  with check (tem_papel('ensaios_usina', array['avaliador','admin']));
