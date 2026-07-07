import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/formato'

export default function DashboardPage() {
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
    </div>
  )
}
