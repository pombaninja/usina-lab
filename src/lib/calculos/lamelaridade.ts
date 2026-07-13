// Índice de Lamelaridade POR FRAÇÃO — método DAER/RS-EL 108/01 (planilha da
// Pedreira "8 - ÍNDICE DE LAMELARIDADE"). DIFERENTE do índice de forma grão a
// grão (indiceForma.ts, NBR 7809): aqui a amostra é peneirada na sequência fixa
// 2" … 1/4", cada FRAÇÃO entre peneiras consecutivas é ensaiada na fenda e o
// resultado final é a média dos IL das frações ponderada pela % de cada fração
// na granulometria da amostra.
//
// Fórmulas (colunas da planilha):
//   pesoPassanteRetido = pesoTotal − pesoAcumuladoRetido            [D = C22 − C]
//   pctPassa = pesoPassanteRetido / pesoTotal × 100                 [E]
//   pctFracao(i) = pctPassa(peneira de cima) − pctPassa(de baixo)   [I]
//   ilFracao = pesoLamelar / pesoFracao × 100, se pesoFracao > 0    [L = K/J×100]
//   ponderado = pctFracao × ilFracao                                [M = I×L]
//   IL FINAL = Σ ponderado / Σ pctFracao, somando SOMENTE as        [M23 = ΣM/ΣI]
//              frações ensaiadas (pesoFracao > 0)

/** Sequência fixa de peneiras da granulometria da amostra (coluna B da planilha). */
export const PENEIRAS_LAMELARIDADE = ['2"', '1 1/2"', '1 1/4"', '1"', '3/4"', '1/2"', '3/8"', '1/4"'] as const

/** Frações entre peneiras consecutivas (colunas F/G/H da planilha). */
export const FRACOES_LAMELARIDADE = [
  { passando: '2"', retido: '1 1/2"', faixaMm: '63 a 50' },
  { passando: '1 1/2"', retido: '1 1/4"', faixaMm: '50 a 37,5' },
  { passando: '1 1/4"', retido: '1"', faixaMm: '37,5 a 28' },
  { passando: '1"', retido: '3/4"', faixaMm: '28 a 20' },
  { passando: '3/4"', retido: '1/2"', faixaMm: '20 a 14' },
  { passando: '1/2"', retido: '3/8"', faixaMm: '14 a 10' },
  { passando: '3/8"', retido: '1/4"', faixaMm: '10 a 6,3' },
] as const

export interface FracaoLamelaridadeEntrada {
  /** J — peso da fração ensaiada na fenda (g); null/0 = fração não ensaiada. */
  pesoFracao: number | null
  /** K — peso do material que passa na fenda (g); null = 0 (como célula vazia na planilha). */
  pesoLamelar: number | null
}

export interface LinhaGranulometriaLamelaridade {
  peneira: string
  pesoAcumRetido: number | null
  pesoPassanteRetido: number | null
  pctPassa: number | null
}

export interface LinhaFracaoLamelaridade {
  passando: string
  retido: string
  faixaMm: string
  pctFracao: number | null
  pesoFracao: number | null
  pesoLamelar: number | null
  /** Fração entra nas somas do IL final (pesoFracao > 0 e pctFracao calculável). */
  ensaiada: boolean
  ilFracao: number | null
  ponderado: number | null
}

export interface ResultadoLamelaridadeFracoes {
  granulometria: LinhaGranulometriaLamelaridade[]
  fracoes: LinhaFracaoLamelaridade[]
  /** Σ1 — soma das % das frações ensaiadas. */
  somaPctFracao: number | null
  /** Σ2 — soma dos ponderados das frações ensaiadas. */
  somaPonderado: number | null
  /** IL final = Σ2/Σ1 (null enquanto nenhuma fração ensaiada tem % de fração). */
  ilFinal: number | null
}

/**
 * Calcula o Índice de Lamelaridade por fração de UM material/amostra.
 *
 * @param pesoTotal peso da amostra total (g) — C22 da planilha.
 * @param pesoAcumuladoRetido peso acumulado retido por peneira (g), alinhado a
 *   PENEIRAS_LAMELARIDADE (8 posições; null = peneira não informada).
 * @param fracoes pesos ensaiados por fração, alinhados a FRACOES_LAMELARIDADE
 *   (7 posições).
 */
export function calcularLamelaridade(
  pesoTotal: number,
  pesoAcumuladoRetido: (number | null)[],
  fracoes: FracaoLamelaridadeEntrada[],
): ResultadoLamelaridadeFracoes {
  if (!Number.isFinite(pesoTotal) || pesoTotal <= 0) {
    throw new Error('O peso da amostra total deve ser maior que zero.')
  }

  const granulometria: LinhaGranulometriaLamelaridade[] = PENEIRAS_LAMELARIDADE.map((peneira, i) => {
    const acum = pesoAcumuladoRetido[i] ?? null
    if (acum === null || !Number.isFinite(acum)) {
      return { peneira, pesoAcumRetido: null, pesoPassanteRetido: null, pctPassa: null }
    }
    const passante = pesoTotal - acum
    return { peneira, pesoAcumRetido: acum, pesoPassanteRetido: passante, pctPassa: (passante / pesoTotal) * 100 }
  })

  const linhasFracoes: LinhaFracaoLamelaridade[] = FRACOES_LAMELARIDADE.map((f, i) => {
    // Fração i fica entre a peneira i (de cima, "passando") e a i+1 (de baixo, "retido").
    const pctCima = granulometria[i].pctPassa
    const pctBaixo = granulometria[i + 1].pctPassa
    const pctFracao = pctCima !== null && pctBaixo !== null ? pctCima - pctBaixo : null

    const entrada = fracoes[i] ?? { pesoFracao: null, pesoLamelar: null }
    const pesoFracao = entrada.pesoFracao ?? null
    const pesoLamelar = entrada.pesoLamelar ?? null
    const temPesoFracao = pesoFracao !== null && Number.isFinite(pesoFracao) && pesoFracao > 0
    // Célula K vazia conta como 0 na planilha (K/J com K vazio dá IL = 0).
    const ilFracao = temPesoFracao ? ((pesoLamelar ?? 0) / pesoFracao!) * 100 : null
    const ponderado = ilFracao !== null && pctFracao !== null ? pctFracao * ilFracao : null

    return {
      passando: f.passando, retido: f.retido, faixaMm: f.faixaMm,
      pctFracao, pesoFracao, pesoLamelar,
      ensaiada: temPesoFracao && pctFracao !== null,
      ilFracao, ponderado,
    }
  })

  // IL FINAL: só as frações ensaiadas entram nas somas (regra geral da planilha —
  // o range fixo SUM(…19:21) de lá é apenas o uso atual deles).
  const ensaiadas = linhasFracoes.filter(f => f.ensaiada)
  const somaPctFracao = ensaiadas.length ? ensaiadas.reduce((s, f) => s + f.pctFracao!, 0) : null
  const somaPonderado = ensaiadas.length ? ensaiadas.reduce((s, f) => s + f.ponderado!, 0) : null
  const ilFinal = somaPctFracao !== null && somaPctFracao !== 0 ? somaPonderado! / somaPctFracao : null

  return { granulometria, fracoes: linhasFracoes, somaPctFracao, somaPonderado, ilFinal }
}
