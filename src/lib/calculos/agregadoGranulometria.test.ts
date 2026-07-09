import { describe, it, expect } from 'vitest'
import { calcularGranulometriaAgregado, combinarGranulometrias, type PeneiraRef, type DeterminacaoAgregado } from './agregadoGranulometria'

// Golden: planilha real, aba "PO DE PEDRA" — 2 determinações
describe('calcularGranulometriaAgregado - pó de pedra (golden)', () => {
  const peneiras: PeneiraRef[] = [
    { peneira: '3/4"', aberturaMm: 19 },
    { peneira: '1/2"', aberturaMm: 12.5 },
    { peneira: '3/8"', aberturaMm: 9.53 },
    { peneira: 'N. 04', aberturaMm: 4.8 },
    { peneira: 'N. 10', aberturaMm: 2 },
    { peneira: 'N. 40', aberturaMm: 0.42 },
    { peneira: 'N. 80', aberturaMm: 0.18 },
    { peneira: 'N. 200', aberturaMm: 0.074 },
  ]
  const dets: DeterminacaoAgregado[] = [
    { pesoTotal: 600.1, retidos: { 'N. 04': 1.8, 'N. 10': 211.7, 'N. 40': 412.2, 'N. 80': 461.2, 'N. 200': 496.6 } },
    { pesoTotal: 603.2, retidos: { 'N. 04': 2.6, 'N. 10': 228.6, 'N. 40': 432.8, 'N. 80': 478.8, 'N. 200': 511.1 } },
  ]

  it('reproduz % passando da planilha para Nº4 e Nº200', () => {
    const linhas = calcularGranulometriaAgregado(peneiras, dets)
    const n4 = linhas.find(l => l.peneira === 'N. 04')!
    const n200 = linhas.find(l => l.peneira === 'N. 200')!
    expect(n4.retidoMedio).toBeCloseTo(2.2, 6)
    expect(Number(n4.pctPassa.toFixed(2))).toBe(99.63)
    expect(n200.retidoMedio).toBeCloseTo(503.85, 6)
    // 503.85 / 601.65 * 100 = 83.7447...% retida (confirmado por dupla checagem manual)
    // → %passa = 16.2553% → arredonda para 16.26 (a estimativa de referência de 16.25
    // partia de %retida≈83.7466, que tem um pequeno desvio de arredondamento manual)
    expect(Number(n200.pctPassa.toFixed(2))).toBe(16.26)
  })

  it('peneiras acima de Nº4 sem retido informado ficam em 100% passando', () => {
    const linhas = calcularGranulometriaAgregado(peneiras, dets)
    const tresQuartos = linhas.find(l => l.peneira === '3/4"')!
    expect(tresQuartos.retidoMedio).toBe(0)
    expect(tresQuartos.pctPassa).toBe(100)
  })

  it('retorna as linhas ordenadas da maior para a menor abertura', () => {
    const linhas = calcularGranulometriaAgregado(peneiras, dets)
    expect(linhas.map(l => l.aberturaMm)).toEqual([19, 12.5, 9.53, 4.8, 2, 0.42, 0.18, 0.074])
  })

  it('lança erro em PT-BR se não houver determinações', () => {
    expect(() => calcularGranulometriaAgregado(peneiras, [])).toThrow(/determinaç/i)
  })

  it('lança erro em PT-BR se todos os pesos totais forem inválidos', () => {
    const invalidas: DeterminacaoAgregado[] = [{ pesoTotal: 0, retidos: {} }, { pesoTotal: -5, retidos: {} }]
    expect(() => calcularGranulometriaAgregado(peneiras, invalidas)).toThrow(/peso total/i)
  })
})

describe('combinarGranulometrias', () => {
  it('combina duas granulometrias ponderando pela % na mistura', () => {
    const linhasA = [
      { peneira: 'N. 04', aberturaMm: 4.8, retidoMedio: 0, pctRetida: 0, pctPassa: 100 },
      { peneira: 'N. 40', aberturaMm: 0.42, retidoMedio: 0, pctRetida: 50, pctPassa: 50 },
      { peneira: 'N. 200', aberturaMm: 0.074, retidoMedio: 0, pctRetida: 90, pctPassa: 10 },
    ]
    const linhasB = [
      { peneira: 'N. 04', aberturaMm: 4.8, retidoMedio: 0, pctRetida: 20, pctPassa: 80 },
      { peneira: 'N. 40', aberturaMm: 0.42, retidoMedio: 0, pctRetida: 80, pctPassa: 20 },
      { peneira: 'N. 200', aberturaMm: 0.074, retidoMedio: 0, pctRetida: 98, pctPassa: 2 },
    ]
    const combinado = combinarGranulometrias([
      { pctNaMistura: 60, linhas: linhasA },
      { pctNaMistura: 40, linhas: linhasB },
    ])
    const n4 = combinado.find(l => l.peneira === 'N. 04')!
    const n40 = combinado.find(l => l.peneira === 'N. 40')!
    const n200 = combinado.find(l => l.peneira === 'N. 200')!
    expect(n4.pctPassa).toBeCloseTo(0.6 * 100 + 0.4 * 80, 9)
    expect(n40.pctPassa).toBeCloseTo(0.6 * 50 + 0.4 * 20, 9)
    expect(n200.pctPassa).toBeCloseTo(0.6 * 10 + 0.4 * 2, 9)
  })

  it('retorna ordenado da maior para a menor abertura', () => {
    const linhasA = [
      { peneira: 'N. 40', aberturaMm: 0.42, retidoMedio: 0, pctRetida: 50, pctPassa: 50 },
      { peneira: 'N. 04', aberturaMm: 4.8, retidoMedio: 0, pctRetida: 0, pctPassa: 100 },
    ]
    const combinado = combinarGranulometrias([{ pctNaMistura: 100, linhas: linhasA }])
    expect(combinado.map(l => l.aberturaMm)).toEqual([4.8, 0.42])
  })
})
