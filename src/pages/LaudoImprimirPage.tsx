import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/formato'
import GraficoGranulometria from '../components/GraficoGranulometria'
import { calcularMarshall, fatorCorrecaoPorVolume } from '../lib/calculos/marshall'
import { teorRotarex, gmmRice } from '../lib/calculos/teorBetume'
import { calcularRtd } from '../lib/calculos/rtd'
import { normalizarPeneira, type LinhaGranulometria } from '../lib/calculos/granulometria'

const ROTULOS: Record<string, string> = {
  vazios: 'Vazios (%)', rbv: 'R.B.V. (%)', vam: 'V.A.M. (%)', estabilidade: 'Estabilidade (kgf)',
  fluencia_mm: 'Fluência (mm)', rtd: 'RTD (MPa)', filler_ligante: 'Relação Fíler/Ligante', teor_ligante: 'Teor de Ligante (%)',
}

// ===== Linhas cruas do ensaio (tabelas cauq_*) =====
// Abordagem dos dados: o laudo continua exibindo os RESULTADOS do snapshot congelado
// (laudo.snapshot = resultados calculados na emissão). As tabelas ANALÍTICAS abaixo
// leem as leituras cruas das tabelas do ensaio (cauq_marshall, cauq_marshall_cp,
// cauq_granulometria, cauq_teor_betume, cauq_rtd_cp) — imutáveis por trigger após a
// emissão do laudo — e recalculam com as mesmas bibliotecas de cálculo do ensaio.
interface MarshallRow { constante_prensa: number; gmm_ensaio: number | null; correcao_fluencia: number | null }
interface MarshallCpRow {
  cp: number; peso_ar: number; peso_imerso: number; leitura_estabilidade: number
  fator_correcao: number | null; leitura_fluencia_mm: number; altura_cm: number | null
}
interface GranRow { peso_total: number; leituras: { peneira: string; abertura_mm: number; retido_acum: number }[] }
interface TeorRow {
  metodo: string | null; amostra_com_betume: number | null; amostra_sem_betume: number | null; umidade_pct: number | null
  rice_peso_amostra: number | null; rice_frasco_agua: number | null; rice_frasco_amostra_agua: number | null; rice_fator_temp: number | null
}
interface RtdRow { cp: number; leitura: number; constante_prensa: number; diametro_cm: number; altura_cm: number }

