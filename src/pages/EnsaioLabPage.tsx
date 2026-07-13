import { useEffect, useState, type ComponentType } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { ROTULO_MATERIAL, ROTULO_TIPO_ENSAIO, type FormEnsaioLabProps } from '../components/ensaiolab/tipos'
import GranulometriaLabForm from '../components/ensaiolab/GranulometriaLabForm'
import LamelaridadeLabForm from '../components/ensaiolab/LamelaridadeLabForm'
import IndiceFormaLabForm from '../components/ensaiolab/IndiceFormaLabForm'
import EquivalenteAreiaLabForm from '../components/ensaiolab/EquivalenteAreiaLabForm'
import DensidadeGraudoLabForm from '../components/ensaiolab/DensidadeGraudoLabForm'
import DensidadeMiudoLabForm from '../components/ensaiolab/DensidadeMiudoLabForm'
import MarshallLabForm from '../components/ensaiolab/MarshallLabForm'
import TeorBetumeLabForm from '../components/ensaiolab/TeorBetumeLabForm'
import GranulometriaMisturaLabForm from '../components/ensaiolab/GranulometriaMisturaLabForm'
import RtdLabForm from '../components/ensaiolab/RtdLabForm'
import RiceDmtLabForm from '../components/ensaiolab/RiceDmtLabForm'

interface EnsaioLab {
  id: string
  empresa_id: string
  data: string
  material_tipo: string
  material_nome: string | null
  origem: string | null
  tipo_ensaio: string
  dados: Record<string, unknown>
  empresas: { nome_exibicao: string } | null
}

interface LaudoLinha { id: string; numero: string; status: string; revisao: number }

// Formulário por tipo de ensaio (agregado da F3-A + CBUQ/CBUQF da F3-B).
const FORMULARIOS: Record<string, ComponentType<FormEnsaioLabProps> | undefined> = {
  granulometria: GranulometriaLabForm,
  lamelaridade: LamelaridadeLabForm,
  indice_forma: IndiceFormaLabForm,
  equivalente_areia: EquivalenteAreiaLabForm,
  densidade_graudo: DensidadeGraudoLabForm,
  densidade_miudo: DensidadeMiudoLabForm,
  marshall: MarshallLabForm,
  teor_betume: TeorBetumeLabForm,
  granulometria_mistura: GranulometriaMisturaLabForm,
  rtd: RtdLabForm,
  rice_dmt: RiceDmtLabForm,
}

