import { describe, it, expect } from 'vitest'
import { calcularResistenciaCompressao } from './resistenciaCompressao'

// Goldens calculados à mão (mesma convenção da planilha do RTD: MPa = kgf/cm² ÷ 10):
//   carga = leitura × constante; área = π·D²/4; tensão = carga/área; MPa = tensão/10.
describe('Resistência à compressão (convenção da planilha, kgf/cm² ÷ 10 = MPa)', () => {
  it('leitura 500, K=1,9372, D=10', () => {
    // carga  = 500 × 1,9372 = 968,6 kgf
    // área   = π·10²/4 = 78,53982 cm²
    // tensão = 968,6 / 78,53982 = 12,33259 kgf/cm²
    // RC     = 12,33259 / 10 = 1,233259 MPa
    const r = calcularResistenciaCompressao([{ leitura: 500, constantePrensa: 1.9372, diametroCm: 10 }])
    expect(r.rcMpa[0]).toBeCloseTo(1.2333, 4)
    expect(r.media).toBeCloseTo(1.2333, 4)
  })

  it('três CPs 500/520/480, K=1,9372, D=10 — RC por CP e média', () => {
    // CP1: 500 × 1,9372 = 968,600 kgf → 968,600/78,53982 = 12,33259 → 1,233259 MPa
    // CP2: 520 × 1,9372 = 1007,344 kgf → 1007,344/78,53982 = 12,82590 → 1,282590 MPa
    // CP3: 480 × 1,9372 = 929,856 kgf → 929,856/78,53982 = 11,83929 → 1,183929 MPa
    // média = (1,233259 + 1,282590 + 1,183929)/3 = 1,233259 MPa (leituras simétricas)
    const r = calcularResistenciaCompressao([
      { leitura: 500, constantePrensa: 1.9372, diametroCm: 10 },
      { leitura: 520, constantePrensa: 1.9372, diametroCm: 10 },
      { leitura: 480, constantePrensa: 1.9372, diametroCm: 10 },
    ])
    expect(r.rcMpa[0]).toBeCloseTo(1.2333, 4)
    expect(r.rcMpa[1]).toBeCloseTo(1.2826, 4)
    expect(r.rcMpa[2]).toBeCloseTo(1.1839, 4)
    expect(r.media).toBeCloseTo(1.2333, 4)
  })

  it('diâmetro diferente entra pela área: leitura 640, K=1,79, D=15,2', () => {
    // carga  = 640 × 1,79 = 1145,6 kgf
    // área   = π·15,2²/4 = 181,45839 cm²
    // tensão = 1145,6 / 181,45839 = 6,31329 kgf/cm² → 0,631329 MPa
    const r = calcularResistenciaCompressao([{ leitura: 640, constantePrensa: 1.79, diametroCm: 15.2 }])
    expect(r.rcMpa[0]).toBeCloseTo(0.6313, 4)
  })

  it('deve lançar erro quando array está vazio', () => {
    expect(() => calcularResistenciaCompressao([])).toThrow()
  })
})
