// Equivalente de areia — Módulo 5a do Projeto CAUQ completo (Ensaios complementares simples).
// DNER-ME 054/94: EA = leituraTopoAreia / leituraTopoArgila x 100, por determinação.
// O resultado do ensaio é a média das determinações.

export interface DeterminacaoEA {
  leituraAreia: number
  leituraArgila: number
}

export function equivalenteAreia(dets: DeterminacaoEA[]): number {
  if (!dets.length) throw new Error('Informe ao menos uma determinação de equivalente de areia.')
  if (dets.some(d => !Number.isFinite(d.leituraArgila) || d.leituraArgila <= 0)) {
    throw new Error('A leitura do topo da argila deve ser maior que zero em todas as determinações.')
  }
  const soma = dets.reduce((s, d) => s + (d.leituraAreia / d.leituraArgila) * 100, 0)
  return soma / dets.length
}
