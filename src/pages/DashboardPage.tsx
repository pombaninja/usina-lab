import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/formato'
import { useAuth } from '../lib/auth'
import { calcularAgregadoMes, saldoTanque, type LancamentoMes, type TanqueMin } from '../lib/calculos/insumos'
import { limitesDoMes, mesAtualLocal } from '../lib/datas'

interface TanqueAtivo { id: string; codigo: string; nome: string; unidade: string; estoque_minimo: number }

function SecaoInsumos() {
  const { inicio, fimExclusivo: fim } = limitesDoMes(mesAtualLocal())
  const card = 'bg-white p-6 rounded-xl shadow'

  const { data: tanquesAtivos } = useQuery({
    queryKey: ['tanques-ativos-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tanques').select('id, codigo, nome, unidade, estoque_minimo').eq('ativa', true).order('codigo')
      if (error) throw error
      return (data ?? []) as TanqueAtivo[]
    },
  })

  const { data: tanquesTodos } = useQuery({
    queryKey: ['tanques-todos-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tanques').select('id, produto')
      if (error) throw error
      return (data ?? []) as TanqueMin[]
    },
  })

  const { data: ultimoLancamento } = useQuery({
    queryKey: ['insumos-ultimo-lancamento'],
    queryFn: async () => {
      const { data, error } = await supabase.from('insumos_lancamentos')
        .select('data, insumos_leituras(tanque_id, volume_final)')
        .order('data', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0] ?? null) as { data: string; insumos_leituras: { tanque_id: string; volume_final: number | null }[] } | null
    },
  })

  // Entradas registradas depois do último lançamento (não refletidas no volume_final lido).
  // Entradas do próprio dia do lançamento já são consideradas parte da leitura daquele dia,
  // por isso o filtro é estritamente "depois" (gt), não "a partir de" (gte).
  const { data: entradasPosterioresRaw } = useQuery({
    queryKey: ['insumos-entradas-posteriores', ultimoLancamento?.data],
    queryFn: async () => {
      const { data, error } = await supabase.from('insumos_entradas')
        .select('tanque_id, quantidade')
        .gt('data', ultimoLancamento!.data)
      if (error) throw error
      return (data ?? []) as { tanque_id: string; quantidade: number }[]
    },
    enabled: !!ultimoLancamento,
  })

  const entradasPosterioresPorTanque = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entradasPosterioresRaw ?? []) m.set(e.tanque_id, (m.get(e.tanque_id) ?? 0) + Number(e.quantidade))
    return m
  }, [entradasPosterioresRaw])

  const { data: lancamentosMes } = useQuery({
    queryKey: ['insumos-lancamentos-mes-atual'],
    queryFn: async () => {
      const { data, error } = await supabase.from('insumos_lancamentos')
        .select('data, producao_ton, insumos_leituras(*)')
        .gte('data', inicio).lt('data', fim)
      if (error) throw error
      return (data ?? []) as LancamentoMes[]
    },
  })

  const saldoPorTanque = useMemo(() => {
    const m = new Map<string, { saldo: number; entradasPosteriores: number }>()
    for (const l of ultimoLancamento?.insumos_leituras ?? []) {
      if (l.volume_final != null) {
        const entradasPosteriores = entradasPosterioresPorTanque.get(l.tanque_id) ?? 0
        m.set(l.tanque_id, { saldo: saldoTanque(l.volume_final, entradasPosteriores, 0), entradasPosteriores })
      }
    }
    return m
  }, [ultimoLancamento, entradasPosterioresPorTanque])

  const agregado = useMemo(
    () => calcularAgregadoMes(lancamentosMes ?? [], tanquesTodos ?? []),
    [lancamentosMes, tanquesTodos],
  )

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">Insumos</h2>
      <div className="grid grid-cols-4 gap-4">
        {(tanquesAtivos ?? []).map(t => {
          const info = saldoPorTanque.get(t.id)
          const saldo = info?.saldo
          const abaixoMinimo = saldo != null && saldo < t.estoque_minimo
          return (
            <div key={t.id} className={card}>
              <p className="text-slate-500 text-sm">{t.codigo} — {t.nome}</p>
              <p className={`text-3xl font-bold ${abaixoMinimo ? 'text-red-600' : ''}`}>
                {saldo != null ? `${fmt(saldo, 3)} ${t.unidade}` : '—'}
              </p>
              {info && info.entradasPosteriores > 0 && (
                <p className="text-xs text-slate-500">(inclui {fmt(info.entradasPosteriores, 3)} recebidos)</p>
              )}
              {abaixoMinimo && <span className="bg-red-600 text-white rounded-full px-2 py-0.5 text-xs font-bold">ABAIXO DO MÍNIMO</span>}
            </div>
          )
        })}
        <div className={card}><p className="text-slate-500 text-sm">CAP/ton (mês)</p><p className="text-3xl font-bold">{fmt(agregado.capPorTonMedio, 4)}</p></div>
        <div className={card}><p className="text-slate-500 text-sm">Óleo L/ton (mês)</p><p className="text-3xl font-bold">{fmt(agregado.oleoPorTonMedio, 2)}</p></div>
      </div>
    </section>
  )
}

export default function DashboardPage() {
  const { perfis } = useAuth()
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const inicio = new Date()
      inicio.setDate(1)
      inicio.setHours(0, 0, 0, 0)
      const iso = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-01`
      const [{ data: ensaios }, { data: laudos }] = await Promise.all([
        supabase.from('ensaios_cauq').select('id, data, resultados').gte('data', iso),
        supabase.from('laudos').select('id, status').gte('criado_em', inicio.toISOString()),
      ])
      const total = ensaios?.length ?? 0
      const conformes = (ensaios ?? []).filter(e => e.resultados?.conforme === true).length
      const teores = (ensaios ?? []).map(e => e.resultados?.teor).filter((x): x is number => typeof x === 'number')
      return {
        total, conformes,
        pctConforme: total ? Math.round((conformes / total) * 100) : null,
        teorMedio: teores.length ? teores.reduce((a, b) => a + b, 0) / teores.length : null,
        emitidos: (laudos ?? []).filter(l => l.status === 'emitido').length,
      }
    },
  })
  const card = 'bg-white p-6 rounded-xl shadow'
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Painel do mês</h1>
      <div className="grid grid-cols-4 gap-4">
        <div className={card}><p className="text-slate-500 text-sm">Ensaios no mês</p><p className="text-3xl font-bold">{data?.total ?? '…'}</p></div>
        <div className={card}><p className="text-slate-500 text-sm">% Conformidade</p>
          <p className={`text-3xl font-bold ${data?.pctConforme !== null && (data?.pctConforme ?? 100) < 90 ? 'text-red-600' : 'text-green-700'}`}>
            {data === undefined ? '…' : data.pctConforme !== null ? `${data.pctConforme}%` : '—'}</p></div>
        <div className={card}><p className="text-slate-500 text-sm">Teor de betume médio</p><p className="text-3xl font-bold">{data?.teorMedio ? `${fmt(data.teorMedio, 2)}%` : '—'}</p></div>
        <div className={card}><p className="text-slate-500 text-sm">Laudos emitidos</p><p className="text-3xl font-bold">{data?.emitidos ?? '…'}</p></div>
      </div>
      {perfis['insumos'] && <SecaoInsumos />}
    </div>
  )
}
