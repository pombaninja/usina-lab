export interface LeituraTanque {
  /** Slug em insumo_produtos (cadastro livre). Os indicadores do dia continuam
   *  específicos de 'cap' | 'oleo_queima' | 'oleo_termico'; leituras de outros
   *  produtos (ex.: 'emulsao') não entram nesses somatórios. */
  tanqueId: string; produto: string
  volumeInicial?: number | null; volumeFinal?: number | null
  horimetroLigou?: number | null; horimetroDesligou?: number | null
}
export interface IndicadoresDia {
  capDeslocadoTon: number; oleoQueimaDeslocado: number
  capPorTon: number | null; oleoPorTon: number | null
  caldeiraConsumo: number | null; caldeiraHoras: number | null; caldeiraLitrosHora: number | null
}

function deslocado(l: LeituraTanque): number {
  if (l.volumeInicial == null || l.volumeFinal == null) return 0
  const d = l.volumeInicial - l.volumeFinal
  if (d < -1e-9) throw new Error(`Volume final maior que o inicial no tanque — registre a entrada de material separadamente`)
  return d
}

export function calcularIndicadoresDia(leituras: LeituraTanque[], producaoTon?: number | null): IndicadoresDia {
  const capDeslocadoTon = leituras.filter(l => l.produto === 'cap').reduce((a, l) => a + deslocado(l), 0)
  const oleoQueimaDeslocado = leituras.filter(l => l.produto === 'oleo_queima').reduce((a, l) => a + deslocado(l), 0)
  const cald = leituras.find(l => l.produto === 'oleo_termico')
  const caldeiraConsumo = cald ? deslocado(cald) : null
  const caldeiraHoras = cald && cald.horimetroLigou != null && cald.horimetroDesligou != null
    ? cald.horimetroDesligou - cald.horimetroLigou : null
  const caldeiraLitrosHora = caldeiraConsumo != null && caldeiraHoras != null && caldeiraHoras > 0
    ? caldeiraConsumo / caldeiraHoras : null
  const temProducao = producaoTon != null && producaoTon > 0
  return {
    capDeslocadoTon, oleoQueimaDeslocado,
    capPorTon: temProducao ? capDeslocadoTon / producaoTon! : null,
    oleoPorTon: temProducao ? oleoQueimaDeslocado / producaoTon! : null,
    caldeiraConsumo, caldeiraHoras, caldeiraLitrosHora,
  }
}

export function saldoTanque(saldoAnterior: number, entradas: number, deslocadoDia: number): number {
  return saldoAnterior + entradas - deslocadoDia
}

// ===== agregação mensal (tipos de entrada neutros — arrays de objetos simples) =====
export interface TanqueMin {
  id: string
  produto: string
}
export interface LeituraRow {
  tanque_id: string
  volume_inicial: number | null
  volume_final: number | null
  horimetro_ligou: number | null
  horimetro_desligou: number | null
}
export interface LancamentoMes {
  data: string
  producao_ton: number | null
  insumos_leituras: LeituraRow[]
}
export interface DiaAgregado {
  data: string
  producaoTon: number | null
  resultado: { ok: true; ind: IndicadoresDia } | { ok: false; erro: string }
}
export interface AgregadoMes {
  dias: DiaAgregado[]
  totalProducaoTon: number
  totalCapTon: number
  totalOleoL: number
  capPorTonMedio: number | null
  oleoPorTonMedio: number | null
}

/**
 * Agrega os lançamentos de um mês em indicadores diários e totais/médias
 * ponderadas do mês. Um dia com erro de leitura (ex.: volume final maior
 * que o inicial) não contamina o mês inteiro: ele é reportado com o erro
 * e excluído dos totais/médias, mas os demais dias seguem calculados.
 */
export function calcularAgregadoMes(lancamentos: LancamentoMes[], tanques: TanqueMin[]): AgregadoMes {
  const tanquePorId = new Map(tanques.map(t => [t.id, t]))
  let totalProducaoTon = 0
  let totalCapTon = 0
  let totalOleoL = 0
  const dias: DiaAgregado[] = lancamentos.map(l => {
    try {
      const leituras: LeituraTanque[] = l.insumos_leituras
        .map((r): LeituraTanque | null => {
          const t = tanquePorId.get(r.tanque_id)
          if (!t) return null
          return {
            tanqueId: r.tanque_id, produto: t.produto,
            volumeInicial: r.volume_inicial, volumeFinal: r.volume_final,
            horimetroLigou: r.horimetro_ligou, horimetroDesligou: r.horimetro_desligou,
          }
        })
        .filter((x): x is LeituraTanque => x !== null)
      const ind = calcularIndicadoresDia(leituras, l.producao_ton)
      totalProducaoTon += l.producao_ton ?? 0
      totalCapTon += ind.capDeslocadoTon
      totalOleoL += ind.oleoQueimaDeslocado
      return { data: l.data, producaoTon: l.producao_ton, resultado: { ok: true, ind } }
    } catch (e) {
      return { data: l.data, producaoTon: l.producao_ton, resultado: { ok: false, erro: (e as Error).message } }
    }
  })
  return {
    dias, totalProducaoTon, totalCapTon, totalOleoL,
    capPorTonMedio: totalProducaoTon > 0 ? totalCapTon / totalProducaoTon : null,
    oleoPorTonMedio: totalProducaoTon > 0 ? totalOleoL / totalProducaoTon : null,
  }
}

/**
 * Divergência de continuidade: o volume inicial de hoje deveria ser
 * o fechamento de ontem mais as entradas do dia. Retorna a diferença
 * (hoje − esperado) ou null quando faltam dados.
 */
export function divergenciaContinuidade(
  volumeInicialHoje: number | null | undefined,
  volumeFinalOntem: number | null | undefined,
  entradasDia: number,
): number | null {
  if (volumeInicialHoje == null || volumeFinalOntem == null) return null
  return volumeInicialHoje - (volumeFinalOntem + entradasDia)
}
