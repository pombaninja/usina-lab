-- Suporta o cálculo Marshall correto (tabela DER-SP / DNER-ME 043 completa):
-- altura do CP por corpo de prova (para achar o fator de correção pela
-- espessura, mais preciso que pelo volume) e um fator de correção de fluência
-- por ensaio (a planilha oficial usa "Correção Fluência" = 0,32 na FX III).
alter table cauq_marshall_cp add column altura_cm numeric;
alter table cauq_marshall add column correcao_fluencia numeric;
