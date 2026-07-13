import { useMemo, useState } from 'react'
import { teorRotarex, gmmRice } from '../../lib/calculos/teorBetume'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'

// Teor de betume AVULSO — Rotarex e/ou Rice, espelho da seção de teor do ensaio
// CAUQ diário (EnsaioCauqPage). Cálculo via teorRotarex / gmmRice (golden-testados).
// dados jsonb espelha cauq_teor_betume: { amostra_com_betume, amostra_sem_betume,
// umidade_pct, rice_peso_amostra, rice_frasco_agua, rice_frasco_amostra_agua,
// rice_fator_temp }.

interface DadosTeor {
  amostra_com_betume?: number | null
  amostra_sem_betume?: number | null
  umidade_pct?: number | null
  rice_peso_amostra?: number | null
  rice_frasco_agua?: number | null
  rice_frasco_amostra_agua?: number | null
  rice_fator_temp?: number | null
}

export default function TeorBetumeLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosTeor
  const [teor, setTeor] = useState(() => ({
    comBetume: d.amostra_com_betume != null ? decimalParaTexto(d.amostra_com_betume) : '',
    semBetume: d.amostra_sem_betume != null ? decimalParaTexto(d.amostra_sem_betume) : '',
    umidade: d.umidade_pct != null ? decimalParaTexto(d.umidade_pct) : '0',
  }))
  const [rice, setRice] = useState(() => ({
    pesoAmostra: d.rice_peso_amostra != null ? decimalParaTexto(d.rice_peso_amostra) : '',
    frascoAgua: d.rice_frasco_agua != null ? decimalParaTexto(d.rice_frasco_agua) : '',
    frascoAmostraAgua: d.rice_frasco_amostra_agua != null ? decimalParaTexto(d.rice_frasco_amostra_agua) : '',
    fator: d.rice_fator_temp != null ? decimalParaTexto(d.rice_fator_temp) : '1',
  }))
  const [erroLocal, setErroLocal] = useState('')

  const rotarexRes = useMemo((): { ok: true; teorPct: number } | { ok: false; problema: string } | null => {
    if (teor.comBetume === '' || teor.semBetume === '') return null
    try {
      const teorPct = teorRotarex(
        parseDecimal(teor.comBetume) ?? NaN,
        parseDecimal(teor.semBetume) ?? NaN,
        parseDecimal(teor.umidade) ?? 0)
      return Number.isFinite(teorPct) ? { ok: true, teorPct } : { ok: false, problema: 'Leituras Rotarex inválidas.' }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [teor])

  const riceRes = useMemo((): { ok: true; gmm: number } | { ok: false; problema: string } | null => {
    if (rice.pesoAmostra === '' || rice.frascoAgua === '' || rice.frascoAmostraAgua === '') return null
    try {
      const gmm = gmmRice(
        parseDecimal(rice.pesoAmostra) ?? NaN,
        parseDecimal(rice.frascoAgua) ?? NaN,
        parseDecimal(rice.frascoAmostraAgua) ?? NaN,
        parseDecimal(rice.fator) ?? 1)
      return Number.isFinite(gmm) ? { ok: true, gmm } : { ok: false, problema: 'Leituras Rice inválidas.' }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [rice])

  function salvar() {
    const temRotarex = teor.comBetume !== '' && teor.semBetume !== ''
    const temRice = rice.pesoAmostra !== '' && rice.frascoAgua !== '' && rice.frascoAmostraAgua !== ''
    if (!temRotarex && !temRice) {
      setErroLocal('Informe as leituras de ao menos um método (Rotarex ou Rice).'); return
    }
    if (temRotarex && rotarexRes && !rotarexRes.ok) { setErroLocal(rotarexRes.problema); return }
    if (temRice && riceRes && !riceRes.ok) { setErroLocal(riceRes.problema); return }
    setErroLocal('')
    salvarDados({
      amostra_com_betume: temRotarex ? parseDecimal(teor.comBetume) : null,
      amostra_sem_betume: temRotarex ? parseDecimal(teor.semBetume) : null,
      umidade_pct: parseDecimal(teor.umidade) ?? 0,
      rice_peso_amostra: temRice ? parseDecimal(rice.pesoAmostra) : null,
      rice_frasco_agua: temRice ? parseDecimal(rice.frascoAgua) : null,
      rice_frasco_amostra_agua: temRice ? parseDecimal(rice.frascoAmostraAgua) : null,
      rice_fator_temp: parseDecimal(rice.fator) ?? 1,
    })
  }

  const inp = 'border rounded p-2 w-full'

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
      <h2 className="font-semibold text-lg text-grp-700">Teor de betume (Rotarex / Rice)</h2>
      <p className="text-sm text-slate-500">Informe as leituras de um ou dos dois métodos — os resultados são calculados ao digitar.</p>

      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold mb-2">Rotarex</h3>
          <div className="space-y-2 text-sm">
            <label className="block">Amostra com betume (g)
              <input className={inp} inputMode="decimal" value={teor.comBetume} disabled={!podeEditar}
                onChange={e => setTeor({ ...teor, comBetume: sanitizarDecimal(e.target.value) })} /></label>
            <label className="block">Amostra sem betume (g)
              <input className={inp} inputMode="decimal" value={teor.semBetume} disabled={!podeEditar}
                onChange={e => setTeor({ ...teor, semBetume: sanitizarDecimal(e.target.value) })} /></label>
            <label className="block">Umidade (%)
              <input className={inp} inputMode="decimal" value={teor.umidade} disabled={!podeEditar}
                onChange={e => setTeor({ ...teor, umidade: sanitizarDecimal(e.target.value) })} /></label>
            {rotarexRes?.ok && <p className="bg-slate-50 rounded p-2">Teor de betume: <b>{fmt(rotarexRes.teorPct, 2)}%</b></p>}
            {rotarexRes && !rotarexRes.ok && <p className="text-amber-700 bg-amber-50 p-2 rounded">{rotarexRes.problema}</p>}
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Rice (AASHTO T-209)</h3>
          <div className="space-y-2 text-sm">
            <label className="block">Peso da amostra (g)
              <input className={inp} inputMode="decimal" value={rice.pesoAmostra} disabled={!podeEditar}
                onChange={e => setRice({ ...rice, pesoAmostra: sanitizarDecimal(e.target.value) })} /></label>
            <label className="block">Frasco + água (g)
              <input className={inp} inputMode="decimal" value={rice.frascoAgua} disabled={!podeEditar}
                onChange={e => setRice({ ...rice, frascoAgua: sanitizarDecimal(e.target.value) })} /></label>
            <label className="block">Frasco + amostra + água (g)
              <input className={inp} inputMode="decimal" value={rice.frascoAmostraAgua} disabled={!podeEditar}
                onChange={e => setRice({ ...rice, frascoAmostraAgua: sanitizarDecimal(e.target.value) })} /></label>
            <label className="block">Fator de temperatura
              <input className={inp} inputMode="decimal" value={rice.fator} disabled={!podeEditar}
                onChange={e => setRice({ ...rice, fator: sanitizarDecimal(e.target.value) })} /></label>
            {riceRes?.ok && <p className="bg-slate-50 rounded p-2">Gmm (Rice): <b>{fmt(riceRes.gmm, 4)}</b></p>}
            {riceRes && !riceRes.ok && <p className="text-amber-700 bg-amber-50 p-2 rounded">{riceRes.problema}</p>}
          </div>
        </div>
      </div>

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
