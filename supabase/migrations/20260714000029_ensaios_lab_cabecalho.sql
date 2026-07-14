-- Cabeçalho completo do Ensaio CBUQ nos Ensaios Lab: o "Ensaio CBUQ completo"
-- (e demais ensaios de mistura) passa a carregar as MESMAS informações de
-- cabeçalho do Ensaio CAUQ diário (ensaios_cauq, 20260706000002): período,
-- cliente/obra, placa do caminhão, local de extração, operador, temperatura do
-- CAP e observações. Colunas ADITIVAS e nullable — ensaios de agregado seguem
-- com o cabeçalho simples (data/material/origem) e ficam com null aqui.

alter table ensaios_lab add column periodo text check (periodo in ('manha','tarde','noite'));
alter table ensaios_lab add column cliente_obra_id uuid references clientes_obras(id);
alter table ensaios_lab add column placa_caminhao text;
alter table ensaios_lab add column local_extracao text;
alter table ensaios_lab add column operador text;
alter table ensaios_lab add column temperatura_cap numeric;
alter table ensaios_lab add column observacoes text;
