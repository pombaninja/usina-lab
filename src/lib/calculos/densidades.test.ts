import { describe, it, expect } from 'vitest'
import { densidadeAgregadoGraudo, densidadeAgregadoMiudo, massaEspecificaRealMedia } from './densidades'

describe('densidadeAgregadoGraudo - golden (aba DENS. REAL, BRITA 1 det 1)', () => {
  // A=1038.4, B=1046.88, C=690.05 (planilha "Projeto FX 9,5 ET-DE-P00/027 Rv.B", aba DENS. REAL)
  it('calcula real, aparente e absorção conforme DNER-ME 081/98', () => {
    const r = densidadeAgregadoGraudo(1038.4, 1046.88, 690.05)
    // real = A/(A-C) = 1038.4/348.35
    expect(r.real).toBeCloseTo(2.981, 3)
    // aparente = A/(B-C) = 1038.4/356.83
    expect(r.aparente).toBeCloseTo(2.910, 3)
    // absorção = (B-A)/A x 100
    expect(r.absorcao).toBeCloseTo(0.817, 3)
  })

  it('lança erro em PT-BR se peso ao ar seco <= 0', () => {
    expect(() => densidadeAgregadoGraudo(0, 10, 5)).toThrow(/peso ao ar seco/i)
    expect(() => densidadeAgregadoGraudo(-5, 10, 5)).toThrow(/peso ao ar seco/i)
  })

  it('lança erro em PT-BR se peso imerso >= peso ao ar seco ou saturado', () => {
    expect(() => densidadeAgregadoGraudo(100, 110, 100)).toThrow(/inconsistente/i)
    expect(() => densidadeAgregadoGraudo(100, 90, 95)).toThrow(/inconsistente/i)
  })
})

describe('densidadeAgregadoMiudo - golden (aba DENS. REAL, PÓ DE PEDRA det 1/det 2, picnômetro DNER-ME 084/95)', () => {
  // det 1: pic=111.3, pic+agregado=463.52, pic+água=598.52, pic+agregado+água=832.6
  it('det 1 sem correção de temperatura', () => {
    const d = densidadeAgregadoMiudo(111.3, 463.52, 598.52, 832.6)
    // pesoAgregado = 463.52-111.3 = 352.22; volAguaNaoDeslocada = 832.6-463.52 = 369.08
    // pesoAgua = 598.52-111.3 = 487.22; volAguaDeslocada = 487.22-369.08 = 118.14
    // real = 352.22/118.14
    expect(d).toBeCloseTo(2.981, 3)
  })

  it('det 1 com fator de correção de temperatura 0,9989 (25°C, tabela DNER) confere com "MASSA ESPECIF. REAL CORRIGIDA" da planilha', () => {
    const d = densidadeAgregadoMiudo(111.3, 463.52, 598.52, 832.6, 0.9989)
    expect(d).toBeCloseTo(2.978, 3)
  })

  it('det 2: pic=125.26, pic+agregado=461.08, pic+água=606.76, pic+agregado+água=830', () => {
    const d = densidadeAgregadoMiudo(125.26, 461.08, 606.76, 830)
    expect(d).toBeCloseTo(2.983, 3)
  })

  it('lança erro em PT-BR se peso do agregado <= 0', () => {
    expect(() => densidadeAgregadoMiudo(200, 200, 400, 600)).toThrow(/peso do agregado/i)
  })

  it('lança erro em PT-BR se volume de água deslocada <= 0', () => {
    // pesoAgua (pic+água - pic) menor que volAguaNaoDeslocada (pic+agregado+água - pic+agregado)
    expect(() => densidadeAgregadoMiudo(100, 300, 150, 500)).toThrow(/volume de água deslocada/i)
  })
})

describe('massaEspecificaRealMedia - golden (média harmônica ponderada pelos % da composição)', () => {
  it('MERM = 100 / Σ(pct/densidadeReal)', () => {
    const merm = massaEspecificaRealMedia([
      { pct: 23, densidadeReal: 2.98 },
      { pct: 30, densidadeReal: 2.95 },
      { pct: 47, densidadeReal: 2.90 },
    ])
    // 100/(23/2.98+30/2.95+47/2.90) = 100/34.0945... = 2.93302...
    expect(merm).toBeCloseTo(2.933, 3)
  })

  it('lança erro em PT-BR se a lista de agregados estiver vazia', () => {
    expect(() => massaEspecificaRealMedia([])).toThrow(/ao menos um agregado/i)
  })

  it('lança erro em PT-BR se a soma dos percentuais for <= 0', () => {
    expect(() => massaEspecificaRealMedia([{ pct: 0, densidadeReal: 2.9 }])).toThrow(/soma dos percentuais/i)
    expect(() => massaEspecificaRealMedia([{ pct: -10, densidadeReal: 2.9 }, { pct: 5, densidadeReal: 2.9 }])).toThrow(/soma dos percentuais/i)
  })

  it('lança erro em PT-BR se alguma densidade real for <= 0', () => {
    expect(() => massaEspecificaRealMedia([{ pct: 100, densidadeReal: 0 }])).toThrow(/densidade real/i)
    expect(() => massaEspecificaRealMedia([{ pct: 50, densidadeReal: 2.9 }, { pct: 50, densidadeReal: -1 }])).toThrow(/densidade real/i)
  })
})
