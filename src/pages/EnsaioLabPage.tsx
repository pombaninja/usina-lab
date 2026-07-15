import { useEffect, useState, type ComponentType } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { sanitizarDecimal, parseDecimal } from '../lib/formato'
import { ROTULO_MATERIAL, ROTULO_TIPO_ENSAIO, rotuloCurtoTipo, type FormEnsaioLabProps } from '../components/ensaiolab/tipos'
import FornecedorMaterialSelect from '../components/ensaiolab/FornecedorMaterialSelect'
import VinculosEnsaiosCard, { TIPOS_VINCULAVEIS } from '../components/ensaiolab/VinculosEnsaiosCard'
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
import ResistenciaCompressaoLabForm from '../components/ensaiolab/ResistenciaCompressaoLabForm'
import RiceDmtLabForm from '../components/ensaiolab/RiceDmtLabForm'
import CbuqCompletoLabForm from '../components/ensaiolab/CbuqCompletoLabForm'

interface EnsaioLab {
  id: string
  numero: number
  empresa_id: string
  data: string
  material_tipo: string
  material_nome: string | null
  origem: string | null
  fornecedor_id: string | null
  material_lab_id: string | null
  tipo_ensaio: string
  dados: Record<string, unknown>
  periodo: string | null
  cliente_obra_id: string | null
  placa_caminhao: string | null
  local_extracao: string | null
  operador: string | null
  temperatura_cap: number | null
  observacoes: string | null
  empresas: { nome_exibicao: string } | null
}

interface LaudoLinha { id: string; numero: string; status: string; revisao: number }

/** Referência de um ensaio componente gravada em dados.ensaios do unificado. */
interface ComponenteRef { id: string; numero: number; data: string; tipo_ensaio: string; material_nome: string | null }

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
  // rtd não é mais oferecido para ensaios NOVOS (saiu de TIPOS_CBUQ — é ensaio do
  // projeto), mas o formulário fica registrado para abrir ensaios legados.
  rtd: RtdLabForm,
  resistencia_compressao: ResistenciaCompressaoLabForm,
  rice_dmt: RiceDmtLabForm,
  // Composto: um ensaio reúne TODOS os ensaios CBUQ; o form envia sempre o objeto
  // `dados` COMPLETO (merge interno), pois a mutação `salvar` substitui o jsonb inteiro.
  cbuq_completo: CbuqCompletoLabForm,
}

