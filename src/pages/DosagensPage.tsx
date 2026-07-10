import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { normalizarPeneira } from '../lib/calculos/granulometria'

interface LinhaCurva { peneira: string; passante: string; tolerancia: string }
interface LinhaComposicao { origem: string; material: string; local: string; pct: string; densidade: string }
type Dosagem = Record<string, unknown> & {
  id: string
  empresas: { nome_exibicao: string }
  especificacoes: { nome: string }
  contexto?: string | null
  tipo?: string | null
  curva_projeto?: Record<string, number> | null
  curva_tolerancias?: Record<string, number> | null
  parametros_projeto?: Record<string, unknown> | null
  revisao?: number | null
  projeto_pai_id?: string | null
  criado_em?: string | null
}
const linhaVazia = (): LinhaCurva => ({ peneira: '', passante: '', tolerancia: '' })
const linhaComposicaoVazia = (): LinhaComposicao => ({ origem: '', material: '', local: '', pct: '', densidade: '' })
const formVazio: Record<string, unknown> = {}

const TIPOS_POR_CONTEXTO: Record<string, { value: string; label: string }[]> = {
  usina: [
    { value: 'cbuq', label: 'CBUQ' },
    { value: 'cbuqf', label: 'CBUQF' },
  ],
  obra: [
    { value: 'solo_brita', label: 'Solo-brita' },
    { value: 'solo_cimento', label: 'Solo-cimento' },
    { value: 'bgtc', label: 'BGTC' },
    { value: 'bgs', label: 'BGS' },
  ],
}
const CONTEXTO_LABEL: Record<string, string> = { obra: 'Obra', usina: 'Usina' }
const TIPO_LABEL: Record<string, string> = {
  cbuq: 'CBUQ', cbuqf: 'CBUQF', solo_brita: 'Solo-brita', solo_cimento: 'Solo-cimento', bgtc: 'BGTC', bgs: 'BGS',
}
const CARACTERISTICAS_CBUQ: { key: string; label: string }[] = [
  { key: 'vazios', label: 'Teor de vazios (%)' },
  { key: 'vam', label: 'V.A.M. (%)' },
  { key: 'rbv', label: 'R.B.V. (%)' },
  { key: 'estabilidade', label: 'Estabilidade Marshall (kgf)' },
  { key: 'fluencia_mm', label: 'Fluência (mm)' },
  { key: 'equivalente_areia', label: 'Equivalente de areia (%)' },
  { key: 'filler_ligante', label: 'Relação filler/betume' },
  { key: 'rtd', label: 'Resistência à tração diametral (MPa)' },
  { key: 'abrasao_los_angeles', label: 'Abrasão Los Angeles (%)' },
  { key: 'indice_forma', label: 'Índice de forma' },
  { key: 'durabilidade_sulfato', label: 'Durabilidade ao sulfato de sódio (%)' },
]

function validarCurva(linhas: LinhaCurva[]): string | null {
  const vistas = new Set<string>()
  for (const l of linhas) {
    const peneira = l.peneira.trim()
    if (!peneira) return 'Toda linha da curva precisa de uma peneira.'
    if (vistas.has(peneira)) return `Peneira repetida na curva de projeto: "${peneira}"`
    vistas.add(peneira)
    if (l.passante.trim() === '') return `Informe o % passando para a peneira "${peneira}".`
    const p = Number(l.passante)
    if (!Number.isFinite(p) || p < 0 || p > 100) return `% passando inválido para a peneira "${peneira}" (use um valor entre 0 e 100).`
    if (l.tolerancia.trim() !== '') {
      const t = Number(l.tolerancia)
      if (!Number.isFinite(t) || t < 0) return `Tolerância inválida para a peneira "${peneira}" (use um valor ≥ 0).`
    }
  }
  return null
}

function validarComposicao(linhas: LinhaComposicao[]): string | null {
  for (const l of linhas) {
    const preenchida = l.origem.trim() || l.material.trim() || l.local.trim() || l.pct.trim() !== '' || l.densidade.trim() !== ''
    if (!preenchida) continue
    if (l.pct.trim() === '') return 'Informe o "% na mistura" para toda linha de composição preenchida.'
    const p = Number(l.pct)
    if (!Number.isFinite(p) || p < 0 || p > 100) return '"% na mistura" inválido na composição (use um valor entre 0 e 100).'
    if (l.densidade.trim() !== '') {
      const dens = Number(l.densidade)
      if (!Number.isFinite(dens) || dens <= 0) return 'Densidade inválida na composição (use um valor maior que 0).'
    }
  }
  return null
}

