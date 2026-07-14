import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { sanitizarDecimal, parseDecimal, decimalParaTexto } from '../lib/formato'

export interface Campo {
  nome: string; rotulo: string
  tipo: 'texto' | 'numero' | 'select' | 'checkbox' | 'cor'
  opcoes?: { valor: string; rotulo: string }[]
  obrigatorio?: boolean
  /** Validação extra ao salvar: recebe o valor do formulário e devolve a
   *  mensagem de erro (ou null se válido). Ex.: formato de slug. */
  validar?: (valor: unknown) => string | null
}
export interface CrudProps {
  tabela: string; titulo: string
  colunas: { nome: string; rotulo: string }[]
  campos: Campo[]
  ordem?: string
  /** Coluna-chave usada no update (padrão 'id'; ex.: 'produto' em insumo_produtos). */
  chave?: string
  /** false = tabela de linhas fixas: sem criar, só editar (formulário aparece ao clicar Editar). */
  permitirCriar?: boolean
  /** Campos travados na EDIÇÃO (inputs desabilitados) — ex.: a chave 'produto',
   *  referenciada por FK, não muda depois de criada. Na criação seguem editáveis. */
  camposImutaveisNaEdicao?: string[]
}
type Registro = Record<string, unknown>

/** <input type="color"> exige '#rrggbb'; qualquer outra coisa vira preto. */
const corValida = (v: unknown): string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : '#000000'

export default function Crud({ tabela, titulo, colunas, campos, ordem = 'criado_em', chave = 'id', permitirCriar = true, camposImutaveisNaEdicao }: CrudProps) {
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
        const msgValidacao = c.validar?.(form[c.nome])
        if (msgValidacao) throw new Error(msgValidacao)
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
      if (editando) {
        // .select() no update para detectar bloqueio silencioso do RLS: sem permissão,
        // o Supabase não dá erro — só não altera linha nenhuma. Aqui isso vira erro claro.
        const { data, error } = await supabase.from(tabela).update(registro)
          .eq(chave, editando[chave] as string).select(chave)
        if (error) throw error
        if (!data?.length) throw new Error('Nada foi salvo: seu perfil de acesso não tem permissão para alterar este cadastro.')
      } else {
        // No INSERT, campo deixado vazio (null) sai do payload para valer o
        // DEFAULT do banco (ex.: baias.estoque_atual 0, cor '#64748b') — null
        // explícito violaria NOT NULL. No UPDATE o null fica: é como se limpa
        // um valor (ex.: capacidade).
        for (const k of Object.keys(registro)) if (registro[k] === null) delete registro[k]
        const { error } = await supabase.from(tabela).insert(registro)
        if (error) throw error
      }
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
      <h1 className="text-2xl font-bold text-grp-700">{titulo}</h1>
      {(permitirCriar || editando) && (
      <form onSubmit={e => { e.preventDefault(); salvar.mutate() }}
            className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-3 gap-3 items-end">
        {campos.map(c => {
          const imutavel = !!editando && (camposImutaveisNaEdicao?.includes(c.nome) ?? false)
          return (
          <label key={c.nome} className="text-sm">
            <span className="block text-slate-600 mb-1">{c.rotulo}{c.obrigatorio && ' *'}</span>
            {c.tipo === 'select' ? (
              <select className="w-full border rounded p-2 disabled:bg-slate-100 disabled:text-slate-500" disabled={imutavel}
                      value={String(form[c.nome] ?? '')}
                      onChange={e => setForm({ ...form, [c.nome]: e.target.value })}>
                <option value="">—</option>
                {c.opcoes?.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            ) : c.tipo === 'checkbox' ? (
              <input type="checkbox" checked={!!form[c.nome]} disabled={imutavel}
                     onChange={e => setForm({ ...form, [c.nome]: e.target.checked })} />
            ) : c.tipo === 'cor' ? (
              <span className="flex items-center gap-2">
                <input type="color" className="h-9 w-14 border rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                       disabled={imutavel} value={corValida(form[c.nome])}
                       onChange={e => setForm({ ...form, [c.nome]: corValida(e.target.value) })} />
                <span className="text-slate-500 text-xs font-mono">{corValida(form[c.nome])}</span>
              </span>
            ) : (
              // Numérico: texto com teclado decimal — aceita ',' e '.', padroniza em ','
              // e só converte para Number ao salvar (permite digitar "0,075").
              <input className="w-full border rounded p-2 disabled:bg-slate-100 disabled:text-slate-500" type="text" disabled={imutavel}
                     inputMode={c.tipo === 'numero' ? 'decimal' : undefined} value={String(form[c.nome] ?? '')}
                     onChange={e => setForm({ ...form, [c.nome]: c.tipo === 'numero' ? sanitizarDecimal(e.target.value) : e.target.value })} />
            )}
          </label>
          )
        })}
        <div className="flex gap-2">
          <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2 disabled:opacity-50" disabled={salvar.isPending}>{editando ? 'Atualizar' : 'Adicionar'}</button>
          {editando && <button type="button" className="border rounded px-3" onClick={() => { setEditando(null); setForm({}) }}>Cancelar</button>}
        </div>
        {erro && <p className="text-red-600 text-sm col-span-3">{erro}</p>}
      </form>
      )}
      <table className="w-full bg-white rounded-xl shadow-sm text-sm">
        <thead><tr className="text-left border-b">
          {colunas.map(c => <th key={c.nome} className="p-3">{c.rotulo}</th>)}<th />
        </tr></thead>
        <tbody>
          {(linhas ?? []).map(l => (
            <tr key={String(l[chave])} className="border-b hover:bg-slate-50">
              {colunas.map(c => {
                const campo = campos.find(x => x.nome === c.nome)
                return (
                  <td key={c.nome} className="p-3">
                    {campo?.tipo === 'numero' ? decimalParaTexto(l[c.nome])
                      : campo?.tipo === 'cor' ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block h-4 w-8 rounded border border-slate-300" style={{ backgroundColor: corValida(l[c.nome]) }} />
                            <span className="font-mono text-xs text-slate-500">{corValida(l[c.nome])}</span>
                          </span>
                        )
                      : campo?.tipo === 'select' ? (campo.opcoes?.find(o => o.valor === l[c.nome])?.rotulo ?? String(l[c.nome] ?? ''))
                      : String(l[c.nome] ?? '')}
                  </td>
                )
              })}
              <td className="p-3"><button className="text-blue-700" onClick={() => abrirEdicao(l)}>Editar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
