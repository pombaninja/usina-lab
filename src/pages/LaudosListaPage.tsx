import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { fmt } from '../lib/formato'
import { contagemPorChave, contagemPorMesECategoria, dataLocalDoTimestamp, mediaDiasEntre } from '../lib/relatorios'

interface LaudoLinha {
  id: string
  numero: string
  revisao: number
  status: string
  criado_em: string
  emitido_em: string | null
  empresa_id: string
  ensaio_id: string | null
  ensaio_lab_id: string | null
  empresas: { nome_exibicao: string }
}

// Cores de status (mesma semântica dos badges de Ensaios Lab): emitido verde,
// aprovado azul GRP, rascunho âmbar.
const COR_STATUS = { emitido: '#16a34a', aprovado: '#3b6fb5', rascunho: '#f59e0b' } as const

const FILTROS_VAZIOS = { de: '', ate: '', status: '', empresa: '', origem: '', numero: '' }

export default function LaudosListaPage() {
  const qc = useQueryClient()
  const { perfis } = useAuth()
  const podeExcluir = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  function setFiltro(campo: keyof typeof FILTROS_VAZIOS, valor: string) {
    setFiltros(f => ({ ...f, [campo]: valor }))
  }
  const temFiltro = Object.values(filtros).some(v => v !== '')

  // criado_em/empresa_id entram no select para filtros e relatório; limite 200 -> 1000
  // (volume real é pequeno e o relatório precisa do conjunto).
  const { data: laudos } = useQuery({
    queryKey: ['laudos'],
    queryFn: async () => {
      const result = await supabase.from('laudos')
        .select('id, numero, revisao, status, criado_em, emitido_em, empresa_id, ensaio_id, ensaio_lab_id, empresas(nome_exibicao)')
        .order('criado_em', { ascending: false }).limit(1000)
      return (result.data ?? []) as unknown as LaudoLinha[]
    },
  })

  const { data: empresas } = useQuery({
    queryKey: ['empresas-ativas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresas').select('id, nome_exibicao').eq('ativa', true).order('nome_exibicao')
      if (error) throw error
      return (data ?? []) as { id: string; nome_exibicao: string }[]
    },
  })

  // Todos os filtros são opcionais e combinam com E (AND). O período filtra pela
  // DATA DE EMISSÃO (emitido_em): com período preenchido, laudos não emitidos saem
  // do conjunto — rascunhos/aprovados continuam acháveis pelo filtro de Status.
  const filtrados = useMemo(() => {
    const busca = filtros.numero.trim().toLowerCase()
    return (laudos ?? []).filter(l => {
      if (filtros.de || filtros.ate) {
        const dataEmissao = dataLocalDoTimestamp(l.emitido_em)
        if (!dataEmissao) return false
        if (filtros.de && dataEmissao < filtros.de) return false
        if (filtros.ate && dataEmissao > filtros.ate) return false
      }
      if (filtros.status && l.status !== filtros.status) return false
      if (filtros.empresa && l.empresa_id !== filtros.empresa) return false
      if (filtros.origem === 'lab' && !l.ensaio_lab_id) return false
      if (filtros.origem === 'diario' && !l.ensaio_id) return false
      if (busca && !l.numero.toLowerCase().includes(busca)) return false
      return true
    })
  }, [laudos, filtros])

  // Relatório estratégico do CONJUNTO FILTRADO (recalculado ao vivo, client-side).
  const relatorio = useMemo(() => {
    const porMes = contagemPorMesECategoria(filtrados.map(l => ({ data: l.criado_em, categoria: l.status })))
      .map(m => ({
        rotulo: m.rotulo,
        emitido: m.porCategoria.emitido ?? 0,
        aprovado: m.porCategoria.aprovado ?? 0,
        rascunho: m.porCategoria.rascunho ?? 0,
      }))
    const emitidosPorEmpresa = contagemPorChave(
      filtrados.filter(l => l.status === 'emitido').map(l => l.empresas?.nome_exibicao))
    const emitidos = filtrados.filter(l => l.status === 'emitido').length
    const aprovados = filtrados.filter(l => l.status === 'aprovado').length
    const rascunhos = filtrados.filter(l => l.status === 'rascunho').length
    const tempoMedioDias = mediaDiasEntre(filtrados.map(l => ({ inicio: l.criado_em, fim: l.emitido_em })))
    return { porMes, emitidosPorEmpresa, emitidos, aprovados, rascunhos, tempoMedioDias }
  }, [filtrados])

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

  const inp = 'border rounded p-2 w-full'
  const kpi = 'bg-grp-50 rounded-lg p-3'

  // Impressão POR LOTE (B2): o botão leva o CONJUNTO FILTRADO ATUAL (na ordem da
  // lista) para /laudos/imprimir-lote?ids=… — um Ctrl+P imprime tudo, um laudo
  // por página. Cap de 50 (MAX_LOTE da página do lote); rascunhos/aprovados
  // entram como filtrados e saem com a marca "NÃO EMITIDO", consistente com a
  // impressão individual.
  const idsLote = filtrados.map(l => l.id)
  const loteBloqueado = idsLote.length === 0 || idsLote.length > 50

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h1 className="text-2xl font-bold text-grp-700">Laudos</h1>
        <div className="text-right">
          {loteBloqueado ? (
            <button className="bg-grp-600 text-white rounded px-4 py-2 opacity-50 cursor-not-allowed" disabled>
              Imprimir lote ({idsLote.length})
            </button>
          ) : (
            <Link to={`/laudos/imprimir-lote?ids=${idsLote.join(',')}`}
              className="inline-block bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2">
              Imprimir lote ({idsLote.length})
            </Link>
          )}
          {idsLote.length > 50 && (
            <p className="text-xs text-amber-700 mt-1">O lote imprime no máximo 50 laudos — refine os filtros.</p>
          )}
          {idsLote.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">Nenhum laudo no filtro para imprimir.</p>
          )}
        </div>
      </div>

      {/* ===== Filtros (todos opcionais, combinam com E) ===== */}
      <section className="bg-white p-4 rounded-xl shadow-sm space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-grp-700">Filtros</h2>
          {temFiltro && (
            <button className="text-sm text-grp-600 hover:text-grp-700 underline" onClick={() => setFiltros(FILTROS_VAZIOS)}>
              Limpar filtros
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-sm">Emissão de
            <input className={inp} type="date" value={filtros.de} onChange={e => setFiltro('de', e.target.value)} /></label>
          <label className="text-sm">Emissão até
            <input className={inp} type="date" value={filtros.ate} onChange={e => setFiltro('ate', e.target.value)} /></label>
          <label className="text-sm">Status
            <select className={inp} value={filtros.status} onChange={e => setFiltro('status', e.target.value)}>
              <option value="">Todos</option>
              <option value="rascunho">Rascunho</option>
              <option value="aprovado">Aprovado</option>
              <option value="emitido">Emitido</option>
            </select></label>
          <label className="text-sm">Empresa
            <select className={inp} value={filtros.empresa} onChange={e => setFiltro('empresa', e.target.value)}>
              <option value="">Todas</option>
              {(empresas ?? []).map(e => <option key={e.id} value={e.id}>{e.nome_exibicao}</option>)}
            </select></label>
          <label className="text-sm">Origem
            <select className={inp} value={filtros.origem} onChange={e => setFiltro('origem', e.target.value)}>
              <option value="">Todos</option>
              <option value="diario">CBUQ diário</option>
              <option value="lab">Laboratório</option>
            </select></label>
          <label className="text-sm">Busca por número
            <input className={inp} type="text" placeholder="ex.: SULPAV-2026-0147"
              value={filtros.numero} onChange={e => setFiltro('numero', e.target.value)} /></label>
        </div>
        {(filtros.de || filtros.ate) && (
          <p className="text-xs text-slate-500">
            O período filtra pela <b>data de emissão</b> — laudos ainda não emitidos ficam de fora enquanto o período estiver preenchido.
          </p>
        )}
      </section>

      {/* ===== Relatório estratégico do conjunto filtrado ===== */}
      <details open className="bg-white rounded-xl shadow-sm">
        <summary className="cursor-pointer select-none p-4 font-semibold text-grp-700">
          Relatório de laudos (conjunto filtrado)
        </summary>
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className={kpi}>
              <p className="text-xs text-slate-500">Total no filtro</p>
              <p className="text-2xl font-bold text-grp-700">{filtrados.length}</p>
            </div>
            <div className={kpi}>
              <p className="text-xs text-slate-500">Emitidos</p>
              <p className="text-2xl font-bold text-green-700">{relatorio.emitidos}</p>
            </div>
            <div className={kpi}>
              <p className="text-xs text-slate-500">Aprovados aguardando emissão</p>
              <p className="text-2xl font-bold text-grp-700">{relatorio.aprovados}</p>
            </div>
            <div className={kpi}>
              <p className="text-xs text-slate-500">Rascunhos</p>
              <p className="text-2xl font-bold text-amber-700">{relatorio.rascunhos}</p>
            </div>
            <div className={kpi}>
              <p className="text-xs text-slate-500">Tempo médio criação → emissão</p>
              <p className="text-2xl font-bold text-grp-700">
                {relatorio.tempoMedioDias != null ? `${fmt(relatorio.tempoMedioDias, 1)} dias` : '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-lg p-3 overflow-x-auto">
              <h3 className="text-sm font-semibold text-grp-700 mb-2">Laudos por mês de criação, por status</h3>
              {relatorio.porMes.length ? (
                <div className="w-fit mx-auto max-w-full">
                  <BarChart width={460} height={260} data={relatorio.porMes}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="emitido" name="Emitido" stackId="s" fill={COR_STATUS.emitido} />
                    <Bar dataKey="aprovado" name="Aprovado" stackId="s" fill={COR_STATUS.aprovado} />
                    <Bar dataKey="rascunho" name="Rascunho" stackId="s" fill={COR_STATUS.rascunho} />
                  </BarChart>
                </div>
              ) : <p className="text-sm text-slate-500">Sem dados no filtro.</p>}
            </div>

            <div className="border border-slate-200 rounded-lg p-3 overflow-x-auto">
              <h3 className="text-sm font-semibold text-grp-700 mb-2">Laudos emitidos por empresa</h3>
              {relatorio.emitidosPorEmpresa.length ? (
                <div className="w-fit mx-auto max-w-full">
                  <BarChart width={460} height={260} data={relatorio.emitidosPorEmpresa}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="chave" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="total" name="Emitidos" fill={COR_STATUS.emitido} />
                  </BarChart>
                </div>
              ) : <p className="text-sm text-slate-500">Sem dados no filtro.</p>}
            </div>
          </div>
        </div>
      </details>

      <table className="w-full bg-white rounded-xl shadow-sm text-sm">
        <thead><tr className="text-left border-b"><th className="p-3">Número</th><th>Tipo</th><th>Empresa</th><th>Rev.</th><th>Status</th><th>Emitido em</th><th /></tr></thead>
        <tbody>{filtrados.map((l: LaudoLinha) => (
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
      {!filtrados.length && (
        <p className="text-sm text-slate-500">
          {temFiltro ? 'Nenhum laudo no filtro.' : 'Nenhum laudo criado ainda.'}
        </p>
      )}
    </div>
  )
}
