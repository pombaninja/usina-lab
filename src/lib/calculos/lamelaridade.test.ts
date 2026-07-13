import { describe, it, expect } from 'vitest'
import { calcularLamelaridade, PENEIRAS_LAMELARIDADE, FRACOES_LAMELARIDADE } from './lamelaridade'

// Golden do Índice de Lamelaridade por fração (DAER/RS-EL 108/01 — planilha
// "8 - ÍNDICE DE LAMELARIDADE -Pedreira - HP.xlsx"). As fórmulas foram lidas
// da própria planilha (D = C22−C; E = D/C22×100; I = E(cima)−E(baixo);
// L = K/J×100 se J>0; M = I×L; M23 = ΣM/ΣI das frações ensaiadas) e os
// valores esperados abaixo foram recontados à mão nos comentários.

describe('calcularLamelaridade - golden (DAER/RS-EL 108/01, por fração)', () => {
  it('amostra de 10000 g com 3 frações ensaiadas: %passa, %fração, IL e ponderado conferidos à mão', () => {
    // pesoTotal = 10000 g. Acumulados retidos (C) e derivados:
    //   peneira  C(acum)  D(passante=10000−C)  E(%passa=D/10000×100)
    //   2"          0        10000               100
    //   1 1/2"    500         9500                95
    //   1 1/4"   1500         8500                85
    //   1"       3000         7000                70
    //   3/4"     5000         5000                50
    //   1/2"     7000         3000                30
    //   3/8"     8500         1500                15
    //   1/4"     9500          500                 5
    // % das frações (I = E de cima − E de baixo):
    //   63a50: 100−95=5 · 50a37,5: 95−85=10 · 37,5a28: 85−70=15 · 28a20: 70−50=20
    //   20a14: 50−30=20 · 14a10: 30−15=15 · 10a6,3: 15−5=10
    // Frações ensaiadas (J, K):
    //   28a20: J=2000, K=300 → L = 300/2000×100 = 15  → M = 20×15 = 300
    //   20a14: J=1800, K=450 → L = 450/1800×100 = 25  → M = 20×25 = 500
    //   14a10: J=1200, K=240 → L = 240/1200×100 = 20  → M = 15×20 = 300
    // Σ1 = 20+20+15 = 55 · Σ2 = 300+500+300 = 1100 → IL final = 1100/55 = 20
    const acum = [0, 500, 1500, 3000, 5000, 7000, 8500, 9500]
    const fracoes = [
      { pesoFracao: null, pesoLamelar: null },  // 63 a 50
      { pesoFracao: null, pesoLamelar: null },  // 50 a 37,5
      { pesoFracao: null, pesoLamelar: null },  // 37,5 a 28
      { pesoFracao: 2000, pesoLamelar: 300 },   // 28 a 20
      { pesoFracao: 1800, pesoLamelar: 450 },   // 20 a 14
      { pesoFracao: 1200, pesoLamelar: 240 },   // 14 a 10
      { pesoFracao: null, pesoLamelar: null },  // 10 a 6,3
    ]

    const r = calcularLamelaridade(10000, acum, fracoes)

    expect(r.granulometria.map(g => g.pctPassa)).toEqual([100, 95, 85, 70, 50, 30, 15, 5])
    expect(r.granulometria[4].pesoPassanteRetido).toBe(5000)
    expect(r.fracoes.map(f => f.pctFracao)).toEqual([5, 10, 15, 20, 20, 15, 10])

    // Frações não ensaiadas ficam fora das somas mesmo com % de fração > 0.
    expect(r.fracoes[0].ensaiada).toBe(false)
    expect(r.fracoes[0].ilFracao).toBeNull()
    expect(r.fracoes[0].ponderado).toBeNull()

    expect(r.fracoes[3].ilFracao).toBeCloseTo(15, 6)
    expect(r.fracoes[3].ponderado).toBeCloseTo(300, 6)
    expect(r.fracoes[4].ilFracao).toBeCloseTo(25, 6)
    expect(r.fracoes[4].ponderado).toBeCloseTo(500, 6)
    expect(r.fracoes[5].ilFracao).toBeCloseTo(20, 6)
    expect(r.fracoes[5].ponderado).toBeCloseTo(300, 6)

    expect(r.somaPctFracao).toBeCloseTo(55, 6)
    expect(r.somaPonderado).toBeCloseTo(1100, 6)
    expect(r.ilFinal).toBeCloseTo(20, 6)
  })

  it('amostra de 8000 g com IL não redondos: contas à mão em frações exatas', () => {
    // pesoTotal = 8000 g. Acumulados (C) → %passa (E = (8000−C)/8000×100):
    //   2": 0 → 100 · 1 1/2": 0 → 100 · 1 1/4": 240 → 7760/8000 = 97
    //   1": 1120 → 6880/8000 = 86 · 3/4": 2960 → 5040/8000 = 63
    //   1/2": 5200 → 2800/8000 = 35 · 3/8": 6640 → 1360/8000 = 17
    //   1/4": 7680 → 320/8000 = 4
    // % das frações: 0 · 3 · 11 · 23 · 28 · 18 · 13
    // Ensaiadas:
    //   28a20: J=1840, K=333 → L = 33300/1840 = 18.097826086956523
    //          M = 23×L = 765900/1840 = 416.25 (exato)
    //   20a14: J=2240, K=515 → L = 51500/2240 = 22.991071428571427
    //          M = 28×L = 1442000/2240 = 643.75 (exato)
    //   14a10: J=1440, K=289 → L = 28900/1440 = 20.069444444444443
    //          M = 18×L = 520200/1440 = 361.25 (exato)
    // Σ1 = 23+28+18 = 69 · Σ2 = 416.25+643.75+361.25 = 1421.25
    // IL final = 1421.25/69 = 20.597826086956523
    const acum = [0, 0, 240, 1120, 2960, 5200, 6640, 7680]
    const fracoes = [
      { pesoFracao: null, pesoLamelar: null },
      { pesoFracao: null, pesoLamelar: null },
      { pesoFracao: null, pesoLamelar: null },
      { pesoFracao: 1840, pesoLamelar: 333 },
      { pesoFracao: 2240, pesoLamelar: 515 },
      { pesoFracao: 1440, pesoLamelar: 289 },
      { pesoFracao: null, pesoLamelar: null },
    ]

    const r = calcularLamelaridade(8000, acum, fracoes)

    expect(r.fracoes.map(f => f.pctFracao)).toEqual([0, 3, 11, 23, 28, 18, 13])
    expect(r.fracoes[3].ilFracao).toBeCloseTo(18.098, 3)
    expect(r.fracoes[4].ilFracao).toBeCloseTo(22.991, 3)
    expect(r.fracoes[5].ilFracao).toBeCloseTo(20.069, 3)
    expect(r.fracoes[3].ponderado).toBeCloseTo(416.25, 3)
    expect(r.fracoes[4].ponderado).toBeCloseTo(643.75, 3)
    expect(r.fracoes[5].ponderado).toBeCloseTo(361.25, 3)
    expect(r.somaPctFracao).toBeCloseTo(69, 6)
    expect(r.somaPonderado).toBeCloseTo(1421.25, 3)
    expect(r.ilFinal).toBeCloseTo(20.598, 3)
  })

  it('peso lamelar vazio conta como 0 (como a célula K vazia na planilha) e pesoFracao 0 NÃO é ensaiada', () => {
    // 10000 g, mesma granulometria do 1º teste. 28a20 ensaiada com K vazio →
    // IL = 0/2000×100 = 0 e M = 20×0 = 0; entra nas somas: Σ1=20, Σ2=0 → IL final 0.
    const acum = [0, 500, 1500, 3000, 5000, 7000, 8500, 9500]
    const fracoes = [
      { pesoFracao: null, pesoLamelar: null },
      { pesoFracao: null, pesoLamelar: null },
      { pesoFracao: null, pesoLamelar: null },
      { pesoFracao: 2000, pesoLamelar: null }, // K vazio → 0
      { pesoFracao: 0, pesoLamelar: 100 },     // J = 0 → não ensaiada (IF(J>0,…))
      { pesoFracao: null, pesoLamelar: null },
      { pesoFracao: null, pesoLamelar: null },
    ]

    const r = calcularLamelaridade(10000, acum, fracoes)

    expect(r.fracoes[3].ensaiada).toBe(true)
    expect(r.fracoes[3].ilFracao).toBe(0)
    expect(r.fracoes[4].ensaiada).toBe(false)
    expect(r.fracoes[4].ilFracao).toBeNull()
    expect(r.somaPctFracao).toBe(20)
    expect(r.somaPonderado).toBe(0)
    expect(r.ilFinal).toBe(0)
  })

  it('fração ensaiada sem granulometria acima/abaixo fica sem % de fração e fora das somas', () => {
    // Só as peneiras 1" e 3/4" informadas → apenas a fração 28a20 tem % (70−50=20).
    // A 20a14 foi ensaiada (J=1000, K=250 → IL=25) mas sem %passa da 1/2" não tem
    // ponderado — como na planilha (I e M viram "" e o SUM ignora).
    const acum = [null, null, null, 3000, 5000, null, null, null]
    const fracoes = [
      { pesoFracao: null, pesoLamelar: null },
      { pesoFracao: null, pesoLamelar: null },
      { pesoFracao: null, pesoLamelar: null },
      { pesoFracao: 2000, pesoLamelar: 300 },  // 28a20: pct 20, IL 15, M 300
      { pesoFracao: 1000, pesoLamelar: 250 },  // 20a14: sem pctFracao
      { pesoFracao: null, pesoLamelar: null },
      { pesoFracao: null, pesoLamelar: null },
    ]

    const r = calcularLamelaridade(10000, acum, fracoes)

    expect(r.granulometria[0].pctPassa).toBeNull()
    expect(r.fracoes[4].ilFracao).toBeCloseTo(25, 6)
    expect(r.fracoes[4].pctFracao).toBeNull()
    expect(r.fracoes[4].ponderado).toBeNull()
    expect(r.fracoes[4].ensaiada).toBe(false)
    // Só 28a20 nas somas: IL final = 300/20 = 15.
    expect(r.somaPctFracao).toBeCloseTo(20, 6)
    expect(r.ilFinal).toBeCloseTo(15, 6)
  })

  it('sem nenhuma fração ensaiada o IL final é null', () => {
    const r = calcularLamelaridade(10000, [0, 500, 1500, 3000, 5000, 7000, 8500, 9500],
      FRACOES_LAMELARIDADE.map(() => ({ pesoFracao: null, pesoLamelar: null })))
    expect(r.ilFinal).toBeNull()
    expect(r.somaPctFracao).toBeNull()
    expect(r.somaPonderado).toBeNull()
  })

  it('lança erro em PT-BR se o peso total for <= 0 ou não numérico', () => {
    expect(() => calcularLamelaridade(0, [], [])).toThrow(/peso da amostra/i)
    expect(() => calcularLamelaridade(-100, [], [])).toThrow(/peso da amostra/i)
    expect(() => calcularLamelaridade(NaN, [], [])).toThrow(/peso da amostra/i)
  })

  it('sequência fixa de peneiras e frações da planilha', () => {
    expect(PENEIRAS_LAMELARIDADE).toEqual(['2"', '1 1/2"', '1 1/4"', '1"', '3/4"', '1/2"', '3/8"', '1/4"'])
    expect(FRACOES_LAMELARIDADE.map(f => f.faixaMm)).toEqual(
      ['63 a 50', '50 a 37,5', '37,5 a 28', '28 a 20', '20 a 14', '14 a 10', '10 a 6,3'])
  })
})
