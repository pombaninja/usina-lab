import { fatorCorrecaoPorVolume } from './marshall'

export interface CpDosagem {
  teor: number; cp: number; pesoAr: number; pesoImerso: number; riceTeorica: number
  leituraEstabilidade?: number; fatorCorrecao?: number; alturaCm?: number; leituraFluencia?: number
}

export interface PontoTeor {
  teor: number; densidadeAparente: number; vazios: number; vcb: number; vam: number; rbv: number
  estabilidade: number; fluencia: number
}

// Detalhe de UM corpo de prova — espelha a planilha Marshall (todas as grandezas
// calculadas por CP). `calcul` = leitura × constante da prensa; `corrig` = calcul ×
// fator = estabilidade corrigida. `inconsistente` marca Rice ≤ densidade aparente
// (vazios fisicamente impossível ≤ 0), sinalizando erro de digitação da Rice.
export interface CpDetalhe {
  cp: number; teor: number
  pesoAr: number; pesoImerso: number; volume: number
  densidadeAparente: number; riceTeorica: number
  vazios: number; vcb: number; vam: number; rbv: number
  fator: number
  leitura: number; calcul: number; corrig: number
  alturaCm: number | null
  leituraFluencia: number; fluenciaMm: number; fluenciaPol: number
  inconsistente: boolean
}

// Média aritmética de cada coluna numérica entre os CPs de um teor.
export interface MediaTeor {
  volume: number; densidadeAparente: number; riceTeorica: number
  vazios: number; vcb: number; vam: number; rbv: number
  fator: number; alturaCm: number | null
  leitura: number; calcul: number; corrig: number
  fluenciaMm: number; fluenciaPol: number
}

export interface TeorDetalhe {
  teor: number; cps: CpDetalhe[]; media: MediaTeor
}

export interface InterpolacaoTeor {
  teor: number; densidadeAparente: number; vazios: number; vcb: number; vam: number; rbv: number
  estabilidade: number; fluencia: number
}

export interface ParametrosDosagemMarshall {
  densidadeRealCap: number; constantePrensa: number; correcaoFluencia?: number
}

function media(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length }

export function calcularDosagemMarshall(
  cps: CpDosagem[],
  params: ParametrosDosagemMarshall,
): { pontos: PontoTeor[]; teorOtimoSugerido: number | null; detalhes: TeorDetalhe[] } {
  if (cps.length === 0) throw new Error('Informe ao menos um corpo de prova')

  const porTeor = new Map<number, CpDosagem[]>()
  for (const cp of cps) {
    const arr = porTeor.get(cp.teor) ?? []
    arr.push(cp)
    porTeor.set(cp.teor, arr)
  }

  const pontos: PontoTeor[] = []
  const detalhes: TeorDetalhe[] = []

  for (const [teor, grupo] of [...porTeor.entries()].sort(([a], [b]) => a - b)) {
    if (grupo.length === 0) throw new Error(`Teor ${teor}% não tem corpos de prova informados`)

    // Cada CP contribui com densidade aparente, vazios, VCB, VAM, RBV, estabilidade
    // e fluência — todas calculadas por CP (VCB/VAM/RBV usando a densidade/vazios
    // DAQUELE CP) — e só então têm sua MÉDIA tomada por teor. Isso espelha
    // marshall.ts (medias por chave) e a planilha real (aba Marshall: cada
    // grandeza é calculada por CP nas linhas 15-17 e depois mediada na linha 19).
    // Calcular vcb/vam/rbv a partir da densidade/vazios já médios do teor
    // divergiria por serem razões não-lineares (gap de Jensen).
    const calculados: CpDetalhe[] = grupo.map(cp => {
      const volume = cp.pesoAr - cp.pesoImerso
      if (volume <= 0) throw new Error(`Peso imerso deve ser menor que peso ao ar (teor ${cp.teor}%, CP ${cp.cp})`)
      const densidadeAparente = cp.pesoAr / volume
      const vazios = ((cp.riceTeorica - densidadeAparente) / cp.riceTeorica) * 100
      const vcb = (densidadeAparente * teor) / params.densidadeRealCap
      const vam = vazios + vcb
      const rbv = (vcb * 100) / vam
      // Fator automático segue o VOLUME do CP (planilha usa PROCV por faixa de volume);
      // altura permanece campo informativo. Fator manual informado sempre prevalece.
      const fator = cp.fatorCorrecao ?? fatorCorrecaoPorVolume(volume)
      const leitura = cp.leituraEstabilidade ?? 0
      const calcul = leitura * params.constantePrensa
      const corrig = calcul * fator // = estabilidadeCorrigida
      const leituraFluencia = cp.leituraFluencia ?? 0
      const fluenciaMm = leituraFluencia * (params.correcaoFluencia ?? 1)
      const fluenciaPol = fluenciaMm * (1 / 32) * 100
      return {
        cp: cp.cp, teor,
        pesoAr: cp.pesoAr, pesoImerso: cp.pesoImerso, volume,
        densidadeAparente, riceTeorica: cp.riceTeorica,
        vazios, vcb, vam, rbv, fator,
        leitura, calcul, corrig,
        alturaCm: cp.alturaCm ?? null,
        leituraFluencia, fluenciaMm, fluenciaPol,
        inconsistente: cp.riceTeorica <= densidadeAparente,
      }
    })

    // Ponto médio por teor — mantido IDÊNTICO ao comportamento anterior:
    // estabilidade = média de (leitura×constante×fator); fluência = média de (leitura×correção).
    const ponto: PontoTeor = {
      teor,
      densidadeAparente: media(calculados.map(c => c.densidadeAparente)),
      vazios: media(calculados.map(c => c.vazios)),
      vcb: media(calculados.map(c => c.vcb)),
      vam: media(calculados.map(c => c.vam)),
      rbv: media(calculados.map(c => c.rbv)),
      estabilidade: media(calculados.map(c => c.corrig)),
      fluencia: media(calculados.map(c => c.fluenciaMm)),
    }
    pontos.push(ponto)

    const alturas = calculados.map(c => c.alturaCm).filter((x): x is number => x != null)
    detalhes.push({
      teor,
      cps: calculados,
      media: {
        volume: media(calculados.map(c => c.volume)),
        densidadeAparente: ponto.densidadeAparente,
        riceTeorica: media(calculados.map(c => c.riceTeorica)),
        vazios: ponto.vazios,
        vcb: ponto.vcb,
        vam: ponto.vam,
        rbv: ponto.rbv,
        fator: media(calculados.map(c => c.fator)),
        alturaCm: alturas.length ? media(alturas) : null,
        leitura: media(calculados.map(c => c.leitura)),
        calcul: media(calculados.map(c => c.calcul)),
        corrig: ponto.estabilidade,
        fluenciaMm: ponto.fluencia,
        fluenciaPol: media(calculados.map(c => c.fluenciaPol)),
      },
    })
  }

  let teorOtimoSugerido: number | null = null
  for (let i = 0; i < pontos.length - 1; i++) {
    const atual = pontos[i]
    const proximo = pontos[i + 1]
    if (atual.vazios >= 4.0 && proximo.vazios <= 4.0) {
      teorOtimoSugerido = atual.vazios === proximo.vazios
        ? atual.teor
        : atual.teor + ((atual.vazios - 4.0) / (atual.vazios - proximo.vazios)) * (proximo.teor - atual.teor)
      break
    }
  }

  return { pontos, teorOtimoSugerido, detalhes }
}

