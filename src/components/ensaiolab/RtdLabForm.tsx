import { useMemo, useState } from 'react'
import { calcularRtd } from '../../lib/calculos/rtd'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'

// RTD AVULSA — espelho da seção de RTD do ensaio CAUQ diário (EnsaioCauqPage):
// leitura + diâmetro + altura por CP e constante da prensa → MPa por CP + média
// via calcularRtd (golden-testada). dados jsonb espelha cauq_rtd_cp:
// { constante_prensa, cps: [{cp, leitura, diametro_cm, altura_cm}] }.

interface CpForm { leitura: string; d: string; h: string }
const cpVazio = (): CpForm => ({ leitura: '', d: '10', h: '6' })

interface DadosRtd {
  constante_prensa?: number
  cps?: { cp: number; leitura: number; diametro_cm: number; altura_cm: number }[]
}

export default function RtdLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosRtd
  const [constantePrensa, setConstantePrensa] = useState(() =>
    d.constante_prensa !== undefined ? decimalParaTexto(d.constante_prensa) : '1,79')
  const [cps, setCps] = useState<CpForm[]>(() => {
    if (!d.cps?.length) return [cpVazio(), cpVazio(), cpVazio()]
    return [1, 2, 3].map(cp => {
      const c = d.cps!.find(x => x.cp === cp)
      return c
        ? { leitura: decimalParaTexto(c.leitura), d: decimalParaTexto(c.diametro_cm), h: decimalParaTexto(c.altura_cm) }
        : cpVazio()
    })
  })
  const [erroLocal, setErroLocal] = useState('')

  function alterarCp(i: number, campo: keyof CpForm, valor: string) {
    setCps(cps.map((c, idx) => (idx === i ? { ...c, [campo]: sanitizarDecimal(valor) } : c)))
  }

  const cpsPreenchidos = useMemo(() => cps.filter(c => c.leitura !== ''), [cps])

  const calc = useMemo((): { ok: true; r: ReturnType<typeof calcularRtd> } | { ok: false; problema: string } | null => {
    if (!cpsPreenchidos.length) return null
    const k = parseDecimal(constantePrensa)
    if (k === null || !Number.isFinite(k) || k <= 0) return { ok: false, problema: 'Informe a constante da prensa.' }
    try {
      const r = calcularRtd(cpsPreenchidos.map(c => ({
        leitura: parseDecimal(c.leitura) ?? NaN,
        constantePrensa: k,
        diametroCm: parseDecimal(c.d) ?? NaN,
        alturaCm: parseDecimal(c.h) ?? NaN,
      })))
      return r.rtdMpa.every(x => Number.isFinite(x)) ? { ok: true, r } : { ok: false, problema: 'Leituras de RTD inválidas.' }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [cpsPreenchidos, constantePrensa])

  function salvar() {
    if (!cpsPreenchidos.length) { setErroLocal('Informe a leitura de ao menos um corpo de prova.'); return }
    if (!calc || !calc.ok) { setErroLocal(calc && !calc.ok ? calc.problema : 'Preencha os dados do ensaio.'); return }
    setErroLocal('')
    salvarDados({
      constante_prensa: parseDecimal(constantePrensa)!,
      cps: cps.map((c, i) => ({ ...c, cp: i + 1 }))
        .filter(c => c.leitura !== '')
        .map(c => ({
          cp: c.cp,
          leitura: parseDecimal(c.leitura)!,
          diametro_cm: parseDecimal(c.d)!,
          altura_cm: parseDecimal(c.h)!,
        })),
    })
  }

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
      <h2 className="font-semibold text-lg text-grp-700">Resistência à Tração Diametral (RTD)</h2>
      <p className="text-sm text-slate-500">RTD = 2·carga/(π·D·H), carga = leitura × constante da prensa, em MPa.</p>

      <label className="text-sm block max-w-xs">Constante da prensa
        <input className="border rounded p-2 w-full" inputMode="decimal" value={constantePrensa} disabled={!podeEditar}
          onChange={e => setConstantePrensa(sanitizarDecimal(e.target.value))} /></label>

      <table className="text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="p-2">CP</th><th>Leitura</th><th>Diâmetro (cm)</th><th>Altura (cm)</th><th>RTD (MPa)</th>
          </tr>
        </thead>
        <tbody>
          {cps.map((c, i) => {
            const mpa = calc?.ok && c.leitura !== ''
              ? calc.r.rtdMpa[cps.filter((x, j) => j < i && x.leitura !== '').length]
              : undefined
            return (
              <tr key={i} className="border-b">
                <td className="p-2 font-semibold">{i + 1}</td>
                {(['leitura', 'd', 'h'] as const).map(k => (
                  <td key={k}><input className="border rounded p-1 w-24" inputMode="decimal" value={c[k]} disabled={!podeEditar}
                    onChange={e => alterarCp(i, k, e.target.value)} /></td>
                ))}
                <td className="p-2 font-semibold">{mpa !== undefined ? fmt(mpa, 3) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {calc?.ok && <p className="text-sm bg-slate-50 rounded p-2">RTD média: <b>{fmt(calc.r.media, 3)} MPa</b></p>}
      {calc && !calc.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{calc.problema}</p>}

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
