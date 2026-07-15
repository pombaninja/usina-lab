import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../lib/formato'
import { ROTULO_MATERIAL, ROTULO_TIPO_ENSAIO, rotuloCurtoTipo } from '../ensaiolab/tipos'
import { calcularMarshall, fatorCorrecaoPorVolume } from '../../lib/calculos/marshall'
import { calcularRtd } from '../../lib/calculos/rtd'
import { useDosagemFaixas } from '../ensaiolab/useDosagemFaixas'
import {
  mediaDe, thMini, tdMini, Secao,
  TeorBetumeLaudo, GranulometriaMisturaLaudo, ResistenciaCompressaoLaudo, RiceDmtLaudo, CbuqCompletoLaudo,
} from '../ensaiolab/AnaliticoCbuq'
import {
  AgregadoUnificadoLaudo, GranulometriaAgregadoLaudo, LamelaridadeLaudo, IndiceFormaLaudo,
  EquivalenteAreiaLaudo, DensidadeGraudoLaudo, DensidadeMiudoLaudo,
} from '../ensaiolab/AnaliticoAgregado'

// Laudo IMPRIMÍVEL do ensaio de laboratório avulso — identidade GRP igual à do
// laudo CBUQ diário (LaudoImprimirPage). As tabelas ANALÍTICAS são renderizadas a
// partir das ENTRADAS BRUTAS de ensaios_lab.dados, recalculadas com as MESMAS
// bibliotecas de cálculo dos formulários (src/lib/calculos). A leitura ao vivo de
// ensaios_lab é estável: a emissão do laudo congela o ensaio via trigger
// (fn_bloqueia_ensaio_lab_emitido) — nada muda depois de emitido.
// EXCEÇÃO (laudo unificado de agregados): a trava cobre só a linha unificada, não
// os componentes — aprovado/emitido imprime do SNAPSHOT (ver AnaliticoAgregado).
//
// As seções do CBUQ composto (teor de betume, granulometria da mistura,
// resistência à compressão, Rice/DMT) moram em components/ensaiolab/AnaliticoCbuq;
// as dos ensaios de AGREGADO em components/ensaiolab/AnaliticoAgregado. Marshall e
// RTD (legado) seguem aqui.

// ===== CBUQ / CBUQF =====

function MarshallLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as {
    teor_ligante?: number; densidade_ligante?: number; gmm?: number
    constante_prensa?: number; correcao_fluencia?: number
    cps?: { cp: number; peso_ar: number; peso_imerso: number; leitura_estabilidade: number; fator_correcao: number | null; altura_cm: number | null; leitura_fluencia_mm: number }[]
  }
  const calc = useMemo(() => {
    if (!d.cps?.length || d.teor_ligante == null || d.densidade_ligante == null || d.gmm == null || d.constante_prensa == null) return null
    try {
      const res = calcularMarshall(
        d.cps.map(c => ({
          pesoAr: c.peso_ar, pesoImerso: c.peso_imerso,
          leituraEstabilidade: c.leitura_estabilidade, fatorCorrecao: c.fator_correcao ?? undefined,
          leituraFluenciaMm: c.leitura_fluencia_mm, alturaCm: c.altura_cm ?? undefined,
        })),
        { teorLigante: d.teor_ligante, densidadeLigante: d.densidade_ligante, densMaxTeorica: d.gmm,
          constantePrensa: d.constante_prensa, correcaoFluencia: d.correcao_fluencia ?? 1 },
      )
      const linhas = d.cps.map((c, i) => {
        const r = res.cps[i]
        return {
          cp: c.cp, pesoAr: c.peso_ar, pesoImerso: c.peso_imerso, alturaCm: c.altura_cm,
          leitura: c.leitura_estabilidade,
          fator: c.fator_correcao ?? fatorCorrecaoPorVolume(r.volume),
          calcul: c.leitura_estabilidade * d.constante_prensa!,
          ...r,
        }
      })
      return {
        linhas, medias: res.medias,
        mediaFator: mediaDe(linhas.map(l => l.fator)), mediaLeitura: mediaDe(linhas.map(l => l.leitura)),
        mediaCalcul: mediaDe(linhas.map(l => l.calcul)), mediaAltura: mediaDe(linhas.map(l => l.alturaCm)),
      }
    } catch { return null }
  }, [d])
  if (!calc) return null
  return (
    <Secao titulo="Ensaio Marshall — resultados por corpo de prova">
      <p className="text-[9px] text-slate-600 mb-1">
        Teor de ligante: <b>{fmt(d.teor_ligante, 2)}%</b> ·
        Gmm (Rice teórica): <b>{fmt(d.gmm, 3)}</b> ·
        Densidade do ligante: <b>{fmt(d.densidade_ligante, 3)}</b> ·
        Constante da prensa: <b>{fmt(d.constante_prensa, 4)}</b> ·
        Correção de fluência: <b>{fmt(d.correcao_fluencia ?? 1, 3)}</b>
      </p>
      <table className="w-full border-collapse text-[8px] leading-tight">
        <thead>
          <tr className="bg-grp-100 text-center">
            <th className={thMini} rowSpan={2}>CP</th>
            <th className={thMini} colSpan={2}>Peso (g)</th>
            <th className={thMini} colSpan={4}>Densidade</th>
            <th className={thMini} colSpan={3}>V.C.B. / V.A.M. / R.B.V.</th>
            <th className={thMini} colSpan={2}>Corpo de prova</th>
            <th className={thMini} colSpan={3}>Estabilidade</th>
            <th className={thMini} colSpan={2}>Fluência</th>
          </tr>
          <tr className="bg-grp-100 text-center">
            <th className={thMini}>Peso no ar</th>
            <th className={thMini}>Peso na água</th>
            <th className={thMini}>Volume cm³</th>
            <th className={thMini}>Densidade aparente</th>
            <th className={thMini}>Teórica Rice</th>
            <th className={thMini}>V.V (% vazios)</th>
            <th className={thMini}>V.C.B. (%)</th>
            <th className={thMini}>V.A.M. (%)</th>
            <th className={thMini}>R.B.V. (%)</th>
            <th className={thMini}>Altura cm</th>
            <th className={thMini}>Fator correção</th>
            <th className={thMini}>Leitura</th>
            <th className={thMini}>Calcul.</th>
            <th className={thMini}>Corrig. kg</th>
            <th className={thMini}>Leitura mm</th>
            <th className={thMini}>Pol.</th>
          </tr>
        </thead>
        <tbody>
          {calc.linhas.map(c => (
            <tr key={c.cp} className="text-center">
              <td className={`${thMini} font-semibold text-center`}>{c.cp}</td>
              <td className={tdMini}>{fmt(c.pesoAr, 1)}</td>
              <td className={tdMini}>{fmt(c.pesoImerso, 1)}</td>
              <td className={tdMini}>{fmt(c.volume, 1)}</td>
              <td className={tdMini}>{fmt(c.densidadeAparente, 3)}</td>
              <td className={tdMini}>{fmt(d.gmm, 3)}</td>
              <td className={tdMini}>{fmt(c.vazios, 1)}</td>
              <td className={tdMini}>{fmt(c.vcb, 1)}</td>
              <td className={tdMini}>{fmt(c.vam, 1)}</td>
              <td className={tdMini}>{fmt(c.rbv, 1)}</td>
              <td className={tdMini}>{c.alturaCm != null ? fmt(c.alturaCm, 2) : '—'}</td>
              <td className={tdMini}>{fmt(c.fator, 2)}</td>
              <td className={tdMini}>{fmt(c.leitura, 0)}</td>
              <td className={tdMini}>{fmt(c.calcul, 0)}</td>
              <td className={tdMini}>{fmt(c.estabilidadeCorrigida, 0)}</td>
              <td className={tdMini}>{fmt(c.fluenciaMm, 1)}</td>
              <td className={tdMini}>{fmt(c.fluenciaPol, 1)}</td>
            </tr>
          ))}
          <tr className="text-center font-semibold bg-slate-50">
            <td className={tdMini}>Média</td>
            <td className={tdMini}>—</td>
            <td className={tdMini}>—</td>
            <td className={tdMini}>{fmt(calc.medias.volume, 1)}</td>
            <td className={tdMini}>{fmt(calc.medias.densidadeAparente, 3)}</td>
            <td className={tdMini}>{fmt(d.gmm, 3)}</td>
            <td className={tdMini}>{fmt(calc.medias.vazios, 1)}</td>
            <td className={tdMini}>{fmt(calc.medias.vcb, 1)}</td>
            <td className={tdMini}>{fmt(calc.medias.vam, 1)}</td>
            <td className={tdMini}>{fmt(calc.medias.rbv, 1)}</td>
            <td className={tdMini}>{calc.mediaAltura != null ? fmt(calc.mediaAltura, 2) : '—'}</td>
            <td className={tdMini}>{fmt(calc.mediaFator, 2)}</td>
            <td className={tdMini}>{fmt(calc.mediaLeitura, 0)}</td>
            <td className={tdMini}>{fmt(calc.mediaCalcul, 0)}</td>
            <td className={tdMini}>{fmt(calc.medias.estabilidadeCorrigida, 0)}</td>
            <td className={tdMini}>{fmt(calc.medias.fluenciaMm, 1)}</td>
            <td className={tdMini}>{fmt(calc.medias.fluenciaPol, 1)}</td>
          </tr>
        </tbody>
      </table>
    </Secao>
  )
}

function RtdLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as { constante_prensa?: number; cps?: { cp: number; leitura: number; diametro_cm: number; altura_cm: number }[] }
  const calc = useMemo(() => {
    if (d.constante_prensa == null || !d.cps?.length) return null
    try {
      const r = calcularRtd(d.cps.map(c => ({
        leitura: c.leitura, constantePrensa: d.constante_prensa!, diametroCm: c.diametro_cm, alturaCm: c.altura_cm,
      })))
      return { linhas: d.cps.map((c, i) => ({ ...c, mpa: r.rtdMpa[i] })), media: r.media }
    } catch { return null }
  }, [d])
  if (!calc) return null
  return (
    <Secao titulo="Resistência à Tração Diametral (RTD)">
      <p className="text-[9px] text-slate-600 mb-1">RTD = 2·carga/(π·D·H), carga = leitura × constante da prensa ({fmt(d.constante_prensa, 4)}), em MPa.</p>
      <table className="w-full border-collapse text-[9px] leading-tight">
        <thead><tr className="bg-grp-100 text-center">
          <th className={thMini}>CP</th><th className={thMini}>Leitura</th>
          <th className={thMini}>Diâmetro (cm)</th><th className={thMini}>Altura (cm)</th><th className={thMini}>RTD (MPa)</th>
        </tr></thead>
        <tbody>
          {calc.linhas.map(c => (
            <tr key={c.cp} className="text-center">
              <td className={`${tdMini} font-semibold`}>{c.cp}</td>
              <td className={tdMini}>{fmt(c.leitura, 1)}</td>
              <td className={tdMini}>{fmt(c.diametro_cm, 2)}</td>
              <td className={tdMini}>{fmt(c.altura_cm, 2)}</td>
              <td className={`${tdMini} font-semibold`}>{fmt(c.mpa, 3)}</td>
            </tr>
          ))}
          <tr className="text-center bg-slate-50 font-semibold">
            <td className={tdMini} colSpan={4}>Média</td>
            <td className={tdMini}>{fmt(calc.media, 3)} MPa</td>
          </tr>
        </tbody>
      </table>
    </Secao>
  )
}

