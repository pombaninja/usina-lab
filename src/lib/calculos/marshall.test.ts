import { describe, it, expect } from 'vitest'
import { calcularMarshall, fatorCorrecaoPorVolume, fatorCorrecaoPorEspessura } from './marshall'

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

describe('fatorCorrecaoPorVolume (tabela DER-SP / DNER-ME 043)', () => {
  it('volume 514,8 cm³ (linha exata) → fator 1,0', () => {
    expect(fatorCorrecaoPorVolume(514.8)).toBe(1)
  })
  it('volume 411,8 cm³ (extremo inferior da tabela) → fator 1,46', () => {
    expect(fatorCorrecaoPorVolume(411.8)).toBe(1.46)
  })
  it('volume 617,8 cm³ (extremo superior da tabela) → fator 0,76', () => {
    expect(fatorCorrecaoPorVolume(617.8)).toBe(0.76)
  })
  it('volume 500 cm³ (sem linha exata) → usa o volume mais próximo (501,6 → fator 1,04)', () => {
    expect(fatorCorrecaoPorVolume(500)).toBe(1.04)
  })
  it('volume fora da tabela não lança erro — satura na ponta mais próxima', () => {
    expect(fatorCorrecaoPorVolume(400)).toBe(1.46)
    expect(fatorCorrecaoPorVolume(700)).toBe(0.76)
  })
})

describe('fatorCorrecaoPorEspessura (tabela DER-SP / DNER-ME 043)', () => {
  it('espessura 6,35 cm (linha exata) → fator 1,0', () => {
    expect(fatorCorrecaoPorEspessura(6.35)).toBe(1)
  })
  it('espessura 5,08 cm (extremo inferior) → fator 1,46', () => {
    expect(fatorCorrecaoPorEspessura(5.08)).toBe(1.46)
  })
  it('espessura 7,62 cm (extremo superior) → fator 0,76', () => {
    expect(fatorCorrecaoPorEspessura(7.62)).toBe(0.76)
  })
})

describe('correção de fluência', () => {
  it('fluência lida é multiplicada pelo fator de correção do ensaio (planilha: 0,32)', () => {
    const r = calcularMarshall(
      [{ pesoAr: 1200, pesoImerso: 700, leituraEstabilidade: 0, fatorCorrecao: 1, leituraFluenciaMm: 8.4375 }],
      { teorLigante: 5, densidadeLigante: 1.009, densMaxTeorica: 2.6, constantePrensa: 1.782, correcaoFluencia: 0.32 },
    )
    expect(r.cps[0].fluenciaMm).toBeCloseTo(2.7, 3)
  })
  it('sem correção informada, fluência lida passa direto (fator implícito 1)', () => {
    const r = calcularMarshall(
      [{ pesoAr: 1200, pesoImerso: 700, leituraEstabilidade: 0, fatorCorrecao: 1, leituraFluenciaMm: 3.5 }],
      { teorLigante: 5, densidadeLigante: 1.009, densMaxTeorica: 2.6, constantePrensa: 1.782 },
    )
    expect(r.cps[0].fluenciaMm).toBe(3.5)
  })
})
