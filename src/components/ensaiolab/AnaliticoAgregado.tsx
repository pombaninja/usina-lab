import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../lib/formato'
import GraficoGranulometria from '../GraficoGranulometria'
import { mediaDe, th, td, thMini, tdMini, Secao } from './AnaliticoCbuq'
import { rotuloCurtoTipo } from './tipos'
import { calcularGranulometriaAgregado, aplicarFaixaEspecificacao, retidoLancado, type PeneiraRef, type DeterminacaoAgregado, type LinhaAgregadoFaixa } from '../../lib/calculos/agregadoGranulometria'
import type { LinhaGranulometria } from '../../lib/calculos/granulometria'
import { useEspecificacaoFaixa } from './useEspecificacaoFaixa'
import { calcularLamelaridade, PENEIRAS_LAMELARIDADE, FRACOES_LAMELARIDADE } from '../../lib/calculos/lamelaridade'
import { indiceLamelaridade } from '../../lib/calculos/indiceForma'
import { equivalenteAreia } from '../../lib/calculos/equivalenteAreia'
import { densidadeAgregadoGraudo, densidadeAgregadoMiudo } from '../../lib/calculos/densidades'

// Seções ANALÍTICAS dos ensaios de AGREGADO — componentes presentacionais
// EXTRAÍDOS de LaudoLabImprimirPage (mesma técnica do AnaliticoCbuq: movimento
// byte-idêntico, saída impressa inalterada). Recalculam das ENTRADAS BRUTAS
// (ensaios_lab.dados) com as MESMAS bibliotecas de cálculo dos formulários
// (src/lib/calculos). Usados em:
// 1) o laudo imprimível de ensaio avulso (LaudoLabImprimirPage importa daqui);
// 2) o laudo UNIFICADO de agregados (AgregadoUnificadoLaudo, ao final), que
//    imprime a seção analítica de CADA ensaio componente.

export function GranulometriaAgregadoLaudo({ dados }: { dados: Record<string, unknown> }) {
  const d = dados as {
    peneiras?: { peneira: string; aberturaMm: number }[]
    determinacoes?: { pesoTotal: number; retidos: Record<string, number> }[]
    especificacao_id?: string
  }
  // Especificação vinculada (A2, dados.especificacao_id — opcional): nome + faixa
  // passante mín/máx por peneira. SEM faixa de trabalho: ensaio avulso não tem
  // curva de projeto — a banda impressa é a própria especificação.
  const { data: espec } = useEspecificacaoFaixa(typeof d.especificacao_id === 'string' ? d.especificacao_id : undefined)
  const comFaixa = !!espec?.peneiras.length
  const calc = useMemo(() => {
    if (!d.peneiras?.length || !d.determinacoes?.length) return null
    try {
      const peneiras: PeneiraRef[] = d.peneiras.map(p => ({ peneira: p.peneira, aberturaMm: p.aberturaMm }))
      const dets: DeterminacaoAgregado[] = d.determinacoes.map(det => ({ pesoTotal: det.pesoTotal, retidos: det.retidos ?? {} }))
      const base = calcularGranulometriaAgregado(peneiras, dets)
      const faixa = espec?.peneiras.length ? aplicarFaixaEspecificacao(base, espec.peneiras) : null
      const linhas: LinhaAgregadoFaixa[] = faixa?.linhas ?? base
      const linhasGrafico: LinhaGranulometria[] = linhas.map(l => ({
        peneira: l.peneira, aberturaMm: l.aberturaMm, retidoAcum: l.retidoMedio,
        pctRetidaAcum: l.pctRetida, pctPassando: l.pctPassa,
        espMin: l.espMin, espMax: l.espMax,
      }))
      return { linhas, linhasGrafico, dets, conforme: faixa?.conforme ?? false, julgadas: faixa?.julgadas ?? 0 }
    } catch { return null }
  }, [d, espec])
  if (!calc) return null
  return (
    <Secao titulo="Análise Granulométrica — DNER-ME 083/98">
      <p className="text-[9px] text-slate-600 mb-1">
        {calc.dets.map((det, i) => <span key={i}>Det. {i + 1} — peso total: <b>{fmt(det.pesoTotal, 1)} g</b>{i < calc.dets.length - 1 ? ' · ' : ''}</span>)}
        {comFaixa && espec && <>
          {' '}· Especificação: <b>{espec.nome}{espec.norma ? ` (${espec.norma})` : ''}</b>
          {calc.julgadas > 0 && <> · Situação geral: <b className={calc.conforme ? 'text-green-700' : 'text-red-600'}>{calc.conforme ? 'CONFORME' : 'FORA DA FAIXA'}</b></>}
        </>}
      </p>
      <table className="w-full border mb-3">
        <thead><tr className="bg-grp-100">
          <th className={th}>Peneira</th><th className={th}>mm</th>
          {calc.dets.map((_, i) => <th key={i} className={th}>Det. {i + 1} — retido acum. (g)</th>)}
          <th className={th}>Retido acum. médio (g)</th><th className={th}>% retida acum.</th><th className={th}>% Passando</th>
          {comFaixa && <><th className={th}>Esp. mín</th><th className={th}>Esp. máx</th><th className={th}>Situação</th></>}
        </tr></thead>
        <tbody>{calc.linhas.map(l => (
          <tr key={l.peneira}>
            <td className={td}>{l.peneira}</td>
            <td className={td}>{l.aberturaMm}</td>
            {calc.dets.map((det, i) => {
              const retido = retidoLancado(det, l.peneira)
              return <td key={i} className={td}>{retido != null ? fmt(retido, 1) : '—'}</td>
            })}
            <td className={td}>{fmt(l.retidoMedio, 1)}</td>
            <td className={td}>{fmt(l.pctRetida, 1)}</td>
            <td className={`${td} font-semibold`}>{fmt(l.pctPassa, 1)}</td>
            {comFaixa && <>
              <td className={td}>{l.espMin !== undefined ? fmt(l.espMin, 1) : '—'}</td>
              <td className={td}>{l.espMax !== undefined ? fmt(l.espMax, 1) : '—'}</td>
              <td className={td}>
                {l.conforme === true && <span className="text-green-700 font-semibold">Conforme</span>}
                {l.conforme === false && <span className="text-red-600 font-semibold">Fora</span>}
                {l.conforme === undefined && '—'}
              </td>
            </>}
          </tr>
        ))}</tbody>
      </table>
      <GraficoGranulometria linhas={calc.linhasGrafico} largura={680} />
      {comFaixa && espec && (
        <p className="text-[9px] text-slate-600 text-center">Faixa da especificação: {espec.nome}{espec.norma ? ` (${espec.norma})` : ''}</p>
      )}
    </Secao>
  )
}

