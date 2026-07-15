import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import LaudoLabConteudo from '../components/laudos/LaudoLabConteudo'
import LaudoCauqConteudo from '../components/laudos/LaudoCauqConteudo'

// Impressão de laudos POR LOTE (B2) — rota /laudos/imprimir-lote?ids=<uuid,uuid,…>.
// Renderiza o CONTEÚDO de cada laudo em sequência (LaudoLabConteudo para laudos de
// ensaio de laboratório, LaudoCauqConteudo para o CBUQ diário — cada um se
// auto-busca pelo laudoId), um por página (.doc-pagina = break-before), de modo
// que UM Ctrl+P imprime o lote inteiro. Laudos não emitidos saem com a marca
// "NÃO EMITIDO" no cabeçalho — mesmo comportamento das páginas individuais.

/** Limite de laudos por lote (URL e tempo de renderização sob controle) —
 *  espelhado no botão "Imprimir lote" de LaudosListaPage. */
const MAX_LOTE = 50

export default function LaudosLotePage() {
  const [params] = useSearchParams()
  const ids = useMemo(() => {
    const brutos = (params.get('ids') ?? '').split(',').map(s => s.trim()).filter(Boolean)
    return [...new Set(brutos)].slice(0, MAX_LOTE)
  }, [params])

  // Uma consulta só para descobrir o TIPO de cada laudo (lab × CBUQ diário) e
  // manter a ordem dos ids recebidos; ids inexistentes são ignorados.
  const { data: laudos } = useQuery({
    queryKey: ['laudos-lote', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('laudos')
        .select('id, ensaio_lab_id').in('id', ids)
      if (error) throw error
      const porId = new Map((data ?? []).map(l => [l.id as string, l]))
      return ids.map(id => porId.get(id)).filter(Boolean) as { id: string; ensaio_lab_id: string | null }[]
    },
  })

  if (!ids.length) {
    return (
      <div className="max-w-[210mm] mx-auto bg-white p-8 text-sm">
        <p className="text-amber-700">Nenhum laudo informado — abra pelo botão “Imprimir lote” da lista de laudos (rota ?ids=…).</p>
        <Link to="/laudos" className="text-blue-700 underline">Voltar aos laudos</Link>
      </div>
    )
  }
  if (!laudos) return <p>Carregando…</p>

  return (
    <div className="max-w-[210mm] mx-auto bg-white p-8 text-sm print:p-0">
      <div className="print:hidden mb-4 flex items-center gap-4">
        <button onClick={() => window.print()} className="bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2">
          Imprimir lote / Salvar PDF ({laudos.length} laudo{laudos.length === 1 ? '' : 's'})
        </button>
        <Link to="/laudos" className="text-sm text-blue-700 underline">Voltar aos laudos</Link>
      </div>
      {!laudos.length && <p className="text-amber-700">Nenhum dos laudos informados foi encontrado.</p>}
      {laudos.map(l => (
        // Quebra de página por laudo; o navegador ignora o break forçado no
        // primeiro elemento renderizado — sem página em branco no início.
        <div key={l.id} className="doc-pagina">
          {l.ensaio_lab_id ? <LaudoLabConteudo laudoId={l.id} /> : <LaudoCauqConteudo laudoId={l.id} />}
        </div>
      ))}
    </div>
  )
}
