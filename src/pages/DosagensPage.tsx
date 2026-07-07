import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { parseCurvaProjeto } from '../lib/parseCurvaProjeto'

export default function DosagensPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<Record<string, unknown>>({ tipo: 'cauq' })
  const [curvaTexto, setCurvaTexto] = useState('')   // "3/4"=100; 1/2"=98.5; ..."
  const [erro, setErro] = useState('')

  const { data: empresas } = useQuery({ queryKey: ['empresas'], queryFn: async () => (await supabase.from('empresas').select('id, nome_exibicao')).data ?? [] })
  const { data: especs } = useQuery({ queryKey: ['especificacoes'], queryFn: async () => (await supabase.from('especificacoes').select('id, nome')).data ?? [] })
  const { data: dosagens } = useQuery({
    queryKey: ['dosagens'],
    queryFn: async () => (await supabase.from('dosagens').select('*, empresas(nome_exibicao), especificacoes(nome)').order('criado_em', { ascending: false })).data ?? [],
  })

  const salvar = useMutation({
    mutationFn: async () => {
      const curva = parseCurvaProjeto(curvaTexto)
      const { error } = await supabase.from('dosagens').insert({ ...form, curva_projeto: curva })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dosagens'] }); setForm({ tipo: 'cauq' }); setCurvaTexto(''); setErro('') },
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
      <form onSubmit={e => { e.preventDefault(); salvar.mutate() }} className="bg-white p-4 rounded-xl shadow grid grid-cols-3 gap-3">
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
        <label className="text-sm col-span-2">Curva de projeto (ex.: 3/4"=100; 1/2"=98.5; N. 04=54.6)
          <input className="w-full border rounded p-2" value={curvaTexto} onChange={e => setCurvaTexto(e.target.value)} /></label>
        <button className="bg-blue-700 text-white rounded px-4 py-2 self-end">Adicionar</button>
        {erro && <p className="text-red-600 text-sm col-span-3">{erro}</p>}
      </form>
      <table className="w-full bg-white rounded-xl shadow text-sm">
        <thead><tr className="text-left border-b"><th className="p-3">Nome</th><th>Empresa</th><th>Especificação</th><th>Teor ótimo</th><th>Gmm</th></tr></thead>
        <tbody>{(dosagens ?? []).map((d: Record<string, unknown> & { id: string; empresas: { nome_exibicao: string }; especificacoes: { nome: string } }) => (
          <tr key={d.id} className="border-b">
            <td className="p-3">{String(d.nome)}</td><td>{d.empresas?.nome_exibicao}</td>
            <td>{d.especificacoes?.nome}</td><td>{String(d.teor_otimo ?? '')}</td><td>{String(d.dens_max_teorica_projeto ?? '')}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
