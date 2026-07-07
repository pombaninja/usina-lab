import { describe, it, expect } from 'vitest'
import { calcularRtd } from './rtd'

describe('RTD DNIT 136/2018 (golden FX III Olimpia)', () => {
  it('leituras 640/610/620, K=1,79, D=10, H=6', () => {
    const r = calcularRtd([
      { leitura: 640, constantePrensa: 1.79, diametroCm: 10, alturaCm: 6 },
      { leitura: 610, constantePrensa: 1.79, diametroCm: 10, alturaCm: 6 },
      { leitura: 620, constantePrensa: 1.79, diametroCm: 10, alturaCm: 6 },
    ])
    expect(r.rtdMpa[0]).toBeCloseTo(1.2155, 3)
    expect(r.rtdMpa[1]).toBeCloseTo(1.1585, 3)
    expect(r.media).toBeCloseTo(1.1839, 3)
  })

  it('deve lançar erro quando array está vazio', () => {
    expect(() => calcularRtd([])).toThrow()
  })
})
