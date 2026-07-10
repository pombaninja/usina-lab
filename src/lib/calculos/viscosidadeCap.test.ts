import { describe, it, expect } from 'vitest'
import { curvaViscosidade } from './viscosidadeCap'

describe('curvaViscosidade - golden (planilha real, aba "Visc.cap 30 - 45", CAP 30-45)', () => {
  // Pontos reais: viscosímetro Saybolt-Furol, médias de 2 leituras por temperatura
  // (linhas 19-22 da aba). Faixas-alvo reais da planilha (linhas 36-44):
  // usinagem 75-95 seg SSF, compactação 125-155 seg SSF.
  const pontos = [
    { temperatura: 120, viscosidade: 417.85 },
    { temperatura: 135, viscosidade: 217.65 },
    { temperatura: 150, viscosidade: 121.45 },
    { temperatura: 165, viscosidade: 69.44999999999999 },
    { temperatura: 177, viscosidade: 52.05 },
  ]
  const faixas = { usinagemMin: 75, usinagemMax: 95, compactacaoMin: 125, compactacaoMax: 155 }

  it('reproduz a regressão LOGEST da planilha (Q54/R54: m=0.9636873769916828, b=33127.60706715866)', () => {
    const r = curvaViscosidade(pontos, faixas)
    // LOGEST ajusta V = b_excel * m_excel^T <=> ln(V) = ln(b_excel) + T*ln(m_excel)
    expect(r.coefA).toBeCloseTo(Math.log(33127.60706715866), 6)
    expect(r.coefB).toBeCloseTo(Math.log(0.9636873769916828), 6)
  })

  it('reproduz a temperatura de compactação da planilha (E62=$Q$38=150.85319663546673 / G62=$Q$36=145.03754201362764)', () => {
    const r = curvaViscosidade(pontos, faixas)
    expect(r.tempCompactacao.min).toBeCloseTo(145.03754201362764, 3)
    expect(r.tempCompactacao.max).toBeCloseTo(150.85319663546673, 3)
  })

  it('reproduz a temperatura de usinagem da planilha (M62=$Q$43=164.66364871428596 / N62=$Q$41=158.27274790676847)', () => {
    const r = curvaViscosidade(pontos, faixas)
    expect(r.tempUsinagem.min).toBeCloseTo(158.27274790676847, 3)
    expect(r.tempUsinagem.max).toBeCloseTo(164.66364871428596, 3)
  })

  it('lança erro em PT-BR com menos de 2 pontos', () => {
    expect(() => curvaViscosidade([{ temperatura: 135, viscosidade: 200 }], faixas)).toThrow(/dois pontos/i)
    expect(() => curvaViscosidade([], faixas)).toThrow(/dois pontos/i)
  })

  it('lança erro em PT-BR se alguma viscosidade for <= 0', () => {
    expect(() => curvaViscosidade([
      { temperatura: 120, viscosidade: 0 },
      { temperatura: 150, viscosidade: 100 },
    ], faixas)).toThrow(/viscosidade/i)
    expect(() => curvaViscosidade([
      { temperatura: 120, viscosidade: -5 },
      { temperatura: 150, viscosidade: 100 },
    ], faixas)).toThrow(/viscosidade/i)
  })

  it('ordena min/max da faixa corretamente mesmo se a inclinação for positiva (curva atípica)', () => {
    // Viscosidade crescente com T (caso não físico, mas a função não deve assumir o sinal).
    const r = curvaViscosidade([
      { temperatura: 100, viscosidade: 50 },
      { temperatura: 200, viscosidade: 500 },
    ], { usinagemMin: 60, usinagemMax: 200, compactacaoMin: 100, compactacaoMax: 300 })
    expect(r.tempUsinagem.min).toBeLessThan(r.tempUsinagem.max)
    expect(r.tempCompactacao.min).toBeLessThan(r.tempCompactacao.max)
  })
})