// Índices médios interpolados linearmente no teor alvo (teor ótimo escolhido).
// Encaixa teorAlvo entre os dois pontos mais próximos por teor; fora da faixa,
// satura no ponto de extremidade. Retorna null se não houver pontos.
const CAMPOS_INTERP = ['densidadeAparente', 'vazios', 'vcb', 'vam', 'rbv', 'estabilidade', 'fluencia'] as const

// Interpolação linear de UM valor por teor — mesma semântica de encaixe/saturação
// do interpolarNoTeor (fora da faixa ensaiada, satura no ponto de extremidade).
// Usada nos cruzamentos de teor ótimo fora das curvas Marshall (ex.: DMT do RICE-TEOR).
export function interpolarValorNoTeor(pontos: { teor: number; valor: number }[], alvo: number): number | null {
  if (pontos.length === 0) return null
  const ord = [...pontos].sort((a, b) => a.teor - b.teor)
  if (alvo <= ord[0].teor) return ord[0].valor
  if (alvo >= ord[ord.length - 1].teor) return ord[ord.length - 1].valor
  for (let i = 0; i < ord.length - 1; i++) {
    const a = ord[i]
    const b = ord[i + 1]
    if (alvo >= a.teor && alvo <= b.teor) {
      const f = b.teor === a.teor ? 0 : (alvo - a.teor) / (b.teor - a.teor)
      return a.valor + f * (b.valor - a.valor)
    }
  }
  return null
}

export function interpolarNoTeor(pontos: PontoTeor[], teorAlvo: number): InterpolacaoTeor | null {
  if (pontos.length === 0) return null
  const ord = [...pontos].sort((a, b) => a.teor - b.teor)

  const projetar = (p: PontoTeor): InterpolacaoTeor => ({
    teor: teorAlvo,
    densidadeAparente: p.densidadeAparente, vazios: p.vazios, vcb: p.vcb, vam: p.vam,
    rbv: p.rbv, estabilidade: p.estabilidade, fluencia: p.fluencia,
  })

  if (teorAlvo <= ord[0].teor) return projetar(ord[0])
  if (teorAlvo >= ord[ord.length - 1].teor) return projetar(ord[ord.length - 1])

  for (let i = 0; i < ord.length - 1; i++) {
    const a = ord[i]
    const b = ord[i + 1]
    if (teorAlvo >= a.teor && teorAlvo <= b.teor) {
      const f = b.teor === a.teor ? 0 : (teorAlvo - a.teor) / (b.teor - a.teor)
      const out = { teor: teorAlvo } as InterpolacaoTeor
      for (const k of CAMPOS_INTERP) out[k] = a[k] + f * (b[k] - a[k])
      return out
    }
  }
  return null
}
