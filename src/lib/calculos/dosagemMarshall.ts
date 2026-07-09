import { fatorCorrecaoPorEspessura, fatorCorrecaoPorVolume } from './marshall'

export interface CpDosagem {
  teor: number; cp: number; pesoAr: number; pesoImerso: number; riceTeorica: number
  leituraEstabilidade?: number; fatorCorrecao?: number; alturaCm?: number; leituraFluencia?: number
}

export interface PontoTeor {
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
): { pontos: PontoTeor[]; teorOtimoSugerido: number | null } {
  if (cps.length === 0) throw new Error('Informe ao menos um corpo de prova')

  const porTeor = new Map<number, CpDosagem[]>()
  for (const cp of cps) {
    const arr = porTeor.get(cp.teor) ?? []
    arr.push(cp)
    porTeor.set(cp.teor, arr)
  }

  const pontos: PontoTeor[] = [...porTeor.entries()]
    .sort(([a], [b]) => a - b)
    .map(([teor, grupo]) => {
      if (grupo.length === 0) throw new Error(`Teor ${teor}% não tem corpos de prova informados`)

      // Cada CP contribui com densidade aparente, vazios, VCB, VAM, RBV, estabilidade
      // e fluência — todas calculadas por CP (VCB/VAM/RBV usando a densidade/vazios
      // DAQUELE CP) — e só então têm sua MÉDIA tomada por teor. Isso espelha
      // marshall.ts (medias por chave) e a planilha real (aba Marshall: cada
      // grandeza é calculada por CP nas linhas 15-17 e depois mediada na linha 19).
      // Calcular vcb/vam/rbv a partir da densidade/vazios já médios do teor
      // divergiria por serem razões não-lineares (gap de Jensen).
      const calculados = grupo.map(cp => {
        const volume = cp.pesoAr - cp.pesoImerso
        if (volume <= 0) throw new Error(`Peso imerso deve ser menor que peso ao ar (teor ${cp.teor}%, CP ${cp.cp})`)
        const densidadeAparente = cp.pesoAr / volume
        const vazios = ((cp.riceTeorica - densidadeAparente) / cp.riceTeorica) * 100
        const vcb = (densidadeAparente * teor) / params.densidadeRealCap
        const vam = vazios + vcb
        const rbv = (vcb * 100) / vam
        const fator = cp.fatorCorrecao ?? (cp.alturaCm != null ? fatorCorrecaoPorEspessura(cp.alturaCm) : fatorCorrecaoPorVolume(volume))
        const estabilidade = (cp.leituraEstabilidade ?? 0) * params.constantePrensa * fator
        const fluencia = (cp.leituraFluencia ?? 0) * (params.correcaoFluencia ?? 1)
        return { densidadeAparente, vazios, vcb, vam, rbv, estabilidade, fluencia }
      })

      return {
        teor,
        densidadeAparente: media(calculados.map(c => c.densidadeAparente)),
        vazios: media(calculados.map(c => c.vazios)),
        vcb: media(calculados.map(c => c.vcb)),
        vam: media(calculados.map(c => c.vam)),
        rbv: media(calculados.map(c => c.rbv)),
        estabilidade: media(calculados.map(c => c.estabilidade)),
        fluencia: media(calculados.map(c => c.fluencia)),
      }
    })

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

  return { pontos, teorOtimoSugerido }
}
