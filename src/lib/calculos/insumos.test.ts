import { describe, it, expect } from 'vitest'
import { calcularIndicadoresDia, saldoTanque, divergenciaContinuidade, calcularAgregadoMes, type TanqueMin, type LancamentoMes } from './insumos'

describe('indicadores de insumos — 13/11/2025 (golden da planilha)', () => {
  const leituras = [
    { tanqueId: '1', produto: 'cap' as const, volumeInicial: 0.64, volumeFinal: 0.64 },
    { tanqueId: '2', produto: 'cap' as const, volumeInicial: 3.56, volumeFinal: 1.09 },
    { tanqueId: '3', produto: 'cap' as const, volumeInicial: 48.072, volumeFinal: 42.658 },
    { tanqueId: '4', produto: 'oleo_queima' as const, volumeInicial: 14756, volumeFinal: 13810 },
    { tanqueId: '5', produto: 'oleo_termico' as const, volumeInicial: 3670, volumeFinal: 3320, horimetroLigou: 290.49, horimetroDesligou: 299.76 },
  ]
  const r = calcularIndicadoresDia(leituras, 171.48)
  it('CAP deslocado total = 7,884 t (célula D19)', () => expect(r.capDeslocadoTon).toBeCloseTo(7.884, 3))
  it('cap/ton = 0,046 (célula C18)', () => expect(r.capPorTon!).toBeCloseTo(0.04598, 4))
  it('óleo/ton = 5,5167 L (célula D18)', () => expect(r.oleoPorTon!).toBeCloseTo(5.5167, 3))
  it('caldeira: 350 L em 9,27 h = 37,7562 L/h (célula D16)', () => {
    expect(r.caldeiraConsumo!).toBeCloseTo(350, 1)
    expect(r.caldeiraHoras!).toBeCloseTo(9.27, 2)
    expect(r.caldeiraLitrosHora!).toBeCloseTo(37.7562, 3)
  })
  it('sem produção → índices null (não NaN/Infinity)', () => {
    const s = calcularIndicadoresDia(leituras, null)
    expect(s.capPorTon).toBeNull(); expect(s.oleoPorTon).toBeNull()
  })
  it('leitura final maior que inicial sem entrada lança erro', () => {
    expect(() => calcularIndicadoresDia([{ tanqueId: '1', produto: 'cap', volumeInicial: 1, volumeFinal: 2 }], 100))
      .toThrow(/final maior/i)
  })
})

describe('saldoTanque', () => {
  it('saldo anterior + entradas − deslocado', () => expect(saldoTanque(10, 5, 3)).toBeCloseTo(12))
})

describe('divergenciaContinuidade', () => {
  it('inicial de hoje = fechamento de ontem + entradas → 0', () => {
    expect(divergenciaContinuidade(15, 10, 5)).toBeCloseTo(0)
  })
  it('diferença real aparece com sinal', () => {
    expect(divergenciaContinuidade(12, 10, 5)).toBeCloseTo(-3)
  })
  it('sem leitura de ontem → null', () => {
    expect(divergenciaContinuidade(12, null, 5)).toBeNull()
  })
})

describe('calcularAgregadoMes', () => {
  const tanques: TanqueMin[] = [{ id: 't1', produto: 'cap' }]

  function lancamento(data: string, producaoTon: number | null, volumeInicial: number, volumeFinal: number): LancamentoMes {
    return {
      data,
      producao_ton: producaoTon,
      insumos_leituras: [{
        tanque_id: 't1', volume_inicial: volumeInicial, volume_final: volumeFinal,
        horimetro_ligou: null, horimetro_desligou: null,
      }],
    }
  }

  it('média ponderada (não a média simples dos dias)', () => {
    // dia1: produção 100, CAP deslocado 5 → 0,05/ton; dia2: produção 10, CAP deslocado 1 → 0,1/ton
    const lancamentos = [lancamento('2026-01-01', 100, 5, 0), lancamento('2026-01-02', 10, 1, 0)]
    const agregado = calcularAgregadoMes(lancamentos, tanques)
    expect(agregado.totalProducaoTon).toBeCloseTo(110)
    expect(agregado.totalCapTon).toBeCloseTo(6)
    expect(agregado.capPorTonMedio).toBeCloseTo(6 / 110, 4) // ≈ 0,05455
    expect(agregado.capPorTonMedio).not.toBeCloseTo(0.075, 2) // média simples de 0,05 e 0,1 seria errada
  })

  it('dia com erro de leitura é excluído atomicamente dos totais do mês', () => {
    const diaOk = lancamento('2026-01-01', 100, 5, 0)
    const diaErro = lancamento('2026-01-02', 50, 1, 2) // volume final > inicial → lança erro
    const agregado = calcularAgregadoMes([diaOk, diaErro], tanques)
    expect(agregado.dias[1].resultado.ok).toBe(false)
    if (!agregado.dias[1].resultado.ok) {
      expect(agregado.dias[1].resultado.erro).toMatch(/final maior/i)
    }
    // nada do dia com erro deve contaminar os totais: produção, CAP e óleo
    expect(agregado.totalProducaoTon).toBeCloseTo(100)
    expect(agregado.totalCapTon).toBeCloseTo(5)
    expect(agregado.totalOleoL).toBeCloseTo(0)
  })

  it('produção total zero → médias ponderadas null (não NaN/Infinity)', () => {
    const agregado = calcularAgregadoMes([lancamento('2026-01-01', 0, 5, 0)], tanques)
    expect(agregado.totalProducaoTon).toBe(0)
    expect(agregado.capPorTonMedio).toBeNull()
    expect(agregado.oleoPorTonMedio).toBeNull()
  })
})
