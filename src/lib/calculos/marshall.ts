export interface MarshallCpInput {
  pesoAr: number; pesoImerso: number
  leituraEstabilidade: number; fatorCorrecao?: number; leituraFluenciaMm: number
  alturaCm?: number
}
export interface MarshallParams {
  teorLigante: number; densidadeLigante: number
  densMaxTeorica: number; constantePrensa: number; passando200?: number
  correcaoFluencia?: number
}
export interface MarshallCpResultado {
  volume: number; densidadeAparente: number; vazios: number
  vcb: number; vam: number; rbv: number
  estabilidadeCorrigida: number; fluenciaMm: number; fluenciaPol: number
}

// Tabela de correção Marshall (DNER-ME 043 / DER-SP) — [espessura_cm, volume_cm3, fator].
// Transcrita da planilha 'Laudo Técnico FX 9,5 DER-RVB 2024.xlsx'.
const TABELA_CORRECAO_MARSHALL: Array<[number, number, number]> = [
  [5.08, 411.8, 1.46],
  [5.1, 413.5, 1.45],
  [5.12, 415.1, 1.44],
  [5.16, 418.3, 1.43],
  [5.18, 420, 1.42],
  [5.2, 421.6, 1.41],
  [5.22, 423.2, 1.4],
  [5.24, 424.8, 1.39],
  [5.26, 426.4, 1.38],
  [5.29, 428.9, 1.37],
  [5.31, 430.5, 1.36],
  [5.33, 432.1, 1.35],
  [5.35, 433.7, 1.34],
  [5.38, 436.2, 1.33],
  [5.4, 437.8, 1.32],
  [5.42, 439.4, 1.31],
  [5.45, 441.8, 1.3],
  [5.47, 443.5, 1.29],
  [5.49, 445.1, 1.28],
  [5.51, 446.7, 1.27],
  [5.54, 449.1, 1.26],
  [5.56, 450.8, 1.25],
  [5.58, 452.4, 1.24],
  [5.61, 454.8, 1.23],
  [5.63, 456.4, 1.22],
  [5.66, 458.9, 1.21],
  [5.68, 460.5, 1.2],
  [5.71, 462.9, 1.19],
  [5.74, 465.4, 1.18],
  [5.77, 467.8, 1.17],
  [5.81, 471, 1.16],
  [5.84, 473.5, 1.15],
  [5.87, 475.9, 1.14],
  [5.9, 478.3, 1.13],
  [5.93, 480.8, 1.12],
  [5.97, 484, 1.11],
  [6, 486.4, 1.1],
  [6.03, 488.9, 1.09],
  [6.06, 491.3, 1.08],
  [6.09, 493.7, 1.07],
  [6.11, 495.4, 1.06],
  [6.14, 497.8, 1.05],
  [6.19, 501.6, 1.04],
  [6.23, 505.1, 1.03],
  [6.27, 508.3, 1.02],
  [6.31, 511.6, 1.01],
  [6.35, 514.8, 1],
  [6.39, 518.1, 0.99],
  [6.43, 521.3, 0.98],
  [6.47, 524.5, 0.97],
  [6.51, 527.8, 0.96],
  [6.56, 531.2, 0.95],
  [6.61, 535.9, 0.94],
  [6.67, 540.8, 0.93],
  [6.71, 544, 0.92],
  [6.75, 547.2, 0.91],
  [6.79, 550.5, 0.9],
  [6.83, 553.7, 0.89],
  [6.88, 557.8, 0.88],
  [6.93, 561.8, 0.87],
  [6.98, 565.9, 0.86],
  [7.03, 569.9, 0.85],
  [7.08, 574, 0.84],
  [7.14, 578.9, 0.83],
  [7.22, 585.3, 0.82],
  [7.3, 591.8, 0.81],
  [7.35, 595.9, 0.8],
  [7.4, 599.9, 0.79],
  [7.46, 604.8, 0.78],
  [7.54, 611.3, 0.77],
  [7.62, 617.8, 0.76],
]

function fatorPorColunaMaisProxima(valor: number, coluna: 0 | 1): number {
  let melhor = TABELA_CORRECAO_MARSHALL[0]
  let menorDist = Math.abs(melhor[coluna] - valor)
  for (const linha of TABELA_CORRECAO_MARSHALL) {
    const dist = Math.abs(linha[coluna] - valor)
    if (dist < menorDist) { melhor = linha; menorDist = dist }
  }
  return melhor[2]
}

// Fator de correção pela espessura (cm) do CP — usa a linha da tabela DER cuja
// espessura está mais próxima da informada (tabela fina; sem lançar erro, satura nas pontas).
export function fatorCorrecaoPorEspessura(alturaCm: number): number {
  return fatorPorColunaMaisProxima(alturaCm, 0)
}

// Fator de correção pelo volume (cm³) do CP — usa a linha da tabela DER cujo
// volume está mais próximo do informado (tabela fina; sem lançar erro, satura nas pontas).
export function fatorCorrecaoPorVolume(volumeCm3: number): number {
  return fatorPorColunaMaisProxima(volumeCm3, 1)
}

function media(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length }

export function calcularMarshall(cps: MarshallCpInput[], p: MarshallParams) {
  if (cps.length === 0) throw new Error('Informe ao menos um corpo de prova')
  const resultados: MarshallCpResultado[] = cps.map((cp) => {
    const volume = cp.pesoAr - cp.pesoImerso
    if (volume <= 0) throw new Error('Peso imerso deve ser menor que peso ao ar')
    const densidadeAparente = cp.pesoAr / volume
    const vazios = ((p.densMaxTeorica - densidadeAparente) / p.densMaxTeorica) * 100
    const vcb = (densidadeAparente * p.teorLigante) / p.densidadeLigante
    const vam = vazios + vcb
    const rbv = (vcb * 100) / vam
    const fator = cp.fatorCorrecao ?? (cp.alturaCm != null ? fatorCorrecaoPorEspessura(cp.alturaCm) : fatorCorrecaoPorVolume(volume))
    const estabilidadeCorrigida = cp.leituraEstabilidade * p.constantePrensa * fator
    const fluenciaMm = cp.leituraFluenciaMm * (p.correcaoFluencia ?? 1)
    const fluenciaPol = fluenciaMm * (1 / 32) * 100
    return { volume, densidadeAparente, vazios, vcb, vam, rbv, estabilidadeCorrigida, fluenciaMm, fluenciaPol }
  })
  const chaves = Object.keys(resultados[0]) as (keyof MarshallCpResultado)[]
  const medias = Object.fromEntries(
    chaves.map(k => [k, media(resultados.map(r => r[k]))]),
  ) as unknown as MarshallCpResultado
  const relacaoFillerLigante = p.passando200 !== undefined ? p.passando200 / p.teorLigante : undefined
  return { cps: resultados, medias, relacaoFillerLigante }
}
