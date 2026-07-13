import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import Crud from '../../components/Crud'
import { sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'

function SubTabela({ especId, tabela, titulo, campos, obrigatorios }: {
  especId: string; tabela: 'especificacao_peneiras' | 'especificacao_parametros'
  titulo: string
  campos: { nome: string; rotulo: string; numero?: boolean; opcoes?: { valor: string; rotulo: string }[] }[]
  obrigatorios?: string[]
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [erro, setErro] = useState<string>('')
  const { data: linhas } = useQuery({
    queryKey: [tabela, especId],
    queryFn: async () => {
      const { data, error } = await supabase.from(tabela).select('*').eq('especificacao_id', especId)
        .order(tabela === 'especificacao_peneiras' ? 'abertura_mm' : 'parametro', { ascending: false })
      if (error) throw error
      return data
    },
  })
  const inserir = useMutation({
    mutationFn: async () => {
      setErro('')
      if (obrigatorios && obrigatorios.length > 0) {
        for (const campo of obrigatorios) {
          const valor = form[campo]
          if (valor === null || valor === undefined || valor === '') {
            throw new Error('Preencha os campos obrigatórios')
          }
        }
      }
      // Campos numéricos ficam como texto com vírgula no estado; converte para Number só aqui.
      const registro: Record<string, unknown> = { ...form }
      for (const c of campos) {
        if (!c.numero) continue
        const bruto = registro[c.nome]
        if (bruto === null || bruto === undefined || bruto === '') { registro[c.nome] = null; continue }
        const num = parseDecimal(String(bruto))
        if (num === null || !Number.isFinite(num)) {
          throw new Error(`Valor inválido em "${c.rotulo}" — use números com vírgula (ex.: 0,075)`)
        }
        registro[c.nome] = num
      }
      const { error } = await supabase.from(tabela).insert({ ...registro, especificacao_id: especId })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [tabela, especId] }); setForm({}); setErro('') },
    onError: (err: Error) => { setErro(err.message) },
  })
  const excluir = useMutation({
    mutationFn: async (id: string) => { await supabase.from(tabela).delete().eq('id', id) },
    onSuccess: () => qc.invalidateQueries({ queryKey: [tabela, especId] }),
  })
  return (
    <div className="bg-white p-4 rounded-xl shadow">
      <h3 className="font-semibold mb-2">{titulo}</h3>
      <div className="flex gap-2 mb-3 flex-wrap">
        {campos.map(c => {
          if (c.opcoes) {
            return (
              <select key={c.nome} className="border rounded p-2 w-36" value={String(form[c.nome] ?? '')}
                      onChange={e => setForm({ ...form, [c.nome]: e.target.value })}>
                <option value="">Selecione…</option>
                {c.opcoes.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            )
          }
          // Numérico: texto com teclado decimal — aceita ',' e '.', padroniza em ','
          // e só converte para Number ao salvar (permite digitar "0,075").
          return (
            <input key={c.nome} className="border rounded p-2 w-36" placeholder={c.rotulo}
                   type="text" inputMode={c.numero ? 'decimal' : undefined} value={String(form[c.nome] ?? '')}
                   onChange={e => setForm({ ...form, [c.nome]: c.numero ? sanitizarDecimal(e.target.value) : e.target.value })} />
          )
        })}
        <button className="bg-blue-700 text-white rounded px-3" onClick={() => inserir.mutate()}>+</button>
      </div>
      {erro && <p className="text-red-600 text-sm mb-2">{erro}</p>}
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b">{campos.map(c => <th key={c.nome} className="p-2">{c.rotulo}</th>)}<th /></tr></thead>
        <tbody>{(linhas ?? []).map((l: Record<string, unknown> & { id: string }) => (
          <tr key={l.id} className="border-b">
            {campos.map(c => <td key={c.nome} className="p-2">{c.numero ? decimalParaTexto(l[c.nome]) : String(l[c.nome] ?? '')}</td>)}
            <td><button className="text-red-600" onClick={() => excluir.mutate(l.id)}>×</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export default function EspecificacoesPage() {
  const [selecionada, setSelecionada] = useState<string>('')
  const { data: especs } = useQuery({
    queryKey: ['especificacoes'],
    queryFn: async () => (await supabase.from('especificacoes').select('*').order('nome')).data ?? [],
  })
  return (
    <div className="space-y-6">
      <Crud tabela="especificacoes" titulo="Especificações Normativas"
        colunas={[{ nome: 'nome', rotulo: 'Nome' }, { nome: 'norma', rotulo: 'Norma' }, { nome: 'tipo_mistura', rotulo: 'Tipo' }]}
        campos={[
          { nome: 'nome', rotulo: 'Nome (ex.: FAIXA III DER/SP)', tipo: 'texto', obrigatorio: true },
          { nome: 'norma', rotulo: 'Norma/ET', tipo: 'texto' },
          { nome: 'tipo_mistura', rotulo: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: [
            { valor: 'cauq', rotulo: 'CAUQ' }, { valor: 'bgs', rotulo: 'BGS' },
            { valor: 'solo_brita', rotulo: 'Solo-brita' }, { valor: 'agregado', rotulo: 'Agregado' }] },
        ]} />
      <div className="bg-white p-4 rounded-xl shadow">
        <label className="text-sm text-slate-600">Editar faixas da especificação:</label>
        <select className="border rounded p-2 ml-2" value={selecionada} onChange={e => setSelecionada(e.target.value)}>
          <option value="">Selecione…</option>
          {(especs ?? []).map((e: { id: string; nome: string }) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </div>
      {selecionada && <>
        <SubTabela especId={selecionada} tabela="especificacao_peneiras" titulo="Peneiras (faixa especificada + tolerância de trabalho)"
          campos={[
            { nome: 'peneira', rotulo: 'Peneira' }, { nome: 'abertura_mm', rotulo: 'Abertura (mm)', numero: true },
            { nome: 'passante_min', rotulo: '% passante mín', numero: true }, { nome: 'passante_max', rotulo: '% passante máx', numero: true },
            { nome: 'tolerancia_trabalho', rotulo: 'Tolerância ±', numero: true },
          ]}
          obrigatorios={['peneira', 'abertura_mm', 'passante_min', 'passante_max']} />
        <SubTabela especId={selecionada} tabela="especificacao_parametros" titulo="Parâmetros (Marshall, RTD…)"
          campos={[
            { nome: 'parametro', rotulo: 'Parâmetro', opcoes: [
              { valor: 'vazios', rotulo: 'vazios — Vazios (%)' },
              { valor: 'rbv', rotulo: 'rbv — R.B.V. (%)' },
              { valor: 'vam', rotulo: 'vam — V.A.M. (%)' },
              { valor: 'estabilidade', rotulo: 'estabilidade — Estabilidade (kgf)' },
              { valor: 'fluencia_mm', rotulo: 'fluencia_mm — Fluência (mm)' },
              { valor: 'rtd', rotulo: 'rtd — RTD (MPa)' },
              { valor: 'filler_ligante', rotulo: 'filler_ligante — Relação Fíler/Ligante' },
              { valor: 'teor_ligante', rotulo: 'teor_ligante — Teor de Ligante (%)' },
            ] },
            { nome: 'valor_min', rotulo: 'Mín', numero: true },
            { nome: 'valor_max', rotulo: 'Máx', numero: true }, { nome: 'unidade', rotulo: 'Unidade' },
          ]}
          obrigatorios={['parametro']} />
      </>}
    </div>
  )
}
