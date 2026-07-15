import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { rotuloCurtoTipo } from './tipos'

// Vínculos BIDIRECIONAIS entre ensaios de AGREGADO (A3 do Batch A), guardados em
// ensaios_lab.dados.vinculos = { granulometria?: uuid, lamelaridade?: uuid,
// equivalente_areia?: uuid } (chave = tipo do ensaio apontado).
//
// Vincular grava OS DOIS lados (este ensaio → alvo e o alvo → este de volta),
// sempre relendo o `dados` fresco do banco e aplicando spread merge-preserving —
// nunca sobrescreve outras chaves de `dados` nem outros vínculos. Se o alvo for
// IMUTÁVEL (laudo emitido), o vínculo fica só deste lado e a tela avisa (nota
// âmbar). Desvincular desfaz os dois lados quando possível — o lado de volta só
// é removido se apontar para ESTE ensaio (não clobbera vínculo alheio).

export const TIPOS_VINCULAVEIS: Record<string, string[]> = {
  granulometria: ['lamelaridade', 'equivalente_areia'],
  lamelaridade: ['granulometria'],
  equivalente_areia: ['granulometria'],
}

type Vinculos = Record<string, string>

interface EnsaioResumo { id: string; numero: number; data: string; material_nome: string | null; tipo_ensaio: string }

function resumo(e: EnsaioResumo): string {
  return `Nº ${e.numero} · ${new Date(e.data + 'T12:00').toLocaleDateString('pt-BR')} · ${e.material_nome ?? '—'}`
}

