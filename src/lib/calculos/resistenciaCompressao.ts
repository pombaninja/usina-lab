export interface RcCpInput { leitura: number; constantePrensa: number; diametroCm: number }

// Resistência à compressão simples de CP cilíndrico — mesma convenção da planilha
// usada no RTD (rtd.ts): carga em kgf, tensão em kgf/cm² e MPa = kgf/cm² ÷ 10.
export function calcularResistenciaCompressao(cps: RcCpInput[]): { rcMpa: number[]; media: number } {
  if (cps.length === 0) throw new Error('Informe ao menos um corpo de prova')
  const rcMpa = cps.map((cp) => {
    const carga = cp.leitura * cp.constantePrensa            // kgf
    const area = (Math.PI * cp.diametroCm * cp.diametroCm) / 4 // cm² (π·D²/4)
    const tensao = carga / area                              // kgf/cm²
    return tensao / 10                                       // MPa (convenção da planilha)
  })
  return { rcMpa, media: rcMpa.reduce((a, b) => a + b, 0) / rcMpa.length }
}
