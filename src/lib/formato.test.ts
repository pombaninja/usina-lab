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
    // "2.45" fica com o ponto no estado: ainda pode virar "2.450" (milhar) na
    // próxima tecla. O VALOR não muda: parseDecimal('2.45') === 2.45 (ponto
    // único = decimal). Antes o ponto virava vírgula na hora.
    expect(sanitizarDecimal('R$ 2.45')).toBe('2.45')
    expect(parseDecimal(sanitizarDecimal('R$ 2.45'))).toBe(2.45)
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

describe('sanitizarDecimal — separador de MILHAR pt-BR (bug "30.000" → 30)', () => {
  it('agrupamento completo de milhar fica intacto no estado', () => {
    expect(sanitizarDecimal('30.000')).toBe('30.000')       // trinta mil
    expect(sanitizarDecimal('1.234.567')).toBe('1.234.567') // 1 milhão e pouco
    expect(sanitizarDecimal('1.234,56')).toBe('1.234,56')   // milhar + decimal
  })
  it('digitar "30.000" tecla a tecla nunca perde o ponto (cenário do dono)', () => {
    // Cada estado intermediário passa pelo onChange do Crud; se "30." virasse
    // "30," aqui, o valor final seria 30 de novo. Prefixos plausíveis de milhar
    // (último grupo com 0–2 dígitos) são preservados até o grupo fechar.
    for (const estado of ['3', '30', '30.', '30.0', '30.00', '30.000']) {
      expect(sanitizarDecimal(estado)).toBe(estado)
    }
    expect(parseDecimal(sanitizarDecimal('30.000'))).toBe(30000)
  })
  it('"0.075" segue decimal: grupo inicial "0" não existe em milhar', () => {
    // Ninguém escreve 75 como "0.075" — zero à esquerda só faz sentido em fração.
    expect(sanitizarDecimal('0.075')).toBe('0,075')
  })
  it('4+ dígitos após o ponto quebram o formato de milhar → decimal', () => {
    // "1.2345" não é agrupamento válido (grupos têm exatamente 3 dígitos);
    // cai na regra do ponto único = decimal.
    expect(sanitizarDecimal('1.2345')).toBe('1,2345')
    expect(parseDecimal('1,2345')).toBe(1.2345)
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

describe('parseDecimal — separador de MILHAR pt-BR (casos calculados à mão)', () => {
  it('"30.000" → 30000 (capacidade de tanque em litros: trinta MIL, não trinta)', () => {
    // Casa no padrão ^[1-9]\d{0,2}(\.\d{3})+$: "30" + grupo ".000" → pontos caem.
    expect(parseDecimal('30.000')).toBe(30000)
  })
  it('"1.234.567" → 1234567 (dois grupos de milhar)', () => {
    expect(parseDecimal('1.234.567')).toBe(1234567)
  })
  it('"1.234,56" → 1234.56 (milhar com decimal em vírgula)', () => {
    // Pontos caem, vírgula vira ponto: 1234 + 56 centésimos.
    expect(parseDecimal('1.234,56')).toBe(1234.56)
  })
  it('"0.075" → 0.075 (grupo inicial "0" não é milhar → ponto é decimal)', () => {
    // Se fosse milhar seria "75" escrito de forma absurda; é a densidade/fração
    // típica do laboratório digitada no teclado numérico.
    expect(parseDecimal('0.075')).toBe(0.075)
  })
  it('"0,075" → 0.075 (vírgula decimal segue como sempre foi)', () => {
    expect(parseDecimal('0,075')).toBe(0.075)
  })
  it('"20.00" → 20.0 (grupo de DOIS dígitos não é milhar → decimal)', () => {
    // Milhar exige grupos de exatamente 3 dígitos; "20.00" só pode ser 20,00.
    expect(parseDecimal('20.00')).toBe(20.0)
  })
  it('negativo com milhar: "-30.000" → -30000', () => {
    expect(parseDecimal('-30.000')).toBe(-30000)
  })
  it('vírgula à direita após milhar é tolerada ("1.234," → 1234, como "1," → 1)', () => {
    expect(parseDecimal('1.234,')).toBe(1234)
  })
  it('ATENÇÃO documentada: "2.450" é milhar (2450); densidade 2,450 exige VÍRGULA', () => {
    // Ambiguidade inerente do pt-BR: X.XXX é agrupamento de milhar por definição.
    // O padrão do laboratório para decimais é a vírgula (convenção já vigente).
    expect(parseDecimal('2.450')).toBe(2450)
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
    // inclui os valores grandes do cadastro de tanques (30000 L, 1234.56):
    // decimalParaTexto NÃO insere ponto de milhar ("30000"), então o parse
    // devolve exatamente o número persistido — exibição do Crud round-tripa.
    for (const x of [0.075, 54.6, 100, 0, -1.5, 2.45, 30000, 5000, 1234.56, 1234567]) {
      expect(parseDecimal(decimalParaTexto(x))).toBe(x)
    }
  })
  it('digitado → sanitizado → salvo → exibido mantém o valor', () => {
    const digitado = '54.6' // usuário digita com ponto
    const texto = sanitizarDecimal(digitado) // '54.6' fica no estado (pode virar "54.600")
    const salvo = parseDecimal(texto) // ponto único = decimal → 54.6 persistido
    expect(salvo).toBe(54.6)
    expect(decimalParaTexto(salvo)).toBe('54,6') // volta com vírgula na edição
  })
  it('capacidade "30.000" digitada → salva 30000 → reabre como "30000" → salva 30000', () => {
    const texto = sanitizarDecimal('30.000')
    const salvo = parseDecimal(texto)
    expect(salvo).toBe(30000)
    const reaberto = decimalParaTexto(salvo) // abrirEdicao no Crud
    expect(reaberto).toBe('30000')
    expect(parseDecimal(reaberto)).toBe(30000) // atualizar sem tocar não corrompe
  })
})
