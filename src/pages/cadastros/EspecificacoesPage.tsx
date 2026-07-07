import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import Crud from '../../components/Crud'

function SubTabela({ especId, tabela, titulo, campos }: {
  especId: string; tabela: 'especificacao_peneiras' | 'especificacao_parametros'
  titulo: string
  campos: { nome: string; rotulo: string; numero?: boolean }[]
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Record<string, unknown>>({})
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
      const { error } = await supabase.from(tabela).insert({ ...form, especificacao_id: especId })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [tabela, especId] }); setForm({}) },
  })
  const excluir = useMutation({
    mutationFn: async (id: string) => { await supabase.from(tabela).delete().eq('id', id) },
    onSuccess: () => qc.invalidateQueries({ queryKey: [tabela, especId] }),
  })
  return (
    <div className="bg-white p-4 rounded-xl shadow">
      <h3 className="font-semibold mb-2">{titulo}</h3>
      <div className="flex gap-2 mb-3 flex-wrap">
        {campos.map(c => (
          <input key={c.nome} className="border rounded p-2 w-36" placeholder={c.rotulo}
                 type={c.numero ? 'number' : 'text'} step="any" value={String(form[c.nome] ?? '')}
                 onChange={e => setForm({ ...form, [c.nome]: c.numero ? Number(e.target.value) : e.target.value })} />
        ))}
        <button className="bg-blue-700 text-white rounded px-3" onClick={() => inserir.mutate()}>+</button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b">{campos.map(c => <th key={c.nome} className="p-2">{c.rotulo}</th>)}<th /></tr></thead>
        <tbody>{(linhas ?? []).map((l: Record<string, unknown> & { id: string }) => (
          <tr key={l.id} className="border-b">
            {campos.map(c => <td key={c.nome} className="p-2">{String(l[c.nome] ?? '')}</td>)}
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
          ]} />
        <SubTabela especId={selecionada} tabela="especificacao_parametros" titulo="Parâmetros (Marshall, RTD…)"
          campos={[
            { nome: 'parametro', rotulo: 'Parâmetro' }, { nome: 'valor_min', rotulo: 'Mín', numero: true },
            { nome: 'valor_max', rotulo: 'Máx', numero: true }, { nome: 'unidade', rotulo: 'Unidade' },
          ]} />
      </>}
    </div>
  )
}