function mediaDe(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

export default function LaudoImprimirPage() {
  const { id } = useParams()
  const { data: laudo } = useQuery({
    queryKey: ['laudo-print', id],
    queryFn: async () => (await supabase.from('laudos')
      .select('*, empresas(razao_social, nome_exibicao, cnpj, cabecalho, rodape), ensaios_cauq(data, periodo, placa_caminhao, operador, temperatura_cap, observacoes, dosagens(nome, teor_otimo, dens_max_teorica_projeto, densidade_ligante, especificacoes(nome, norma)), clientes_obras(cliente, obra, local_aplicacao))')
      .eq('id', id).single()).data,
  })

  // Leituras cruas do ensaio (imutáveis por trigger após emissão do laudo).
  const ensaioId = laudo?.ensaio_id as string | undefined
  const { data: bruto } = useQuery({
    queryKey: ['laudo-print-bruto', ensaioId],
    enabled: !!ensaioId,
    queryFn: async () => {
      const [marshallR, cpsR, granR, teorR, rtdR] = await Promise.all([
        supabase.from('cauq_marshall').select('constante_prensa, gmm_ensaio, correcao_fluencia').eq('ensaio_id', ensaioId).maybeSingle(),
        supabase.from('cauq_marshall_cp').select('cp, peso_ar, peso_imerso, leitura_estabilidade, fator_correcao, leitura_fluencia_mm, altura_cm').eq('ensaio_id', ensaioId).order('cp'),
        supabase.from('cauq_granulometria').select('peso_total, leituras').eq('ensaio_id', ensaioId).maybeSingle(),
        supabase.from('cauq_teor_betume').select('metodo, amostra_com_betume, amostra_sem_betume, umidade_pct, rice_peso_amostra, rice_frasco_agua, rice_frasco_amostra_agua, rice_fator_temp').eq('ensaio_id', ensaioId).maybeSingle(),
        supabase.from('cauq_rtd_cp').select('cp, leitura, constante_prensa, diametro_cm, altura_cm').eq('ensaio_id', ensaioId).order('cp'),
      ])
      for (const r of [marshallR, cpsR, granR, teorR, rtdR]) if (r.error) throw r.error
      return {
        marshall: marshallR.data as MarshallRow | null,
        cps: (cpsR.data ?? []) as MarshallCpRow[],
        gran: granR.data as GranRow | null,
        teor: teorR.data as TeorRow | null,
        rtd: (rtdR.data ?? []) as RtdRow[],
      }
    },
  })

  const snapshot = useMemo(() => (laudo?.snapshot ?? {}) as {
    teor?: number; gmm?: number
    granulometria?: { linhas: LinhaGranulometria[] } | null
    avaliacoes?: { parametro: string; valor: number; min: number | null; max: number | null; conforme: boolean }[]
  }, [laudo])

  // ===== Marshall do ensaio — recalcula por CP via calcularMarshall (mesma lib do ensaio) =====
  const marshallEnsaio = useMemo(() => {
    if (!laudo || !bruto?.marshall || !bruto.cps.length) return null
    const dos = laudo.ensaios_cauq?.dosagens as { teor_otimo: number | null; dens_max_teorica_projeto: number | null; densidade_ligante: number | null } | null
    const teorLigante = snapshot.teor ?? dos?.teor_otimo
    const densMaxTeorica = snapshot.gmm ?? bruto.marshall.gmm_ensaio ?? dos?.dens_max_teorica_projeto
    const densidadeLigante = dos?.densidade_ligante
    if (teorLigante == null || densMaxTeorica == null || densidadeLigante == null) return null
    const constante = bruto.marshall.constante_prensa
    const correcaoFluencia = bruto.marshall.correcao_fluencia ?? 1
    const passando200 = snapshot.granulometria?.linhas
      ?.find(l => normalizarPeneira(l.peneira) === normalizarPeneira('N. 200'))?.pctPassando
    try {
      const res = calcularMarshall(
        bruto.cps.map(c => ({
          pesoAr: c.peso_ar, pesoImerso: c.peso_imerso,
          leituraEstabilidade: c.leitura_estabilidade, fatorCorrecao: c.fator_correcao ?? undefined,
          leituraFluenciaMm: c.leitura_fluencia_mm, alturaCm: c.altura_cm ?? undefined,
        })),
        { teorLigante, densidadeLigante, densMaxTeorica, constantePrensa: constante, correcaoFluencia, passando200 },
      )
      const linhas = bruto.cps.map((c, i) => {
        const r = res.cps[i]
        const fator = c.fator_correcao ?? fatorCorrecaoPorVolume(r.volume)
        return {
          cp: c.cp, pesoAr: c.peso_ar, pesoImerso: c.peso_imerso, alturaCm: c.altura_cm,
          leitura: c.leitura_estabilidade, fator, calcul: c.leitura_estabilidade * constante, ...r,
        }
      })
      const alturas = linhas.map(l => l.alturaCm).filter((x): x is number => x != null)
      return {
        linhas, medias: res.medias, relacaoFillerLigante: res.relacaoFillerLigante,
        mediaFator: mediaDe(linhas.map(l => l.fator)), mediaLeitura: mediaDe(linhas.map(l => l.leitura)),
        mediaCalcul: mediaDe(linhas.map(l => l.calcul)), mediaAltura: mediaDe(alturas),
        params: { teorLigante, densMaxTeorica, densidadeLigante, constante, correcaoFluencia },
      }
    } catch { return null }
  }, [laudo, bruto, snapshot])

  // ===== Teor de betume — leituras cruas + resultado (teorRotarex / gmmRice) =====
  const teorEnsaio = useMemo(() => {
    const t = bruto?.teor
    if (!t) return null
    let rotarex: number | null = null
    if (t.amostra_com_betume != null && t.amostra_sem_betume != null) {
      try { rotarex = teorRotarex(t.amostra_com_betume, t.amostra_sem_betume, t.umidade_pct ?? 0) } catch { rotarex = null }
    }
    let rice: number | null = null
    if (t.rice_peso_amostra != null && t.rice_frasco_agua != null && t.rice_frasco_amostra_agua != null) {
      try { rice = gmmRice(t.rice_peso_amostra, t.rice_frasco_agua, t.rice_frasco_amostra_agua, t.rice_fator_temp ?? 1) } catch { rice = null }
    }
    if (t.amostra_com_betume == null && t.rice_peso_amostra == null) return null
    return { row: t, rotarex, rice }
  }, [bruto])

  // ===== RTD — leituras por CP → MPa (calcularRtd) + média =====
  const rtdEnsaio = useMemo(() => {
    const rows = bruto?.rtd ?? []
    if (!rows.length) return null
    const linhas = rows.map(r => {
      let mpa: number | null = null
      try {
        mpa = calcularRtd([{ leitura: r.leitura, constantePrensa: r.constante_prensa, diametroCm: r.diametro_cm, alturaCm: r.altura_cm }]).rtdMpa[0]
      } catch { mpa = null }
      return { ...r, mpa }
    })
    return { linhas, media: mediaDe(linhas.map(l => l.mpa).filter((x): x is number => x != null)) }
  }, [bruto])

  if (!laudo) return <p>Carregando…</p>
  const s = laudo.snapshot ?? {}
  const e = laudo.ensaios_cauq
  return (
    <div className="max-w-[210mm] mx-auto bg-white p-8 text-sm print:p-0">
      <button onClick={() => window.print()} className="print:hidden mb-4 bg-slate-800 text-white rounded px-4 py-2">
        Imprimir / Salvar PDF
      </button>

      <header className="border-b-4 border-slate-800 pb-3 mb-4 flex justify-between items-end doc-evitar-quebra">
        <div>
          <h1 className="text-xl font-bold">{laudo.empresas.razao_social}</h1>
          <p className="text-slate-600">{laudo.empresas.cabecalho ?? 'Controle Tecnológico de Misturas Betuminosas'}</p>
          {laudo.empresas.cnpj && <p className="text-slate-500 text-xs">CNPJ: {laudo.empresas.cnpj}</p>}
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-lg">{laudo.numero}</p>
          <p>Rev. {laudo.revisao}</p>
          <p>{laudo.emitido_em ? new Date(laudo.emitido_em).toLocaleDateString('pt-BR') : 'NÃO EMITIDO'}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-8 gap-y-1 mb-4 doc-evitar-quebra">
        <p><b>Cliente:</b> {e.clientes_obras?.cliente ?? '—'}</p>
        <p><b>Obra:</b> {e.clientes_obras?.obra ?? '—'}</p>
        <p><b>Dosagem/Faixa:</b> {e.dosagens?.nome}</p>
        <p><b>Especificação:</b> {e.dosagens?.especificacoes?.nome} {e.dosagens?.especificacoes?.norma}</p>
        <p><b>Data do ensaio:</b> {new Date(e.data + 'T12:00').toLocaleDateString('pt-BR')} ({e.periodo})</p>
        <p><b>Placa:</b> {e.placa_caminhao ?? '—'} · <b>Operador:</b> {e.operador ?? '—'}</p>
      </section>

      {s.avaliacoes?.length > 0 && (
        <section className="mb-4 doc-evitar-quebra">
          <h2 className="font-bold border-b mb-2">Resultados × Especificação</h2>
          <table className="w-full border">
            <thead><tr className="bg-slate-100"><th className="border p-1 text-left">Parâmetro</th><th className="border p-1">Obtido</th><th className="border p-1">Especificado</th><th className="border p-1">Situação</th></tr></thead>
            <tbody>{s.avaliacoes.map((a: { parametro: string; valor: number; min: number | null; max: number | null; conforme: boolean }) => (
              <tr key={a.parametro}>
                <td className="border p-1">{ROTULOS[a.parametro] ?? a.parametro}</td>
                <td className="border p-1 text-center font-semibold">{fmt(a.valor, 2)}</td>
                <td className="border p-1 text-center">{a.min ?? '—'} a {a.max ?? '—'}</td>
                <td className={`border p-1 text-center font-bold ${a.conforme ? 'text-green-700' : 'text-red-700'}`}>{a.conforme ? 'CONFORME' : 'NÃO CONFORME'}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {/* ===== Marshall do ensaio — resultados analíticos por corpo de prova ===== */}
      {marshallEnsaio && (
        <section className="mb-4 doc-evitar-quebra">
          <h2 className="font-bold border-b mb-2">Marshall do ensaio — resultados por corpo de prova</h2>
          <p className="text-[9px] text-slate-600 mb-1">
            Teor de ligante considerado: <b>{fmt(marshallEnsaio.params.teorLigante, 2)}%</b> ·
            Gmm (Rice): <b>{fmt(marshallEnsaio.params.densMaxTeorica, 3)}</b> ·
            Densidade do ligante: <b>{fmt(marshallEnsaio.params.densidadeLigante, 3)}</b> ·
            Constante da prensa: <b>{fmt(marshallEnsaio.params.constante, 4)}</b> ·
            Correção de fluência: <b>{fmt(marshallEnsaio.params.correcaoFluencia, 3)}</b>
          </p>
          <table className="w-full border-collapse text-[8px] leading-tight">
            <thead>
              <tr className="bg-slate-100 text-center">
                <th className="border p-0.5" rowSpan={2}>CP</th>
                <th className="border p-0.5" colSpan={2}>Peso (g)</th>
                <th className="border p-0.5" colSpan={4}>Densidade</th>
                <th className="border p-0.5" colSpan={3}>V.C.B. / V.A.M. / R.B.V.</th>
                <th className="border p-0.5" colSpan={2}>Corpo de prova</th>
                <th className="border p-0.5" colSpan={3}>Estabilidade</th>
                <th className="border p-0.5" colSpan={2}>Fluência</th>
              </tr>
              <tr className="bg-slate-100 text-center">
                <th className="border p-0.5">Peso no ar</th>
                <th className="border p-0.5">Peso na água</th>
                <th className="border p-0.5">Volume cm³</th>
                <th className="border p-0.5">Densidade aparente</th>
                <th className="border p-0.5">Teórica Rice</th>
                <th className="border p-0.5">V.V (% vazios)</th>
                <th className="border p-0.5">V.C.B. (%)</th>
                <th className="border p-0.5">V.A.M. (%)</th>
                <th className="border p-0.5">R.B.V. (%)</th>
                <th className="border p-0.5">Altura cm</th>
                <th className="border p-0.5">Fator correção</th>
                <th className="border p-0.5">Leitura</th>
                <th className="border p-0.5">Calcul.</th>
                <th className="border p-0.5">Corrig. kg</th>
                <th className="border p-0.5">Leitura mm</th>
                <th className="border p-0.5">Pol.</th>
              </tr>
            </thead>
            <tbody>
              {marshallEnsaio.linhas.map(c => (
                <tr key={c.cp} className="text-center">
                  <td className="border p-0.5 font-semibold">{c.cp}</td>
                  <td className="border p-0.5">{fmt(c.pesoAr, 1)}</td>
                  <td className="border p-0.5">{fmt(c.pesoImerso, 1)}</td>
                  <td className="border p-0.5">{fmt(c.volume, 1)}</td>
                  <td className="border p-0.5">{fmt(c.densidadeAparente, 3)}</td>
                  <td className="border p-0.5">{fmt(marshallEnsaio.params.densMaxTeorica, 3)}</td>
                  <td className="border p-0.5">{fmt(c.vazios, 1)}</td>
                  <td className="border p-0.5">{fmt(c.vcb, 1)}</td>
                  <td className="border p-0.5">{fmt(c.vam, 1)}</td>
                  <td className="border p-0.5">{fmt(c.rbv, 1)}</td>
                  <td className="border p-0.5">{c.alturaCm != null ? fmt(c.alturaCm, 2) : '—'}</td>
                  <td className="border p-0.5">{fmt(c.fator, 2)}</td>
                  <td className="border p-0.5">{fmt(c.leitura, 0)}</td>
                  <td className="border p-0.5">{fmt(c.calcul, 0)}</td>
                  <td className="border p-0.5">{fmt(c.estabilidadeCorrigida, 0)}</td>
                  <td className="border p-0.5">{fmt(c.fluenciaMm, 1)}</td>
                  <td className="border p-0.5">{fmt(c.fluenciaPol, 1)}</td>
                </tr>
              ))}
              <tr className="text-center font-semibold bg-slate-50">
                <td className="border p-0.5">Média</td>
                <td className="border p-0.5">—</td>
                <td className="border p-0.5">—</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.medias.volume, 1)}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.medias.densidadeAparente, 3)}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.params.densMaxTeorica, 3)}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.medias.vazios, 1)}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.medias.vcb, 1)}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.medias.vam, 1)}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.medias.rbv, 1)}</td>
                <td className="border p-0.5">{marshallEnsaio.mediaAltura != null ? fmt(marshallEnsaio.mediaAltura, 2) : '—'}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.mediaFator, 2)}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.mediaLeitura, 0)}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.mediaCalcul, 0)}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.medias.estabilidadeCorrigida, 0)}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.medias.fluenciaMm, 1)}</td>
                <td className="border p-0.5">{fmt(marshallEnsaio.medias.fluenciaPol, 1)}</td>
              </tr>
            </tbody>
          </table>
          {marshallEnsaio.relacaoFillerLigante !== undefined && (
            <p className="text-[9px] text-slate-600 mt-1">Relação fíler/ligante: <b>{fmt(marshallEnsaio.relacaoFillerLigante, 2)}</b></p>
          )}
        </section>
      )}

      {s.granulometria && (
        <section className="mb-4 doc-evitar-quebra">
          <h2 className="font-bold border-b mb-2">Análise Granulométrica — DNER-ME 083/98</h2>
          {bruto?.gran?.peso_total != null && (
            <p className="text-[9px] text-slate-600 mb-1">Peso total da amostra: <b>{fmt(bruto.gran.peso_total, 1)} g</b></p>
          )}
          <table className="w-full border mb-3">
            <thead><tr className="bg-slate-100">
              <th className="border p-1">Peneira</th><th className="border p-1">mm</th>
              <th className="border p-1">Retido acum. (g)</th><th className="border p-1">% retida acum.</th>
              <th className="border p-1">% Passando</th><th className="border p-1">Faixa de trabalho</th><th className="border p-1">Especificada</th>
            </tr></thead>
            <tbody>{[...s.granulometria.linhas].sort((a: { aberturaMm: number }, b: { aberturaMm: number }) => b.aberturaMm - a.aberturaMm).map((l: LinhaGranulometria) => (
              <tr key={l.peneira}>
                <td className="border p-1 text-center">{l.peneira}</td>
                <td className="border p-1 text-center">{l.aberturaMm}</td>
                <td className="border p-1 text-center">{fmt(l.retidoAcum, 1)}</td>
                <td className="border p-1 text-center">{fmt(l.pctRetidaAcum, 1)}</td>
                <td className="border p-1 text-center font-semibold">{fmt(l.pctPassando, 1)}</td>
                <td className="border p-1 text-center">{l.trabMin !== undefined ? `${fmt(l.trabMin, 1)} – ${fmt(l.trabMax, 1)}` : '—'}</td>
                <td className="border p-1 text-center">{l.espMin !== undefined ? `${l.espMin} – ${l.espMax}` : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          <GraficoGranulometria linhas={s.granulometria.linhas} largura={680} />
        </section>
      )}

      {/* ===== Teor de betume — leituras cruas + resultado ===== */}
      {teorEnsaio && (
        <section className="mb-4 doc-evitar-quebra">
          <h2 className="font-bold border-b mb-2">Teor de betume — leituras</h2>
          <div className="grid grid-cols-2 gap-4">
            {teorEnsaio.row.amostra_com_betume != null && (
              <table className="w-full border-collapse text-[9px] leading-tight self-start">
                <thead><tr className="bg-slate-100 text-center"><th className="border p-0.5 text-left" colSpan={2}>Rotarex</th></tr></thead>
                <tbody>
                  <tr><td className="border p-0.5">Amostra com betume (g)</td><td className="border p-0.5 text-center">{fmt(teorEnsaio.row.amostra_com_betume, 1)}</td></tr>
                  <tr><td className="border p-0.5">Amostra sem betume (g)</td><td className="border p-0.5 text-center">{teorEnsaio.row.amostra_sem_betume != null ? fmt(teorEnsaio.row.amostra_sem_betume, 1) : '—'}</td></tr>
                  <tr><td className="border p-0.5">Umidade (%)</td><td className="border p-0.5 text-center">{fmt(teorEnsaio.row.umidade_pct ?? 0, 2)}</td></tr>
                  <tr className="bg-slate-50 font-semibold"><td className="border p-0.5">Teor de betume (%)</td><td className="border p-0.5 text-center">{teorEnsaio.rotarex != null ? fmt(teorEnsaio.rotarex, 2) : '—'}</td></tr>
                </tbody>
              </table>
            )}
            {teorEnsaio.row.rice_peso_amostra != null && (
              <table className="w-full border-collapse text-[9px] leading-tight self-start">
                <thead><tr className="bg-slate-100 text-center"><th className="border p-0.5 text-left" colSpan={2}>Rice (AASHTO T-209)</th></tr></thead>
                <tbody>
                  <tr><td className="border p-0.5">A — peso da amostra (g)</td><td className="border p-0.5 text-center">{fmt(teorEnsaio.row.rice_peso_amostra, 1)}</td></tr>
                  <tr><td className="border p-0.5">B — frasco + água (g)</td><td className="border p-0.5 text-center">{teorEnsaio.row.rice_frasco_agua != null ? fmt(teorEnsaio.row.rice_frasco_agua, 1) : '—'}</td></tr>
                  <tr><td className="border p-0.5">C — frasco + amostra + água (g)</td><td className="border p-0.5 text-center">{teorEnsaio.row.rice_frasco_amostra_agua != null ? fmt(teorEnsaio.row.rice_frasco_amostra_agua, 1) : '—'}</td></tr>
                  <tr><td className="border p-0.5">Fator de temperatura</td><td className="border p-0.5 text-center">{fmt(teorEnsaio.row.rice_fator_temp ?? 1, 4)}</td></tr>
                  <tr className="bg-slate-50 font-semibold"><td className="border p-0.5">Gmm (Rice do dia)</td><td className="border p-0.5 text-center">{teorEnsaio.rice != null ? fmt(teorEnsaio.rice, 4) : '—'}</td></tr>
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* ===== Resistência à Tração Diametral (RTD) — leituras por CP ===== */}
      {rtdEnsaio && (
        <section className="mb-4 doc-evitar-quebra">
          <h2 className="font-bold border-b mb-2">Resistência à Tração Diametral (RTD)</h2>
          <p className="text-[9px] text-slate-600 mb-1">RTD = 2·carga/(π·D·H), carga = leitura × constante da prensa, em MPa.</p>
          <table className="w-full border-collapse text-[9px] leading-tight">
            <thead><tr className="bg-slate-100 text-center">
              <th className="border p-0.5">CP</th><th className="border p-0.5">Leitura</th><th className="border p-0.5">Constante da prensa</th>
              <th className="border p-0.5">Diâmetro (cm)</th><th className="border p-0.5">Altura (cm)</th><th className="border p-0.5">RTD (MPa)</th>
            </tr></thead>
            <tbody>
              {rtdEnsaio.linhas.map(r => (
                <tr key={r.cp} className="text-center">
                  <td className="border p-0.5 font-semibold">{r.cp}</td>
                  <td className="border p-0.5">{fmt(r.leitura, 1)}</td>
                  <td className="border p-0.5">{fmt(r.constante_prensa, 4)}</td>
                  <td className="border p-0.5">{fmt(r.diametro_cm, 2)}</td>
                  <td className="border p-0.5">{fmt(r.altura_cm, 2)}</td>
                  <td className="border p-0.5 font-semibold">{r.mpa != null ? fmt(r.mpa, 3) : '—'}</td>
                </tr>
              ))}
              <tr className="text-center bg-slate-50 font-semibold">
                <td className="border p-0.5" colSpan={5}>Média</td>
                <td className="border p-0.5">{rtdEnsaio.media != null ? `${fmt(rtdEnsaio.media, 3)} MPa` : '—'}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <footer className="mt-10 grid grid-cols-2 gap-8 text-center doc-evitar-quebra">
        <div className="border-t pt-2">Laboratorista<br /><b>{e.operador ?? ''}</b></div>
        <div className="border-t pt-2">Avaliador responsável<br /><b>(assinado eletronicamente em {laudo.aprovado_em ? new Date(laudo.aprovado_em).toLocaleString('pt-BR') : '—'})</b></div>
      </footer>
      {laudo.empresas.rodape && <p className="text-xs text-slate-500 mt-6 text-center">{laudo.empresas.rodape}</p>}
    </div>
  )
}
