import { describe, it, expect } from 'vitest'
import { calcularMarshall } from './marshall'

describe('marshall - FX III Olimpia (golden)', () => {
  const cps = [
    { pesoAr: 1277.25, pesoImerso: 779.85, leituraEstabilidade: 700, fatorCorrecao: 1.0779, leituraFluenciaMm: 3.0 },
    { pesoAr: 1275.81, pesoImerso: 776.85, leituraEstabilidade: 710, fatorCorrecao: 1.0716, leituraFluenciaMm: 3.5 },
    { pesoAr: 1276.49, pesoImerso: 778.58, leituraEstabilidade: 720, fatorCorrecao: 1.0759, leituraFluenciaMm: 3.5 },
  ]
  const p = {
    teorLigante: 4.5991, densidadeLigante: 1.009,
    densMaxTeorica: 2.6725, constantePrensa: 1.79, passando200: 6.6709,
  }
  const r = calcularMarshall(cps, p)

  it('volume e densidade aparente', () => {
    expect(r.cps[0].volume).toBeCloseTo(497.4, 2)
    expect(r.cps[2].densidadeAparente).toBeCloseTo(2.5637, 3)
  })
  it('vazios, VCB, VAM, RBV (médias da planilha)', () => {
    expect(r.medias.vazios).toBeCloseTo(4.1047, 2)
    expect(r.medias.vcb).toBeCloseTo(11.6817, 2)
    expect(r.medias.vam).toBeCloseTo(15.7863, 2)
    expect(r.medias.rbv).toBeCloseTo(74.0063, 2)
  })
  it('estabilidade corrigida e fluência', () => {
    expect(r.cps[0].estabilidadeCorrigida).toBeCloseTo(1350.66, 0)
    expect(r.medias.estabilidadeCorrigida).toBeCloseTo(1366.36, 0)
    expect(r.cps[0].fluenciaPol).toBeCloseTo(9.375, 3)
  })
  it('relação filler/ligante', () => {
    expect(r.relacaoFillerLigante).toBeCloseTo(1.4505, 3)
  })
})
