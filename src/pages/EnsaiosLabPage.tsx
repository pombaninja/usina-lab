import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { fmt } from '../lib/formato'
import { ROTULO_MATERIAL, ROTULO_TIPO_ENSAIO, TIPOS_AGREGADO, TIPOS_CBUQ } from '../components/ensaiolab/tipos'
import FornecedorMaterialSelect, { type SelecaoFornecedorMaterial } from '../components/ensaiolab/FornecedorMaterialSelect'
import { teorRotarex, gmmRice } from '../lib/calculos/teorBetume'
import { calcularResistenciaCompressao } from '../lib/calculos/resistenciaCompressao'
import { contagemPorChave, contagemPorMes, rotuloDataCurta, situacaoLaudos, type SituacaoLaudo } from '../lib/relatorios'

interface EnsaioLabLinha {
  id: string
  numero: number
  data: string
  empresa_id: string
  material_tipo: string
  material_nome: string | null
  origem: string | null
  tipo_ensaio: string
  dados: Record<string, unknown>
}

// ===== Situação do laudo por ensaio (badge + filtro) =====

const ROTULO_SITUACAO: Record<SituacaoLaudo | 'sem', string> = {
  sem: 'Sem laudo', rascunho: 'Rascunho', aprovado: 'Aprovado', emitido: 'Emitido',
}
const COR_SITUACAO: Record<SituacaoLaudo | 'sem', string> = {
  sem: 'bg-slate-100 text-slate-600',
  rascunho: 'bg-amber-100 text-amber-800',
  aprovado: 'bg-blue-100 text-blue-800',
  emitido: 'bg-green-100 text-green-800',
}

function BadgeSituacao({ situacao }: { situacao: SituacaoLaudo | null }) {
  const s = situacao ?? 'sem'
  return <span className={`text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${COR_SITUACAO[s]}`}>{ROTULO_SITUACAO[s]}</span>
}

// ===== Extração de resultados CBUQ para o relatório =====
// SEMPRE via libs golden-testadas de src/lib/calculos (nunca reimplementar).
// Ensaio avulso guarda o shape na raiz de `dados`; o cbuq_completo guarda o MESMO
// shape na sub-chave homônima. Dados incompletos/inválidos → ensaio pulado (null).

function subDados(e: EnsaioLabLinha, tipo: string): Record<string, unknown> | null {
  if (e.tipo_ensaio === tipo) return e.dados
  if (e.tipo_ensaio === 'cbuq_completo') {
    const sub = e.dados[tipo]
    if (sub && typeof sub === 'object') return sub as Record<string, unknown>
  }
  return null
}

function teorBetumeDe(e: EnsaioLabLinha): number | null {
  const d = subDados(e, 'teor_betume') as { amostra_com_betume?: number | null; amostra_sem_betume?: number | null; umidade_pct?: number | null } | null
  if (!d || d.amostra_com_betume == null || d.amostra_sem_betume == null) return null
  try {
    const t = teorRotarex(d.amostra_com_betume, d.amostra_sem_betume, d.umidade_pct ?? 0)
    return Number.isFinite(t) ? t : null
  } catch { return null }
}

function rcMediaDe(e: EnsaioLabLinha): number | null {
  const d = subDados(e, 'resistencia_compressao') as { constante_prensa?: number; cps?: { leitura: number; diametro_cm: number }[] } | null
  if (!d || d.constante_prensa == null || !d.cps?.length) return null
  try {
    const r = calcularResistenciaCompressao(d.cps.map(c => ({
      leitura: c.leitura, constantePrensa: d.constante_prensa!, diametroCm: c.diametro_cm,
    })))
    return Number.isFinite(r.media) ? r.media : null
  } catch { return null }
}

function dmtDe(e: EnsaioLabLinha): number | null {
  const d = subDados(e, 'rice_dmt') as { peso_amostra?: number; frasco_agua?: number; frasco_amostra_agua?: number; fator_temp?: number } | null
  if (!d || d.peso_amostra == null || d.frasco_agua == null || d.frasco_amostra_agua == null) return null
  try {
    const v = gmmRice(d.peso_amostra, d.frasco_agua, d.frasco_amostra_agua, d.fator_temp ?? 1)
    return Number.isFinite(v) ? v : null
  } catch { return null }
}

