import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { fmt } from '../lib/formato'

interface Dosagem {
  nome: string
  empresa_id: string
  especificacoes: { nome: string }
}

interface ClienteObra {
  cliente: string
  obra: string
}

interface Resultados {
  teor: number
  gmm: number
  conforme: boolean
  marshall?: {
    medias: {
      vazios: number
      vam: number
      rbv: number
      estabilidadeCorrigida: number
    }
  }
}

interface Ensaio {
  id: string
  data: string
  resultados: Resultados | null
  dosagens: Dosagem | null
  clientes_obras: ClienteObra | null
  empresa_id: string
}

interface Laudo {
  id: string
  numero: string
  revisao: number
  status: string
  empresa_id: string
  ensaio_id: string
  snapshot: Resultados | null
}

export default function EnsaioDetalhePage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { perfis, user } = useAuth()
  const podeAprovar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const { data: ensaio } = useQuery({
    queryKey: ['ensaio', id],
    queryFn: async () => {
      const result = await supabase.from('ensaios_cauq')
        .select('*, dosagens(nome, empresa_id, especificacoes(nome)), clientes_obras(cliente, obra)')
        .eq('id', id).single()
      return result.data as unknown as Ensaio | null
    },
  })

  const { data: laudo } = useQuery({
    queryKey: ['laudo-do-ensaio', id],
    queryFn: async () => {
      const result = await supabase.from('laudos').select('*').eq('ensaio_id', id)
        .order('revisao', { ascending: false }).limit(1).maybeSingle()
      return result.data as unknown as Laudo | null
    },
  })

  const criarLaudo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('laudos').insert({
        empresa_id: ensaio!.empresa_id,
        ensaio_id: id,
        ano: new Date().getFullYear(),
        seq: 0,
        numero: `RASCUNHO-${id!.slice(0, 8)}`,
        snapshot: ensaio!.resultados,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laudo-do-ensaio', id] }),
  })

  const aprovar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('laudos')
        .update({
          status: 'aprovado',
          avaliador: user!.id,
          aprovado_em: new Date().toISOString(),
          snapshot: ensaio!.resultados,
        })
        .eq('id', laudo!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laudo-do-ensaio', id] }),
  })

  const emitir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('emitir_laudo', { p_laudo: laudo!.id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laudo-do-ensaio', id] }),
  })

  const revisar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('laudos').insert({
        empresa_id: laudo!.empresa_id,
        ensaio_id: id,
        ano: new Date().getFullYear(),
        seq: 0,
        numero: `RASCUNHO-R${laudo!.revisao + 1}-${id!.slice(0, 8)}`,
        revisao: laudo!.revisao + 1,
        laudo_original_id: laudo!.id,
        snapshot: ensaio!.resultados,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laudo-do-ensaio', id] }),
  })

  if (!ensaio) return <p>Carregando…</p>
  const r = ensaio.resultados
  const podeEditarValores = !laudo || laudo.status !== 'emitido'
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-grp-700">Ensaio de {new Date(ensaio.data + 'T12:00').toLocaleDateString('pt-BR')} — {ensaio.dosagens?.nome}</h1>
        {podeEditarValores && <Link to={`/ensaios/${id}/editar`} className="bg-slate-800 text-white rounded px-4 py-2">Editar valores</Link>}
      </div>
      {r && (
        <div className={`p-4 rounded-xl text-white font-bold ${r.conforme ? 'bg-green-600' : 'bg-red-600'}`}>
          {r.conforme ? 'DENTRO DA ESPECIFICAÇÃO' : 'FORA DA ESPECIFICAÇÃO'}
        </div>
      )}
      {r?.marshall && (
        <section className="bg-white p-4 rounded-xl shadow-sm text-sm">
          <h2 className="font-semibold mb-2">Resultados Marshall (médias)</h2>
          <p>Vazios: <b>{fmt(r.marshall.medias.vazios, 2)}%</b> · VAM: <b>{fmt(r.marshall.medias.vam, 1)}</b> ·
             RBV: <b>{fmt(r.marshall.medias.rbv, 1)}%</b> · Estabilidade: <b>{fmt(r.marshall.medias.estabilidadeCorrigida, 0)} kgf</b> ·
             Teor: <b>{fmt(r.teor, 2)}%</b> · Gmm: <b>{fmt(r.gmm, 4)}</b></p>
        </section>
      )}
      <section className="bg-white p-4 rounded-xl shadow-sm">
        <h2 className="font-semibold mb-3">Laudo</h2>
        {!laudo && <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2 disabled:opacity-50" disabled={criarLaudo.isPending} onClick={() => criarLaudo.mutate()}>Criar laudo (rascunho)</button>}
        {laudo && (
          <div className="space-y-3 text-sm">
            <p>Número: <b>{laudo.numero}{laudo.revisao > 0 ? ` — Rev. ${laudo.revisao}` : ''}</b> · Revisão: <b>{laudo.revisao}</b> · Status: <b className="uppercase">{laudo.status}</b></p>
            <div className="flex gap-3">
              {laudo.status === 'rascunho' && podeAprovar &&
                <button className="bg-amber-600 text-white rounded px-4 py-2 disabled:opacity-50" disabled={aprovar.isPending} onClick={() => aprovar.mutate()}>Aprovar</button>}
              {laudo.status === 'aprovado' && podeAprovar &&
                <button className="bg-green-700 text-white rounded px-4 py-2 disabled:opacity-50" disabled={emitir.isPending} onClick={() => emitir.mutate()}>Emitir (numera e trava)</button>}
              {laudo.status === 'emitido' && <>
                <Link to={`/laudos/${laudo.id}/imprimir`} className="bg-slate-800 text-white rounded px-4 py-2 inline-block">Imprimir / PDF</Link>
                <button className="border rounded px-4 py-2 disabled:opacity-50" disabled={revisar.isPending} onClick={() => revisar.mutate()}>Criar revisão</button>
              </>}
            </div>
            {laudo.revisao > 0 && laudo.status === 'rascunho' && (
              <p className="text-amber-700">
                Revisão aberta: edite os valores do ensaio, aprove e emita novamente. O número do laudo será mantido (Rev. {laudo.revisao}).
              </p>
            )}
            {(criarLaudo.error || aprovar.error || emitir.error || revisar.error) &&
              <p className="text-red-600">{String((criarLaudo.error ?? aprovar.error ?? emitir.error ?? revisar.error as Error).message)}</p>}
          </div>
        )}
      </section>
    </div>
  )
}
