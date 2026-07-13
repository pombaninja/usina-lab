import { useMemo, useState } from 'react'
import {
  calcularLamelaridade, PENEIRAS_LAMELARIDADE, FRACOES_LAMELARIDADE,
  type ResultadoLamelaridadeFracoes,
} from '../../lib/calculos/lamelaridade'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'

// Índice de Lamelaridade POR FRAÇÃO avulso (DAER/RS-EL 108/01) — mesma estrutura de
// UM material da ProjetoLamelaridadePage: dados = { pesoTotal, granulometria:
// Record<peneira, peso acum. retido>, fracoes: [{passando, retido, pesoFracao,
// pesoLamelar}] } (mesmo shape de projeto_lamelaridade). Cálculo via calcularLamelaridade.

interface FracaoForm { pesoFracao: string; pesoLamelar: string }

interface DadosLamelaridade {
  pesoTotal?: number
  granulometria?: Record<string, number>
  fracoes?: { passando: string; retido: string; pesoFracao: number | null; pesoLamelar: number | null }[]
}

export default function LamelaridadeLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosLamelaridade
  const [pesoTotal, setPesoTotal] = useState(() => decimalParaTexto(d.pesoTotal))
  const [granulometria, setGranulometria] = useState<string[]>(() =>
    PENEIRAS_LAMELARIDADE.map(p => decimalParaTexto(d.granulometria?.[p])))
  const [fracoes, setFracoes] = useState<FracaoForm[]>(() => {
    const porFaixa = new Map((d.fracoes ?? []).map(f => [`${f.passando}|${f.retido}`, f]))
    return FRACOES_LAMELARIDADE.map(f => {
      const salvoF = porFaixa.get(`${f.passando}|${f.retido}`)
      return { pesoFracao: decimalParaTexto(salvoF?.pesoFracao), pesoLamelar: decimalParaTexto(salvoF?.pesoLamelar) }
    })
  })
  const [erroLocal, setErroLocal] = useState('')

  function alterarGranulometria(iP: number, valor: string) {
    setGranulometria(granulometria.map((g, gi) => (gi === iP ? sanitizarDecimal(valor) : g)))
  }
  function alterarFracao(iF: number, campo: keyof FracaoForm, valor: string) {
    setFracoes(fracoes.map((f, fi) => (fi === iF ? { ...f, [campo]: sanitizarDecimal(valor) } : f)))
  }

  const res = useMemo((): ResultadoLamelaridadeFracoes | null => {
    const peso = parseDecimal(pesoTotal)
    if (peso === null || !Number.isFinite(peso) || peso <= 0) return null
    try {
      return calcularLamelaridade(
        peso,
        granulometria.map(v => parseDecimal(v)),
        fracoes.map(f => ({ pesoFracao: parseDecimal(f.pesoFracao), pesoLamelar: parseDecimal(f.pesoLamelar) })),
      )
    } catch {
      return null
    }
  }, [pesoTotal, granulometria, fracoes])

  function salvar() {
    const peso = parseDecimal(pesoTotal)
    if (peso === null || !Number.isFinite(peso) || peso <= 0) {
      setErroLocal('Informe o peso da amostra total (> 0).'); return
    }
    const gran: Record<string, number> = {}
    PENEIRAS_LAMELARIDADE.forEach((p, iP) => {
      const v = parseDecimal(granulometria[iP])
      if (v !== null && Number.isFinite(v)) gran[p] = v
    })
    setErroLocal('')
    salvarDados({
      pesoTotal: peso,
      granulometria: gran,
      fracoes: FRACOES_LAMELARIDADE.map((f, iF) => ({
        passando: f.passando, retido: f.retido,
        pesoFracao: parseDecimal(fracoes[iF].pesoFracao),
        pesoLamelar: parseDecimal(fracoes[iF].pesoLamelar),
      })),
    })
  }

  const inp = 'border rounded p-2 w-full'
  const inpNum = 'border rounded p-1 w-24'

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-3">
      <h2 className="font-semibold text-lg text-grp-700">Índice de Lamelaridade (frações) — DAER/RS-EL 108/01</h2>
      <p className="text-sm text-slate-600">
        Informe a granulometria da amostra (peso acumulado retido em 2" … 1/4") e, para cada fração ensaiada na
        fenda, o peso da fração e o peso do material que passa. IL final = Σ(% da fração × IL) / Σ(% das frações ensaiadas).
      </p>

      <label className="text-sm block max-w-xs">Peso da amostra total (g)
        <input className={inp} inputMode="decimal" value={pesoTotal} disabled={!podeEditar}
          onChange={e => setPesoTotal(sanitizarDecimal(e.target.value))} /></label>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <h3 className="font-semibold text-sm mb-1">Granulometria da amostra</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="p-2">Peneira</th><th>Peso acum. retido (g)</th><th>Peso passante (g)</th><th>% que passa</th>
              </tr>
            </thead>
            <tbody>
              {PENEIRAS_LAMELARIDADE.map((p, iP) => {
                const g = res?.granulometria[iP]
                return (
                  <tr key={p} className="border-b">
                    <td className="p-2 font-semibold">{p}</td>
                    <td><input className={inpNum} inputMode="decimal" value={granulometria[iP]} disabled={!podeEditar}
                      onChange={e => alterarGranulometria(iP, e.target.value)} /></td>
                    <td>{g?.pesoPassanteRetido != null ? fmt(g.pesoPassanteRetido, 1) : '—'}</td>
                    <td>{g?.pctPassa != null ? fmt(g.pctPassa, 2) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto">
          <h3 className="font-semibold text-sm mb-1">Frações (fenda)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="p-2">Fração (mm)</th><th>% da fração</th><th>Peso da fração (g)</th>
                <th>Peso lamelar (g)</th><th>IL da fração</th><th>Ponderado</th>
              </tr>
            </thead>
            <tbody>
              {FRACOES_LAMELARIDADE.map((f, iF) => {
                const fr = res?.fracoes[iF]
                return (
                  <tr key={f.faixaMm} className="border-b">
                    <td className="p-2 font-semibold whitespace-nowrap">{f.faixaMm}</td>
                    <td>{fr?.pctFracao != null ? fmt(fr.pctFracao, 2) : '—'}</td>
                    <td><input className={inpNum} inputMode="decimal" value={fracoes[iF].pesoFracao} disabled={!podeEditar}
                      onChange={e => alterarFracao(iF, 'pesoFracao', e.target.value)} /></td>
                    <td><input className={inpNum} inputMode="decimal" value={fracoes[iF].pesoLamelar} disabled={!podeEditar}
                      onChange={e => alterarFracao(iF, 'pesoLamelar', e.target.value)} /></td>
                    <td>{fr?.ilFracao != null ? fmt(fr.ilFracao, 2) : '—'}</td>
                    <td>{fr?.ponderado != null ? fmt(fr.ponderado, 2) : '—'}</td>
                  </tr>
                )
              })}
              <tr className="bg-slate-50 font-semibold">
                <td className="p-2">Σ (ensaiadas)</td>
                <td>{res?.somaPctFracao != null ? fmt(res.somaPctFracao, 2) : '—'}</td>
                <td></td><td></td><td></td>
                <td>{res?.somaPonderado != null ? fmt(res.somaPonderado, 2) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-sm bg-lime-50 border border-lime-200 rounded p-2">
        IL FINAL (Σ2/Σ1): <b className="text-lime-800 text-base">{res?.ilFinal != null ? fmt(res.ilFinal, 2) : '—'}</b>
      </p>

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50"
            disabled={salvando} onClick={salvar}>Salvar ensaio</button>
          {salvo && !erro && !erroLocal && <span className="text-green-700 text-sm">Salvo.</span>}
        </div>
      )}
      {(erroLocal || erro) && <p className="text-red-600 text-sm">{erroLocal || erro}</p>}
    </section>
  )
}
