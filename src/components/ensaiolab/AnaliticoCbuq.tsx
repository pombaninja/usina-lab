import { useMemo } from 'react'
import { fmt } from '../../lib/formato'
import GraficoGranulometria from '../GraficoGranulometria'
import { teorRotarex, gmmRice } from '../../lib/calculos/teorBetume'
import { calcularResistenciaCompressao } from '../../lib/calculos/resistenciaCompressao'
import { calcularGranulometria, type LinhaGranulometria } from '../../lib/calculos/granulometria'
import type { EspecificacaoMistura } from './useDosagemFaixas'

// Seções ANALÍTICAS do ensaio CBUQ completo (composto) — componentes puramente
// presentacionais, EXTRAÍDOS de LaudoLabImprimirPage para reuso em duas telas:
// 1) o laudo imprimível (LaudoLabImprimirPage importa daqui — saída idêntica);
// 2) a tela do próprio ensaio (CbuqCompletoLabForm mostra os resultados
//    consolidados "conforme salvo", com o gráfico granulométrico).
// As tabelas são recalculadas das ENTRADAS BRUTAS (ensaios_lab.dados) com as
// MESMAS bibliotecas de cálculo dos formulários (src/lib/calculos).

export function mediaDe(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

export const th = 'border p-1'
export const td = 'border p-1 text-center'
export const thMini = 'border p-0.5'
export const tdMini = 'border p-0.5 text-center'

export function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 doc-evitar-quebra">
      <h2 className="font-bold text-grp-700 border-b border-grp-600 mb-2">{titulo}</h2>
      {children}
    </section>
  )
}