export default function DosagensPage() {
  const qc = useQueryClient()
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [editando, setEditando] = useState<Dosagem | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>(formVazio)
  const [curvaLinhas, setCurvaLinhas] = useState<LinhaCurva[]>([])
  const [composicaoLinhas, setComposicaoLinhas] = useState<LinhaComposicao[]>([])
  const [parametros, setParametros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [revisoesAbertas, setRevisoesAbertas] = useState<Set<string>>(new Set())

  const { data: empresas } = useQuery({ queryKey: ['empresas'], queryFn: async () => (await supabase.from('empresas').select('id, nome_exibicao')).data ?? [] })
  const { data: especs } = useQuery({ queryKey: ['especificacoes'], queryFn: async () => (await supabase.from('especificacoes').select('id, nome')).data ?? [] })
  const { data: dosagens } = useQuery({
    queryKey: ['dosagens'],
    queryFn: async () => (await supabase.from('dosagens').select('*, empresas(nome_exibicao), especificacoes(nome)').order('criado_em', { ascending: false })).data as Dosagem[] ?? [],
  })

  // A lista principal mostra só a revisão mais recente de cada família de projeto
  // (família = coalesce(projeto_pai_id, id)); o histórico completo fica disponível
  // via "Ver revisões" por linha.
  const { atuais, historicoPorFamilia } = useMemo(() => {
    const porFamilia = new Map<string, Dosagem[]>()
    for (const d of dosagens ?? []) {
      const familia = String(d.projeto_pai_id ?? d.id)
      const arr = porFamilia.get(familia) ?? []
      arr.push(d)
      porFamilia.set(familia, arr)
    }
    const atuais: Dosagem[] = []
    const historicoPorFamilia = new Map<string, Dosagem[]>()
    for (const [familia, rows] of porFamilia) {
      const ordenadas = [...rows].sort((a, b) => Number(a.revisao ?? 0) - Number(b.revisao ?? 0))
      atuais.push(ordenadas[ordenadas.length - 1])
      historicoPorFamilia.set(familia, ordenadas)
    }
    return { atuais, historicoPorFamilia }
  }, [dosagens])

  function toggleRevisoes(familia: string) {
    setRevisoesAbertas(prev => {
      const next = new Set(prev)
      if (next.has(familia)) next.delete(familia)
      else next.add(familia)
      return next
    })
  }

  function limparForm() {
    setEditando(null)
    setForm(formVazio)
    setCurvaLinhas([])
    setComposicaoLinhas([])
    setParametros({})
    setErro('')
  }

  async function abrirEdicao(d: Dosagem) {
    setEditando(d)
    setForm({
      contexto: d.contexto ?? '', tipo: d.tipo ?? '', nome: d.nome, empresa_id: d.empresa_id, especificacao_id: d.especificacao_id,
      teor_otimo: d.teor_otimo, dens_max_teorica_projeto: d.dens_max_teorica_projeto,
      densidade_aparente_projeto: d.densidade_aparente_projeto, densidade_ligante: d.densidade_ligante,
    })
    const curvaProjeto = d.curva_projeto ?? {}
    const curvaTolerancias = d.curva_tolerancias ?? {}
    setCurvaLinhas(Object.keys(curvaProjeto).map(peneira => ({
      peneira,
      passante: String(curvaProjeto[peneira]),
      tolerancia: curvaTolerancias[peneira] != null ? String(curvaTolerancias[peneira]) : '',
    })))
    const parametrosProjeto = (d.parametros_projeto ?? {}) as Record<string, unknown>
    setParametros(Object.fromEntries(Object.entries(parametrosProjeto).map(([k, v]) => [k, String(v)])))
    setErro('')

    if (d.tipo === 'cbuq') {
      const { data, error } = await supabase.from('dosagem_composicao').select('*').eq('dosagem_id', d.id)
      if (error) { setErro(error.message); return }
      setComposicaoLinhas((data ?? []).map((r: Record<string, unknown>) => ({
        origem: String(r.origem ?? ''),
        material: String(r.material_nome ?? ''),
        local: String(r.local ?? ''),
        pct: r.percentual != null ? String(r.percentual) : '',
        densidade: r.densidade != null ? String(r.densidade) : '',
      })))
    } else {
      setComposicaoLinhas([])
    }
  }

  async function carregarPeneirasDaEspecificacao() {
    const especId = String(form.especificacao_id ?? '')
    if (!especId) return
    const { data, error } = await supabase.from('especificacao_peneiras').select('*').eq('especificacao_id', especId).order('abertura_mm', { ascending: false })
    if (error) { setErro(error.message); return }
    setCurvaLinhas(prev => {
      const existentes = new Map(prev.map(l => [normalizarPeneira(l.peneira), l.passante]))
      return (data ?? []).map((p: { peneira: string; tolerancia_trabalho: number | null }) => ({
        peneira: p.peneira,
        passante: existentes.get(normalizarPeneira(p.peneira)) ?? '',
        tolerancia: p.tolerancia_trabalho != null ? String(p.tolerancia_trabalho) : '',
      }))
    })
  }

  function alterarLinha(i: number, campo: keyof LinhaCurva, valor: string) {
    setCurvaLinhas(curvaLinhas.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)))
  }

  function alterarComposicao(i: number, campo: keyof LinhaComposicao, valor: string) {
    setComposicaoLinhas(composicaoLinhas.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)))
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.contexto) throw new Error('Selecione o contexto (Obra ou Usina).')
      if (!form.tipo) throw new Error('Selecione o tipo.')

      const erroCurva = validarCurva(curvaLinhas)
      if (erroCurva) throw new Error(erroCurva)

      const isCbuq = form.tipo === 'cbuq'
      if (isCbuq) {
        const erroComposicao = validarComposicao(composicaoLinhas)
        if (erroComposicao) throw new Error(erroComposicao)
      }

      const curva_projeto: Record<string, number> = {}
      const curva_tolerancias: Record<string, number> = {}
      for (const l of curvaLinhas) {
        const peneira = l.peneira.trim()
        curva_projeto[peneira] = Number(l.passante)
        if (l.tolerancia.trim() !== '') curva_tolerancias[peneira] = Number(l.tolerancia)
      }

      let parametros_projeto: Record<string, number | string> | null = null
      if (isCbuq) {
        const p: Record<string, number | string> = {}
        for (const c of CARACTERISTICAS_CBUQ) {
          const v = (parametros[c.key] ?? '').trim()
          if (v !== '') {
            const n = Number(v)
            if (!Number.isFinite(n)) throw new Error(`Valor inválido em "${c.label}".`)
            p[c.key] = n
          }
        }
        if (parametros.adesividade) p.adesividade = parametros.adesividade
        parametros_projeto = Object.keys(p).length ? p : null
      }

      const payload = {
        contexto: form.contexto,
        tipo: form.tipo,
        nome: form.nome,
        empresa_id: form.empresa_id,
        especificacao_id: form.especificacao_id,
        teor_otimo: form.teor_otimo ?? null,
        dens_max_teorica_projeto: form.dens_max_teorica_projeto ?? null,
        densidade_aparente_projeto: form.densidade_aparente_projeto ?? null,
        densidade_ligante: form.densidade_ligante ?? null,
        curva_projeto,
        curva_tolerancias: Object.keys(curva_tolerancias).length ? curva_tolerancias : null,
        parametros_projeto,
      }

      const { data: salvo, error } = editando
        ? await supabase.from('dosagens').update(payload).eq('id', editando.id).select('id').single()
        : await supabase.from('dosagens').insert(payload).select('id').single()
      if (error) throw error

      const dosagemId = (salvo as { id: string }).id

      // Reconciliação da composição roda para toda gravação, não só quando tipo === 'cbuq':
      // isso garante limpeza de linhas órfãs quando o tipo é trocado para fora de cbuq.
      const { data: antigas, error: errAntigas } = await supabase.from('dosagem_composicao').select('id').eq('dosagem_id', dosagemId)
      if (errAntigas) throw errAntigas
      const idsAntigos = (antigas ?? []).map((a: { id: string }) => a.id)

      const linhasPreenchidas = composicaoLinhas.filter(l =>
        l.origem.trim() || l.material.trim() || l.local.trim() || l.pct.trim() !== '' || l.densidade.trim() !== '')

      if (isCbuq && linhasPreenchidas.length) {
        // Insere as linhas novas primeiro; só remove as antigas se a inserção for bem-sucedida,
        // para nunca perder composição já salva em caso de falha parcial.
        const rows = linhasPreenchidas.map(l => ({
          dosagem_id: dosagemId,
          origem: l.origem.trim() || null,
          material_nome: l.material.trim() || null,
          local: l.local || null,
          percentual: Number(l.pct),
          densidade: l.densidade.trim() !== '' ? Number(l.densidade) : null,
        }))
        const ins = await supabase.from('dosagem_composicao').insert(rows)
        if (ins.error) throw ins.error

        if (idsAntigos.length) {
          const del = await supabase.from('dosagem_composicao').delete().in('id', idsAntigos)
          if (del.error) throw del.error
        }
      } else if (idsAntigos.length) {
        // tipo não é cbuq (ou é cbuq sem linhas preenchidas): apenas limpa composição antiga.
        const del = await supabase.from('dosagem_composicao').delete().in('id', idsAntigos)
        if (del.error) throw del.error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dosagens'] }); limparForm() },
    onError: (e: Error) => setErro(e.message),
  })

  // Cria uma nova revisão (snapshot do projeto atual, revisao+1) e já abre a
  // revisão nova no formulário de edição.
  const criarRevisao = useMutation({
    mutationFn: async (dosagemId: string) => {
      const { data, error } = await supabase.rpc('criar_revisao_projeto', { p_dosagem: dosagemId })
      if (error) throw error
      return data as string
    },
    onSuccess: async (novoId) => {
      await qc.invalidateQueries({ queryKey: ['dosagens'] })
      const { data, error } = await supabase.from('dosagens')
        .select('*, empresas(nome_exibicao), especificacoes(nome)').eq('id', novoId).single()
      if (error) { setErro(error.message); return }
      await abrirEdicao(data as Dosagem)
    },
    onError: (e: Error) => setErro(e.message),
  })

  const num = (k: string) => ({
    value: String(form[k] ?? ''), type: 'number', step: 'any',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) }),
    className: 'w-full border rounded p-2',
  })

  const paramNum = (k: string) => ({
    value: parametros[k] ?? '', type: 'number', step: 'any',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setParametros({ ...parametros, [k]: e.target.value }),
    className: 'w-full border rounded p-2',
  })

  const tipoAtual = String(form.tipo ?? '')
  const contextoAtual = String(form.contexto ?? '')
  const isCbuq = tipoAtual === 'cbuq'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Projetos de Materiais</h1>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita projetos de materiais.</p>}

      {podeEditar && (
        <form onSubmit={e => { e.preventDefault(); salvar.mutate() }} className="bg-white p-4 rounded-xl shadow space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm">Nome *<input className="w-full border rounded p-2" value={String(form.nome ?? '')}
              onChange={e => setForm({ ...form, nome: e.target.value })} required /></label>
            <label className="text-sm">Empresa *<select className="w-full border rounded p-2" required value={String(form.empresa_id ?? '')}
              onChange={e => setForm({ ...form, empresa_id: e.target.value })}>
              <option value="">—</option>{(empresas ?? []).map((x: { id: string; nome_exibicao: string }) => <option key={x.id} value={x.id}>{x.nome_exibicao}</option>)}
            </select></label>
            <label className="text-sm">Especificação *<select className="w-full border rounded p-2" required value={String(form.especificacao_id ?? '')}
              onChange={e => setForm({ ...form, especificacao_id: e.target.value })}>
              <option value="">—</option>{(especs ?? []).map((x: { id: string; nome: string }) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select></label>
            <label className="text-sm">Contexto *<select className="w-full border rounded p-2" required value={contextoAtual}
              onChange={e => setForm({ ...form, contexto: e.target.value, tipo: '' })}>
              <option value="">—</option>
              <option value="obra">Obra</option>
              <option value="usina">Usina</option>
            </select></label>
            <label className="text-sm">Tipo *<select className="w-full border rounded p-2 disabled:bg-slate-100" required disabled={!contextoAtual} value={tipoAtual}
              onChange={e => setForm({ ...form, tipo: e.target.value })}>
              <option value="">—</option>
              {(TIPOS_POR_CONTEXTO[contextoAtual] ?? []).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select></label>
            <label className="text-sm">Teor ótimo (%)<input {...num('teor_otimo')} /></label>
            <label className="text-sm">Massa esp. Rice (g/cm³)<input {...num('dens_max_teorica_projeto')} /></label>
            <label className="text-sm">Massa esp. aparente (g/cm³)<input {...num('densidade_aparente_projeto')} /></label>
            <label className="text-sm">Massa esp. do asfalto (g/cm³)<input {...num('densidade_ligante')} /></label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Curva de projeto</h2>
              <div className="flex gap-2">
                <button type="button" className="text-sm border rounded px-3 py-1 disabled:opacity-50"
                  disabled={!form.especificacao_id} onClick={carregarPeneirasDaEspecificacao}>
                  Carregar peneiras da especificação
                </button>
                <button type="button" className="text-sm border rounded px-3 py-1" onClick={() => setCurvaLinhas([...curvaLinhas, linhaVazia()])}>
                  + Adicionar peneira
                </button>
              </div>
            </div>
            {curvaLinhas.length > 0 && (
              <table className="w-full text-sm">
                <thead><tr className="text-left border-b text-slate-600">
                  <th className="py-1 pr-2">Peneira</th><th className="py-1 pr-2">% passando projeto</th><th className="py-1 pr-2">Tolerância ±</th><th />
                </tr></thead>
                <tbody>
                  {curvaLinhas.map((l, i) => (
                    <tr key={i}>
                      <td className="pr-2 py-1"><input className="w-full border rounded p-1" value={l.peneira}
                        onChange={e => alterarLinha(i, 'peneira', e.target.value)} /></td>
                      <td className="pr-2 py-1"><input className="w-full border rounded p-1" type="number" step="any" min="0" max="100" value={l.passante}
                        onChange={e => alterarLinha(i, 'passante', e.target.value)} /></td>
                      <td className="pr-2 py-1"><input className="w-full border rounded p-1" type="number" step="any" min="0" value={l.tolerancia}
                        onChange={e => alterarLinha(i, 'tolerancia', e.target.value)} /></td>
                      <td className="py-1"><button type="button" className="text-red-600 px-2" onClick={() => setCurvaLinhas(curvaLinhas.filter((_, idx) => idx !== i))}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {tipoAtual && !isCbuq && (
            <p className="text-sm text-slate-500 italic">Formulário detalhado deste tipo será liberado em breve.</p>
          )}

          {isCbuq && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm">Composição da mistura</h2>
                  <button type="button" className="text-sm border rounded px-3 py-1" onClick={() => setComposicaoLinhas([...composicaoLinhas, linhaComposicaoVazia()])}>
                    + Adicionar material
                  </button>
                </div>
                {composicaoLinhas.length > 0 && (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left border-b text-slate-600">
                      <th className="py-1 pr-2">Origem</th><th className="py-1 pr-2">Material</th><th className="py-1 pr-2">Local</th>
                      <th className="py-1 pr-2">% na mistura</th><th className="py-1 pr-2">Densidade</th><th />
                    </tr></thead>
                    <tbody>
                      {composicaoLinhas.map((l, i) => (
                        <tr key={i}>
                          <td className="pr-2 py-1"><input className="w-full border rounded p-1" placeholder="Pedreira Diabásio" value={l.origem}
                            onChange={e => alterarComposicao(i, 'origem', e.target.value)} /></td>
                          <td className="pr-2 py-1"><input className="w-full border rounded p-1" placeholder="Pedrisco" value={l.material}
                            onChange={e => alterarComposicao(i, 'material', e.target.value)} /></td>
                          <td className="pr-2 py-1">
                            <select className="w-full border rounded p-1" value={l.local} onChange={e => alterarComposicao(i, 'local', e.target.value)}>
                              <option value="">—</option>
                              <option value="silo_frio">Silo frio</option>
                              <option value="silo_quente">Silo quente</option>
                            </select>
                          </td>
                          <td className="pr-2 py-1"><input className="w-full border rounded p-1" type="number" step="any" min="0" max="100" value={l.pct}
                            onChange={e => alterarComposicao(i, 'pct', e.target.value)} /></td>
                          <td className="pr-2 py-1"><input className="w-full border rounded p-1" type="number" step="any" min="0" value={l.densidade}
                            onChange={e => alterarComposicao(i, 'densidade', e.target.value)} /></td>
                          <td className="py-1"><button type="button" className="text-red-600 px-2" onClick={() => setComposicaoLinhas(composicaoLinhas.filter((_, idx) => idx !== i))}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="space-y-2">
                <h2 className="font-semibold text-sm">Características de projeto (obtido)</h2>
                <div className="grid grid-cols-3 gap-3">
                  {CARACTERISTICAS_CBUQ.map(c => (
                    <label key={c.key} className="text-sm">{c.label}<input {...paramNum(c.key)} /></label>
                  ))}
                  <label className="text-sm">Adesividade
                    <select className="w-full border rounded p-2" value={parametros.adesividade ?? ''}
                      onChange={e => setParametros({ ...parametros, adesividade: e.target.value })}>
                      <option value="">—</option>
                      <option value="satisfatoria">Satisfatória</option>
                      <option value="nao_satisfatoria">Não satisfatória</option>
                    </select>
                  </label>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 items-center">
            <button className="bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-50" disabled={salvar.isPending}>
              {editando ? 'Atualizar' : 'Adicionar'}
            </button>
            {editando && <button type="button" className="border rounded px-3 py-2 disabled:opacity-50" disabled={salvar.isPending} onClick={limparForm}>Cancelar</button>}
          </div>
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
        </form>
      )}

      <table className="w-full bg-white rounded-xl shadow text-sm">
        <thead><tr className="text-left border-b"><th className="p-3">Nome</th><th>Rev.</th><th>Empresa</th><th>Especificação</th><th>Contexto/Tipo</th><th>Teor ótimo</th><th>Gmm</th><th /></tr></thead>
        <tbody>{atuais.map(d => {
          const familia = String(d.projeto_pai_id ?? d.id)
          const historico = historicoPorFamilia.get(familia) ?? [d]
          const temHistorico = historico.length > 1
          const aberto = revisoesAbertas.has(familia)
          return (
            <Fragment key={familia}>
              <tr className="border-b">
                <td className="p-3">{String(d.nome)}</td>
                <td>Rev. {String(d.revisao ?? 0)}</td>
                <td>{d.empresas?.nome_exibicao}</td>
                <td>{d.especificacoes?.nome}</td>
                <td>{CONTEXTO_LABEL[String(d.contexto ?? '')] ?? '—'} · {TIPO_LABEL[String(d.tipo ?? '')] ?? String(d.tipo ?? '—')}</td>
                <td>{String(d.teor_otimo ?? '')}</td><td>{String(d.dens_max_teorica_projeto ?? '')}</td>
                <td className="p-3 space-x-2 whitespace-nowrap">
                  {podeEditar && (
                    <>
                      <button className="text-blue-700" disabled={salvar.isPending || criarRevisao.isPending} onClick={() => abrirEdicao(d)}>Editar</button>
                      <button className="text-emerald-700" disabled={salvar.isPending || criarRevisao.isPending} onClick={() => criarRevisao.mutate(d.id)}>Criar revisão</button>
                    </>
                  )}
                  {(d.tipo === 'cbuq' || d.tipo === 'cbuqf') && (
                    <>
                      <Link className="text-purple-700" to={`/projetos/${d.id}/marshall`}>Dosagem Marshall</Link>
                      <Link className="text-indigo-700" to={`/projetos/${d.id}/agregados`}>Agregados</Link>
                      <Link className="text-teal-700" to={`/projetos/${d.id}/moldagem`}>Composição/Moldagem</Link>
                      <Link className="text-fuchsia-700" to={`/projetos/${d.id}/densidades`}>Densidades</Link>
                      <Link className="text-orange-700" to={`/projetos/${d.id}/complementares`}>Complementares</Link>
                      <Link className="text-rose-700" to={`/projetos/${d.id}/indice-forma`}>Índice de forma</Link>
                      <Link className="text-cyan-700" to={`/projetos/${d.id}/viscosidade`}>Viscosidade do CAP</Link>
                      <Link className="text-slate-700" to={`/projetos/${d.id}/documento`}>Documento / PDF</Link>
                    </>
                  )}
                </td>
              </tr>
              {temHistorico && (
                <tr className="border-b bg-slate-50">
                  <td colSpan={8} className="px-3 py-1 text-xs text-slate-500">
                    <button type="button" className="underline" onClick={() => toggleRevisoes(familia)}>
                      {aberto ? 'Ocultar revisões anteriores' : `Ver revisões (${historico.length})`}
                    </button>
                    {aberto && (
                      <ul className="mt-1 space-y-0.5">
                        {historico.map(h => (
                          <li key={h.id}>
                            Rev. {String(h.revisao ?? 0)} — {String(h.nome)}
                            {h.criado_em ? ` — ${new Date(h.criado_em).toLocaleDateString('pt-BR')}` : ''}
                            {String(h.id) === String(d.id) ? ' (atual)' : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}</tbody>
      </table>
    </div>
  )
}
