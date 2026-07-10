import { describe, it, expect } from 'vitest'
import { equivalenteAreia } from './equivalenteAreia'

describe('equivalenteAreia - golden (DNER-ME 054/94)', () => {
  it('uma determinação: EA = leituraAreia/leituraArgila x 100', () => {
    // areia 7.7, argila 10.4 -> 7.7/10.4*100 = 74.0384615...
    expect(equivalenteAreia([{ leituraAreia: 7.7, leituraArgila: 10.4 }])).toBeCloseTo(74.04, 2)
  })

  it('duas determinações: resultado é a média das determinações', () => {
    // det 1: 7.7/10.4*100 = 74.038461...
    // det 2: 8.0/10.0*100 = 80.0
    // média = (74.038461... + 80.0)/2 = 77.019230...
    const r = equivalenteAreia([
      { leituraAreia: 7.7, leituraArgila: 10.4 },
      { leituraAreia: 8.0, leituraArgila: 10.0 },
    ])
    expect(r).toBeCloseTo(77.02, 2)
  })

  it('lança erro em PT-BR se a lista de determinações estiver vazia', () => {
    expect(() => equivalenteAreia([])).toThrow(/determinaç/i)
  })

  it('lança erro em PT-BR se alguma leitura de argila for <= 0', () => {
    expect(() => equivalenteAreia([{ leituraAreia: 7.7, leituraArgila: 0 }])).toThrow(/argila/i)
    expect(() => equivalenteAreia([{ leituraAreia: 7.7, leituraArgila: -1 }])).toThrow(/argila/i)
  })
})
