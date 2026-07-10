import { describe, it, expect } from 'vitest'
import { teorRotarex, gmmRice } from './teorBetume'

describe('teor de betume Rotarex (golden)', () => {
  it('laudo PDF Fx III 30/06/2025: 1060/1010 g, umidade 0 → 4,72%', () => {
    expect(teorRotarex(1060, 1010, 0)).toBeCloseTo(4.717, 2)
  })
  it('laudo FX III Olimpia: 991,22/943,65 g, umidade 0,2% → valor da célula L14', () => {
    // Substituir o esperado pelo valor exato da célula L14 (4,5991) após confirmar a fórmula no Step 1
    expect(teorRotarex(991.22, 943.65, 0.2)).toBeCloseTo(4.5991, 2)
  })
})

describe('densidade máxima teórica Rice (golden)', () => {
  it('laudo FX III Olimpia: frasco 2450,25 / 7652,31 / 9188,39, fator 0,9971 → 2,6725', () => {
    expect(gmmRice(2450.25, 7652.31, 9188.39, 0.9971)).toBeCloseTo(2.6725, 3)
  })
})

describe('RICE-TEOR — DMT por teor (golden, reutiliza gmmRice)', () => {
  it('leitura RICE-TEOR realista: A=1211,5 / B=7623,4 / C=8365,1, fator 1 → 2,5788', () => {
    // DMT = A/(A+B−C)·fator = 1211,5/(1211,5+7623,4−8365,1) = 1211,5/469,8 = 2,578757…
    expect(gmmRice(1211.5, 7623.4, 8365.1, 1)).toBeCloseTo(2.5788, 3)
  })
})

describe('validação de entradas', () => {
  it('teorRotarex rejeita pesos inválidos', () => {
    expect(() => teorRotarex(0, 10)).toThrow(/inválidos/)
    expect(() => teorRotarex(100, 0)).toThrow(/inválidos/)
    expect(() => teorRotarex(100, 150)).toThrow(/inválidos/)
  })
  it('gmmRice rejeita leituras inconsistentes (denominador ≤ 0)', () => {
    expect(() => gmmRice(100, 200, 400)).toThrow(/inconsistentes/)
  })
})
