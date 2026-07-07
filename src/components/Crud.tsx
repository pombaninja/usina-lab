import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface Campo {
  nome: string; rotulo: string
  tipo: 'texto' | 'numero' | 'select' | 'checkbox'
  opcoes?: { valor: string; rotulo: string }[]
  obrigatorio?: boolean
}
export interface CrudProps {
  tabela: string; titulo: string
  colunas: { nome: string; rotulo: string }[]
  campos: Campo[]
  ordem?: string
}
type Registro = Record<string, unknown> & { id: string }

export default function Crud({ tabela, titulo, colunas, campos, ordem = 'criado_em' }: CrudProps) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState<Registro | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [erro, setErro] = useState('')

  const { data: linhas } = useQuery({
    queryKey: [tabela],
    queryFn: async () => {
      const { data, error } = await supabase.from(tabela).select('*').order(ordem)
      if (error) throw error
      return data as Registro[]
    },
  })

  const salvar = useMutation({
    mutationFn: async () => {
      for (const c of campos) {
        if (c.obrigatorio && !form[c.nome] && form[c.nome] !== false)
          throw new Error(`Preencha o campo "${c.rotulo}"`)
      }
      const { error } = editando
        ? await supabase.from(tabela).update(form).eq('id', editando.id)
        : await supabase.from(tabela).insert(form)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [tabela] }); setForm({}); setEditando(null); setErro('') },
    onError: (e: Error) => setErro(e.message),
  })

  function abrirEdicao(l: Registro) {
    setEditando(l)
    setForm(Object.fromEntries(campos.map(c => [c.nome, l[c.nome] ?? ''])))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <form onSubmit={e => { e.preventDefault(); salvar.mutate() }}
            className="bg-white p-4 rounded-xl shadow grid grid-cols-3 gap-3 items-end">
        {campos.map(c => (
          <label key={c.nome} className="text-sm">
            <span className="block text-slate-600 mb-1">{c.rotulo}{c.obrigatorio && ' *'}</span>
            {c.tipo === 'select' ? (
              <select className="w-full border rounded p-2" value={String(form[c.nome] ?? '')}
                      onChange={e => setForm({ ...form, [c.nome]: e.target.value })}>
                <option value="">—</option>
                {c.opcoes?.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            ) : c.tipo === 'checkbox' ? (
              <input type="checkbox" checked={!!form[c.nome]}
                     onChange={e => setForm({ ...form, [c.nome]: e.target.checked })} />
            ) : (
              <input className="w-full border rounded p-2" type={c.tipo === 'numero' ? 'number' : 'text'}
                     step="any" value={String(form[c.nome] ?? '')}
                     onChange={e => setForm({ ...form, [c.nome]: c.tipo === 'numero' ? Number(e.target.value) : e.target.value })} />
            )}
          </label>
        ))}
        <div className="flex gap-2">
          <button className="bg-blue-700 text-white rounded px-4 py-2">{editando ? 'Atualizar' : 'Adicionar'}</button>
          {editando && <button type="button" className="border rounded px-3" onClick={() => { setEditando(null); setForm({}) }}>Cancelar</button>}
        </div>
        {erro && <p className="text-red-600 text-sm col-span-3">{erro}</p>}
      </form>
      <table className="w-full bg-white rounded-xl shadow text-sm">
        <thead><tr className="text-left border-b">
          {colunas.map(c => <th key={c.nome} className="p-3">{c.rotulo}</th>)}<th />
        </tr></thead>
        <tbody>
          {(linhas ?? []).map(l => (
            <tr key={l.id} className="border-b hover:bg-slate-50">
              {colunas.map(c => <td key={c.nome} className="p-3">{String(l[c.nome] ?? '')}</td>)}
              <td className="p-3"><button className="text-blue-700" onClick={() => abrirEdicao(l)}>Editar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
