import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'

interface LaudoLinha {
  id: string
  numero: string
  revisao: number
  status: string
  emitido_em: string | null
  ensaio_id: string | null
  ensaio_lab_id: string | null
  empresas: { nome_exibicao: string }
}

export default function LaudosListaPage() {
  const qc = useQueryClient()
  const { perfis } = useAuth()
  const podeExcluir = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const { data: laudos } = useQuery({
    queryKey: ['laudos'],
    queryFn: async () => {
      const result = await supabase.from('laudos')
        .select('id, numero, revisao, status, emitido_em, ensaio_id, ensaio_lab_id, empresas(nome_exibicao)')
        .order('criado_em', { ascending: false }).limit(200)
      return (result.data ?? []) as unknown as LaudoLinha[]
    },
  })

  const excluirLaudo = useMutation({
    mutationFn: async (laudoId: string) => {
      const { error } = await supabase.rpc('excluir_laudo', { p_laudo: laudoId })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laudos'] }) },
    onError: (e: Error) => window.alert(e.message),
  })

  function confirmarExclusao(l: LaudoLinha) {
    const msg = l.status === 'emitido'
      ? `Excluir o laudo EMITIDO ${l.numero}? Esta ação é IRREVERSÍVEL e remove um documento oficial numerado.`
      : 'Excluir este laudo? Esta ação é irreversível.'
    if (window.confirm(msg)) {
      excluirLaudo.mutate(l.id)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-grp-700">Laudos</h1>
      <table className="w-full bg-white rounded-xl shadow-sm text-sm">
        <thead><tr className="text-left border-b"><th className="p-3">Número</th><th>Tipo</th><th>Empresa</th><th>Rev.</th><th>Status</th><th>Emitido em</th><th /></tr></thead>
        <tbody>{(laudos ?? []).map((l: LaudoLinha) => (
          <tr key={l.id} className="border-b hover:bg-slate-50">
            <td className="p-3 font-mono">{l.numero}{l.revisao > 0 ? ` — Rev. ${l.revisao}` : ''}</td>
            <td>{l.ensaio_lab_id
              ? <span className="text-xs font-semibold bg-grp-100 text-grp-700 rounded px-2 py-0.5">Lab</span>
              : <span className="text-xs text-slate-500">CBUQ</span>}</td>
            <td>{l.empresas?.nome_exibicao}</td>
            <td>{l.revisao}</td><td className="uppercase">{l.status}</td>
            <td>{l.emitido_em ? new Date(l.emitido_em).toLocaleString('pt-BR') : '—'}</td>
            <td className="p-3 flex gap-3">
              {/* Laudo lab aponta para o ensaio avulso e para a impressão própria (/laudos-lab). */}
              <Link className="text-blue-700" to={l.ensaio_lab_id ? `/ensaios-lab/${l.ensaio_lab_id}` : `/ensaios/${l.ensaio_id}`}>Ensaio</Link>
              {l.status === 'emitido' && (
                <Link className="text-blue-700" to={l.ensaio_lab_id ? `/laudos-lab/${l.id}/imprimir` : `/laudos/${l.id}/imprimir`}>PDF</Link>
              )}
              {podeExcluir && (
                <button className="text-red-600 disabled:opacity-50" disabled={excluirLaudo.isPending}
                  onClick={() => confirmarExclusao(l)}>Excluir</button>
              )}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
