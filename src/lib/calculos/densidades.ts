// Densidades — Módulo 4 do Projeto CAUQ completo.
// Densidade real/aparente/absorção do agregado graúdo (DNER-ME 081/98), densidade
// real do agregado miúdo por picnômetro (DNER-ME 084/95) e massa específica real
// média da mistura (MERM). O Rice/DMT da mistura asfáltica reaproveita `gmmRice`
// de teorBetume.ts — não é reescrito aqui.

export interface DensidadeGraudo {
  real: number
  aparente: number
  absorcao: number
}

// DNER-ME 081/98 — Agregado graúdo: A = peso ao ar seco, B = peso ao ar saturado
// superfície seca, C = peso imerso (todos em g).
// real = A/(A-C); aparente = A/(B-C); absorção (%) = (B-A)/A x 100.
export function densidadeAgregadoGraudo(pesoArSeco: number, pesoSaturado: number, pesoImerso: number): DensidadeGraudo {
  if (!Number.isFinite(pesoArSeco) || pesoArSeco <= 0) throw new Error('Peso ao ar seco deve ser maior que zero.')
  const volumeReal = pesoArSeco - pesoImerso
  const volumeAparente = pesoSaturado - pesoImerso
  if (volumeReal <= 0 || volumeAparente <= 0) {
    throw new Error('Leituras inconsistentes: o peso imerso deve ser menor que os pesos ao ar seco e saturado superfície seca.')
  }
  return {
    real: pesoArSeco / volumeReal,
    aparente: pesoArSeco / volumeAparente,
    absorcao: ((pesoSaturado - pesoArSeco) / pesoArSeco) * 100,
  }
}

// DNER-ME 084/95 — Agregado miúdo por picnômetro. Leituras brutas (g):
//   pesoPicnometro       — peso do picnômetro vazio
//   pesoPicAgregado      — peso do picnômetro + agregado seco
//   pesoPicAgua          — peso do picnômetro + água (até a marca de aferição)
//   pesoPicAgregadoAgua  — peso do picnômetro + agregado + água (até a marca)
//   fatorCorrecaoTemp    — fator de correção de temperatura da tabela DNER (1 = sem correção)
// Fórmula (conforme aba "DENS. REAL" da planilha, linhas 24-32):
//   pesoAgregado             = pesoPicAgregado - pesoPicnometro
//   pesoAgua                 = pesoPicAgua - pesoPicnometro
//   volumeAguaNaoDeslocada    = pesoPicAgregadoAgua - pesoPicAgregado
//   volumeAguaDeslocada       = pesoAgua - volumeAguaNaoDeslocada
//   massaEspecificaReal       = pesoAgregado / volumeAguaDeslocada
// O resultado final é multiplicado pelo fator de correção de temperatura.
export function densidadeAgregadoMiudo(
  pesoPicnometro: number,
  pesoPicAgregado: number,
  pesoPicAgua: number,
  pesoPicAgregadoAgua: number,
  fatorCorrecaoTemp = 1,
): number {
  const pesoAgregado = pesoPicAgregado - pesoPicnometro
  if (!Number.isFinite(pesoAgregado) || pesoAgregado <= 0) {
    throw new Error('Peso do agregado (picnômetro + agregado − picnômetro) deve ser maior que zero.')
  }
  const pesoAgua = pesoPicAgua - pesoPicnometro
  const volumeAguaNaoDeslocada = pesoPicAgregadoAgua - pesoPicAgregado
  const volumeAguaDeslocada = pesoAgua - volumeAguaNaoDeslocada
  if (!Number.isFinite(volumeAguaDeslocada) || volumeAguaDeslocada <= 0) {
    throw new Error('Leituras do picnômetro inconsistentes: o volume de água deslocada deve ser maior que zero.')
  }
  return (pesoAgregado / volumeAguaDeslocada) * fatorCorrecaoTemp
}

// Massa específica real média da mistura (MERM) = 100 / Σ (%agregado / densidadeReal_agregado)
// — média harmônica ponderada pelos percentuais de composição.
export function massaEspecificaRealMedia(agregados: { pct: number; densidadeReal: number }[]): number {
  if (!agregados.length) throw new Error('Informe ao menos um agregado para calcular a massa específica real média da mistura.')
  const somaPct = agregados.reduce((soma, a) => soma + a.pct, 0)
  if (!Number.isFinite(somaPct) || somaPct <= 0) throw new Error('A soma dos percentuais dos agregados deve ser maior que zero.')
  if (agregados.some(a => !Number.isFinite(a.densidadeReal) || a.densidadeReal <= 0)) {
    throw new Error('A densidade real de todos os agregados deve ser maior que zero.')
  }
  const somaInversos = agregados.reduce((soma, a) => soma + a.pct / a.densidadeReal, 0)
  return 100 / somaInversos
}