export default function EnsaioLabPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const ensaioId = id!
  const qc = useQueryClient()
  const { perfis, user } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'lancador')
  const podeAprovar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [cabecalho, setCabecalho] = useState({
    // material_nome/origem seguem no estado como TEXTO sincronizado: os selects
    // de Fornecedor/Material (A1) escrevem os NOMES aqui ao selecionar; linhas
    // legadas sem FK preservam o texto antigo até alguém trocar a seleção.
    data: '', material_nome: '', origem: '', fornecedor_id: '', material_lab_id: '',
    // Cabeçalho completo do CBUQ (espelho do Ensaio CAUQ diário) — só aparece
    // quando material_tipo é cbuq/cbuqf; agregado mantém o cabeçalho simples.
    periodo: '', cliente_obra_id: '', placa_caminhao: '', local_extracao: '',
    operador: '', temperatura_cap: '', observacoes: '',
  })
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

  // Cliente/Obra ativos para o cabeçalho CBUQ — espelho do select do CAUQ diário.
  const materialCbuq = ensaio?.material_tipo === 'cbuq' || ensaio?.material_tipo === 'cbuqf'
  const { data: obras } = useQuery({
    queryKey: ['clientes_obras-ativas'],
    enabled: materialCbuq,
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes_obras')
        .select('id, cliente, obra').eq('ativa', true).order('cliente')
      if (error) throw error
      return (data ?? []) as { id: string; cliente: string; obra: string | null }[]
    },
  })

  useEffect(() => {
    if (!ensaio || carregado) return
    setCabecalho({
      data: ensaio.data, material_nome: ensaio.material_nome ?? '', origem: ensaio.origem ?? '',
      fornecedor_id: ensaio.fornecedor_id ?? '', material_lab_id: ensaio.material_lab_id ?? '',
      periodo: ensaio.periodo ?? '',
      cliente_obra_id: ensaio.cliente_obra_id ?? '',
      placa_caminhao: ensaio.placa_caminhao ?? '',
      local_extracao: ensaio.local_extracao ?? '',
      operador: ensaio.operador ?? '',
      temperatura_cap: ensaio.temperatura_cap != null ? String(ensaio.temperatura_cap).replace('.', ',') : '',
      observacoes: ensaio.observacoes ?? '',
    })
    setCarregado(true)
  }, [ensaio, carregado])

  // O formulário do tipo entrega o jsonb `dados`; o cabeçalho (data/material/origem) vai junto.
  const salvar = useMutation({
    mutationFn: async (dados: Record<string, unknown>) => {
      if (!cabecalho.data) throw new Error('Informe a data do ensaio.')
      const temperatura = parseDecimal(cabecalho.temperatura_cap)
      if (temperatura != null && Number.isNaN(temperatura)) throw new Error('Temperatura do CAP inválida.')
      // dados.vinculos (A3) é metadado da PÁGINA, não do formulário: o form monta
      // o payload só com os campos dele — preserva os vínculos existentes aqui.
      const vinculos = (ensaio?.dados as Record<string, unknown> | undefined)?.vinculos
      if (vinculos !== undefined) dados = { ...dados, vinculos }
      const { error } = await supabase.from('ensaios_lab').update({
        data: cabecalho.data,
        material_nome: cabecalho.material_nome.trim() || null,
        origem: cabecalho.origem.trim() || null,
        fornecedor_id: cabecalho.fornecedor_id || null,
        material_lab_id: cabecalho.material_lab_id || null,
        // Cabeçalho completo (CBUQ/CBUQF); nos ensaios de agregado os campos
        // ficam ocultos e o estado preserva o que veio do banco (via prefill).
        periodo: cabecalho.periodo || null,
        cliente_obra_id: cabecalho.cliente_obra_id || null,
        placa_caminhao: cabecalho.placa_caminhao.trim() || null,
        local_extracao: cabecalho.local_extracao.trim() || null,
        operador: cabecalho.operador.trim() || null,
        temperatura_cap: temperatura,
        observacoes: cabecalho.observacoes.trim() || null,
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
  //
  // UNIFICADO (agregado_unificado): o snapshot embute CÓPIAS COMPLETAS dos `dados`
  // atuais de CADA ensaio componente (busca fresca aqui). A emissão deste laudo
  // congela (trigger fn_bloqueia_ensaio_lab_emitido) SOMENTE a linha unificada —
  // os componentes NÃO ficam travados e podem mudar depois; o snapshot da
  // aprovação é, portanto, a verdade impressa (LaudoLabImprimirPage imprime do
  // snapshot quando aprovado/emitido e ao vivo apenas em rascunho).
  const aprovar = useMutation({
    mutationFn: async (laudoId: string) => {
      let snapshot: Record<string, unknown> = {
        tipo_ensaio: ensaio!.tipo_ensaio, material_tipo: ensaio!.material_tipo, dados: ensaio!.dados,
      }
      if (ensaio!.tipo_ensaio === 'agregado_unificado') {
        const refs = ((ensaio!.dados?.ensaios ?? []) as ComponenteRef[])
        if (!refs.length) throw new Error('Ensaio unificado sem ensaios componentes.')
        const { data, error } = await supabase.from('ensaios_lab')
          .select('id, numero, data, tipo_ensaio, material_nome, dados')
          .in('id', refs.map(r => r.id))
        if (error) throw new Error('Falha ao buscar os ensaios componentes: ' + error.message)
        const porId = new Map((data ?? []).map(c => [c.id as string, c]))
        const faltantes = refs.filter(r => !porId.has(r.id))
        if (faltantes.length) {
          throw new Error(`Ensaio componente Nº ${faltantes.map(f => f.numero).join(', ')} não existe mais — remova-o gerando um novo unificado.`)
        }
        snapshot = {
          tipo_ensaio: 'agregado_unificado',
          material_tipo: 'agregado',
          componentes: refs.map(r => {
            const c = porId.get(r.id)! as ComponenteRef & { dados: Record<string, unknown> }
            return { id: c.id, numero: c.numero, data: c.data, tipo_ensaio: c.tipo_ensaio, material_nome: c.material_nome, dados: c.dados }
          }),
        }
      }
      const { error } = await supabase.from('laudos').update({
        status: 'aprovado',
        avaliador: user!.id,
        aprovado_em: new Date().toISOString(),
        snapshot,
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
  // Ensaio UNIFICADO de agregados: sem formulário próprio — o corpo é a lista dos
  // ensaios componentes (chips clicáveis) + o card padrão do laudo.
  const unificado = ensaio.tipo_ensaio === 'agregado_unificado'
  const componentesRefs = unificado ? ((ensaio.dados?.ensaios ?? []) as ComponenteRef[]) : []
  const inp = 'border rounded p-2 w-full'
  // Ensaio com laudo EMITIDO é imutável (trigger no banco); a tela desabilita a
  // edição proativamente em vez de deixar o usuário esbarrar no erro do banco.
  const laudoEmitido = (laudos ?? []).some(l => l.status === 'emitido')
  const editavel = podeEditar && !laudoEmitido

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-grp-700">
          Ensaio nº {ensaio.numero} · {ROTULO_TIPO_ENSAIO[ensaio.tipo_ensaio] ?? ensaio.tipo_ensaio} — {ROTULO_MATERIAL[ensaio.material_tipo] ?? ensaio.material_tipo}
        </h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/ensaios-lab')}>Voltar aos ensaios</button>
      </div>

      {laudoEmitido && (
        <p className="text-sm text-grp-700 bg-grp-100 p-3 rounded">
          Este ensaio pertence a um laudo <b>emitido</b> e é imutável. Os campos estão bloqueados.
        </p>
      )}

      <section className="bg-white p-4 rounded-xl shadow-sm grid sm:grid-cols-4 gap-3">
        <p className="text-sm sm:col-span-4"><span className="text-slate-500">Empresa:</span> <b>{ensaio.empresas?.nome_exibicao ?? '—'}</b></p>
        <label className="text-sm">Data
          <input className={inp} type="date" value={cabecalho.data} disabled={!editavel}
            onChange={e => setCabecalho({ ...cabecalho, data: e.target.value })} /></label>
        {unificado ? (
          // Materiais MISTOS: fornecedor/material ficam nos ensaios componentes.
          <p className="text-xs text-slate-500 self-end pb-2 sm:col-span-2">
            Materiais mistos — fornecedor e material ficam registrados em cada ensaio componente.
          </p>
        ) : (<>
          <FornecedorMaterialSelect disabled={!editavel}
            valor={{ fornecedorId: cabecalho.fornecedor_id, materialLabId: cabecalho.material_lab_id }}
            onChange={v => setCabecalho(c => ({
              ...c,
              fornecedor_id: v.fornecedorId, material_lab_id: v.materialLabId,
              // Sincroniza os TEXTOS com a seleção; trocar a seleção substitui o
              // texto legado (a linha "cadastro anterior" some junto).
              origem: v.fornecedorNome ?? '', material_nome: v.materialNome ?? '',
            }))} />
          {!cabecalho.fornecedor_id && (cabecalho.material_nome || cabecalho.origem) && (
            <p className="text-xs text-slate-500 self-end pb-2">
              Cadastro anterior (texto livre): <b>{cabecalho.material_nome || '—'}</b> · {cabecalho.origem || '—'}
            </p>
          )}
        </>)}
        {materialCbuq && (<>
          <label className="text-sm">Período
            <select className={inp} value={cabecalho.periodo} disabled={!editavel}
              onChange={e => setCabecalho({ ...cabecalho, periodo: e.target.value })}>
              <option value="">—</option>
              <option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option>
            </select></label>
          <label className="text-sm">Cliente / Obra
            <select className={inp} value={cabecalho.cliente_obra_id} disabled={!editavel}
              onChange={e => setCabecalho({ ...cabecalho, cliente_obra_id: e.target.value })}>
              <option value="">—</option>
              {(obras ?? []).map(o => <option key={o.id} value={o.id}>{o.cliente}{o.obra ? ` — ${o.obra}` : ''}</option>)}
            </select></label>
          <label className="text-sm">Placa caminhão
            <input className={inp} value={cabecalho.placa_caminhao} disabled={!editavel}
              onChange={e => setCabecalho({ ...cabecalho, placa_caminhao: e.target.value })} /></label>
          <label className="text-sm">Local de extração
            <input className={inp} value={cabecalho.local_extracao} disabled={!editavel}
              onChange={e => setCabecalho({ ...cabecalho, local_extracao: e.target.value })} /></label>
          <label className="text-sm">Operador
            <input className={inp} value={cabecalho.operador} disabled={!editavel}
              onChange={e => setCabecalho({ ...cabecalho, operador: e.target.value })} /></label>
          <label className="text-sm">Temp. CAP (°C)
            <input className={inp} inputMode="decimal" value={cabecalho.temperatura_cap} disabled={!editavel}
              onChange={e => setCabecalho({ ...cabecalho, temperatura_cap: sanitizarDecimal(e.target.value) })} /></label>
          <label className="text-sm sm:col-span-4">Observações
            <textarea className={inp} value={cabecalho.observacoes} disabled={!editavel}
              onChange={e => setCabecalho({ ...cabecalho, observacoes: e.target.value })} /></label>
        </>)}
      </section>

      {TIPOS_VINCULAVEIS[ensaio.tipo_ensaio] && ensaio.material_tipo === 'agregado' && (
        <VinculosEnsaiosCard ensaio={ensaio} editavel={editavel} />
      )}

      {unificado ? (
        <section className="bg-white p-4 rounded-xl shadow-sm space-y-3">
          <h2 className="font-semibold text-lg text-grp-700">Ensaios que compõem este laudo unificado</h2>
          <p className="text-sm text-slate-500">
            O laudo imprime a seção analítica de cada ensaio abaixo, indicando número e data.
            A <b>aprovação</b> congela uma cópia dos dados atuais de cada um — os ensaios componentes
            continuam editáveis depois (só a linha unificada trava na emissão).
          </p>
          <div className="flex flex-wrap gap-2">
            {componentesRefs.map(r => (
              <Link key={r.id} to={`/ensaios-lab/${r.id}`}
                className="inline-flex items-center gap-1 bg-grp-50 hover:bg-grp-100 text-grp-700 border border-grp-200 rounded-full px-3 py-1 text-sm">
                <b>Nº {r.numero}</b> · {new Date(r.data + 'T12:00').toLocaleDateString('pt-BR')} · {rotuloCurtoTipo(r.tipo_ensaio)} · {r.material_nome ?? '—'}
              </Link>
            ))}
          </div>
          {!componentesRefs.length && (
            <p className="text-amber-700 bg-amber-50 p-3 rounded">Este ensaio unificado não referencia nenhum ensaio componente.</p>
          )}
          {editavel && (
            // Sem formulário próprio: este botão persiste o cabeçalho (data),
            // repassando ensaio.dados intacto (refs dos componentes preservadas).
            <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2 disabled:opacity-50"
              disabled={salvar.isPending} onClick={() => salvar.mutate(ensaio.dados ?? {})}>
              Salvar cabeçalho
            </button>
          )}
          {salvar.isSuccess && !erro && <p className="text-green-700 text-sm">Cabeçalho salvo.</p>}
        </section>
      ) : Formulario && carregado ? (
        <Formulario dados={ensaio.dados ?? {}} podeEditar={editavel} salvando={salvar.isPending}
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
