import { describe, it, expect } from 'vitest'
import { parseCurvaProjeto } from './parseCurvaProjeto'

describe('parseCurvaProjeto', () => {
  it('converte pares válidos', () => {
    expect(parseCurvaProjeto('3/4"=100; N. 04=54.6')).toEqual({ '3/4"': 100, 'N. 04': 54.6 })
  })
  it('aceita nome de peneira contendo = após o primeiro', () => {
    expect(() => parseCurvaProjeto('a=b=c')).toThrow(/inválida/)
  })
  it('rejeita valor vazio (não vira 0)', () => {
    expect(() => parseCurvaProjeto('3/4"=')).toThrow(/inválida/)
  })
  it('rejeita vírgula decimal com mensagem indicando o par', () => {
    expect(() => parseCurvaProjeto('N. 04=54,6')).toThrow(/N\. 04=54,6/)
  })
  it('rejeita peneira repetida', () => {
    expect(() => parseCurvaProjeto('x=1; x=2')).toThrow(/repetida/)
  })
  it('string vazia retorna curva vazia', () => {
    expect(parseCurvaProjeto('')).toEqual({})
  })
})
