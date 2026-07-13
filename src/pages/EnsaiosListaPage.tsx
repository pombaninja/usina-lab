import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'

interface EnsaioLinha {
  id: string; data: string; periodo: string
  resultados: { conforme?: boolean } | null
  dosagens: { nome: string }
  clientes_obras: { cliente: string } | null
}

export default function EnsaiosListaPage() {
  const qc = useQueryClient()
  const { perfis } = useAuth()
  const podeExcluir = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const { data: ensaios } = useQuery({
    queryKey: ['ensaios_cauq'],
    queryFn: async () => ((await supabase.from('ensaios_cauq')
      .select('id, data, periodo, resultados, dosagens(nome), clientes_obras(cliente)')
      .order('data', { ascending: false }).limit(100)).data ?? []) as unknown as EnsaioLinha[],
  })

  const excluirEnsaio = useMutation({
    mutationFn: async (ensaioId: string) => {
      const { error } = await supabase.rpc('excluir_ensaio', { p_ensaio: ensaioId })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ensaios_cauq'] }) },
    onError: (e: Error) => window.alert(e.message),
  })

  function confirmarExclusao(id: string) {
    if (window.confirm('Excluir este ensaio? Esta ação é irreversível e remove os dados do ensaio.')) {
      excluirEnsaio.mutate(id)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-grp-700">Ensaios CAUQ</h1>
        <Link to="/ensaios/novo" className="bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2">+ Novo Ensaio</Link>
      </div>
      <table className="w-full bg-white rounded-xl shadow-sm text-sm">
        <thead><tr className="text-left border-b"><th className="p-3">Data</th><th>Período</th><th>Dosagem</th><th>Cliente</th><th>Situação</th><th /></tr></thead>
        <tbody>{(ensaios ?? []).map((e: EnsaioLinha) => (
          <tr key={e.id} className="border-b hover:bg-slate-50">
            <td className="p-3"><Link className="text-blue-700" to={`/ensaios/${e.id}`}>{new Date(e.data + 'T12:00').toLocaleDateString('pt-BR')}</Link></td>
            <td>{e.periodo}</td><td>{e.dosagens?.nome}</td><td>{e.clientes_obras?.cliente ?? '—'}</td>
            <td>{e.resultados?.conforme === true ? <span className="text-green-600 font-semibold">Conforme</span>
               : e.resultados?.conforme === false ? <span className="text-red-600 font-semibold">Não conforme</span> : '—'}</td>
            <td className="p-3">
              {podeExcluir && (
                <button className="text-red-600 disabled:opacity-50" disabled={excluirEnsaio.isPending}
                  onClick={() => confirmarExclusao(e.id)}>Excluir</button>
              )}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
