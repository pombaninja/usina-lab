import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// Selects encadeados Fornecedor/Origem → Material do cadastro do laboratório
// (fornecedores_lab / materiais_lab — A1 do Batch A), usados no lançamento
// (EnsaiosLabPage) e no cabeçalho do ensaio (EnsaioLabPage). Cada select tem
// quick-add inline ("+ novo"): o LANÇADOR cria fornecedor/material na hora do
// lançamento (decisão pragmática espelhada na RLS, que exige lancador+).
//
// O onChange entrega também os NOMES selecionados: o chamador grava
// material_nome/origem (colunas TEXT legadas) sincronizados, para exibição,
// impressão e filtros de busca continuarem funcionando; linhas legadas sem FK
// seguem valendo só com o texto.

export interface FornecedorLab { id: string; nome: string }
export interface MaterialLab { id: string; nome: string; fornecedor_id: string }

export function useFornecedoresLab() {
  return useQuery({
    queryKey: ['fornecedores_lab'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fornecedores_lab')
        .select('id, nome').eq('ativa', true).order('nome')
      if (error) throw error
      return (data ?? []) as FornecedorLab[]
    },
  })
}

export function useMateriaisLab(fornecedorId: string) {
  return useQuery({
    queryKey: ['materiais_lab', fornecedorId],
    enabled: !!fornecedorId,
    queryFn: async () => {
      const { data, error } = await supabase.from('materiais_lab')
        .select('id, nome, fornecedor_id').eq('fornecedor_id', fornecedorId).eq('ativa', true).order('nome')
      if (error) throw error
      return (data ?? []) as MaterialLab[]
    },
  })
}

export interface SelecaoFornecedorMaterial {
  fornecedorId: string
  materialLabId: string
  /** Nomes correspondentes às seleções (null quando o select está em "—"). */
  fornecedorNome: string | null
  materialNome: string | null
}

function QuickAdd({ placeholder, salvando, onCriar }: {
  placeholder: string; salvando: boolean; onCriar: (nome: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  if (!aberto) {
    return (
      <button type="button" className="text-xs text-grp-600 hover:text-grp-700 underline mt-1"
        onClick={() => setAberto(true)}>+ novo</button>
    )
  }
  return (
    <span className="flex items-center gap-1 mt-1">
      <input className="border rounded p-1 text-sm flex-1 min-w-0" placeholder={placeholder}
        value={nome} onChange={e => setNome(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && nome.trim()) { e.preventDefault(); onCriar(nome.trim()); setNome(''); setAberto(false) } }} />
      <button type="button" className="text-sm border rounded px-2 py-1 disabled:opacity-50"
        disabled={salvando || !nome.trim()}
        onClick={() => { onCriar(nome.trim()); setNome(''); setAberto(false) }}>Criar</button>
      <button type="button" className="text-sm text-slate-500 px-1" onClick={() => { setAberto(false); setNome('') }}>×</button>
    </span>
  )
}

/** Dois <label> irmãos (Fornecedor/Origem e Material) — encaixam direto na grid do chamador. */
export default function FornecedorMaterialSelect({ valor, onChange, disabled }: {
  valor: { fornecedorId: string; materialLabId: string }
  onChange: (v: SelecaoFornecedorMaterial) => void
  disabled?: boolean
}) {
  const qc = useQueryClient()
  const { data: fornecedores } = useFornecedoresLab()
  const { data: materiais } = useMateriaisLab(valor.fornecedorId)
  const [erro, setErro] = useState('')

  const inp = 'border rounded p-2 w-full'

  function selecionarFornecedor(id: string) {
    const f = (fornecedores ?? []).find(x => x.id === id) ?? null
    onChange({ fornecedorId: id, materialLabId: '', fornecedorNome: f?.nome ?? null, materialNome: null })
  }
  function selecionarMaterial(id: string) {
    const m = (materiais ?? []).find(x => x.id === id) ?? null
    const f = (fornecedores ?? []).find(x => x.id === valor.fornecedorId) ?? null
    onChange({ fornecedorId: valor.fornecedorId, materialLabId: id, fornecedorNome: f?.nome ?? null, materialNome: m?.nome ?? null })
  }

  const criarFornecedor = useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase.from('fornecedores_lab')
        .insert({ nome }).select('id, nome').single()
      if (error) throw new Error('Falha ao criar fornecedor: ' + error.message)
      return data as FornecedorLab
    },
    onSuccess: (f) => {
      setErro('')
      qc.invalidateQueries({ queryKey: ['fornecedores_lab'] })
      onChange({ fornecedorId: f.id, materialLabId: '', fornecedorNome: f.nome, materialNome: null })
    },
    onError: (e: Error) => setErro(e.message),
  })

  const criarMaterial = useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase.from('materiais_lab')
        .insert({ fornecedor_id: valor.fornecedorId, nome }).select('id, nome, fornecedor_id').single()
      if (error) throw new Error('Falha ao criar material: ' + error.message)
      return data as MaterialLab
    },
    onSuccess: (m) => {
      setErro('')
      qc.invalidateQueries({ queryKey: ['materiais_lab', valor.fornecedorId] })
      const f = (fornecedores ?? []).find(x => x.id === valor.fornecedorId) ?? null
      onChange({ fornecedorId: valor.fornecedorId, materialLabId: m.id, fornecedorNome: f?.nome ?? null, materialNome: m.nome })
    },
    onError: (e: Error) => setErro(e.message),
  })

  return (
    <>
      <label className="text-sm">Fornecedor / Origem
        <select className={inp} value={valor.fornecedorId} disabled={disabled}
          onChange={e => selecionarFornecedor(e.target.value)}>
          <option value="">—</option>
          {(fornecedores ?? []).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        {!disabled && (
          <QuickAdd placeholder="Nome do fornecedor/origem" salvando={criarFornecedor.isPending}
            onCriar={nome => criarFornecedor.mutate(nome)} />
        )}
      </label>
      <label className="text-sm">Material
        <select className={inp} value={valor.materialLabId} disabled={disabled || !valor.fornecedorId}
          onChange={e => selecionarMaterial(e.target.value)}>
          <option value="">—</option>
          {(materiais ?? []).map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        {!disabled && !!valor.fornecedorId && (
          <QuickAdd placeholder="Nome do material" salvando={criarMaterial.isPending}
            onCriar={nome => criarMaterial.mutate(nome)} />
        )}
        {erro && <span className="block text-red-600 text-xs mt-1">{erro}</span>}
      </label>
    </>
  )
}
