export interface MarshallCpInput {
  pesoAr: number; pesoImerso: number
  leituraEstabilidade: number; fatorCorrecao?: number; leituraFluenciaMm: number
}
export interface MarshallParams {
  teorLigante: number; densidadeLigante: number
  densMaxTeorica: number; constantePrensa: number; passando200?: number
}
export interface MarshallCpResultado {
  volume: number; densidadeAparente: number; vazios: number
  vcb: number; vam: number; rbv: number
  estabilidadeCorrigida: number; fluenciaMm: number; fluenciaPol: number
}

// Tabela NBR 12891 (fator de correção por volume do CP, molde 4").
// Usada como sugestão quando o laboratorista não informa o fator manualmente.
const TABELA_FATOR: Array<[number, number, number]> = [
  [457, 470, 1.19], [471, 482, 1.14], [483, 495, 1.09],
  [496, 508, 1.04], [509, 522, 1.00], [523, 535, 0.96],
  [536, 546, 0.93], [547, 559, 0.89], [560, 573, 0.86],
]
export function fatorCorrecaoPorVolume(volumeCm3: number): number {
  const f = TABELA_FATOR.find(([a, b]) => volumeCm3 >= a && volumeCm3 <= b)
  if (!f) throw new Error(`Volume ${volumeCm3} cm³ fora da tabela de correção — informe o fator manualmente`)
  return f[2]
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
    const fator = cp.fatorCorrecao ?? fatorCorrecaoPorVolume(volume)
    const estabilidadeCorrigida = cp.leituraEstabilidade * p.constantePrensa * fator
    const fluenciaPol = cp.leituraFluenciaMm * (1 / 32) * 100
    return { volume, densidadeAparente, vazios, vcb, vam, rbv, estabilidadeCorrigida, fluenciaMm: cp.leituraFluenciaMm, fluenciaPol }
  })
  const chaves = Object.keys(resultados[0]) as (keyof MarshallCpResultado)[]
  const medias = Object.fromEntries(
    chaves.map(k => [k, media(resultados.map(r => r[k]))]),
  ) as unknown as MarshallCpResultado
  const relacaoFillerLigante = p.passando200 !== undefined ? p.passando200 / p.teorLigante : undefined
  return { cps: resultados, medias, relacaoFillerLigante }
}