export default function EnsaioLabPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const ensaioId = id!
  const qc = useQueryClient()
  const { perfis, user } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'lancador')
  const podeAprovar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [cabecalho, setCabecalho] = useState({ data: '', material_nome: '', origem: '' })
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState('')

  const { data: ensaio } = useQuery({
    queryKey: ['ensaio-lab', ensaioId],
    queryFn: async () => {
      const { data, error } = await supabase.from('ensaios_lab')
        .select('*, empresas(nome_exibicao)').eq('id', ensaioId).single()
      if (error) throw error
      return data as EnsaioLab
    },
  })

  const { data: laudos } = useQuery({
    queryKey: ['laudos-ensaio-lab', ensaioId],
    queryFn: async () => {
      const { data, error } = await supabase.from('laudos')
        .select('id, numero, status, revisao').eq('ensaio_lab_id', ensaioId).order('revisao')
      if (error) throw error
      return (data ?? []) as LaudoLinha[]
    },
  })

  useEffect(() => {
    if (!ensaio || carregado) return
    setCabecalho({ data: ensaio.data, material_nome: ensaio.material_nome ?? '', origem: ensaio.origem ?? '' })
    setCarregado(true)
  }, [ensaio, carregado])

  // O formulário do tipo entrega o jsonb `dados`; o cabeçalho (data/material/origem) vai junto.
  const salvar = useMutation({
    mutationFn: async (dados: Record<string, unknown>) => {
      if (!cabecalho.data) throw new Error('Informe a data do ensaio.')
      const { error } = await supabase.from('ensaios_lab').update({
        data: cabecalho.data,
        material_nome: cabecalho.material_nome.trim() || null,
        origem: cabecalho.origem.trim() || null,
        dados,
      }).eq('id', ensaioId)
      if (error) throw new Error('Falha ao salvar o ensaio: ' + error.message)
    },
    onSuccess: () => { setErro(''); qc.invalidateQueries({ queryKey: ['ensaio-lab', ensaioId] }) },
    onError: (e: Error) => setErro(e.message),
  })

  // Rascunho igual ao fluxo do laudo CBUQ diário: numero provisório; a numeração
  // oficial (laudo_numeracao, compartilhada) entra só na emissão via emitir_laudo.
  const gerarLaudo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('laudos').insert({
        empresa_id: ensaio!.empresa_id,
        ensaio_lab_id: ensaioId,
        ano: new Date().getFullYear(),
        seq: 0,
        numero: `RASCUNHO-LAB-${ensaioId.slice(0, 8)}`,
        snapshot: { tipo_ensaio: ensaio!.tipo_ensaio, material_tipo: ensaio!.material_tipo, dados: ensaio!.dados },
      })
      if (error) throw new Error('Falha ao gerar o laudo: ' + error.message)
    },
    onSuccess: () => { setErro(''); qc.invalidateQueries({ queryKey: ['laudos-ensaio-lab', ensaioId] }) },
    onError: (e: Error) => setErro(e.message),
  })

  // Aprovação espelha o fluxo diário (EnsaioDetalhePage): avaliador+, refresh do
  // snapshot para a cópia congelada refletir o ensaio ATUAL no momento da aprovação.
  const aprovar = useMutation({
    mutationFn: async (laudoId: string) => {
      const { error } = await supabase.from('laudos').update({
        status: 'aprovado',
        avaliador: user!.id,
        aprovado_em: new Date().toISOString(),
        snapshot: { tipo_ensaio: ensaio!.tipo_ensaio, material_tipo: ensaio!.material_tipo, dados: ensaio!.dados },
      }).eq('id', laudoId)
      if (error) throw new Error('Falha ao aprovar o laudo: ' + error.message)
    },
    onSuccess: () => { setErro(''); qc.invalidateQueries({ queryKey: ['laudos-ensaio-lab', ensaioId] }) },
    onError: (e: Error) => setErro(e.message),
  })

  // Emissão: numeração oficial compartilhada (laudo_numeracao) via emitir_laudo —
  // a mesma RPC do laudo CBUQ diário; depois o ensaio fica imutável (trigger).
  const emitir = useMutation({
    mutationFn: async (laudoId: string) => {
      const { error } = await supabase.rpc('emitir_laudo', { p_laudo: laudoId })
      if (error) throw new Error('Falha ao emitir o laudo: ' + error.message)
    },
    onSuccess: () => { setErro(''); qc.invalidateQueries({ queryKey: ['laudos-ensaio-lab', ensaioId] }) },
    onError: (e: Error) => setErro(e.message),
  })

  if (!ensaio) return <p>Carregando…</p>

  const Formulario = FORMULARIOS[ensaio.tipo_ensaio]
  const inp = 'border rounded p-2 w-full'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-grp-700">
          {ROTULO_TIPO_ENSAIO[ensaio.tipo_ensaio] ?? ensaio.tipo_ensaio} — {ROTULO_MATERIAL[ensaio.material_tipo] ?? ensaio.material_tipo}
        </h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/ensaios-lab')}>Voltar aos ensaios</button>
      </div>

      <section className="bg-white p-4 rounded-xl shadow-sm grid sm:grid-cols-4 gap-3">
        <p className="text-sm sm:col-span-4"><span className="text-slate-500">Empresa:</span> <b>{ensaio.empresas?.nome_exibicao ?? '—'}</b></p>
        <label className="text-sm">Data
          <input className={inp} type="date" value={cabecalho.data} disabled={!podeEditar}
            onChange={e => setCabecalho({ ...cabecalho, data: e.target.value })} /></label>
        <label className="text-sm">Nome do material
          <input className={inp} value={cabecalho.material_nome} disabled={!podeEditar}
            onChange={e => setCabecalho({ ...cabecalho, material_nome: e.target.value })} /></label>
        <label className="text-sm sm:col-span-2">Origem / amostra
          <input className={inp} value={cabecalho.origem} disabled={!podeEditar}
            onChange={e => setCabecalho({ ...cabecalho, origem: e.target.value })} /></label>
      </section>

      {Formulario && carregado ? (
        <Formulario dados={ensaio.dados ?? {}} podeEditar={podeEditar} salvando={salvar.isPending}
          salvarDados={(dados) => salvar.mutate(dados)} erro={erro} salvo={salvar.isSuccess && !erro} />
      ) : !Formulario ? (
        <p className="text-amber-700 bg-amber-50 p-3 rounded">
          O formulário deste tipo de ensaio ({ROTULO_TIPO_ENSAIO[ensaio.tipo_ensaio] ?? ensaio.tipo_ensaio}) chega na próxima fase.
        </p>
      ) : null}

      <section className="bg-white p-4 rounded-xl shadow-sm space-y-3">
        <h2 className="font-semibold text-lg text-grp-700">Laudo</h2>
        {!!laudos?.length && (
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th className="p-2">Número</th><th>Revisão</th><th>Status</th><th /></tr></thead>
            <tbody>{laudos.map(l => (
              <tr key={l.id} className="border-b">
                <td className="p-2 font-semibold">{l.numero}</td>
                <td>{l.revisao}</td>
                <td className="uppercase">{l.status}</td>
                <td className="p-2">
                  <div className="flex gap-3">
                    {l.status === 'rascunho' && podeAprovar && (
                      <button className="bg-amber-600 text-white rounded px-4 py-2 disabled:opacity-50"
                        disabled={aprovar.isPending} onClick={() => aprovar.mutate(l.id)}>Aprovar</button>
                    )}
                    {l.status === 'aprovado' && podeAprovar && (
                      <button className="bg-green-700 text-white rounded px-4 py-2 disabled:opacity-50"
                        disabled={emitir.isPending} onClick={() => emitir.mutate(l.id)}>Emitir (numera e trava)</button>
                    )}
                    {l.status === 'emitido' && (
                      <Link to={`/laudos-lab/${l.id}/imprimir`} className="bg-slate-800 text-white rounded px-4 py-2 inline-block">
                        Imprimir / PDF
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {podeEditar && !laudos?.length && (
          <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2 disabled:opacity-50"
            disabled={gerarLaudo.isPending} onClick={() => gerarLaudo.mutate()}>
            Gerar laudo (rascunho)
          </button>
        )}
        {laudos?.some(l => l.status === 'emitido') && (
          <p className="text-xs text-slate-500">
            Laudo emitido: o ensaio está travado (imutável). A numeração é oficial e compartilhada com os laudos CBUQ diários.
          </p>
        )}
      </section>

      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </div>
  )
}
