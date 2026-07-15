import { normalizarPeneira } from './granulometria'

export interface DeterminacaoAgregado { pesoTotal: number; retidos: Record<string, number> } // por peneira: retido acumulado (g)
export interface PeneiraRef { peneira: string; aberturaMm: number }
export interface LinhaAgregado { peneira: string; aberturaMm: number; retidoMedio: number; pctRetida: number; pctPassa: number }

function media(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length }

/** Retido acumulado LANÇADO na determinação para a peneira (cruzamento tolerante
 *  via normalizarPeneira); null quando a peneira não foi lançada — usado pela
 *  impressão analítica por determinação. No cálculo, ausente vale 0. */
export function retidoLancado(det: DeterminacaoAgregado, peneira: string): number | null {
  for (const [k, v] of Object.entries(det.retidos)) {
    if (normalizarPeneira(k) === normalizarPeneira(peneira)) return v
  }
  return null
}

function retidoNaDeterminacao(det: DeterminacaoAgregado, peneira: string): number {
  return retidoLancado(det, peneira) ?? 0
}

export function calcularGranulometriaAgregado(peneiras: PeneiraRef[], dets: DeterminacaoAgregado[]): LinhaAgregado[] {
  if (dets.length === 0) throw new Error('Informe ao menos uma determinação')
  if (dets.every(d => d.pesoTotal <= 0)) throw new Error('Peso total deve ser maior que zero em ao menos uma determinação')

  const pesoTotalMedio = media(dets.map(d => d.pesoTotal))

  const linhas = peneiras.map((p): LinhaAgregado => {
    const retidoMedio = media(dets.map(d => retidoNaDeterminacao(d, p.peneira)))
    const pctRetida = pesoTotalMedio > 0 ? (retidoMedio / pesoTotalMedio) * 100 : 0
    const pctPassa = 100 - pctRetida
    return { peneira: p.peneira, aberturaMm: p.aberturaMm, retidoMedio, pctRetida, pctPassa }
  })

  // Peneiras sempre da maior para a menor abertura, independente da ordem de entrada
  linhas.sort((a, b) => b.aberturaMm - a.aberturaMm)
  return linhas
}

export interface FaixaEspecAgregado { peneira: string; passanteMin: number; passanteMax: number }
export interface LinhaAgregadoFaixa extends LinhaAgregado { espMin?: number; espMax?: number; conforme?: boolean }

/** Anota as linhas do agregado com a FAIXA da especificação (passante mín/máx por
 *  peneira, cruzamento tolerante via normalizarPeneira) e a situação Conforme/Fora.
 *  SEM faixa de trabalho: ensaio avulso não tem curva de projeto — a banda é a
 *  PRÓPRIA especificação. Peneiras sem faixa cadastrada não entram no julgamento
 *  (conforme=undefined); `julgadas` conta as que entraram e `conforme` geral só
 *  vale quando julgadas > 0. */
export function aplicarFaixaEspecificacao(
  linhas: LinhaAgregado[],
  faixas: FaixaEspecAgregado[],
): { linhas: LinhaAgregadoFaixa[]; conforme: boolean; julgadas: number } {
  let conformeGeral = true
  let julgadas = 0
  const anotadas = linhas.map((l): LinhaAgregadoFaixa => {
    const f = faixas.find(x => normalizarPeneira(x.peneira) === normalizarPeneira(l.peneira))
    if (!f) return { ...l }
    julgadas += 1
    const conforme = l.pctPassa >= f.passanteMin - 1e-9 && l.pctPassa <= f.passanteMax + 1e-9
    if (!conforme) conformeGeral = false
    return { ...l, espMin: f.passanteMin, espMax: f.passanteMax, conforme }
  })
  return { linhas: anotadas, conforme: julgadas > 0 && conformeGeral, julgadas }
}

export function combinarGranulometrias(
  agregados: { pctNaMistura: number; linhas: LinhaAgregado[] }[],
): { peneira: string; aberturaMm: number; pctPassa: number }[] {
  const porPeneira = new Map<string, { peneira: string; aberturaMm: number; pctPassa: number }>()

  for (const ag of agregados) {
    for (const linha of ag.linhas) {
      const chave = normalizarPeneira(linha.peneira)
      const contribuicao = linha.pctPassa * (ag.pctNaMistura / 100)
      const existente = porPeneira.get(chave)
      if (existente) {
        existente.pctPassa += contribuicao
        // mantém o rótulo/abertura da peneira com a maior abertura cadastrada
        if (linha.aberturaMm > existente.aberturaMm) {
          existente.peneira = linha.peneira
          existente.aberturaMm = linha.aberturaMm
        }
      } else {
        porPeneira.set(chave, { peneira: linha.peneira, aberturaMm: linha.aberturaMm, pctPassa: contribuicao })
      }
    }
  }

  return [...porPeneira.values()].sort((a, b) => b.aberturaMm - a.aberturaMm)
}