export default function VinculosEnsaiosCard({ ensaio, editavel }: {
  ensaio: { id: string; tipo_ensaio: string; material_tipo: string; dados: Record<string, unknown> }
  editavel: boolean
}) {
  const qc = useQueryClient()
  const tiposAlvo = TIPOS_VINCULAVEIS[ensaio.tipo_ensaio] ?? []
  const vinculos = ((ensaio.dados ?? {}).vinculos ?? {}) as Vinculos
  const [selecao, setSelecao] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  // Candidatos: ensaios de AGREGADO dos tipos vinculáveis, mais recentes primeiro.
  const { data: candidatos } = useQuery({
    queryKey: ['ensaios-lab-vinculaveis', tiposAlvo],
    enabled: tiposAlvo.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('ensaios_lab')
        .select('id, numero, data, material_nome, tipo_ensaio')
        .in('tipo_ensaio', tiposAlvo).eq('material_tipo', 'agregado')
        .order('data', { ascending: false }).order('criado_em', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as EnsaioResumo[]
    },
  })

  // Detalhe dos ensaios já vinculados (chips) — por id, pois podem estar fora da
  // janela dos candidatos.
  const idsVinculados = Object.values(vinculos)
  const { data: vinculados } = useQuery({
    queryKey: ['ensaios-lab-vinculados', idsVinculados],
    enabled: idsVinculados.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('ensaios_lab')
        .select('id, numero, data, material_nome, tipo_ensaio').in('id', idsVinculados)
      if (error) throw error
      return (data ?? []) as EnsaioResumo[]
    },
  })

  /** Regrava dados.vinculos[chave] (valor null remove a chave) com merge-preserving,
   *  relendo `dados` fresco do banco. Lança o erro do banco (ex.: ensaio imutável). */
  async function gravarVinculo(alvoId: string, chave: string, valor: string | null) {
    const { data: alvo, error: errSel } = await supabase.from('ensaios_lab')
      .select('dados').eq('id', alvoId).single()
    if (errSel) throw new Error(errSel.message)
    const dadosAlvo = ((alvo as { dados: Record<string, unknown> | null }).dados ?? {})
    const vinculosAlvo = { ...((dadosAlvo.vinculos ?? {}) as Vinculos) }
    if (valor === null) delete vinculosAlvo[chave]
    else vinculosAlvo[chave] = valor
    const { error } = await supabase.from('ensaios_lab')
      .update({ dados: { ...dadosAlvo, vinculos: vinculosAlvo } }).eq('id', alvoId)
    if (error) throw new Error(error.message)
  }

  const imutavel = (e: Error) => /imut[aá]vel/i.test(e.message)

  const vincular = useMutation({
    mutationFn: async ({ tipoAlvo, alvoId }: { tipoAlvo: string; alvoId: string }) => {
      // 1) este ensaio aponta para o alvo…
      await gravarVinculo(ensaio.id, tipoAlvo, alvoId)
      // 2) …e o alvo aponta de volta. Alvo imutável (laudo emitido) → fica só um lado.
      try {
        await gravarVinculo(alvoId, ensaio.tipo_ensaio, ensaio.id)
        return { unidirecional: false }
      } catch (e) {
        if (imutavel(e as Error)) return { unidirecional: true }
        throw e
      }
    },
    onSuccess: (r, { tipoAlvo }) => {
      setErro('')
      setAviso(r.unidirecional
        ? 'O ensaio vinculado pertence a laudo emitido (imutável): o vínculo de volta não pôde ser gravado e ficou registrado apenas neste ensaio.'
        : '')
      setSelecao(s => ({ ...s, [tipoAlvo]: '' }))
      qc.invalidateQueries({ queryKey: ['ensaio-lab', ensaio.id] })
    },
    onError: (e: Error) => setErro(e.message),
  })

  const desvincular = useMutation({
    mutationFn: async ({ tipoAlvo, alvoId }: { tipoAlvo: string; alvoId: string }) => {
      await gravarVinculo(ensaio.id, tipoAlvo, null)
      // Remove o apontamento de volta SÓ se ele aponta para este ensaio.
      try {
        const { data: alvo } = await supabase.from('ensaios_lab').select('dados').eq('id', alvoId).maybeSingle()
        const vinculosAlvo = (((alvo as { dados: Record<string, unknown> | null } | null)?.dados ?? {}).vinculos ?? {}) as Vinculos
        if (vinculosAlvo[ensaio.tipo_ensaio] === ensaio.id) {
          await gravarVinculo(alvoId, ensaio.tipo_ensaio, null)
        }
        return { unidirecional: false }
      } catch (e) {
        if (imutavel(e as Error)) return { unidirecional: true }
        throw e
      }
    },
    onSuccess: (r) => {
      setErro('')
      setAviso(r.unidirecional
        ? 'O ensaio desvinculado pertence a laudo emitido (imutável): o apontamento de volta não pôde ser removido lá.'
        : '')
      qc.invalidateQueries({ queryKey: ['ensaio-lab', ensaio.id] })
    },
    onError: (e: Error) => setErro(e.message),
  })

  if (!tiposAlvo.length || ensaio.material_tipo !== 'agregado') return null

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-3">
      <h2 className="font-semibold text-lg text-grp-700">Ensaios vinculados</h2>
      <p className="text-sm text-slate-500">
        Vincule os ensaios da MESMA amostra feitos em conjunto (granulometria ↔ lamelaridade / equivalente de areia).
        O vínculo é gravado nos dois ensaios e vira navegação direta entre eles.
      </p>
      {tiposAlvo.map(tipo => {
        const vinculadoId = vinculos[tipo]
        const detalhe = (vinculados ?? []).find(v => v.id === vinculadoId)
        const removido = !!vinculadoId && vinculados !== undefined && !detalhe
        const opcoes = (candidatos ?? []).filter(c => c.tipo_ensaio === tipo)
        return (
          <div key={tipo} className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-grp-700 w-44">{rotuloCurtoTipo(tipo)}</span>
            {vinculadoId ? (<>
              {removido ? (
                <span className="text-sm text-slate-500 bg-slate-50 border rounded-full px-3 py-1">
                  Ensaio vinculado não encontrado (removido)
                </span>
              ) : (
                <Link to={`/ensaios-lab/${vinculadoId}`}
                  className="text-sm bg-grp-50 border border-grp-200 text-grp-700 rounded-full px-3 py-1 hover:bg-grp-100">
                  {detalhe ? `${resumo(detalhe)}` : 'Abrir ensaio vinculado'}
                </Link>
              )}
              {editavel && (
                <button className="text-sm text-red-600 underline disabled:opacity-50" disabled={desvincular.isPending}
                  onClick={() => desvincular.mutate({ tipoAlvo: tipo, alvoId: vinculadoId })}>Desvincular</button>
              )}
            </>) : editavel ? (<>
              <select className="border rounded p-2 text-sm min-w-64" value={selecao[tipo] ?? ''}
                onChange={e => setSelecao(s => ({ ...s, [tipo]: e.target.value }))}>
                <option value="">— selecione o ensaio —</option>
                {opcoes.map(o => <option key={o.id} value={o.id}>{resumo(o)}</option>)}
              </select>
              <button className="text-sm border rounded px-3 py-2 disabled:opacity-50"
                disabled={!selecao[tipo] || vincular.isPending}
                onClick={() => vincular.mutate({ tipoAlvo: tipo, alvoId: selecao[tipo] })}>Vincular</button>
            </>) : <span className="text-sm text-slate-400">—</span>}
          </div>
        )
      })}
      {aviso && <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded">{aviso}</p>}
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </section>
  )
}
