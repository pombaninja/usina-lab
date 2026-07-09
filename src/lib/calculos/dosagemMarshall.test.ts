import { describe, it, expect } from 'vitest'
import { calcularDosagemMarshall, type CpDosagem } from './dosagemMarshall'

describe('calcularDosagemMarshall - aba Marshall FX 9,5 (golden)', () => {
  const params = { densidadeRealCap: 1.004, constantePrensa: 1.79 }

  const cpsTeor40: CpDosagem[] = [
    { teor: 4.0, cp: 1, pesoAr: 1197.5, pesoImerso: 725.3, riceTeorica: 2.672 },
    { teor: 4.0, cp: 2, pesoAr: 1198.45, pesoImerso: 726.2, riceTeorica: 2.672 },
    { teor: 4.0, cp: 3, pesoAr: 1197.2, pesoImerso: 723.4, riceTeorica: 2.672 },
  ]
  const cpsTeor45: CpDosagem[] = [
    { teor: 4.5, cp: 1, pesoAr: 1202.57, pesoImerso: 730.01, riceTeorica: 2.653 },
    { teor: 4.5, cp: 2, pesoAr: 1204.2, pesoImerso: 733.34, riceTeorica: 2.653 },
    { teor: 4.5, cp: 3, pesoAr: 1197.01, pesoImerso: 727.65, riceTeorica: 2.653 },
  ]

  it('teor 4,0% — densidade aparente e vazios médios', () => {
    const r = calcularDosagemMarshall(cpsTeor40, params)
    expect(r.pontos).toHaveLength(1)
    expect(r.pontos[0].teor).toBe(4.0)
    expect(r.pontos[0].densidadeAparente).toBeCloseTo(2.534, 3)
    expect(r.pontos[0].vazios).toBeCloseTo(5.18, 2)
  })

  it('teor 4,5% — densidade aparente e vazios médios', () => {
    const r = calcularDosagemMarshall(cpsTeor45, params)
    expect(r.pontos).toHaveLength(1)
    expect(r.pontos[0].teor).toBe(4.5)
    expect(r.pontos[0].densidadeAparente).toBeCloseTo(2.551, 3)
    expect(r.pontos[0].vazios).toBeCloseTo(3.85, 2)
  })

  it('VCB / VAM / RBV do teor 4,0% (sanidade)', () => {
    const r = calcularDosagemMarshall(cpsTeor40, params)
    const p = r.pontos[0]
    const vcbEsperado = (p.densidadeAparente * 4.0) / params.densidadeRealCap
    const vamEsperado = p.vazios + vcbEsperado
    const rbvEsperado = (vcbEsperado * 100) / vamEsperado
    expect(p.vcb).toBeCloseTo(vcbEsperado, 6)
    expect(p.vam).toBeCloseTo(vamEsperado, 6)
    expect(p.rbv).toBeCloseTo(rbvEsperado, 6)
  })

  it('combinando os dois teores: pontos ordenados e teor ótimo sugerido por interpolação', () => {
    const r = calcularDosagemMarshall([...cpsTeor40, ...cpsTeor45], params)
    expect(r.pontos.map(p => p.teor)).toEqual([4.0, 4.5])

    const v40 = r.pontos[0].vazios
    const v45 = r.pontos[1].vazios
    expect(v40).toBeGreaterThan(4.0)
    expect(v45).toBeLessThan(4.0)

    const esperado = 4.0 + ((v40 - 4.0) / (v40 - v45)) * 0.5
    expect(r.teorOtimoSugerido).not.toBeNull()
    expect(r.teorOtimoSugerido).toBeCloseTo(esperado, 6)
    expect(r.teorOtimoSugerido).toBeGreaterThan(4.0)
    expect(r.teorOtimoSugerido).toBeLessThan(4.5)
  })
})

describe('calcularDosagemMarshall - guardas', () => {
  const params = { densidadeRealCap: 1.004, constantePrensa: 1.79 }

  it('lança erro em PT-BR se nenhum corpo de prova for informado', () => {
    expect(() => calcularDosagemMarshall([], params)).toThrow(/corpo de prova/i)
  })

  it('lança erro em PT-BR se o volume de algum CP for zero ou negativo', () => {
    const cps: CpDosagem[] = [{ teor: 4.0, cp: 1, pesoAr: 700, pesoImerso: 700, riceTeorica: 2.6 }]
    expect(() => calcularDosagemMarshall(cps, params)).toThrow(/peso imerso/i)
  })

  it('teorOtimoSugerido é null quando a faixa de teores não cobre 4% de vazios', () => {
    // Ambos os pontos com vazios acima de 4% — não há cruzamento a interpolar.
    const cps: CpDosagem[] = [
      { teor: 5.0, cp: 1, pesoAr: 1197.5, pesoImerso: 725.3, riceTeorica: 2.672 },
      { teor: 5.5, cp: 1, pesoAr: 1198.45, pesoImerso: 726.2, riceTeorica: 2.672 },
    ]
    const r = calcularDosagemMarshall(cps, params)
    expect(r.teorOtimoSugerido).toBeNull()
  })
})
