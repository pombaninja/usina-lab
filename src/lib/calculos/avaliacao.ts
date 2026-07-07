export interface ParametroEspec { parametro: string; valor_min: number | null; valor_max: number | null; unidade: string | null }
export interface Avaliacao { parametro: string; valor: number; min: number | null; max: number | null; conforme: boolean }

export function avaliarParametros(
  valores: Record<string, number>,
  especs: ParametroEspec[],
): { avaliacoes: Avaliacao[]; conformeGeral: boolean } {
  const avaliacoes: Avaliacao[] = []
  for (const e of especs) {
    const valor = valores[e.parametro]
    if (valor === undefined || Number.isNaN(valor)) continue
    const okMin = e.valor_min === null || valor >= e.valor_min - 1e-9
    const okMax = e.valor_max === null || valor <= e.valor_max + 1e-9
    avaliacoes.push({ parametro: e.parametro, valor, min: e.valor_min, max: e.valor_max, conforme: okMin && okMax })
  }
  return { avaliacoes, conformeGeral: avaliacoes.every(a => a.conforme) }
}
