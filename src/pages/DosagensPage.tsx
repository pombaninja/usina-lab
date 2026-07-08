import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { normalizarPeneira } from '../lib/calculos/granulometria'

interface LinhaCurva { peneira: string; passante: string; tolerancia: string }
type Dosagem = Record<string, unknown> & {
  id: string
  empresas: { nome_exibicao: string }
  especificacoes: { nome: string }
  curva_projeto?: Record<string, number> | null
  curva_tolerancias?: Record<string, number> | null
}
const linhaVazia = (): LinhaCurva => ({ peneira: '', passante: '', tolerancia: '' })
const formVazio = { tipo: 'cauq' }

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

export default function DosagensPage() {
  const qc = useQueryClient()
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [editando, setEditando] = useState<Dosagem | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>(formVazio)
  const [curvaLinhas, setCurvaLinhas] = useState<LinhaCurva[]>([])
  const [erro, setErro] = useState('')

  const { data: empresas } = useQuery({ queryKey: ['empresas'], queryFn: async () => (await supabase.from('empresas').select('id, nome_exibicao')).data ?? [] })
  const { data: especs } = useQuery({ queryKey: ['especificacoes'], queryFn: async () => (await supabase.from('especificacoes').select('id, nome')).data ?? [] })
  const { data: dosagens } = useQuery({
    queryKey: ['dosagens'],
    queryFn: async () => (await supabase.from('dosagens').select('*, empresas(nome_exibicao), especificacoes(nome)').order('criado_em', { ascending: false })).data as Dosagem[] ?? [],
  })

  function limparForm() {
    setEditando(null)
    setForm(formVazio)
    setCurvaLinhas([])
    setErro('')
  }

  function abrirEdicao(d: Dosagem) {
    setEditando(d)
    setForm({
      tipo: d.tipo ?? 'cauq', nome: d.nome, empresa_id: d.empresa_id, especificacao_id: d.especificacao_id,
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
    setErro('')
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

  const salvar = useMutation({
    mutationFn: async () => {
      const erroCurva = validarCurva(curvaLinhas)
      if (erroCurva) throw new Error(erroCurva)

      const curva_projeto: Record<string, number> = {}
      const curva_tolerancias: Record<string, number> = {}
      for (const l of curvaLinhas) {
        const peneira = l.peneira.trim()
        curva_projeto[peneira] = Number(l.passante)
        if (l.tolerancia.trim() !== '') curva_tolerancias[peneira] = Number(l.tolerancia)
      }
      const payload = {
        ...form,
        curva_projeto,
        curva_tolerancias: Object.keys(curva_tolerancias).length ? curva_tolerancias : null,
      }
      const { error } = editando
        ? await supabase.from('dosagens').update(payload).eq('id', editando.id)
        : await supabase.from('dosagens').insert(payload)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dosagens'] }); limparForm() },
    onError: (e: Error) => setErro(e.message),
  })

  const num = (k: string) => ({
    value: String(form[k] ?? ''), type: 'number', step: 'any',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) }),
    className: 'w-full border rounded p-2',
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dosagens (Traços)</h1>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita dosagens.</p>}

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
            <label className="text-sm">Teor ótimo (%)<input {...num('teor_otimo')} /></label>
            <label className="text-sm">Gmm de projeto<input {...num('dens_max_teorica_projeto')} /></label>
            <label className="text-sm">Dens. aparente projeto<input {...num('densidade_aparente_projeto')} /></label>
            <label className="text-sm">Dens. ligante<input {...num('densidade_ligante')} /></label>
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
        <thead><tr className="text-left border-b"><th className="p-3">Nome</th><th>Empresa</th><th>Especificação</th><th>Teor ótimo</th><th>Gmm</th>{podeEditar && <th />}</tr></thead>
        <tbody>{(dosagens ?? []).map(d => (
          <tr key={d.id} className="border-b">
            <td className="p-3">{String(d.nome)}</td><td>{d.empresas?.nome_exibicao}</td>
            <td>{d.especificacoes?.nome}</td><td>{String(d.teor_otimo ?? '')}</td><td>{String(d.dens_max_teorica_projeto ?? '')}</td>
            {podeEditar && <td className="p-3"><button className="text-blue-700" onClick={() => abrirEdicao(d)}>Editar</button></td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