/** Série {rotulo dd/mm/aa, valor} em ordem cronológica, pulando ensaios sem resultado. */
function serieResultados(ensaios: EnsaioLabLinha[], extrair: (e: EnsaioLabLinha) => number | null) {
  return ensaios
    .map(e => ({ data: e.data, valor: extrair(e) }))
    .filter((p): p is { data: string; valor: number } => p.valor != null)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map(p => ({ rotulo: rotuloDataCurta(p.data), valor: p.valor }))
}

function CartaoGrafico({ titulo, vazio, children }: { titulo: string; vazio: boolean; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 overflow-x-auto">
      <h3 className="text-sm font-semibold text-grp-700 mb-2">{titulo}</h3>
      {vazio
        ? <p className="text-sm text-slate-500">Sem dados no filtro.</p>
        : <div className="w-fit mx-auto max-w-full">{children}</div>}
    </div>
  )
}

const FILTROS_VAZIOS = { de: '', ate: '', material: '', tipo: '', empresa: '', busca: '', situacao: '' }

export default function EnsaiosLabPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { perfis } = useAuth()
  const podeLancar = podeNoModulo(perfis, 'ensaios_usina', 'lancador')
  const podeExcluir = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  const [novoAberto, setNovoAberto] = useState(false)
  const [novo, setNovo] = useState({
    empresa_id: '', data: new Date().toISOString().slice(0, 10),
    material_tipo: 'agregado', tipo_ensaio: 'granulometria',
  })
  // Fornecedor/Origem → Material do cadastro (A1). Os NOMES selecionados vão
  // sincronizados para material_nome/origem (TEXT) no insert — busca/exibição
  // legadas continuam funcionando.
  const [selecao, setSelecao] = useState<SelecaoFornecedorMaterial>({
    fornecedorId: '', materialLabId: '', fornecedorNome: null, materialNome: null,
  })
  const [erro, setErro] = useState('')

  function setFiltro(campo: keyof typeof FILTROS_VAZIOS, valor: string) {
    setFiltros(f => ({ ...f, [campo]: valor }))
  }
  const temFiltro = Object.values(filtros).some(v => v !== '')

  // `dados` entra no select para o relatório recalcular os resultados CBUQ
  // (limite 1000: era 200 — volume real é pequeno, e o relatório precisa do conjunto).
  const { data: ensaios } = useQuery({
    queryKey: ['ensaios_lab'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ensaios_lab')
        .select('id, numero, data, empresa_id, material_tipo, material_nome, origem, tipo_ensaio, dados')
        .order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(1000)
      if (error) throw error
      return (data ?? []) as EnsaioLabLinha[]
    },
  })

  // Laudos vinculados a ensaios de laboratório (uma consulta; join client-side)
  // para o badge de situação, o filtro "Situação do laudo" e o KPI de emitidos.
  const { data: laudosLab } = useQuery({
    queryKey: ['laudos-status-lab'],
    queryFn: async () => {
      const { data, error } = await supabase.from('laudos')
        .select('id, ensaio_lab_id, status')
        .not('ensaio_lab_id', 'is', null)
        .limit(1000)
      if (error) throw error
      return (data ?? []) as { id: string; ensaio_lab_id: string; status: string }[]
    },
  })

  const situacaoPorEnsaio = useMemo(() => {
    const statusPorEnsaio = new Map<string, string[]>()
    for (const l of laudosLab ?? []) {
      const lista = statusPorEnsaio.get(l.ensaio_lab_id) ?? []
      lista.push(l.status)
      statusPorEnsaio.set(l.ensaio_lab_id, lista)
    }
    const m = new Map<string, SituacaoLaudo | null>()
    for (const [id, statuses] of statusPorEnsaio) m.set(id, situacaoLaudos(statuses))
    return m
  }, [laudosLab])

  const { data: empresas } = useQuery({
    queryKey: ['empresas-ativas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresas').select('id, nome_exibicao').eq('ativa', true).order('nome_exibicao')
      if (error) throw error
      return (data ?? []) as { id: string; nome_exibicao: string }[]
    },
  })
  const empresaSelecionada = novo.empresa_id || (empresas?.length === 1 ? empresas[0].id : '')

  // Todos os filtros são opcionais e combinam com E (AND).
  const filtrados = useMemo(() => {
    const busca = filtros.busca.trim().toLowerCase()
    return (ensaios ?? []).filter(e => {
      if (filtros.de && e.data < filtros.de) return false
      if (filtros.ate && e.data > filtros.ate) return false
      if (filtros.material && e.material_tipo !== filtros.material) return false
      if (filtros.tipo && e.tipo_ensaio !== filtros.tipo) return false
      if (filtros.empresa && e.empresa_id !== filtros.empresa) return false
      if (busca && !`${e.material_nome ?? ''} ${e.origem ?? ''}`.toLowerCase().includes(busca)) return false
      if (filtros.situacao) {
        const s = situacaoPorEnsaio.get(e.id) ?? null
        if (filtros.situacao === 'sem' ? s !== null : s !== filtros.situacao) return false
      }
      return true
    })
  }, [ensaios, filtros, situacaoPorEnsaio])

  // Relatório estratégico do CONJUNTO FILTRADO (recalculado ao vivo, client-side).
  const relatorio = useMemo(() => {
    const porMes = contagemPorMes(filtrados.map(e => e.data))
    const porTipo = contagemPorChave(filtrados.map(e =>
      (ROTULO_TIPO_ENSAIO[e.tipo_ensaio] ?? e.tipo_ensaio).split(' — ')[0]))
    const teor = serieResultados(filtrados, teorBetumeDe)
    const rc = serieResultados(filtrados, rcMediaDe)
    const dmt = serieResultados(filtrados, dmtDe)
    const comLaudoEmitido = filtrados.filter(e => situacaoPorEnsaio.get(e.id) === 'emitido').length
    const materiais = new Set(filtrados
      .map(e => e.material_nome?.trim().toLowerCase())
      .filter((x): x is string => !!x))
    return { porMes, porTipo, teor, rc, dmt, comLaudoEmitido, materiaisDistintos: materiais.size }
  }, [filtrados, situacaoPorEnsaio])

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresaSelecionada) throw new Error('Selecione a empresa emissora.')
      if (!novo.data) throw new Error('Informe a data do ensaio.')
      const { data, error } = await supabase.from('ensaios_lab').insert({
        empresa_id: empresaSelecionada,
        data: novo.data,
        material_tipo: novo.material_tipo,
        fornecedor_id: selecao.fornecedorId || null,
        material_lab_id: selecao.materialLabId || null,
        // TEXT sincronizado com os nomes selecionados (exibição/impressão/busca legadas)
        material_nome: selecao.materialNome,
        origem: selecao.fornecedorNome,
        tipo_ensaio: novo.tipo_ensaio,
        dados: {},
      }).select('id').single()
      if (error) throw new Error('Falha ao criar o ensaio: ' + error.message)
      return (data as { id: string }).id
    },
    onSuccess: (id) => { setErro(''); qc.invalidateQueries({ queryKey: ['ensaios_lab'] }); nav(`/ensaios-lab/${id}`) },
    onError: (e: Error) => setErro(e.message),
  })

  const excluir = useMutation({
    mutationFn: async (ensaioId: string) => {
      const { error } = await supabase.rpc('excluir_ensaio_lab', { p_ensaio: ensaioId })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ensaios_lab'] }) },
    onError: (e: Error) => window.alert(e.message),
  })

  function confirmarExclusao(id: string) {
    if (window.confirm('Excluir este ensaio de laboratório? Esta ação é irreversível e remove também os laudos não emitidos vinculados.')) {
      excluir.mutate(id)
    }
  }

  const inp = 'border rounded p-2 w-full'
  const kpi = 'bg-grp-50 rounded-lg p-3'

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-grp-700">Ensaios de Laboratório</h1>
        {podeLancar && (
          <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2" onClick={() => setNovoAberto(v => !v)}>
            {novoAberto ? 'Fechar' : '+ Novo ensaio'}
          </button>
        )}
      </div>

      {novoAberto && podeLancar && (
        <section className="bg-white p-4 rounded-xl shadow-sm space-y-3">
          <h2 className="font-semibold text-grp-700">Novo ensaio avulso</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-sm">Empresa emissora
              <select className={inp} value={empresaSelecionada} onChange={e => setNovo({ ...novo, empresa_id: e.target.value })}>
                <option value="">—</option>
                {(empresas ?? []).map(e => <option key={e.id} value={e.id}>{e.nome_exibicao}</option>)}
              </select></label>
            <label className="text-sm">Data
              <input className={inp} type="date" value={novo.data} onChange={e => setNovo({ ...novo, data: e.target.value })} /></label>
            <label className="text-sm">Material
              <select className={inp} value={novo.material_tipo}
                onChange={e => {
                  const material_tipo = e.target.value
                  // Tipo padrão por material: granulometria (agregado) ou o ensaio CBUQ completo (cbuq/cbuqf).
                  setNovo({ ...novo, material_tipo, tipo_ensaio: material_tipo === 'agregado' ? 'granulometria' : 'cbuq_completo' })
                }}>
                {Object.entries(ROTULO_MATERIAL).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select></label>
            <FornecedorMaterialSelect valor={selecao} onChange={setSelecao} />
            <label className="text-sm">Tipo de ensaio
              <select className={inp} value={novo.tipo_ensaio} onChange={e => setNovo({ ...novo, tipo_ensaio: e.target.value })}>
                {(novo.material_tipo === 'agregado' ? TIPOS_AGREGADO : TIPOS_CBUQ)
                  .map(t => <option key={t} value={t}>{ROTULO_TIPO_ENSAIO[t]}</option>)}
              </select></label>
          </div>
          <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2 disabled:opacity-50"
            disabled={criar.isPending} onClick={() => criar.mutate()}>
            Criar ensaio
          </button>
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
        </section>
      )}

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="text-sm">Data de
            <input className={inp} type="date" value={filtros.de} onChange={e => setFiltro('de', e.target.value)} /></label>
          <label className="text-sm">Data até
            <input className={inp} type="date" value={filtros.ate} onChange={e => setFiltro('ate', e.target.value)} /></label>
          <label className="text-sm">Material
            <select className={inp} value={filtros.material} onChange={e => setFiltro('material', e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ROTULO_MATERIAL).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select></label>
          <label className="text-sm">Tipo de ensaio
            <select className={inp} value={filtros.tipo} onChange={e => setFiltro('tipo', e.target.value)}>
              <option value="">Todos</option>
              {[...TIPOS_AGREGADO, ...TIPOS_CBUQ].map(t => <option key={t} value={t}>{ROTULO_TIPO_ENSAIO[t]}</option>)}
            </select></label>
          <label className="text-sm">Empresa
            <select className={inp} value={filtros.empresa} onChange={e => setFiltro('empresa', e.target.value)}>
              <option value="">Todas</option>
              {(empresas ?? []).map(e => <option key={e.id} value={e.id}>{e.nome_exibicao}</option>)}
            </select></label>
          <label className="text-sm">Situação do laudo
            <select className={inp} value={filtros.situacao} onChange={e => setFiltro('situacao', e.target.value)}>
              <option value="">Todos</option>
              <option value="sem">Sem laudo</option>
              <option value="rascunho">Rascunho</option>
              <option value="aprovado">Aprovado</option>
              <option value="emitido">Emitido</option>
            </select></label>
          <label className="text-sm col-span-2">Busca (material / origem)
            <input className={inp} type="text" placeholder="ex.: pedra, pedreira, amostra…"
              value={filtros.busca} onChange={e => setFiltro('busca', e.target.value)} /></label>
        </div>
      </section>

      {/* ===== Relatório estratégico do conjunto filtrado ===== */}
      <details open className="bg-white rounded-xl shadow-sm">
        <summary className="cursor-pointer select-none p-4 font-semibold text-grp-700">
          Relatório dos ensaios (conjunto filtrado)
        </summary>
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={kpi}>
              <p className="text-xs text-slate-500">Total de ensaios</p>
              <p className="text-2xl font-bold text-grp-700">{(ensaios ?? []).length}</p>
            </div>
            <div className={kpi}>
              <p className="text-xs text-slate-500">Ensaios no período filtrado</p>
              <p className="text-2xl font-bold text-grp-700">{filtrados.length}</p>
            </div>
            <div className={kpi}>
              <p className="text-xs text-slate-500">% com laudo emitido</p>
              <p className="text-2xl font-bold text-grp-700">
                {filtrados.length ? `${Math.round((relatorio.comLaudoEmitido / filtrados.length) * 100)}%` : '—'}
              </p>
            </div>
            <div className={kpi}>
              <p className="text-xs text-slate-500">Materiais distintos</p>
              <p className="text-2xl font-bold text-grp-700">{relatorio.materiaisDistintos}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CartaoGrafico titulo="Ensaios por mês" vazio={!relatorio.porMes.length}>
              <BarChart width={460} height={240} data={relatorio.porMes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" name="Ensaios" fill="#3b6fb5" />
              </BarChart>
            </CartaoGrafico>

            <CartaoGrafico titulo="Distribuição por tipo de ensaio" vazio={!relatorio.porTipo.length}>
              <BarChart width={460} height={Math.max(240, relatorio.porTipo.length * 30 + 60)}
                data={relatorio.porTipo} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="chave" width={170} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" name="Ensaios" fill="#3b6fb5" />
              </BarChart>
            </CartaoGrafico>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-grp-700 mb-2">Resultados CBUQ ao longo do tempo</h3>
            <p className="text-xs text-slate-500 mb-2">
              Recalculados das entradas brutas com as mesmas bibliotecas dos formulários — ensaios com dados incompletos são pulados.
              Inclui ensaios avulsos e as seções do ensaio CBUQ completo.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CartaoGrafico titulo="Teor de betume (%) por data" vazio={!relatorio.teor.length}>
                <LineChart width={460} height={240} data={relatorio.teor}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} />
                  <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => fmt(v, 1)} />
                  <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 2)}%`} />
                  <Line dataKey="valor" name="Teor de betume" stroke="#3b6fb5" strokeWidth={2} dot />
                </LineChart>
              </CartaoGrafico>

              <CartaoGrafico titulo="Resistência à compressão média (MPa) por data" vazio={!relatorio.rc.length}>
                <LineChart width={460} height={240} data={relatorio.rc}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} />
                  <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => fmt(v, 1)} />
                  <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 3)} MPa`} />
                  <Line dataKey="valor" name="RC média" stroke="#2f5a94" strokeWidth={2} dot />
                </LineChart>
              </CartaoGrafico>

              <CartaoGrafico titulo="DMT / Rice (Gmm) por data" vazio={!relatorio.dmt.length}>
                <LineChart width={460} height={240} data={relatorio.dmt}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} />
                  <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => fmt(v, 2)} />
                  <Tooltip formatter={(v: unknown) => fmt(Number(v), 4)} />
                  <Line dataKey="valor" name="DMT (Gmm)" stroke="#4c80c4" strokeWidth={2} dot />
                </LineChart>
              </CartaoGrafico>
            </div>
          </div>
        </div>
      </details>

      <table className="w-full bg-white rounded-xl shadow-sm text-sm">
        <thead><tr className="text-left border-b"><th className="p-3">Nº</th><th>Data</th><th>Material</th><th>Nome</th><th>Origem</th><th>Tipo de ensaio</th><th>Laudo</th><th /></tr></thead>
        <tbody>{filtrados.map(e => (
          <tr key={e.id} className="border-b hover:bg-slate-50">
            <td className="p-3 font-semibold"><Link className="text-blue-700" to={`/ensaios-lab/${e.id}`}>{e.numero}</Link></td>
            <td><Link className="text-blue-700" to={`/ensaios-lab/${e.id}`}>{new Date(e.data + 'T12:00').toLocaleDateString('pt-BR')}</Link></td>
            <td>{ROTULO_MATERIAL[e.material_tipo] ?? e.material_tipo}</td>
            <td>{e.material_nome ?? '—'}</td>
            <td>{e.origem ?? '—'}</td>
            <td>{ROTULO_TIPO_ENSAIO[e.tipo_ensaio] ?? e.tipo_ensaio}</td>
            <td><BadgeSituacao situacao={situacaoPorEnsaio.get(e.id) ?? null} /></td>
            <td className="p-3">
              {podeExcluir && (
                <button className="text-red-600 disabled:opacity-50" disabled={excluir.isPending}
                  onClick={() => confirmarExclusao(e.id)}>Excluir</button>
              )}
            </td>
          </tr>
        ))}</tbody>
      </table>
      {!filtrados.length && (
        <p className="text-sm text-slate-500">
          {temFiltro ? 'Nenhum ensaio de laboratório no filtro.' : 'Nenhum ensaio de laboratório lançado ainda.'}
        </p>
      )}
    </div>
  )
}