const SECOES_POR_TIPO: Record<string, (props: { dados: Record<string, unknown> }) => React.ReactNode> = {
  marshall: MarshallLaudo,
  teor_betume: TeorBetumeLaudo,
  granulometria_mistura: GranulometriaMisturaLaudo,
  // rtd avulsa não é mais oferecida para ensaios novos, mas laudos legados
  // emitidos com tipo_ensaio = 'rtd' continuam imprimindo normalmente.
  rtd: RtdLaudo,
  resistencia_compressao: ResistenciaCompressaoLaudo,
  rice_dmt: RiceDmtLaudo,
  cbuq_completo: CbuqCompletoLaudo,
  granulometria: GranulometriaAgregadoLaudo,
  lamelaridade: LamelaridadeLaudo,
  indice_forma: IndiceFormaLaudo,
  equivalente_areia: EquivalenteAreiaLaudo,
  densidade_graudo: DensidadeGraudoLaudo,
  densidade_miudo: DensidadeMiudoLaudo,
}

interface LaudoLab {
  id: string
  numero: string
  revisao: number
  status: string
  emitido_em: string | null
  aprovado_em: string | null
  ensaio_lab_id: string
  /** Cópia congelada na aprovação — fonte do laudo unificado quando aprovado/emitido. */
  snapshot: Record<string, unknown> | null
  empresas: { razao_social: string; nome_exibicao: string; cnpj: string | null; cabecalho: string | null; rodape: string | null }
  ensaios_lab: {
    data: string; material_tipo: string; material_nome: string | null; origem: string | null
    tipo_ensaio: string; dados: Record<string, unknown>
    periodo: string | null; placa_caminhao: string | null; local_extracao: string | null
    operador: string | null; temperatura_cap: number | null; observacoes: string | null
    clientes_obras: { cliente: string; obra: string | null } | null
  } | null
}

// Rótulo pt-BR do período (ensaios_lab.periodo — check manha/tarde/noite).
const ROTULO_PERIODO: Record<string, string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }

