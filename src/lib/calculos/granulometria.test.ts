import { describe, it, expect } from 'vitest'
import { calcularGranulometria, normalizarPeneira } from './granulometria'

// Golden: Granulometria Pedrisco 3/8 — Pedreira Viradouro, 15/09/2025
describe('granulometria - pedrisco 3/8 (golden)', () => {
  const leituras = [
    { peneira: '3/4"', aberturaMm: 19.0, retidoAcum: 0 },
    { peneira: '1/2"', aberturaMm: 12.5, retidoAcum: 0 },
    { peneira: '3/8"', aberturaMm: 9.53, retidoAcum: 0 },
    { peneira: 'N. 04', aberturaMm: 4.76, retidoAcum: 618 },
    { peneira: 'N. 10', aberturaMm: 2.0, retidoAcum: 1488 },
    { peneira: 'N. 40', aberturaMm: 0.42, retidoAcum: 1502 },
    { peneira: 'N. 80', aberturaMm: 0.18, retidoAcum: 1502 },
    { peneira: 'N. 200', aberturaMm: 0.075, retidoAcum: 1502 },
  ]
  it('reproduz % passando da planilha', () => {
    const r = calcularGranulometria(1506, leituras)
    const passando = r.linhas.map(l => Number(l.pctPassando.toFixed(1)))
    expect(passando).toEqual([100.0, 100.0, 100.0, 59.0, 1.2, 0.3, 0.3, 0.3])
  })
})

// Golden: Laudo FX III Olímpia — granulometria da mistura (peso total 943,65 g)
describe('granulometria - FX III Olimpia (golden)', () => {
  const leituras = [
    { peneira: '3/4"', aberturaMm: 19.0, retidoAcum: 0 },
    { peneira: '1/2"', aberturaMm: 12.5, retidoAcum: 64.95 },
    { peneira: '3/8"', aberturaMm: 9.53, retidoAcum: 123.36 },
    { peneira: 'N. 04', aberturaMm: 4.76, retidoAcum: 398.5 },
    { peneira: 'N. 10', aberturaMm: 2.0, retidoAcum: 653.25 },
    { peneira: 'N. 40', aberturaMm: 0.42, retidoAcum: 805.8 },
    { peneira: 'N. 80', aberturaMm: 0.18, retidoAcum: 849.1 },
    { peneira: 'N. 200', aberturaMm: 0.075, retidoAcum: 880.7 },
  ]
  it('reproduz % passando da planilha', () => {
    const r = calcularGranulometria(943.65, leituras)
    const passando = r.linhas.map(l => Number(l.pctPassando.toFixed(4)))
    expect(passando[1]).toBeCloseTo(93.1172, 3)
    expect(passando[3]).toBeCloseTo(57.7704, 3)
    expect(passando[7]).toBeCloseTo(6.6709, 3)
  })
  it('rejeita retido acumulado maior que o peso total', () => {
    const invalidas = [{ peneira: 'N. 04', aberturaMm: 4.76, retidoAcum: 1000 }]
    expect(() => calcularGranulometria(943.65, invalidas)).toThrow(/maior que o peso total/)
  })
  it('faixa de trabalho = projeto ± tolerância, limitada à especificada', () => {
    const faixa = [
      { peneira: 'N. 04', passanteMin: 44, passanteMax: 72, toleranciaTrabalho: 5 },
    ]
    const curvaProjeto = { 'N. 04': 54.6 }
    const r = calcularGranulometria(943.65, leituras, faixa, curvaProjeto)
    const n4 = r.linhas.find(l => l.peneira === 'N. 04')!
    expect(n4.trabMin).toBeCloseTo(49.6, 5)   // valores da planilha (I42/J42)
    expect(n4.trabMax).toBeCloseTo(59.6, 5)
    expect(n4.conforme).toBe(true)            // 57.77 está dentro de [49.6, 59.6]
  })
  it('cruza faixa cadastrada como "# 4" com leitura "N. 04"', () => {
    const r = calcularGranulometria(943.65, [{ peneira: 'N. 04', aberturaMm: 4.76, retidoAcum: 398.5 }],
      [{ peneira: '# 4', passanteMin: 44, passanteMax: 72, toleranciaTrabalho: 5 }], { '# 4': 54.6 })
    const l = r.linhas[0]
    expect(l.espMin).toBe(44); expect(l.trabMin).toBeCloseTo(49.6, 5)
  })
})

describe('granulometria - ordenação decrescente por abertura', () => {
  it('sempre retorna linhas da maior para a menor abertura, independente da ordem de entrada', () => {
    const leituras = [
      { peneira: 'N. 10', aberturaMm: 2.0, retidoAcum: 1488 },
      { peneira: '3/4"', aberturaMm: 19.0, retidoAcum: 0 },
      { peneira: 'N. 200', aberturaMm: 0.075, retidoAcum: 1502 },
      { peneira: '3/8"', aberturaMm: 9.53, retidoAcum: 0 },
    ]
    const r = calcularGranulometria(1506, leituras)
    expect(r.linhas.map(l => l.aberturaMm)).toEqual([19, 9.53, 2, 0.075])
  })
})

describe('normalizarPeneira', () => {
  it('equivale grafias comuns', () => {
    expect(normalizarPeneira('# 4')).toBe(normalizarPeneira('N. 04'))
    expect(normalizarPeneira('N. 200')).toBe(normalizarPeneira('#200'))
    expect(normalizarPeneira('3/8"')).toBe(normalizarPeneira(' 3/8 '))
    expect(normalizarPeneira('1/2"')).toBe(normalizarPeneira('1/2'))
  })
  it('não colide peneiras diferentes', () => {
    expect(normalizarPeneira('N. 04')).not.toBe(normalizarPeneira('N. 10'))
    expect(normalizarPeneira('3/4"')).not.toBe(normalizarPeneira('3/8"'))
    expect(normalizarPeneira('1"')).not.toBe(normalizarPeneira('1/2"'))
  })
})
