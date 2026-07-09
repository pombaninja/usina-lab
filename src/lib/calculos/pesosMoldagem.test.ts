import { describe, it, expect } from 'vitest'
import { calcularPesosMoldagem } from './pesosMoldagem'

// Golden: invariantes verificadas à mão (ver comentários), não uma planilha real.
// combinada: 1/2"(100%) → 3/8"(90%) → #4(60%) → #200(5%)
const combinada = [
  { peneira: '1/2"', aberturaMm: 12.5, pctPassa: 100 },
  { peneira: '3/8"', aberturaMm: 9.5, pctPassa: 90 },
  { peneira: '#4', aberturaMm: 4.75, pctPassa: 60 },
  { peneira: '#200', aberturaMm: 0.075, pctPassa: 5 },
]

describe('calcularPesosMoldagem - golden (invariantes)', () => {
  it('teor 4,0% sobre pesoTotal 1000g', () => {
    const [res] = calcularPesosMoldagem(combinada, 1000, [4.0])
    expect(res.teor).toBe(4.0)
    expect(res.pesoTotal).toBe(1000)

    // pesoCap = pesoTotal x teor/100
    expect(res.pesoCap).toBeCloseTo(40, 9)

    // Σ pesoIndividual (todas as linhas, incl. fundo) = pesoAgregado = pesoTotal x (100-teor)/100
    const somaIndividual = res.linhas.reduce((s, l) => s + l.pesoIndividual, 0)
    expect(somaIndividual).toBeCloseTo(960, 6)

    // pesoAcumulado da última linha (Fundo) = pesoAgregado
    const ultima = res.linhas[res.linhas.length - 1]
    expect(ultima.aberturaMm).toBeNull()
    expect(ultima.pesoAcumulado).toBeCloseTo(960, 6)

    // Invariante geral: acumulado final + pesoCap = pesoTotal
    expect(ultima.pesoAcumulado + res.pesoCap).toBeCloseTo(1000, 6)

    // faixa 3/8" → #4: pctRetPassante = (90-60)/100 = 0.30 → peso = 960 x 0.30 = 288
    const linha4 = res.linhas.find(l => l.peneira === '#4')!
    expect(linha4.pctRetPassante).toBeCloseTo(0.3, 9)
    expect(linha4.pesoIndividual).toBeCloseTo(288, 6)

    // Fundo: pctRetPassante = 5/100 = 0.05 → peso = 960 x 0.05 = 48
    expect(ultima.pctRetPassante).toBeCloseTo(0.05, 9)
    expect(ultima.pesoIndividual).toBeCloseTo(48, 6)
  })

  it('teor 4,5% — confere pesoCap e agregado', () => {
    const [res] = calcularPesosMoldagem(combinada, 1000, [4.5])
    expect(res.pesoCap).toBeCloseTo(45, 9)
    const somaIndividual = res.linhas.reduce((s, l) => s + l.pesoIndividual, 0)
    expect(somaIndividual).toBeCloseTo(955, 6)
  })

  it('retido acima da maior peneira (1/2") é (100 - pctPassa)/100 = 0', () => {
    const [res] = calcularPesosMoldagem(combinada, 1000, [4.0])
    const primeira = res.linhas[0]
    expect(primeira.peneira).toBe('1/2"')
    expect(primeira.pctRetPassante).toBeCloseTo(0, 9)
    expect(primeira.pesoIndividual).toBeCloseTo(0, 9)
    expect(primeira.pesoAcumulado).toBeCloseTo(0, 9)
  })

  it('linhas de saída seguem a ordem decrescente de abertura + fundo por último', () => {
    const [res] = calcularPesosMoldagem(combinada, 1000, [4.0])
    expect(res.linhas.map(l => l.aberturaMm)).toEqual([12.5, 9.5, 4.75, 0.075, null])
  })

  it('calcula múltiplos teores de uma vez, um MoldagemTeor por teor', () => {
    const res = calcularPesosMoldagem(combinada, 1000, [4.0, 4.5, 5.0])
    expect(res).toHaveLength(3)
    expect(res.map(r => r.teor)).toEqual([4.0, 4.5, 5.0])
  })

  it('ordena a combinada por abertura decrescente independente da ordem de entrada', () => {
    const foraDeOrdem = [combinada[2], combinada[0], combinada[3], combinada[1]]
    const [res] = calcularPesosMoldagem(foraDeOrdem, 1000, [4.0])
    expect(res.linhas.map(l => l.aberturaMm)).toEqual([12.5, 9.5, 4.75, 0.075, null])
  })

  it('lança erro em PT-BR se pesoTotal <= 0', () => {
    expect(() => calcularPesosMoldagem(combinada, 0, [4.0])).toThrow(/peso total/i)
    expect(() => calcularPesosMoldagem(combinada, -10, [4.0])).toThrow(/peso total/i)
  })

  it('lança erro em PT-BR se não houver teores', () => {
    expect(() => calcularPesosMoldagem(combinada, 1000, [])).toThrow(/teor/i)
  })

  it('lança erro em PT-BR se a combinada estiver vazia', () => {
    expect(() => calcularPesosMoldagem([], 1000, [4.0])).toThrow(/combinad|granulometria/i)
  })
})
