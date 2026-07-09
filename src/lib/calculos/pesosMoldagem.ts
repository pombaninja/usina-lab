// Pesos de moldagem — Módulo 3 do Projeto CAUQ completo.
// A partir da granulometria combinada (% passa por peneira) e de um peso total
// por CP, calcula quantos gramas de agregado retido em cada faixa de peneira
// devem ser pesados para moldar o corpo de prova em cada teor de ligante.

export interface LinhaPeso {
  peneira: string
  aberturaMm: number | null // null = linha "Fundo" (o que passa na menor peneira)
  pctRetPassante: number // fração (0–1) do agregado retido nessa faixa
  pesoIndividual: number // gramas retidos nessa faixa
  pesoAcumulado: number // soma cumulativa de pesoIndividual até esta linha
}

export interface MoldagemTeor {
  teor: number
  linhas: LinhaPeso[]
  pesoCap: number
  pesoTotal: number
}

export function calcularPesosMoldagem(
  combinada: { peneira: string; aberturaMm: number; pctPassa: number }[],
  pesoTotal: number,
  teores: number[],
): MoldagemTeor[] {
  if (combinada.length === 0) throw new Error('Informe a granulometria combinada (composição) antes de calcular os pesos de moldagem.')
  if (!Number.isFinite(pesoTotal) || pesoTotal <= 0) throw new Error('O peso total por CP deve ser maior que zero.')
  if (teores.length === 0) throw new Error('Informe ao menos um teor para calcular os pesos de moldagem.')

  const ordenada = [...combinada].sort((a, b) => b.aberturaMm - a.aberturaMm)

  return teores.map((teor): MoldagemTeor => {
    const pesoAgregado = pesoTotal * (100 - teor) / 100
    const pesoCap = pesoTotal * teor / 100

    const linhas: LinhaPeso[] = []
    let acumulado = 0

    ordenada.forEach((s, i) => {
      const pctPassaAnterior = i === 0 ? 100 : ordenada[i - 1].pctPassa
      const pctRetPassante = (pctPassaAnterior - s.pctPassa) / 100
      const pesoIndividual = pesoAgregado * pctRetPassante
      acumulado += pesoIndividual
      linhas.push({ peneira: s.peneira, aberturaMm: s.aberturaMm, pctRetPassante, pesoIndividual, pesoAcumulado: acumulado })
    })

    const menor = ordenada[ordenada.length - 1]
    const pctFundo = menor.pctPassa / 100
    const pesoFundo = pesoAgregado * pctFundo
    acumulado += pesoFundo
    linhas.push({ peneira: 'Fundo', aberturaMm: null, pctRetPassante: pctFundo, pesoIndividual: pesoFundo, pesoAcumulado: acumulado })

    return { teor, linhas, pesoCap, pesoTotal }
  })
}
