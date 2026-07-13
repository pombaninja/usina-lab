import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { ROTULO_MATERIAL, ROTULO_TIPO_ENSAIO, TIPOS_AGREGADO, TIPOS_CBUQ } from '../components/ensaiolab/tipos'

interface EnsaioLabLinha {
  id: string
  data: string
  material_tipo: string
  material_nome: string | null
  origem: string | null
  tipo_ensaio: string
}

export default function EnsaiosLabPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { perfis } = useAuth()
  const podeLancar = podeNoModulo(perfis, 'ensaios_usina', 'lancador')
  const podeExcluir = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [filtroMaterial, setFiltroMaterial] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [novoAberto, setNovoAberto] = useState(false)
  const [novo, setNovo] = useState({
    empresa_id: '', data: new Date().toISOString().slice(0, 10),
    material_tipo: 'agregado', material_nome: '', origem: '', tipo_ensaio: 'granulometria',
  })
  const [erro, setErro] = useState('')

  const { data: ensaios } = useQuery({
    queryKey: ['ensaios_lab'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ensaios_lab')
        .select('id, data, material_tipo, material_nome, origem, tipo_ensaio')
        .order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(200)
      if (error) throw error
      return (data ?? []) as EnsaioLabLinha[]
    },
  })

  const { data: empresas } = useQuery({
    queryKey: ['empresas-ativas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresas').select('id, nome_exibicao').eq('ativa', true).order('nome_exibicao')
      if (error) throw error
      return (data ?? []) as { id: string; nome_exibicao: string }[]
    },
  })
  const empresaSelecionada = novo.empresa_id || (empresas?.length === 1 ? empresas[0].id : '')

  const filtrados = useMemo(() => (ensaios ?? []).filter(e =>
    (!filtroMaterial || e.material_tipo === filtroMaterial) &&
    (!filtroTipo || e.tipo_ensaio === filtroTipo)), [ensaios, filtroMaterial, filtroTipo])

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresaSelecionada) throw new Error('Selecione a empresa emissora.')
      if (!novo.data) throw new Error('Informe a data do ensaio.')
      const { data, error } = await supabase.from('ensaios_lab').insert({
        empresa_id: empresaSelecionada,
        data: novo.data,
        material_tipo: novo.material_tipo,
        material_nome: novo.material_nome.trim() || null,
        origem: novo.origem.trim() || null,
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
                  // Tipo padrão por material: granulometria (agregado) ou marshall (cbuq/cbuqf).
                  setNovo({ ...novo, material_tipo, tipo_ensaio: material_tipo === 'agregado' ? 'granulometria' : 'marshall' })
                }}>
                {Object.entries(ROTULO_MATERIAL).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select></label>
            <label className="text-sm">Nome do material
              <input className={inp} value={novo.material_nome} placeholder="ex.: Pedra 1 — Pedreira Olímpia"
                onChange={e => setNovo({ ...novo, material_nome: e.target.value })} /></label>
            <label className="text-sm">Origem / amostra
              <input className={inp} value={novo.origem} onChange={e => setNovo({ ...novo, origem: e.target.value })} /></label>
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

      <div className="flex gap-3 items-end">
        <label className="text-sm">Material
          <select className="border rounded p-2 block" value={filtroMaterial} onChange={e => setFiltroMaterial(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_MATERIAL).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select></label>
        <label className="text-sm">Tipo de ensaio
          <select className="border rounded p-2 block" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todos</option>
            {[...TIPOS_AGREGADO, ...TIPOS_CBUQ].map(t => <option key={t} value={t}>{ROTULO_TIPO_ENSAIO[t]}</option>)}
          </select></label>
      </div>

      <table className="w-full bg-white rounded-xl shadow-sm text-sm">
        <thead><tr className="text-left border-b"><th className="p-3">Data</th><th>Material</th><th>Nome</th><th>Origem</th><th>Tipo de ensaio</th><th /></tr></thead>
        <tbody>{filtrados.map(e => (
          <tr key={e.id} className="border-b hover:bg-slate-50">
            <td className="p-3"><Link className="text-blue-700" to={`/ensaios-lab/${e.id}`}>{new Date(e.data + 'T12:00').toLocaleDateString('pt-BR')}</Link></td>
            <td>{ROTULO_MATERIAL[e.material_tipo] ?? e.material_tipo}</td>
            <td>{e.material_nome ?? '—'}</td>
            <td>{e.origem ?? '—'}</td>
            <td>{ROTULO_TIPO_ENSAIO[e.tipo_ensaio] ?? e.tipo_ensaio}</td>
            <td className="p-3">
              {podeExcluir && (
                <button className="text-red-600 disabled:opacity-50" disabled={excluir.isPending}
                  onClick={() => confirmarExclusao(e.id)}>Excluir</button>
              )}
            </td>
          </tr>
        ))}</tbody>
      </table>
      {!filtrados.length && <p className="text-sm text-slate-500">Nenhum ensaio de laboratório lançado ainda.</p>}
    </div>
  )
}