export function TeorBetumeLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as {
    metodo?: string
    amostra_com_betume?: number | null; amostra_sem_betume?: number | null; umidade_pct?: number | null
    // rice_* são chaves LEGADAS (Rice morava neste formulário antes de virar seção
    // própria) — preservadas nos saves; se existirem, a tabela ainda sai no laudo.
    rice_peso_amostra?: number | null; rice_frasco_agua?: number | null; rice_frasco_amostra_agua?: number | null; rice_fator_temp?: number | null
  }
  // dados legados sem `metodo` = Rotarex (era o único método gravimétrico).
  const metodo = d.metodo === 'soxhlet' ? 'Soxhlet' : 'Rotarex'
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
    <Secao titulo={`Teor de betume — método ${metodo}`}>
      <div className="grid grid-cols-2 gap-4">
        {d.amostra_com_betume != null && (
          <table className="w-full border-collapse text-[9px] leading-tight self-start">
            <thead><tr className="bg-grp-100 text-center"><th className={`${thMini} text-left`} colSpan={2}>{metodo} (extração gravimétrica)</th></tr></thead>
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

export function GranulometriaMisturaLaudo({ dados, especificacao }: { dados: Record<string, unknown>; especificacao?: EspecificacaoMistura }) {
  const d = dados as { peso_total?: number; leituras?: { peneira: string; abertura_mm: number; retido_acum: number }[] }
  const comFaixas = !!especificacao
  const calc = useMemo(() => {
    if (d.peso_total == null || !d.leituras?.length) return null
    try {
      // Com especificação (projeto vinculado no CBUQ completo): faixas de espec e
      // de trabalho — mesma semântica do CAUQ diário. Sem ela: só a curva.
      return calcularGranulometria(
        d.peso_total,
        d.leituras.map(l => ({ peneira: l.peneira, aberturaMm: l.abertura_mm, retidoAcum: l.retido_acum })),
        especificacao?.faixas, especificacao?.curvaProjeto,
      )
    } catch { return null }
  }, [d, especificacao])
  if (!calc) return null
  return (
    <Secao titulo="Análise Granulométrica da Mistura — DNER-ME 083/98">
      <p className="text-[9px] text-slate-600 mb-1">
        Peso total da amostra: <b>{fmt(d.peso_total, 1)} g</b>
        {comFaixas && <> · Faixa de trabalho = curva de projeto ± tolerância, cortada nos limites da especificação · Situação geral: <b className={calc.conforme ? 'text-green-700' : 'text-red-600'}>{calc.conforme ? 'CONFORME' : 'NÃO CONFORME'}</b></>}
      </p>
      <table className="w-full border mb-3">
        <thead><tr className="bg-grp-100">
          <th className={th}>Peneira</th><th className={th}>mm</th>
          <th className={th}>Retido acum. (g)</th><th className={th}>% retida acum.</th><th className={th}>% Passando</th>
          {comFaixas && <><th className={th}>Esp. mín</th><th className={th}>Esp. máx</th><th className={th}>Trab. mín</th><th className={th}>Trab. máx</th><th className={th}>Situação</th></>}
        </tr></thead>
        <tbody>{calc.linhas.map((l: LinhaGranulometria) => (
          <tr key={l.peneira}>
            <td className={td}>{l.peneira}</td>
            <td className={td}>{l.aberturaMm}</td>
            <td className={td}>{fmt(l.retidoAcum, 1)}</td>
            <td className={td}>{fmt(l.pctRetidaAcum, 1)}</td>
            <td className={`${td} font-semibold`}>{fmt(l.pctPassando, 1)}</td>
            {comFaixas && <>
              <td className={td}>{l.espMin !== undefined ? fmt(l.espMin, 1) : '—'}</td>
              <td className={td}>{l.espMax !== undefined ? fmt(l.espMax, 1) : '—'}</td>
              <td className={td}>{l.trabMin !== undefined ? fmt(l.trabMin, 1) : '—'}</td>
              <td className={td}>{l.trabMax !== undefined ? fmt(l.trabMax, 1) : '—'}</td>
              <td className={td}>
                {l.conforme === true && <span className="text-green-700 font-semibold">Conforme</span>}
                {l.conforme === false && <span className="text-red-600 font-semibold">NÃO CONFORME</span>}
                {l.conforme === undefined && '—'}
              </td>
            </>}
          </tr>
        ))}</tbody>
      </table>
      <GraficoGranulometria linhas={calc.linhas} largura={680} />
    </Secao>
  )
}

export function ResistenciaCompressaoLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as { constante_prensa?: number; cps?: { cp: number; leitura: number; diametro_cm: number }[] }
  const calc = useMemo(() => {
    if (d.constante_prensa == null || !d.cps?.length) return null
    try {
      const r = calcularResistenciaCompressao(d.cps.map(c => ({
        leitura: c.leitura, constantePrensa: d.constante_prensa!, diametroCm: c.diametro_cm,
      })))
      return { linhas: d.cps.map((c, i) => ({ ...c, mpa: r.rcMpa[i] })), media: r.media }
    } catch { return null }
  }, [d])
  if (!calc) return null
  return (
    <Secao titulo="Resistência à compressão">
      <p className="text-[9px] text-slate-600 mb-1">RC = carga/(π·D²/4), carga = leitura × constante da prensa ({fmt(d.constante_prensa, 4)}), em MPa.</p>
      <table className="w-full border-collapse text-[9px] leading-tight">
        <thead><tr className="bg-grp-100 text-center">
          <th className={thMini}>CP</th><th className={thMini}>Leitura</th>
          <th className={thMini}>Diâmetro (cm)</th><th className={thMini}>RC (MPa)</th>
        </tr></thead>
        <tbody>
          {calc.linhas.map(c => (
            <tr key={c.cp} className="text-center">
              <td className={`${tdMini} font-semibold`}>{c.cp}</td>
              <td className={tdMini}>{fmt(c.leitura, 1)}</td>
              <td className={tdMini}>{fmt(c.diametro_cm, 2)}</td>
              <td className={`${tdMini} font-semibold`}>{fmt(c.mpa, 3)}</td>
            </tr>
          ))}
          <tr className="text-center bg-slate-50 font-semibold">
            <td className={tdMini} colSpan={3}>Média</td>
            <td className={tdMini}>{fmt(calc.media, 3)} MPa</td>
          </tr>
        </tbody>
      </table>
    </Secao>
  )
}

export function RiceDmtLaudo({ dados }: { dados: Record<string, unknown> }) {
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

// Ensaio CBUQ COMPLETO (composto): dados = { dosagem_id?, teor_betume?,
// granulometria_mistura?, resistencia_compressao?, rice_dmt? } — cada chave de
// seção com o MESMO sub-shape do ensaio individual, na ordem definida pelo dono
// (teor de betume com o método, granulometria da mistura, resistência à compressão
// e Rice/DMT por último). Chaves legadas marshall/rtd podem existir em ensaios
// antigos: são preservadas no jsonb, mas NÃO saem mais no laudo do composto.
// Renderiza as seções presentes, em sequência, num único PDF; chaves ausentes são
// puladas (e cada seção já retorna null se as entradas forem insuficientes).
// `especificacao` (do projeto vinculado por dados.dosagem_id) vai só para a
// granulometria da mistura (faixas + 5 curvas).
export function CbuqCompletoLaudo({ dados, especificacao }: { dados: Record<string, unknown>; especificacao?: EspecificacaoMistura }) {
  const secoes: [string, (props: { dados: Record<string, unknown> }) => React.ReactNode][] = [
    ['teor_betume', TeorBetumeLaudo],
    ['granulometria_mistura', GranulometriaMisturaLaudo],
    ['resistencia_compressao', ResistenciaCompressaoLaudo],
    ['rice_dmt', RiceDmtLaudo],
  ]
  return (
    <>
      {secoes.map(([chave, Bloco]) => {
        const sub = dados[chave] as Record<string, unknown> | undefined
        if (!sub || !Object.keys(sub).length) return null
        if (chave === 'granulometria_mistura') {
          return <GranulometriaMisturaLaudo key={chave} dados={sub} especificacao={especificacao} />
        }
        return <Bloco key={chave} dados={sub} />
      })}
    </>
  )
}
