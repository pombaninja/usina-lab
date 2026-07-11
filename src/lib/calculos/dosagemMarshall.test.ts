import { describe, it, expect } from 'vitest'
import { calcularDosagemMarshall, interpolarNoTeor, interpolarValorNoTeor, type CpDosagem } from './dosagemMarshall'

describe('interpolarValorNoTeor', () => {
  const pontos = [
    { teor: 4.0, valor: 2.672 },
    { teor: 5.0, valor: 2.630 },
    { teor: 6.0, valor: 2.590 },
  ]

  it('interpola linearmente entre os dois teores vizinhos', () => {
    // f = (4.6 − 4.0)/(5.0 − 4.0) = 0.6 → 2.672 + 0.6·(2.630 − 2.672) = 2.6468
    expect(interpolarValorNoTeor(pontos, 4.6)).toBeCloseTo(2.6468, 10)
  })

  it('satura no ponto de extremidade quando o teor alvo está fora da faixa', () => {
    expect(interpolarValorNoTeor(pontos, 3.0)).toBeCloseTo(2.672, 10)
    expect(interpolarValorNoTeor(pontos, 7.5)).toBeCloseTo(2.590, 10)
  })

  it('retorna null sem pontos e o próprio valor com um único ponto', () => {
    expect(interpolarValorNoTeor([], 5.0)).toBeNull()
    expect(interpolarValorNoTeor([{ teor: 5.0, valor: 2.63 }], 4.2)).toBeCloseTo(2.63, 10)
  })
})

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

  it('VCB / VAM / RBV do teor 4,0% — golden calculado por CP e depois mediado (paridade com marshall.ts)', () => {
    // Golden independente: vcb/vam/rbv calculados por CP (usando a densidade/vazios
    // DAQUELE CP) e só então mediados — não derivados da densidade/vazios já médios
    // do teor, que divergiria por serem razões não-lineares (gap de Jensen).
    // CP1: rbv 66.50, CP2: rbv 66.80, CP3: rbv 64.94 → média 66.08
    // CP1: vcb 10.10, CP2: vcb 10.11, CP3: vcb 10.07 → média 10.09
    // CP1: vam 15.19, CP2: vam 15.14, CP3: vam 15.50 → média 15.28
    const r = calcularDosagemMarshall(cpsTeor40, params)
    const p = r.pontos[0]
    expect(p.vcb).toBeCloseTo(10.09, 2)
    expect(p.vam).toBeCloseTo(15.28, 2)
    expect(p.rbv).toBeCloseTo(66.08, 2)
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

describe('calcularDosagemMarshall - detalhe por CP (golden calculado à mão)', () => {
  // CP único, valores escolhidos para conferência independente:
  //   volume = 1200 - 728 = 472
  //   densidade aparente = 1200 / 472            = 2.5423729
  //   vazios = (2.650 - 2.5423729)/2.650 * 100   = 4.061401
  //   vcb = (2.5423729 * 5.0) / 1.004            = 12.661219
  //   vam = 4.061401 + 12.661219                 = 16.722620
  //   rbv = 12.661219 * 100 / 16.722620          = 75.71338
  //   calcul = 800 * 1.79                        = 1432
  //   corrig = 1432 * 1.0 (fator informado)      = 1432
  //   fluência mm = 2.0 * 1                       = 2.0
  //   fluência pol = 2.0 * (1/32) * 100           = 6.25
  const params = { densidadeRealCap: 1.004, constantePrensa: 1.79, correcaoFluencia: 1 }
  const cp: CpDosagem = {
    teor: 5.0, cp: 1, pesoAr: 1200, pesoImerso: 728, riceTeorica: 2.650,
    leituraEstabilidade: 800, fatorCorrecao: 1.0, leituraFluencia: 2.0,
  }

  it('expõe todas as grandezas por CP, incl. calcul/corrig e fluência em polegadas', () => {
    const r = calcularDosagemMarshall([cp], params)
    expect(r.detalhes).toHaveLength(1)
    const d = r.detalhes[0]
    expect(d.teor).toBe(5.0)
    expect(d.cps).toHaveLength(1)
    const c = d.cps[0]
    expect(c.volume).toBeCloseTo(472, 3)
    expect(c.densidadeAparente).toBeCloseTo(2.5424, 4)
    expect(c.vazios).toBeCloseTo(4.0614, 4)
    expect(c.vcb).toBeCloseTo(12.6612, 4)
    expect(c.vam).toBeCloseTo(16.7226, 4)
    expect(c.rbv).toBeCloseTo(75.713, 3)
    expect(c.fator).toBe(1.0)
    expect(c.leitura).toBe(800)
    expect(c.calcul).toBeCloseTo(1432, 3)
    expect(c.corrig).toBeCloseTo(1432, 3)
    expect(c.fluenciaMm).toBeCloseTo(2.0, 3)
    expect(c.fluenciaPol).toBeCloseTo(6.25, 3)
    expect(c.inconsistente).toBe(false)
    // média de um CP único = o próprio CP
    expect(d.media.calcul).toBeCloseTo(1432, 3)
    expect(d.media.corrig).toBeCloseTo(1432, 3)
    expect(d.media.fluenciaPol).toBeCloseTo(6.25, 3)
  })

  it('marca inconsistente quando Rice ≤ densidade aparente (vazios ≤ 0)', () => {
    // densidade aparente = 1200 / 474 = 2.531646; Rice 2.50 ≤ densidade → inconsistente
    const cpRuim: CpDosagem = { teor: 5.5, cp: 1, pesoAr: 1200, pesoImerso: 726, riceTeorica: 2.50 }
    const r = calcularDosagemMarshall([cpRuim], params)
    const c = r.detalhes[0].cps[0]
    expect(c.densidadeAparente).toBeCloseTo(2.5316, 4)
    expect(c.inconsistente).toBe(true)
    expect(c.vazios).toBeLessThanOrEqual(0)
  })
})

describe('interpolarNoTeor', () => {
  const params = { densidadeRealCap: 1.004, constantePrensa: 1.79 }
  const cps: CpDosagem[] = [
    { teor: 4.0, cp: 1, pesoAr: 1197.5, pesoImerso: 725.3, riceTeorica: 2.672, leituraEstabilidade: 800, fatorCorrecao: 1, leituraFluencia: 2 },
    { teor: 4.5, cp: 1, pesoAr: 1202.57, pesoImerso: 730.01, riceTeorica: 2.653, leituraEstabilidade: 850, fatorCorrecao: 1, leituraFluencia: 3 },
  ]

  it('retorna null quando não há pontos', () => {
    expect(interpolarNoTeor([], 4.25)).toBeNull()
  })

  it('interpola linearmente entre os dois pontos que cercam o teor alvo', () => {
    const { pontos } = calcularDosagemMarshall(cps, params)
    const a = pontos[0]
    const b = pontos[1]
    const alvo = 4.25
    const f = (alvo - a.teor) / (b.teor - a.teor) // = 0.5
    const r = interpolarNoTeor(pontos, alvo)!
    expect(r.teor).toBe(alvo)
    expect(r.densidadeAparente).toBeCloseTo(a.densidadeAparente + f * (b.densidadeAparente - a.densidadeAparente), 10)
    expect(r.vazios).toBeCloseTo(a.vazios + f * (b.vazios - a.vazios), 10)
    expect(r.vcb).toBeCloseTo(a.vcb + f * (b.vcb - a.vcb), 10)
    expect(r.vam).toBeCloseTo(a.vam + f * (b.vam - a.vam), 10)
    expect(r.rbv).toBeCloseTo(a.rbv + f * (b.rbv - a.rbv), 10)
    expect(r.estabilidade).toBeCloseTo(a.estabilidade + f * (b.estabilidade - a.estabilidade), 10)
    expect(r.fluencia).toBeCloseTo(a.fluencia + f * (b.fluencia - a.fluencia), 10)
  })

  it('satura no ponto de extremidade quando o teor alvo está fora da faixa', () => {
    const { pontos } = calcularDosagemMarshall(cps, params)
    const baixo = interpolarNoTeor(pontos, 3.0)!
    expect(baixo.teor).toBe(3.0)
    expect(baixo.vazios).toBeCloseTo(pontos[0].vazios, 10)
    const alto = interpolarNoTeor(pontos, 6.0)!
    expect(alto.teor).toBe(6.0)
    expect(alto.vazios).toBeCloseTo(pontos[1].vazios, 10)
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
