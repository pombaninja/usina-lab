export interface PeneiraLeitura { peneira: string; aberturaMm: number; retidoAcum: number }
export interface FaixaPeneira { peneira: string; passanteMin: number; passanteMax: number; toleranciaTrabalho: number }
export interface LinhaGranulometria {
  peneira: string; aberturaMm: number; retidoAcum: number
  pctRetidaAcum: number; pctPassando: number
  espMin?: number; espMax?: number; trabMin?: number; trabMax?: number; conforme?: boolean
}

/**
 * Normaliza a grafia de peneiras para cruzamento tolerante:
 * '# 4', 'N. 04', 'N.4', 'nº 4' → '4'; '3/8"', ' 3/8 ' → '3/8"'.
 */
export function normalizarPeneira(nome: string): string {
  const s = nome.toLowerCase().replace(/[º°]/g, '').replace(/\s+/g, '')
    .replace(/^n\.?|^#/, '').replace(/["']+$/g, '')
  // remove zeros à esquerda de números puros ('04' → '4')
  const semZeros = /^\d+$/.test(s) ? String(Number(s)) : s
  // frações voltam a ganhar aspas ('3/8' → '3/8"')
  return /^\d+(\/\d+)?$/.test(semZeros) && semZeros.includes('/') ? `${semZeros}"` : semZeros
}

export function calcularGranulometria(
  pesoTotal: number,
  leituras: PeneiraLeitura[],
  faixa?: FaixaPeneira[],
  curvaProjeto?: Record<string, number>,
): { linhas: LinhaGranulometria[]; conforme: boolean } {
  if (pesoTotal <= 0) throw new Error('Peso total deve ser maior que zero')
  if (leituras.some(l => l.retidoAcum > pesoTotal + 1e-9)) {
    throw new Error('Peso retido acumulado maior que o peso total da amostra')
  }
  const curvaProjetoNorm = curvaProjeto
    ? new Map(Object.entries(curvaProjeto).map(([k, v]) => [normalizarPeneira(k), v]))
    : undefined
  let conformeGeral = true
  const linhas = leituras.map((l) => {
    const pctRetidaAcum = (l.retidoAcum / pesoTotal) * 100
    const pctPassando = 100 - pctRetidaAcum
    const linha: LinhaGranulometria = { ...l, pctRetidaAcum, pctPassando }
    const f = faixa?.find(x => normalizarPeneira(x.peneira) === normalizarPeneira(l.peneira))
    if (f) {
      linha.espMin = f.passanteMin
      linha.espMax = f.passanteMax
      const centro = curvaProjetoNorm?.get(normalizarPeneira(l.peneira))
      if (centro !== undefined) {
        linha.trabMin = Math.max(f.passanteMin, centro - f.toleranciaTrabalho)
        linha.trabMax = Math.min(f.passanteMax, centro + f.toleranciaTrabalho)
      } else {
        linha.trabMin = f.passanteMin
        linha.trabMax = f.passanteMax
      }
      linha.conforme = pctPassando >= linha.trabMin - 1e-9 && pctPassando <= linha.trabMax + 1e-9
      if (!linha.conforme) conformeGeral = false
    }
    return linha
  })
  // Peneiras sempre da maior para a menor abertura, independente da ordem de entrada
  linhas.sort((a, b) => b.aberturaMm - a.aberturaMm)
  return { linhas, conforme: conformeGeral }
}
