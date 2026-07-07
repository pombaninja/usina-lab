import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface EnsaioLinha {
  id: string; data: string; periodo: string
  resultados: { conforme?: boolean } | null
  dosagens: { nome: string }
  clientes_obras: { cliente: string } | null
}

export default function EnsaiosListaPage() {
  const { data: ensaios } = useQuery({
    queryKey: ['ensaios_cauq'],
    queryFn: async () => ((await supabase.from('ensaios_cauq')
      .select('id, data, periodo, resultados, dosagens(nome), clientes_obras(cliente)')
      .order('data', { ascending: false }).limit(100)).data ?? []) as unknown as EnsaioLinha[],
  })
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Ensaios CAUQ</h1>
        <Link to="/ensaios/novo" className="bg-blue-700 text-white rounded px-4 py-2">+ Novo Ensaio</Link>
      </div>
      <table className="w-full bg-white rounded-xl shadow text-sm">
        <thead><tr className="text-left border-b"><th className="p-3">Data</th><th>Período</th><th>Dosagem</th><th>Cliente</th><th>Situação</th></tr></thead>
        <tbody>{(ensaios ?? []).map((e: EnsaioLinha) => (
          <tr key={e.id} className="border-b hover:bg-slate-50">
            <td className="p-3"><Link className="text-blue-700" to={`/ensaios/${e.id}`}>{new Date(e.data + 'T12:00').toLocaleDateString('pt-BR')}</Link></td>
            <td>{e.periodo}</td><td>{e.dosagens?.nome}</td><td>{e.clientes_obras?.cliente ?? '—'}</td>
            <td>{e.resultados?.conforme === true ? <span className="text-green-600 font-semibold">Conforme</span>
               : e.resultados?.conforme === false ? <span className="text-red-600 font-semibold">Não conforme</span> : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
