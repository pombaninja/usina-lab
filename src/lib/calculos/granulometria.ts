export interface PeneiraLeitura { peneira: string; aberturaMm: number; retidoAcum: number }
export interface FaixaPeneira { peneira: string; passanteMin: number; passanteMax: number; toleranciaTrabalho: number }
export interface LinhaGranulometria {
  peneira: string; aberturaMm: number; retidoAcum: number
  pctRetidaAcum: number; pctPassando: number
  espMin?: number; espMax?: number; trabMin?: number; trabMax?: number; conforme?: boolean
}

export function calcularGranulometria(
  pesoTotal: number,
  leituras: PeneiraLeitura[],
  faixa?: FaixaPeneira[],
  curvaProjeto?: Record<string, number>,
): { linhas: LinhaGranulometria[]; conforme: boolean } {
  if (pesoTotal <= 0) throw new Error('Peso total deve ser maior que zero')
  let conformeGeral = true
  const linhas = leituras.map((l) => {
    const pctRetidaAcum = (l.retidoAcum / pesoTotal) * 100
    const pctPassando = 100 - pctRetidaAcum
    const linha: LinhaGranulometria = { ...l, pctRetidaAcum, pctPassando }
    const f = faixa?.find(x => x.peneira === l.peneira)
    if (f) {
      linha.espMin = f.passanteMin
      linha.espMax = f.passanteMax
      const centro = curvaProjeto?.[l.peneira]
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
  return { linhas, conforme: conformeGeral }
}
