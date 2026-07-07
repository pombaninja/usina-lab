export interface LeituraTanque {
  tanqueId: string; produto: 'cap' | 'oleo_queima' | 'oleo_termico'
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