export function LamelaridadeLaudo({ dados }: { dados: Record<string, unknown> }) {
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

export function IndiceFormaLaudo({ dados }: { dados: Record<string, unknown> }) {
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

export function EquivalenteAreiaLaudo({ dados }: { dados: Record<string, unknown> }) {
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

export function DensidadeGraudoLaudo({ dados }: { dados: Record<string, unknown> }) {
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

export function DensidadeMiudoLaudo({ dados }: { dados: Record<string, unknown> }) {
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

// ===== LAUDO UNIFICADO DE AGREGADOS (B1) =====

/** Seção analítica por tipo de ensaio de AGREGADO — insumo do laudo unificado. */
export const SECOES_AGREGADO: Record<string, (props: { dados: Record<string, unknown> }) => React.ReactNode> = {
  granulometria: GranulometriaAgregadoLaudo,
  lamelaridade: LamelaridadeLaudo,
  indice_forma: IndiceFormaLaudo,
  equivalente_areia: EquivalenteAreiaLaudo,
  densidade_graudo: DensidadeGraudoLaudo,
  densidade_miudo: DensidadeMiudoLaudo,
}

/** Cópia completa de um ensaio componente congelada no snapshot do laudo na aprovação. */
export interface ComponenteUnificado {
  id: string
  numero: number
  data: string
  tipo_ensaio: string
  material_nome: string | null
  dados: Record<string, unknown>
}

function dataBr(data: string): string {
  return new Date(data + 'T12:00').toLocaleDateString('pt-BR')
}

/** Corpo do laudo UNIFICADO de agregados (tipo_ensaio = 'agregado_unificado').
 *
 *  FONTE DOS DADOS — regra de congelamento: a emissão deste laudo trava (trigger
 *  fn_bloqueia_ensaio_lab_emitido) SOMENTE a linha unificada — os ensaios
 *  COMPONENTES continuam editáveis depois. Por isso a aprovação (EnsaioLabPage)
 *  grava no snapshot CÓPIAS COMPLETAS dos `dados` de cada componente, e:
 *  - status aprovado/emitido → imprime do SNAPSHOT (a verdade congelada);
 *  - status rascunho → imprime dos componentes AO VIVO (busca por dados.ensaios). */
export function AgregadoUnificadoLaudo({ dados, status, snapshot }: {
  dados: Record<string, unknown>
  status: string
  snapshot: Record<string, unknown> | null
}) {
  const congelados = (status === 'aprovado' || status === 'emitido')
    ? ((snapshot?.componentes ?? null) as ComponenteUnificado[] | null)
    : null
  const refs = ((dados.ensaios ?? []) as { id: string }[]).map(r => r.id)
  const { data: aoVivo } = useQuery({
    queryKey: ['unificado-componentes', refs],
    enabled: !congelados?.length && refs.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('ensaios_lab')
        .select('id, numero, data, tipo_ensaio, material_nome, dados').in('id', refs)
      if (error) throw error
      const porId = new Map((data ?? []).map(c => [c.id as string, c]))
      // Preserva a ordem dos refs gravados na criação do ensaio unificado.
      return refs.map(id => porId.get(id)).filter(Boolean) as unknown as ComponenteUnificado[]
    },
  })
  const componentes = congelados?.length ? congelados : (aoVivo ?? [])
  if (!componentes.length) return <p className="text-amber-700">Laudo unificado sem ensaios componentes.</p>
  return (
    <>
      <p className="mb-3 doc-evitar-quebra">
        <b>Ensaios que compõem este laudo:</b>{' '}
        {componentes.map(c =>
          `Nº ${c.numero} (${dataBr(c.data)}) — ${rotuloCurtoTipo(c.tipo_ensaio)} — ${c.material_nome ?? '—'}`,
        ).join('; ')}
      </p>
      {componentes.map(c => {
        const Bloco = SECOES_AGREGADO[c.tipo_ensaio]
        return (
          <div key={c.id}>
            <h2 className="font-bold text-grp-700 bg-grp-100 border-b border-grp-600 mb-2 mt-4 px-1">
              Ensaio nº {c.numero} — {rotuloCurtoTipo(c.tipo_ensaio)} — {c.material_nome ?? '—'} ({dataBr(c.data)})
            </h2>
            {Bloco
              ? <Bloco dados={c.dados ?? {}} />
              : <p className="text-amber-700">Tipo de ensaio sem seção analítica cadastrada: {c.tipo_ensaio}</p>}
          </div>
        )
      })}
    </>
  )
}
