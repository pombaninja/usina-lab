import { describe, it, expect } from 'vitest'
import { calcularMarshall, fatorCorrecaoPorVolume } from './marshall'

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
    // planilha exibe fator com 4 casas; diferença máxima ±0,06 kgf é artefato de arredondamento, não erro de fórmula
    expect(Math.abs(r.cps[0].estabilidadeCorrigida - 1350.66)).toBeLessThan(0.06)
    expect(Math.abs(r.medias.estabilidadeCorrigida - 1366.36)).toBeLessThan(0.06)
    expect(r.cps[0].fluenciaPol).toBeCloseTo(9.375, 3)
  })
  it('relação filler/ligante', () => {
    expect(r.relacaoFillerLigante).toBeCloseTo(1.4505, 3)
  })
})

describe('fatorCorrecaoPorVolume (tabela NBR 12891)', () => {
  it('volume 500 cm³ → fator 1,04', () => {
    expect(fatorCorrecaoPorVolume(500)).toBe(1.04)
  })
  it('volume 460 cm³ → fator 1,19; volume 570 cm³ → fator 0,86', () => {
    expect(fatorCorrecaoPorVolume(460)).toBe(1.19)
    expect(fatorCorrecaoPorVolume(570)).toBe(0.86)
  })
  it('volume fora da tabela lança erro pedindo fator manual', () => {
    expect(() => fatorCorrecaoPorVolume(400)).toThrow(/fora da tabela/)
  })
})
