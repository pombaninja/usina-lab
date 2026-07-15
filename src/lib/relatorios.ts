// Agregações CLIENT-SIDE dos relatórios estratégicos das listas (Ensaios Lab e
// Laudos): bucketing por mês, contagens por categoria/chave, situação consolidada
// de laudos e média de dias entre timestamps. Funções puras sobre strings/números —
// os cálculos técnicos dos ensaios continuam nas libs golden-testadas de
// src/lib/calculos (NUNCA reimplementar fórmula aqui).

export const MESES_ABREV_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const

/** Data local AAAA-MM-DD de um timestamp ISO (criado_em/emitido_em). Strings
 *  só-data (ensaios_lab.data) passam direto SEM parse de Date — new Date('AAAA-MM-DD')
 *  interpreta UTC e viraria "ontem" à noite no fuso local (lição de datas.ts). */
export function dataLocalDoTimestamp(ts: string | null | undefined): string | null {
  if (!ts) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mês 'AAAA-MM' (local) de uma data ou timestamp; null se ausente/inválida. */
export function mesDaData(data: string | null | undefined): string | null {
  return dataLocalDoTimestamp(data)?.slice(0, 7) ?? null
}

/** 'AAAA-MM' → rótulo curto pt-BR 'mmm/aa' (ex.: '2026-07' → 'jul/26'). */
export function rotuloMes(anoMes: string): string {
  const [ano, mes] = anoMes.split('-')
  const nome = MESES_ABREV_PT[Number(mes) - 1]
  return nome && ano?.length === 4 ? `${nome}/${ano.slice(2)}` : anoMes
}

/** 'AAAA-MM-DD' → 'dd/mm/aa' (rótulo compacto do eixo X dos gráficos por data). */
export function rotuloDataCurta(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data)
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : data
}

export interface ContagemMes { mes: string; rotulo: string; total: number }

/** Conta ocorrências por mês, em ordem crescente. Datas ausentes/inválidas são ignoradas. */
export function contagemPorMes(datas: (string | null | undefined)[]): ContagemMes[] {
  const porMes = new Map<string, number>()
  for (const d of datas) {
    const mes = mesDaData(d)
    if (mes) porMes.set(mes, (porMes.get(mes) ?? 0) + 1)
  }
  return [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, total]) => ({ mes, rotulo: rotuloMes(mes), total }))
}

export interface ContagemMesCategoria { mes: string; rotulo: string; porCategoria: Record<string, number> }

/** Conta por mês × categoria (meses crescentes) — insumo de barras empilhadas. */
export function contagemPorMesECategoria(itens: { data: string | null | undefined; categoria: string }[]): ContagemMesCategoria[] {
  const porMes = new Map<string, Record<string, number>>()
  for (const item of itens) {
    const mes = mesDaData(item.data)
    if (!mes) continue
    const porCategoria = porMes.get(mes) ?? {}
    porCategoria[item.categoria] = (porCategoria[item.categoria] ?? 0) + 1
    porMes.set(mes, porCategoria)
  }
  return [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, porCategoria]) => ({ mes, rotulo: rotuloMes(mes), porCategoria }))
}

export interface ContagemChave { chave: string; total: number }

/** Conta ocorrências por chave, da maior para a menor (empate: ordem alfabética).
 *  Valores vazios/nulos são ignorados. */
export function contagemPorChave(valores: (string | null | undefined)[]): ContagemChave[] {
  const m = new Map<string, number>()
  for (const v of valores) if (v) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([chave, total]) => ({ chave, total }))
}

export interface PontoData { data: string; valor: number }

/** Mescla séries {data, valor} nomeadas numa lista única de pontos para gráfico
 *  de MÚLTIPLAS linhas: ordena por data (AAAA-MM-DD), gera uma coluna por série
 *  e o rótulo dd/mm/aa. Pontos repetidos na MESMA data e série não são
 *  colapsados: a data vira N linhas (linha i = i-ésimo ponto de cada série) —
 *  nenhum ensaio some do gráfico. Séries sem ponto na data ficam sem a coluna
 *  (Line com connectNulls atravessa). */
export function mesclarSeriesPorData(
  series: Record<string, PontoData[]>,
): ({ data: string; rotulo: string } & Partial<Record<string, number | string>>)[] {
  const datas = [...new Set(Object.values(series).flat().map(p => p.data))].sort()
  const linhas: ({ data: string; rotulo: string } & Partial<Record<string, number | string>>)[] = []
  for (const data of datas) {
    const porChave = Object.entries(series).map(([chave, pontos]) =>
      [chave, pontos.filter(p => p.data === data)] as const)
    const repeticoes = Math.max(...porChave.map(([, pontos]) => pontos.length))
    for (let i = 0; i < repeticoes; i++) {
      const linha: { data: string; rotulo: string } & Partial<Record<string, number | string>> =
        { data, rotulo: rotuloDataCurta(data) }
      for (const [chave, pontos] of porChave) {
        if (pontos[i]) linha[chave] = pontos[i].valor
      }
      linhas.push(linha)
    }
  }
  return linhas
}

export type SituacaoLaudo = 'emitido' | 'aprovado' | 'rascunho'
const PRIORIDADE_SITUACAO: SituacaoLaudo[] = ['emitido', 'aprovado', 'rascunho']

/** Situação consolidada dos laudos de um ensaio: o status MAIS avançado entre os
 *  laudos vinculados (emitido > aprovado > rascunho); null = sem laudo. */
export function situacaoLaudos(statuses: string[]): SituacaoLaudo | null {
  for (const s of PRIORIDADE_SITUACAO) if (statuses.includes(s)) return s
  return null
}

/** Média de dias entre dois timestamps (ex.: criação→emissão de laudos).
 *  Pares incompletos/inválidos são ignorados; null se nenhum par completo. */
export function mediaDiasEntre(pares: { inicio: string | null | undefined; fim: string | null | undefined }[]): number | null {
  const dias: number[] = []
  for (const p of pares) {
    if (!p.inicio || !p.fim) continue
    const a = new Date(p.inicio).getTime()
    const b = new Date(p.fim).getTime()
    if (Number.isNaN(a) || Number.isNaN(b)) continue
    dias.push((b - a) / 86_400_000)
  }
  return dias.length ? dias.reduce((x, y) => x + y, 0) / dias.length : null
}
