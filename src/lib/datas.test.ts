import { describe, expect, it } from 'vitest'
import { hojeLocal, limitesDoMes, mesAtualLocal } from './datas'

describe('datas', () => {
  it('limitesDoMes retorna início e fim exclusivo dentro do mesmo ano', () => {
    expect(limitesDoMes('2026-07')).toEqual({ inicio: '2026-07-01', fimExclusivo: '2026-08-01' })
  })

  it('limitesDoMes vira o ano em dezembro', () => {
    expect(limitesDoMes('2026-12')).toEqual({ inicio: '2026-12-01', fimExclusivo: '2027-01-01' })
  })

  it('hojeLocal segue o formato AAAA-MM-DD', () => {
    expect(hojeLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('mesAtualLocal segue o formato AAAA-MM e é prefixo de hojeLocal', () => {
    expect(mesAtualLocal()).toMatch(/^\d{4}-\d{2}$/)
    expect(hojeLocal().startsWith(mesAtualLocal())).toBe(true)
  })
})
