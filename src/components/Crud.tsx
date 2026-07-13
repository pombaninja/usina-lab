import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { sanitizarDecimal, parseDecimal, decimalParaTexto } from '../lib/formato'

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
      // Campos numéricos ficam como texto com vírgula no estado; converte para Number só aqui.
      const registro: Record<string, unknown> = { ...form }
      for (const c of campos) {
        if (c.tipo !== 'numero') continue
        const bruto = registro[c.nome]
        if (bruto === null || bruto === undefined || bruto === '') { registro[c.nome] = null; continue }
        const num = typeof bruto === 'number' ? bruto : parseDecimal(String(bruto))
        if (num === null || !Number.isFinite(num)) {
          throw new Error(`Valor inválido em "${c.rotulo}" — use números com vírgula (ex.: 0,075)`)
        }
        registro[c.nome] = num
      }
      const { error } = editando
        ? await supabase.from(tabela).update(registro).eq('id', editando.id)
        : await supabase.from(tabela).insert(registro)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [tabela] }); setForm({}); setEditando(null); setErro('') },
    onError: (e: Error) => setErro(e.message),
  })

  function abrirEdicao(l: Registro) {
    setEditando(l)
    // Numéricos voltam para o formulário como texto com vírgula (padrão de exibição).
    setForm(Object.fromEntries(campos.map(c => [c.nome, c.tipo === 'numero' ? decimalParaTexto(l[c.nome]) : (l[c.nome] ?? '')])))
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
              // Numérico: texto com teclado decimal — aceita ',' e '.', padroniza em ','
              // e só converte para Number ao salvar (permite digitar "0,075").
              <input className="w-full border rounded p-2" type="text"
                     inputMode={c.tipo === 'numero' ? 'decimal' : undefined} value={String(form[c.nome] ?? '')}
                     onChange={e => setForm({ ...form, [c.nome]: c.tipo === 'numero' ? sanitizarDecimal(e.target.value) : e.target.value })} />
            )}
          </label>
        ))}
        <div className="flex gap-2">
          <button className="bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-50" disabled={salvar.isPending}>{editando ? 'Atualizar' : 'Adicionar'}</button>
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
              {colunas.map(c => (
                <td key={c.nome} className="p-3">
                  {campos.find(x => x.nome === c.nome)?.tipo === 'numero' ? decimalParaTexto(l[c.nome]) : String(l[c.nome] ?? '')}
                </td>
              ))}
              <td className="p-3"><button className="text-blue-700" onClick={() => abrirEdicao(l)}>Editar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
