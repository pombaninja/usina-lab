import { describe, it, expect } from 'vitest'
import { avaliarParametros } from './avaliacao'

describe('avaliarParametros', () => {
  const especs = [
    { parametro: 'vazios', valor_min: 3, valor_max: 5, unidade: '%' },
    { parametro: 'estabilidade', valor_min: 800, valor_max: null, unidade: 'kgf' },
  ]
  it('dentro da faixa → conforme', () => {
    const r = avaliarParametros({ vazios: 4.1, estabilidade: 1366 }, especs)
    expect(r.conformeGeral).toBe(true)
  })
  it('fora da faixa → não conforme, aponta o parâmetro', () => {
    const r = avaliarParametros({ vazios: 5.6, estabilidade: 1366 }, especs)
    expect(r.conformeGeral).toBe(false)
    expect(r.avaliacoes.find(a => a.parametro === 'vazios')!.conforme).toBe(false)
  })
  it('parâmetro sem especificação é ignorado', () => {
    const r = avaliarParametros({ vam: 15.7 }, especs)
    expect(r.avaliacoes.length).toBe(0)
    expect(r.conformeGeral).toBe(true)
  })
})
