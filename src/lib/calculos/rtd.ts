export interface RtdCpInput { leitura: number; constantePrensa: number; diametroCm: number; alturaCm: number }

export function calcularRtd(cps: RtdCpInput[]): { rtdMpa: number[]; media: number } {
  if (cps.length === 0) throw new Error('Informe ao menos um corpo de prova')
  const rtdMpa = cps.map((cp) => {
    const carga = cp.leitura * cp.constantePrensa            // kgf
    const tensao = (2 * carga) / (Math.PI * cp.diametroCm * cp.alturaCm) // kgf/cm²
    return tensao / 10                                       // MPa (convenção da planilha)
  })
  return { rtdMpa, media: rtdMpa.reduce((a, b) => a + b, 0) / rtdMpa.length }
}