export default function LaudoLabConteudo({ laudoId }: { laudoId: string }) {
  const { data: laudo } = useQuery({
    queryKey: ['laudo-lab-print', laudoId],
    queryFn: async () => {
      const { data, error } = await supabase.from('laudos')
        .select('id, numero, revisao, status, emitido_em, aprovado_em, ensaio_lab_id, snapshot, empresas(razao_social, nome_exibicao, cnpj, cabecalho, rodape), ensaios_lab(data, material_tipo, material_nome, origem, tipo_ensaio, dados, periodo, placa_caminhao, local_extracao, operador, temperatura_cap, observacoes, clientes_obras(cliente, obra))')
        .eq('id', laudoId).single()
      if (error) throw error
      return data as unknown as LaudoLab
    },
  })

  // Projeto vinculado do CBUQ completo (dados.dosagem_id, opcional): traz nome do
  // projeto p/ o cabeçalho e as faixas da especificação p/ a curva da mistura.
  // Hook SEMPRE chamado (regras de hooks) — a query só roda quando há dosagem_id.
  const ensaioLab = laudo?.ensaios_lab
  const dosagemId = ensaioLab?.tipo_ensaio === 'cbuq_completo' && typeof ensaioLab.dados?.dosagem_id === 'string'
    ? ensaioLab.dados.dosagem_id
    : undefined
  const { data: vinculada } = useDosagemFaixas(dosagemId)

  // Ensaios VINCULADOS (A3, dados.vinculos = { tipo: uuid }): linha compacta no
  // cabeçalho com "Nº X (data) — tipo". Hook sempre chamado; roda só com ids.
  const idsVinculados = Object.values((ensaioLab?.dados?.vinculos ?? {}) as Record<string, string>)
  const { data: ensaiosVinculados } = useQuery({
    queryKey: ['laudo-lab-vinculados', idsVinculados],
    enabled: idsVinculados.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('ensaios_lab')
        .select('id, numero, data, tipo_ensaio').in('id', idsVinculados).order('numero')
      if (error) throw error
      return (data ?? []) as { id: string; numero: number; data: string; tipo_ensaio: string }[]
    },
  })

  if (!laudo) return <p>Carregando…</p>
  const e = laudo.ensaios_lab
  if (!e) return <p className="text-red-600">Este laudo não é de um ensaio de laboratório avulso.</p>
  const Corpo = SECOES_POR_TIPO[e.tipo_ensaio]

  return (
    <>
      <header className="border-b-4 border-grp-600 pb-3 mb-4 flex justify-between items-end doc-evitar-quebra">
        <div>
          <img src="/logo-grp.png" alt="Grupo Ribeiro Porto" className="w-[150px] mb-2" />
          <h1 className="text-xl font-bold text-grp-700">{laudo.empresas.razao_social}</h1>
          <p className="text-slate-600">{laudo.empresas.cabecalho ?? 'Laudo de Ensaio de Laboratório'}</p>
          {laudo.empresas.cnpj && <p className="text-slate-500 text-xs">CNPJ: {laudo.empresas.cnpj}</p>}
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-lg">{laudo.numero}</p>
          <p>Rev. {laudo.revisao}</p>
          <p>{laudo.emitido_em ? new Date(laudo.emitido_em).toLocaleDateString('pt-BR') : 'NÃO EMITIDO'}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-8 gap-y-1 mb-4 doc-evitar-quebra">
        <p><b>Material:</b> {ROTULO_MATERIAL[e.material_tipo] ?? e.material_tipo}{e.material_nome ? ` — ${e.material_nome}` : ''}</p>
        <p><b>Ensaio:</b> {ROTULO_TIPO_ENSAIO[e.tipo_ensaio] ?? e.tipo_ensaio}</p>
        <p><b>Origem / amostra:</b> {e.origem ?? '—'}</p>
        <p><b>Data do ensaio:</b> {new Date(e.data + 'T12:00').toLocaleDateString('pt-BR')}{e.periodo ? ` (${ROTULO_PERIODO[e.periodo] ?? e.periodo})` : ''}</p>
        {e.clientes_obras && <p><b>Cliente / Obra:</b> {e.clientes_obras.cliente}{e.clientes_obras.obra ? ` — ${e.clientes_obras.obra}` : ''}</p>}
        {(e.placa_caminhao || e.operador) && <p><b>Placa:</b> {e.placa_caminhao ?? '—'} · <b>Operador:</b> {e.operador ?? '—'}</p>}
        {e.local_extracao && <p><b>Local de extração:</b> {e.local_extracao}</p>}
        {e.temperatura_cap != null && <p><b>Temperatura do CAP:</b> {fmt(e.temperatura_cap, 1)} °C</p>}
        {vinculada && <p className="col-span-2"><b>Projeto vinculado:</b> {vinculada.nome} — Rev. {vinculada.revisao ?? 0}</p>}
        {!!ensaiosVinculados?.length && (
          <p className="col-span-2"><b>Ensaios vinculados:</b>{' '}
            {ensaiosVinculados.map(v =>
              `Nº ${v.numero} (${new Date(v.data + 'T12:00').toLocaleDateString('pt-BR')}) — ${rotuloCurtoTipo(v.tipo_ensaio)}`,
            ).join(' · ')}
          </p>
        )}
        {e.observacoes && <p className="col-span-2"><b>Observações:</b> {e.observacoes}</p>}
      </section>

      {e.tipo_ensaio === 'agregado_unificado'
        ? <AgregadoUnificadoLaudo dados={e.dados ?? {}} status={laudo.status} snapshot={laudo.snapshot} />
        : e.tipo_ensaio === 'cbuq_completo'
          ? <CbuqCompletoLaudo dados={e.dados ?? {}} especificacao={vinculada?.especificacao ?? undefined} />
          : Corpo
            ? <Corpo dados={e.dados ?? {}} />
            : <p className="text-amber-700">Tipo de ensaio sem seção analítica cadastrada: {e.tipo_ensaio}</p>}

      <footer className="mt-10 grid grid-cols-2 gap-8 text-center doc-evitar-quebra">
        <div className="border-t pt-2">Laboratorista<br /><b>&nbsp;</b></div>
        <div className="border-t pt-2">Avaliador responsável<br /><b>(assinado eletronicamente em {laudo.aprovado_em ? new Date(laudo.aprovado_em).toLocaleString('pt-BR') : '—'})</b></div>
      </footer>
      {laudo.empresas.rodape && <p className="text-xs text-slate-500 mt-6 text-center">{laudo.empresas.rodape}</p>}
    </>
  )
}
