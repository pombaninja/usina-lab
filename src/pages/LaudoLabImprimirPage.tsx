import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/formato'
import GraficoGranulometria from '../components/GraficoGranulometria'
import { ROTULO_MATERIAL, ROTULO_TIPO_ENSAIO } from '../components/ensaiolab/tipos'
import { calcularMarshall, fatorCorrecaoPorVolume } from '../lib/calculos/marshall'
import { teorRotarex, gmmRice } from '../lib/calculos/teorBetume'
import { calcularRtd } from '../lib/calculos/rtd'
import { calcularGranulometria, type LinhaGranulometria } from '../lib/calculos/granulometria'
import { calcularGranulometriaAgregado, type PeneiraRef, type DeterminacaoAgregado } from '../lib/calculos/agregadoGranulometria'
import { calcularLamelaridade, PENEIRAS_LAMELARIDADE, FRACOES_LAMELARIDADE } from '../lib/calculos/lamelaridade'
import { indiceLamelaridade } from '../lib/calculos/indiceForma'
import { equivalenteAreia } from '../lib/calculos/equivalenteAreia'
import { densidadeAgregadoGraudo, densidadeAgregadoMiudo } from '../lib/calculos/densidades'

// Laudo IMPRIMÍVEL do ensaio de laboratório avulso — identidade GRP igual à do
// laudo CBUQ diário (LaudoImprimirPage). As tabelas ANALÍTICAS são renderizadas a
// partir das ENTRADAS BRUTAS de ensaios_lab.dados, recalculadas com as MESMAS
// bibliotecas de cálculo dos formulários (src/lib/calculos). A leitura ao vivo de
// ensaios_lab é estável: a emissão do laudo congela o ensaio via trigger
// (fn_bloqueia_ensaio_lab_emitido) — nada muda depois de emitido.

function mediaDe(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

const th = 'border p-1'
const td = 'border p-1 text-center'
const thMini = 'border p-0.5'
const tdMini = 'border p-0.5 text-center'

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 doc-evitar-quebra">
      <h2 className="font-bold text-grp-700 border-b border-grp-600 mb-2">{titulo}</h2>
      {children}
    </section>
  )
}

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

function TeorBetumeLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as {
    amostra_com_betume?: number | null; amostra_sem_betume?: number | null; umidade_pct?: number | null
    rice_peso_amostra?: number | null; rice_frasco_agua?: number | null; rice_frasco_amostra_agua?: number | null; rice_fator_temp?: number | null
  }
  const rotarex = useMemo(() => {
    if (d.amostra_com_betume == null || d.amostra_sem_betume == null) return null
    try { return teorRotarex(d.amostra_com_betume, d.amostra_sem_betume, d.umidade_pct ?? 0) } catch { return null }
  }, [d])
  const rice = useMemo(() => {
    if (d.rice_peso_amostra == null || d.rice_frasco_agua == null || d.rice_frasco_amostra_agua == null) return null
    try { return gmmRice(d.rice_peso_amostra, d.rice_frasco_agua, d.rice_frasco_amostra_agua, d.rice_fator_temp ?? 1) } catch { return null }
  }, [d])
  if (d.amostra_com_betume == null && d.rice_peso_amostra == null) return null
  return (
    <Secao titulo="Teor de betume — leituras e resultados">
      <div className="grid grid-cols-2 gap-4">
        {d.amostra_com_betume != null && (
          <table className="w-full border-collapse text-[9px] leading-tight self-start">
            <thead><tr className="bg-grp-100 text-center"><th className={`${thMini} text-left`} colSpan={2}>Rotarex</th></tr></thead>
            <tbody>
              <tr><td className={thMini}>Amostra com betume (g)</td><td className={tdMini}>{fmt(d.amostra_com_betume, 1)}</td></tr>
              <tr><td className={thMini}>Amostra sem betume (g)</td><td className={tdMini}>{d.amostra_sem_betume != null ? fmt(d.amostra_sem_betume, 1) : '—'}</td></tr>
              <tr><td className={thMini}>Umidade (%)</td><td className={tdMini}>{fmt(d.umidade_pct ?? 0, 2)}</td></tr>
              <tr className="bg-slate-50 font-semibold"><td className={thMini}>Teor de betume (%)</td><td className={tdMini}>{rotarex != null ? fmt(rotarex, 2) : '—'}</td></tr>
            </tbody>
          </table>
        )}
        {d.rice_peso_amostra != null && (
          <table className="w-full border-collapse text-[9px] leading-tight self-start">
            <thead><tr className="bg-grp-100 text-center"><th className={`${thMini} text-left`} colSpan={2}>Rice (AASHTO T-209)</th></tr></thead>
            <tbody>
              <tr><td className={thMini}>A — peso da amostra (g)</td><td className={tdMini}>{fmt(d.rice_peso_amostra, 1)}</td></tr>
              <tr><td className={thMini}>B — frasco + água (g)</td><td className={tdMini}>{d.rice_frasco_agua != null ? fmt(d.rice_frasco_agua, 1) : '—'}</td></tr>
              <tr><td className={thMini}>C — frasco + amostra + água (g)</td><td className={tdMini}>{d.rice_frasco_amostra_agua != null ? fmt(d.rice_frasco_amostra_agua, 1) : '—'}</td></tr>
              <tr><td className={thMini}>Fator de temperatura</td><td className={tdMini}>{fmt(d.rice_fator_temp ?? 1, 4)}</td></tr>
              <tr className="bg-slate-50 font-semibold"><td className={thMini}>Gmm (Rice)</td><td className={tdMini}>{rice != null ? fmt(rice, 4) : '—'}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </Secao>
  )
}

function GranulometriaMisturaLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as { peso_total?: number; leituras?: { peneira: string; abertura_mm: number; retido_acum: number }[] }
  const calc = useMemo(() => {
    if (d.peso_total == null || !d.leituras?.length) return null
    try {
      // Sem faixas: ensaio avulso não tem especificação vinculada.
      return calcularGranulometria(d.peso_total, d.leituras.map(l => ({ peneira: l.peneira, aberturaMm: l.abertura_mm, retidoAcum: l.retido_acum })))
    } catch { return null }
  }, [d])
  if (!calc) return null
  return (
    <Secao titulo="Análise Granulométrica da Mistura — DNER-ME 083/98">
      <p className="text-[9px] text-slate-600 mb-1">Peso total da amostra: <b>{fmt(d.peso_total, 1)} g</b></p>
      <table className="w-full border mb-3">
        <thead><tr className="bg-grp-100">
          <th className={th}>Peneira</th><th className={th}>mm</th>
          <th className={th}>Retido acum. (g)</th><th className={th}>% retida acum.</th><th className={th}>% Passando</th>
        </tr></thead>
        <tbody>{calc.linhas.map((l: LinhaGranulometria) => (
          <tr key={l.peneira}>
            <td className={td}>{l.peneira}</td>
            <td className={td}>{l.aberturaMm}</td>
            <td className={td}>{fmt(l.retidoAcum, 1)}</td>
            <td className={td}>{fmt(l.pctRetidaAcum, 1)}</td>
            <td className={`${td} font-semibold`}>{fmt(l.pctPassando, 1)}</td>
          </tr>
        ))}</tbody>
      </table>
      <GraficoGranulometria linhas={calc.linhas} largura={680} />
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

function RiceDmtLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as { peso_amostra?: number; frasco_agua?: number; frasco_amostra_agua?: number; fator_temp?: number }
  const dmt = useMemo(() => {
    if (d.peso_amostra == null || d.frasco_agua == null || d.frasco_amostra_agua == null) return null
    try { return gmmRice(d.peso_amostra, d.frasco_agua, d.frasco_amostra_agua, d.fator_temp ?? 1) } catch { return null }
  }, [d])
  if (d.peso_amostra == null) return null
  return (
    <Secao titulo="Rice / DMT — AASHTO T-209">
      <table className="w-1/2 border-collapse text-[9px] leading-tight">
        <tbody>
          <tr><td className={thMini}>A — peso da amostra (g)</td><td className={tdMini}>{fmt(d.peso_amostra, 1)}</td></tr>
          <tr><td className={thMini}>B — frasco + água (g)</td><td className={tdMini}>{d.frasco_agua != null ? fmt(d.frasco_agua, 1) : '—'}</td></tr>
          <tr><td className={thMini}>C — frasco + amostra + água (g)</td><td className={tdMini}>{d.frasco_amostra_agua != null ? fmt(d.frasco_amostra_agua, 1) : '—'}</td></tr>
          <tr><td className={thMini}>Fator de temperatura</td><td className={tdMini}>{fmt(d.fator_temp ?? 1, 4)}</td></tr>
          <tr className="bg-slate-50 font-semibold"><td className={thMini}>DMT (Gmm)</td><td className={tdMini}>{dmt != null ? fmt(dmt, 4) : '—'}</td></tr>
        </tbody>
      </table>
    </Secao>
  )
}

// Ensaio CBUQ COMPLETO (composto): dados = { marshall?, teor_betume?,
// granulometria_mistura?, rtd?, rice_dmt? } — cada chave com o MESMO sub-shape do
// ensaio individual. Renderiza TODAS as seções analíticas presentes, em sequência,
// num único PDF; chaves ausentes são puladas (e cada seção já retorna null se as
// entradas forem insuficientes).
function CbuqCompletoLaudo({ dados }: { dados: Record<string, unknown> }) {
  const secoes: [string, (props: { dados: Record<string, unknown> }) => React.ReactNode][] = [
    ['marshall', MarshallLaudo],
    ['teor_betume', TeorBetumeLaudo],
    ['granulometria_mistura', GranulometriaMisturaLaudo],
    ['rtd', RtdLaudo],
    ['rice_dmt', RiceDmtLaudo],
  ]
  return (
    <>
      {secoes.map(([chave, Bloco]) => {
        const sub = dados[chave] as Record<string, unknown> | undefined
        if (!sub || !Object.keys(sub).length) return null
        return <Bloco key={chave} dados={sub} />
      })}
    </>
  )
}

// ===== AGREGADO =====

function GranulometriaAgregadoLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as {
    peneiras?: { peneira: string; aberturaMm: number }[]
    determinacoes?: { pesoTotal: number; retidos: Record<string, number> }[]
  }
  const calc = useMemo(() => {
    if (!d.peneiras?.length || !d.determinacoes?.length) return null
    try {
      const peneiras: PeneiraRef[] = d.peneiras.map(p => ({ peneira: p.peneira, aberturaMm: p.aberturaMm }))
      const dets: DeterminacaoAgregado[] = d.determinacoes.map(det => ({ pesoTotal: det.pesoTotal, retidos: det.retidos ?? {} }))
      const linhas = calcularGranulometriaAgregado(peneiras, dets)
      const linhasGrafico: LinhaGranulometria[] = linhas.map(l => ({
        peneira: l.peneira, aberturaMm: l.aberturaMm, retidoAcum: l.retidoMedio,
        pctRetidaAcum: l.pctRetida, pctPassando: l.pctPassa,
      }))
      return { linhas, linhasGrafico, dets }
    } catch { return null }
  }, [d])
  if (!calc) return null
  return (
    <Secao titulo="Análise Granulométrica — DNER-ME 083/98">
      <p className="text-[9px] text-slate-600 mb-1">
        {calc.dets.map((det, i) => <span key={i}>Det. {i + 1} — peso total: <b>{fmt(det.pesoTotal, 1)} g</b>{i < calc.dets.length - 1 ? ' · ' : ''}</span>)}
      </p>
      <table className="w-full border mb-3">
        <thead><tr className="bg-grp-100">
          <th className={th}>Peneira</th><th className={th}>mm</th>
          <th className={th}>Retido acum. médio (g)</th><th className={th}>% retida acum.</th><th className={th}>% Passando</th>
        </tr></thead>
        <tbody>{calc.linhas.map(l => (
          <tr key={l.peneira}>
            <td className={td}>{l.peneira}</td>
            <td className={td}>{l.aberturaMm}</td>
            <td className={td}>{fmt(l.retidoMedio, 1)}</td>
            <td className={td}>{fmt(l.pctRetida, 1)}</td>
            <td className={`${td} font-semibold`}>{fmt(l.pctPassa, 1)}</td>
          </tr>
        ))}</tbody>
      </table>
      <GraficoGranulometria linhas={calc.linhasGrafico} largura={680} />
    </Secao>
  )
}

function LamelaridadeLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as {
    pesoTotal?: number
    granulometria?: Record<string, number>
    fracoes?: { passando: string; retido: string; pesoFracao: number | null; pesoLamelar: number | null }[]
  }
  const calc = useMemo(() => {
    if (d.pesoTotal == null || d.pesoTotal <= 0) return null
    try {
      const porFaixa = new Map((d.fracoes ?? []).map(f => [`${f.passando}|${f.retido}`, f]))
      return calcularLamelaridade(
        d.pesoTotal,
        PENEIRAS_LAMELARIDADE.map(p => d.granulometria?.[p] ?? null),
        FRACOES_LAMELARIDADE.map(f => {
          const s = porFaixa.get(`${f.passando}|${f.retido}`)
          return { pesoFracao: s?.pesoFracao ?? null, pesoLamelar: s?.pesoLamelar ?? null }
        }),
      )
    } catch { return null }
  }, [d])
  if (!calc) return null
  return (
    <Secao titulo="Índice de Lamelaridade (frações) — DAER/RS-EL 108/01">
      <p className="text-[9px] text-slate-600 mb-1">Peso da amostra total: <b>{fmt(d.pesoTotal, 1)} g</b></p>
      <div className="grid grid-cols-2 gap-4">
        <table className="w-full border-collapse text-[9px] leading-tight self-start">
          <thead><tr className="bg-grp-100 text-center">
            <th className={thMini}>Peneira</th><th className={thMini}>Retido acum. (g)</th>
            <th className={thMini}>Passante (g)</th><th className={thMini}>% passa</th>
          </tr></thead>
          <tbody>{calc.granulometria.map(g => (
            <tr key={g.peneira} className="text-center">
              <td className={`${tdMini} font-semibold`}>{g.peneira}</td>
              <td className={tdMini}>{g.pesoAcumRetido != null ? fmt(g.pesoAcumRetido, 1) : '—'}</td>
              <td className={tdMini}>{g.pesoPassanteRetido != null ? fmt(g.pesoPassanteRetido, 1) : '—'}</td>
              <td className={tdMini}>{g.pctPassa != null ? fmt(g.pctPassa, 2) : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        <table className="w-full border-collapse text-[9px] leading-tight self-start">
          <thead><tr className="bg-grp-100 text-center">
            <th className={thMini}>Fração (mm)</th><th className={thMini}>% fração</th><th className={thMini}>Peso fração (g)</th>
            <th className={thMini}>Peso lamelar (g)</th><th className={thMini}>IL</th><th className={thMini}>Ponderado</th>
          </tr></thead>
          <tbody>
            {calc.fracoes.map(f => (
              <tr key={f.faixaMm} className="text-center">
                <td className={`${tdMini} font-semibold whitespace-nowrap`}>{f.faixaMm}</td>
                <td className={tdMini}>{f.pctFracao != null ? fmt(f.pctFracao, 2) : '—'}</td>
                <td className={tdMini}>{f.pesoFracao != null ? fmt(f.pesoFracao, 1) : '—'}</td>
                <td className={tdMini}>{f.pesoLamelar != null ? fmt(f.pesoLamelar, 1) : '—'}</td>
                <td className={tdMini}>{f.ilFracao != null ? fmt(f.ilFracao, 2) : '—'}</td>
                <td className={tdMini}>{f.ponderado != null ? fmt(f.ponderado, 2) : '—'}</td>
              </tr>
            ))}
            <tr className="text-center bg-slate-50 font-semibold">
              <td className={tdMini}>Σ (ensaiadas)</td>
              <td className={tdMini}>{calc.somaPctFracao != null ? fmt(calc.somaPctFracao, 2) : '—'}</td>
              <td className={tdMini} colSpan={3}>IL FINAL (Σ2/Σ1)</td>
              <td className={tdMini}>{calc.ilFinal != null ? fmt(calc.ilFinal, 2) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Secao>
  )
}

function IndiceFormaLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as { graos?: { espessura: number; comprimento: number }[] }
  const calc = useMemo(() => {
    if (!d.graos?.length) return null
    try { return indiceLamelaridade(d.graos) } catch { return null }
  }, [d])
  if (!calc || !d.graos) return null
  return (
    <Secao titulo="Índice de forma (grão a grão) — NBR 7809 / DNIT 425/2020">
      <table className="w-1/2 border mb-2">
        <tbody>
          <tr><td className={th}>Total de grãos medidos</td><td className={td}>{calc.totalGraos}</td></tr>
          <tr><td className={th}>Grãos lamelares (IL ≥ 3)</td><td className={td}>{calc.lamelares}</td></tr>
          <tr><td className={th}>% lamelar</td><td className={`${td} font-semibold`}>{fmt(calc.pctLamelar, 2)}%</td></tr>
          <tr className="bg-slate-50 font-semibold"><td className={th}>Média do IL (C/E)</td><td className={td}>{fmt(calc.mediaIL, 3)}</td></tr>
        </tbody>
      </table>
      <p className="text-[9px] text-slate-600 mb-1">Medições por grão — espessura E × comprimento C (mm), IL = C/E:</p>
      <div className="text-[8px] leading-tight columns-4 gap-2">
        {d.graos.map((g, i) => (
          <p key={i} className="border-b border-slate-200">
            {i + 1}: E {fmt(g.espessura, 2)} · C {fmt(g.comprimento, 2)} · IL {g.espessura > 0 ? fmt(g.comprimento / g.espessura, 2) : '—'}
          </p>
        ))}
      </div>
    </Secao>
  )
}

function EquivalenteAreiaLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as { determinacoes?: { leitura_areia: number; leitura_argila: number }[] }
  const calc = useMemo(() => {
    if (!d.determinacoes?.length) return null
    try {
      return {
        media: equivalenteAreia(d.determinacoes.map(det => ({ leituraAreia: det.leitura_areia, leituraArgila: det.leitura_argila }))),
        porDet: d.determinacoes.map(det => {
          try { return equivalenteAreia([{ leituraAreia: det.leitura_areia, leituraArgila: det.leitura_argila }]) } catch { return null }
        }),
      }
    } catch { return null }
  }, [d])
  if (!calc || !d.determinacoes) return null
  return (
    <Secao titulo="Equivalente de areia — DNER-ME 054/94">
      <table className="w-2/3 border">
        <thead><tr className="bg-grp-100">
          <th className={th}>Det.</th><th className={th}>Leitura areia</th><th className={th}>Leitura argila</th><th className={th}>EA (%)</th>
        </tr></thead>
        <tbody>
          {d.determinacoes.map((det, i) => (
            <tr key={i}>
              <td className={`${td} font-semibold`}>{i + 1}</td>
              <td className={td}>{fmt(det.leitura_areia, 1)}</td>
              <td className={td}>{fmt(det.leitura_argila, 1)}</td>
              <td className={td}>{calc.porDet[i] != null ? fmt(calc.porDet[i], 2) : '—'}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold">
            <td className={td} colSpan={3}>Resultado (média)</td>
            <td className={td}>{fmt(calc.media, 2)}</td>
          </tr>
        </tbody>
      </table>
    </Secao>
  )
}

function DensidadeGraudoLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as { determinacoes?: { pesoArSeco: number; pesoSaturado: number; pesoImerso: number }[] }
  const calc = useMemo(() => {
    if (!d.determinacoes?.length) return null
    const porDet = d.determinacoes.map(det => {
      try { return densidadeAgregadoGraudo(det.pesoArSeco, det.pesoSaturado, det.pesoImerso) } catch { return null }
    })
    return {
      porDet,
      real: mediaDe(porDet.map(r => r?.real)),
      aparente: mediaDe(porDet.map(r => r?.aparente)),
      absorcao: mediaDe(porDet.map(r => r?.absorcao)),
    }
  }, [d])
  if (!calc || !d.determinacoes) return null
  return (
    <Secao titulo="Densidade do agregado graúdo — DNER-ME 081/98">
      <p className="text-[9px] text-slate-600 mb-1">A = peso ao ar seco · B = peso ao ar saturado superfície seca · C = peso imerso (g).</p>
      <table className="w-full border">
        <thead><tr className="bg-grp-100">
          <th className={th}>Det.</th><th className={th}>A (g)</th><th className={th}>B (g)</th><th className={th}>C (g)</th>
          <th className={th}>Real</th><th className={th}>Aparente</th><th className={th}>Absorção (%)</th>
        </tr></thead>
        <tbody>
          {d.determinacoes.map((det, i) => {
            const r = calc.porDet[i]
            return (
              <tr key={i}>
                <td className={`${td} font-semibold`}>{i + 1}</td>
                <td className={td}>{fmt(det.pesoArSeco, 1)}</td>
                <td className={td}>{fmt(det.pesoSaturado, 1)}</td>
                <td className={td}>{fmt(det.pesoImerso, 1)}</td>
                <td className={td}>{r ? fmt(r.real, 3) : '—'}</td>
                <td className={td}>{r ? fmt(r.aparente, 3) : '—'}</td>
                <td className={td}>{r ? fmt(r.absorcao, 3) : '—'}</td>
              </tr>
            )
          })}
          <tr className="bg-slate-50 font-semibold">
            <td className={td} colSpan={4}>Média</td>
            <td className={td}>{fmt(calc.real, 3)}</td>
            <td className={td}>{fmt(calc.aparente, 3)}</td>
            <td className={td}>{fmt(calc.absorcao, 3)}</td>
          </tr>
        </tbody>
      </table>
    </Secao>
  )
}

function DensidadeMiudoLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as {
    determinacoes?: { pesoPicnometro: number; pesoPicAgregado: number; pesoPicAgua: number; pesoPicAgregadoAgua: number; fatorCorrecaoTemp?: number }[]
  }
  const calc = useMemo(() => {
    if (!d.determinacoes?.length) return null
    const porDet = d.determinacoes.map(det => {
      try {
        return densidadeAgregadoMiudo(det.pesoPicnometro, det.pesoPicAgregado, det.pesoPicAgua, det.pesoPicAgregadoAgua, det.fatorCorrecaoTemp ?? 1)
      } catch { return null }
    })
    return { porDet, media: mediaDe(porDet) }
  }, [d])
  if (!calc || !d.determinacoes) return null
  return (
    <Secao titulo="Densidade do agregado miúdo — picnômetro (DNER-ME 084/95)">
      <table className="w-full border">
        <thead><tr className="bg-grp-100">
          <th className={th}>Det.</th><th className={th}>Picnômetro (g)</th><th className={th}>Pic.+agregado (g)</th>
          <th className={th}>Pic.+água (g)</th><th className={th}>Pic.+agreg.+água (g)</th><th className={th}>Fator temp.</th><th className={th}>Real</th>
        </tr></thead>
        <tbody>
          {d.determinacoes.map((det, i) => (
            <tr key={i}>
              <td className={`${td} font-semibold`}>{i + 1}</td>
              <td className={td}>{fmt(det.pesoPicnometro, 1)}</td>
              <td className={td}>{fmt(det.pesoPicAgregado, 1)}</td>
              <td className={td}>{fmt(det.pesoPicAgua, 1)}</td>
              <td className={td}>{fmt(det.pesoPicAgregadoAgua, 1)}</td>
              <td className={td}>{fmt(det.fatorCorrecaoTemp ?? 1, 4)}</td>
              <td className={td}>{calc.porDet[i] != null ? fmt(calc.porDet[i], 3) : '—'}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold">
            <td className={td} colSpan={6}>Média</td>
            <td className={td}>{fmt(calc.media, 3)}</td>
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
  rtd: RtdLaudo,
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
  empresas: { razao_social: string; nome_exibicao: string; cnpj: string | null; cabecalho: string | null; rodape: string | null }
  ensaios_lab: { data: string; material_tipo: string; material_nome: string | null; origem: string | null; tipo_ensaio: string; dados: Record<string, unknown> } | null
}

export default function LaudoLabImprimirPage() {
  const { id } = useParams()
  const { data: laudo } = useQuery({
    queryKey: ['laudo-lab-print', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('laudos')
        .select('id, numero, revisao, status, emitido_em, aprovado_em, ensaio_lab_id, empresas(razao_social, nome_exibicao, cnpj, cabecalho, rodape), ensaios_lab(data, material_tipo, material_nome, origem, tipo_ensaio, dados)')
        .eq('id', id).single()
      if (error) throw error
      return data as unknown as LaudoLab
    },
  })

  if (!laudo) return <p>Carregando…</p>
  const e = laudo.ensaios_lab
  if (!e) return <p className="text-red-600">Este laudo não é de um ensaio de laboratório avulso.</p>
  const Corpo = SECOES_POR_TIPO[e.tipo_ensaio]

  return (
    <div className="max-w-[210mm] mx-auto bg-white p-8 text-sm print:p-0">
      <button onClick={() => window.print()} className="print:hidden mb-4 bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2">
        Imprimir / Salvar PDF
      </button>

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
        <p><b>Data do ensaio:</b> {new Date(e.data + 'T12:00').toLocaleDateString('pt-BR')}</p>
      </section>

      {Corpo
        ? <Corpo dados={e.dados ?? {}} />
        : <p className="text-amber-700">Tipo de ensaio sem seção analítica cadastrada: {e.tipo_ensaio}</p>}

      <footer className="mt-10 grid grid-cols-2 gap-8 text-center doc-evitar-quebra">
        <div className="border-t pt-2">Laboratorista<br /><b>&nbsp;</b></div>
        <div className="border-t pt-2">Avaliador responsável<br /><b>(assinado eletronicamente em {laudo.aprovado_em ? new Date(laudo.aprovado_em).toLocaleString('pt-BR') : '—'})</b></div>
      </footer>
      {laudo.empresas.rodape && <p className="text-xs text-slate-500 mt-6 text-center">{laudo.empresas.rodape}</p>}
    </div>
  )
}
