import { describe, expect, it } from 'vitest'
import {
  contagemPorChave, contagemPorMes, contagemPorMesECategoria,
  dataLocalDoTimestamp, mediaDiasEntre, mesDaData, rotuloDataCurta, rotuloMes, situacaoLaudos,
} from './relatorios'

describe('relatorios — datas e rótulos', () => {
  it('dataLocalDoTimestamp passa strings só-data direto (sem parse UTC)', () => {
    expect(dataLocalDoTimestamp('2026-07-01')).toBe('2026-07-01')
  })

  it('dataLocalDoTimestamp devolve null para vazio/ausente/inválida', () => {
    expect(dataLocalDoTimestamp(null)).toBeNull()
    expect(dataLocalDoTimestamp(undefined)).toBeNull()
    expect(dataLocalDoTimestamp('')).toBeNull()
    expect(dataLocalDoTimestamp('não-é-data')).toBeNull()
  })

  it('dataLocalDoTimestamp resolve timestamp de meio de mês (qualquer fuso razoável)', () => {
    // 15/03 meio-dia BRT = 15/03 15:00 UTC — mesmo dia em UTC e em America/Sao_Paulo.
    expect(dataLocalDoTimestamp('2026-03-15T12:00:00-03:00')).toBe('2026-03-15')
  })

  it('mesDaData extrai AAAA-MM de data pura e de timestamp', () => {
    expect(mesDaData('2026-07-14')).toBe('2026-07')
    expect(mesDaData('2026-03-15T12:00:00-03:00')).toBe('2026-03')
    expect(mesDaData(null)).toBeNull()
  })

  it('rotuloMes formata mmm/aa em pt-BR', () => {
    expect(rotuloMes('2026-01')).toBe('jan/26')
    expect(rotuloMes('2026-07')).toBe('jul/26')
    expect(rotuloMes('2025-12')).toBe('dez/25')
  })

  it('rotuloMes devolve a entrada quando não reconhece o formato', () => {
    expect(rotuloMes('2026-13')).toBe('2026-13')
    expect(rotuloMes('abc')).toBe('abc')
  })

  it('rotuloDataCurta formata dd/mm/aa', () => {
    expect(rotuloDataCurta('2026-07-05')).toBe('05/07/26')
    expect(rotuloDataCurta('sem-formato')).toBe('sem-formato')
  })
})

describe('relatorios — contagens', () => {
  it('contagemPorMes agrupa e ordena meses crescentes, ignorando nulos', () => {
    expect(contagemPorMes(['2026-07-10', '2026-06-01', '2026-07-20', null, undefined, ''])).toEqual([
      { mes: '2026-06', rotulo: 'jun/26', total: 1 },
      { mes: '2026-07', rotulo: 'jul/26', total: 2 },
    ])
  })

  it('contagemPorMes vazia devolve lista vazia', () => {
    expect(contagemPorMes([])).toEqual([])
  })

  it('contagemPorMesECategoria conta por mês × categoria em ordem de mês', () => {
    expect(contagemPorMesECategoria([
      { data: '2026-07-02', categoria: 'emitido' },
      { data: '2026-06-15', categoria: 'rascunho' },
      { data: '2026-07-20', categoria: 'emitido' },
      { data: '2026-07-25', categoria: 'aprovado' },
      { data: null, categoria: 'emitido' },
    ])).toEqual([
      { mes: '2026-06', rotulo: 'jun/26', porCategoria: { rascunho: 1 } },
      { mes: '2026-07', rotulo: 'jul/26', porCategoria: { emitido: 2, aprovado: 1 } },
    ])
  })

  it('contagemPorChave ordena do maior para o menor, empate alfabético, ignora vazios', () => {
    expect(contagemPorChave(['B', 'A', 'A', null, 'C', 'A', 'B', undefined, ''])).toEqual([
      { chave: 'A', total: 3 },
      { chave: 'B', total: 2 },
      { chave: 'C', total: 1 },
    ])
    expect(contagemPorChave(['Y', 'X'])).toEqual([
      { chave: 'X', total: 1 },
      { chave: 'Y', total: 1 },
    ])
  })
})

describe('relatorios — situação de laudos e tempos', () => {
  it('situacaoLaudos devolve o status mais avançado', () => {
    expect(situacaoLaudos([])).toBeNull()
    expect(situacaoLaudos(['rascunho'])).toBe('rascunho')
    expect(situacaoLaudos(['rascunho', 'aprovado'])).toBe('aprovado')
    expect(situacaoLaudos(['aprovado', 'emitido', 'rascunho'])).toBe('emitido')
  })

  it('situacaoLaudos ignora status desconhecidos', () => {
    expect(situacaoLaudos(['xyz'])).toBeNull()
    expect(situacaoLaudos(['xyz', 'rascunho'])).toBe('rascunho')
  })

  it('mediaDiasEntre calcula a média em dias (frações incluídas)', () => {
    // 01/07 00:00 → 03/07 12:00 = 2,5 dias (à mão: 60h / 24)
    expect(mediaDiasEntre([{ inicio: '2026-07-01T00:00:00Z', fim: '2026-07-03T12:00:00Z' }])).toBe(2.5)
    // (2,5 + 1,5) / 2 = 2
    expect(mediaDiasEntre([
      { inicio: '2026-07-01T00:00:00Z', fim: '2026-07-03T12:00:00Z' },
      { inicio: '2026-07-10T00:00:00Z', fim: '2026-07-11T12:00:00Z' },
    ])).toBe(2)
  })

  it('mediaDiasEntre ignora pares incompletos e devolve null sem pares completos', () => {
    expect(mediaDiasEntre([
      { inicio: '2026-07-01T00:00:00Z', fim: null },
      { inicio: null, fim: '2026-07-03T00:00:00Z' },
    ])).toBeNull()
    expect(mediaDiasEntre([
      { inicio: '2026-07-01T00:00:00Z', fim: '2026-07-02T00:00:00Z' },
      { inicio: '2026-07-05T00:00:00Z', fim: null },
    ])).toBe(1)
    expect(mediaDiasEntre([])).toBeNull()
  })
})
