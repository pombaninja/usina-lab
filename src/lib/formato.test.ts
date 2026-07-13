import { describe, it, expect } from 'vitest'
import { sanitizarDecimal, parseDecimal, decimalParaTexto } from './formato'

describe('sanitizarDecimal', () => {
  it('mantém texto com vírgula decimal', () => {
    expect(sanitizarDecimal('0,075')).toBe('0,075')
  })
  it('converte ponto em vírgula ("0.075" → "0,075")', () => {
    expect(sanitizarDecimal('0.075')).toBe('0,075')
  })
  it('mantém apenas a PRIMEIRA vírgula ("1.2.3" → "1,23")', () => {
    expect(sanitizarDecimal('1.2.3')).toBe('1,23')
    expect(sanitizarDecimal('1,2,3')).toBe('1,23')
  })
  it('remove letras e demais caracteres inválidos', () => {
    expect(sanitizarDecimal('abc1,5kg')).toBe('1,5')
    expect(sanitizarDecimal('R$ 2.45')).toBe('2,45')
  })
  it('sinal negativo só vale no início', () => {
    expect(sanitizarDecimal('-1,5')).toBe('-1,5')
    expect(sanitizarDecimal('1-5')).toBe('15')
    expect(sanitizarDecimal('--2')).toBe('-2')
  })
  it('string vazia permanece vazia', () => {
    expect(sanitizarDecimal('')).toBe('')
  })
  it('estados intermediários de digitação passam intactos ("," e "1,")', () => {
    expect(sanitizarDecimal(',')).toBe(',')
    expect(sanitizarDecimal('1,')).toBe('1,')
  })
})

describe('parseDecimal', () => {
  it('converte vírgula decimal ("0,075" → 0.075)', () => {
    expect(parseDecimal('0,075')).toBe(0.075)
  })
  it('texto sanitizado de "0.075" parseia para 0.075', () => {
    expect(parseDecimal(sanitizarDecimal('0.075'))).toBe(0.075)
  })
  it('inteiro sem vírgula', () => {
    expect(parseDecimal('42')).toBe(42)
  })
  it('negativo com vírgula', () => {
    expect(parseDecimal('-1,5')).toBe(-1.5)
  })
  it('vazio (e só espaços) → null', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('   ')).toBeNull()
  })
  it('vírgula solta → NaN (inválido, valide antes de salvar)', () => {
    expect(parseDecimal(',')).toBeNaN()
  })
  it('vírgula à direita é tolerada ("1," → 1)', () => {
    expect(parseDecimal('1,')).toBe(1)
  })
  it('texto não sanitizado com lixo → NaN', () => {
    expect(parseDecimal('1,2,3')).toBeNaN()
    expect(parseDecimal('abc')).toBeNaN()
  })
})

describe('decimalParaTexto', () => {
  it('número persistido vira texto com vírgula (0.075 → "0,075")', () => {
    expect(decimalParaTexto(0.075)).toBe('0,075')
  })
  it('inteiro fica sem vírgula', () => {
    expect(decimalParaTexto(12)).toBe('12')
  })
  it('null/undefined/"" → ""', () => {
    expect(decimalParaTexto(null)).toBe('')
    expect(decimalParaTexto(undefined)).toBe('')
    expect(decimalParaTexto('')).toBe('')
  })
  it('texto já com vírgula passa intacto', () => {
    expect(decimalParaTexto('2,45')).toBe('2,45')
  })
})

describe('ida e volta (persistido → exibição → parse)', () => {
  it('parseDecimal(decimalParaTexto(x)) === x', () => {
    for (const x of [0.075, 54.6, 100, 0, -1.5, 2.45]) {
      expect(parseDecimal(decimalParaTexto(x))).toBe(x)
    }
  })
  it('digitado → sanitizado → salvo → exibido mantém o valor', () => {
    const digitado = '54.6' // usuário digita com ponto
    const texto = sanitizarDecimal(digitado) // '54,6' no estado do formulário
    const salvo = parseDecimal(texto) // 54.6 persistido
    expect(salvo).toBe(54.6)
    expect(decimalParaTexto(salvo)).toBe('54,6') // volta com vírgula na edição
  })
})
