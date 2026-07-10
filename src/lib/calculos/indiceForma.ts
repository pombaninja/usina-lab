// Índice de forma / Lamelaridade — Módulo 5b do Projeto CAUQ completo.
// NBR 7809 (2008) / DNIT 425/2020: para cada grão medem-se espessura (E) e
// comprimento (C), em mm. IL = C/E. Um grão é lamelar se IL >= 3.
// O resultado do ensaio é a média dos IL de todos os grãos e o % de grãos lamelares.

export interface GraoMedicao {
  espessura: number
  comprimento: number
}

export interface ResultadoLamelaridade {
  mediaIL: number
  totalGraos: number
  lamelares: number
  pctLamelar: number
}

export function indiceLamelaridade(graos: GraoMedicao[]): ResultadoLamelaridade {
  if (!graos.length) throw new Error('Informe ao menos um grão para o índice de lamelaridade.')
  if (graos.some(g => !Number.isFinite(g.espessura) || g.espessura <= 0)) {
    throw new Error('A espessura (E) deve ser maior que zero em todos os grãos.')
  }

  const ils = graos.map(g => g.comprimento / g.espessura)
  const totalGraos = graos.length
  const lamelares = ils.filter(il => il >= 3).length
  const mediaIL = ils.reduce((s, il) => s + il, 0) / totalGraos
  const pctLamelar = (lamelares / totalGraos) * 100

  return { mediaIL, totalGraos, lamelares, pctLamelar }
}
