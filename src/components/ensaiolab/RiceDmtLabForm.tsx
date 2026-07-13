import { useMemo, useState } from 'react'
import { gmmRice } from '../../lib/calculos/teorBetume'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'

// Rice / DMT AVULSO (AASHTO T-209) — uma determinação: peso da amostra, frasco +
// água, frasco + amostra + água e fator de temperatura → DMT via gmmRice
// (golden-testada). dados jsonb: { peso_amostra, frasco_agua, frasco_amostra_agua,
// fator_temp } (mesmos campos rice_* de cauq_teor_betume, sem o prefixo).

interface DadosRice {
  peso_amostra?: number
  frasco_agua?: number
  frasco_amostra_agua?: number
  fator_temp?: number
}

export default function RiceDmtLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosRice
  const [rice, setRice] = useState(() => ({
    pesoAmostra: decimalParaTexto(d.peso_amostra),
    frascoAgua: decimalParaTexto(d.frasco_agua),
    frascoAmostraAgua: decimalParaTexto(d.frasco_amostra_agua),
    fator: d.fator_temp !== undefined ? decimalParaTexto(d.fator_temp) : '1',
  }))
  const [erroLocal, setErroLocal] = useState('')

  const resultado = useMemo((): { ok: true; dmt: number } | { ok: false; problema: string } | null => {
    if (rice.pesoAmostra === '' || rice.frascoAgua === '' || rice.frascoAmostraAgua === '') return null
    try {
      const dmt = gmmRice(
        parseDecimal(rice.pesoAmostra) ?? NaN,
        parseDecimal(rice.frascoAgua) ?? NaN,
        parseDecimal(rice.frascoAmostraAgua) ?? NaN,
        parseDecimal(rice.fator) ?? 1)
      return Number.isFinite(dmt) ? { ok: true, dmt } : { ok: false, problema: 'Leituras Rice inválidas.' }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [rice])

  function salvar() {
    if (rice.pesoAmostra === '' || rice.frascoAgua === '' || rice.frascoAmostraAgua === '') {
      setErroLocal('Informe as três massas da determinação Rice.'); return
    }
    if (resultado && !resultado.ok) { setErroLocal(resultado.problema); return }
    setErroLocal('')
    salvarDados({
      peso_amostra: parseDecimal(rice.pesoAmostra)!,
      frasco_agua: parseDecimal(rice.frascoAgua)!,
      frasco_amostra_agua: parseDecimal(rice.frascoAmostraAgua)!,
      fator_temp: parseDecimal(rice.fator) ?? 1,
    })
  }

  const inp = 'border rounded p-2 w-full'

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
      <h2 className="font-semibold text-lg text-grp-700">Rice / DMT — AASHTO T-209</h2>
      <p className="text-sm text-slate-500">
        DMT = A / (A + B − C) × fator, onde A = peso da amostra, B = frasco + água e C = frasco + amostra + água.
      </p>
      <div className="grid sm:grid-cols-4 gap-3 text-sm max-w-3xl">
        <label className="block">A — peso da amostra (g)
          <input className={inp} inputMode="decimal" value={rice.pesoAmostra} disabled={!podeEditar}
            onChange={e => setRice({ ...rice, pesoAmostra: sanitizarDecimal(e.target.value) })} /></label>
        <label className="block">B — frasco + água (g)
          <input className={inp} inputMode="decimal" value={rice.frascoAgua} disabled={!podeEditar}
            onChange={e => setRice({ ...rice, frascoAgua: sanitizarDecimal(e.target.value) })} /></label>
        <label className="block">C — frasco + amostra + água (g)
          <input className={inp} inputMode="decimal" value={rice.frascoAmostraAgua} disabled={!podeEditar}
            onChange={e => setRice({ ...rice, frascoAmostraAgua: sanitizarDecimal(e.target.value) })} /></label>
        <label className="block">Fator de temperatura
          <input className={inp} inputMode="decimal" value={rice.fator} disabled={!podeEditar}
            onChange={e => setRice({ ...rice, fator: sanitizarDecimal(e.target.value) })} /></label>
      </div>

      {resultado?.ok && (
        <p className="text-sm bg-lime-50 border border-lime-200 rounded p-2">
          DMT (Gmm): <b className="text-lime-800 text-base">{fmt(resultado.dmt, 4)}</b>
        </p>
      )}
      {resultado && !resultado.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{resultado.problema}</p>}

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
