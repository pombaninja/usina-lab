import { useMemo, useState } from 'react'
import { teorRotarex } from '../../lib/calculos/teorBetume'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'

// Teor de betume — método Rotarex OU Soxhlet (escolha do laboratorista). Os dois
// métodos são gravimétricos com as MESMAS entradas e fórmula (amostra com betume,
// sem betume, umidade %) via teorRotarex (golden-testada); `metodo` só registra
// qual extrator foi usado e sai no laudo. dados jsonb: { metodo, amostra_com_betume,
// amostra_sem_betume, umidade_pct }. Rice NÃO mora mais aqui (é ensaio próprio —
// seção rice_dmt): dados legados com chaves rice_* são ignorados na tela, mas
// PRESERVADOS no save (spread do objeto original, sobrescrevendo só os campos
// de teor — regra de preservação de dados).

type MetodoTeor = 'rotarex' | 'soxhlet'
export const ROTULO_METODO_TEOR: Record<MetodoTeor, string> = { rotarex: 'Rotarex', soxhlet: 'Soxhlet' }

interface DadosTeor {
  metodo?: MetodoTeor
  amostra_com_betume?: number | null
  amostra_sem_betume?: number | null
  umidade_pct?: number | null
}

export default function TeorBetumeLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosTeor
  // Legado sem `metodo` = rotarex (era o único método gravimétrico da tela).
  const [metodo, setMetodo] = useState<MetodoTeor>(() => (d.metodo === 'soxhlet' ? 'soxhlet' : 'rotarex'))
  const [teor, setTeor] = useState(() => ({
    comBetume: d.amostra_com_betume != null ? decimalParaTexto(d.amostra_com_betume) : '',
    semBetume: d.amostra_sem_betume != null ? decimalParaTexto(d.amostra_sem_betume) : '',
    umidade: d.umidade_pct != null ? decimalParaTexto(d.umidade_pct) : '0',
  }))
  const [erroLocal, setErroLocal] = useState('')

  const calc = useMemo((): { ok: true; teorPct: number } | { ok: false; problema: string } | null => {
    if (teor.comBetume === '' || teor.semBetume === '') return null
    try {
      const teorPct = teorRotarex(
        parseDecimal(teor.comBetume) ?? NaN,
        parseDecimal(teor.semBetume) ?? NaN,
        parseDecimal(teor.umidade) ?? 0)
      return Number.isFinite(teorPct) ? { ok: true, teorPct } : { ok: false, problema: 'Leituras inválidas.' }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [teor])

  function salvar() {
    if (teor.comBetume === '' || teor.semBetume === '') {
      setErroLocal('Informe os pesos da amostra com e sem betume.'); return
    }
    if (calc && !calc.ok) { setErroLocal(calc.problema); return }
    setErroLocal('')
    // Spread de `dados`: chaves desconhecidas/legadas (ex.: rice_*) sobrevivem ao
    // save — só os campos de teor (e o método) são sobrescritos.
    salvarDados({
      ...dados,
      metodo,
      amostra_com_betume: parseDecimal(teor.comBetume),
      amostra_sem_betume: parseDecimal(teor.semBetume),
      umidade_pct: parseDecimal(teor.umidade) ?? 0,
    })
  }

  const inp = 'border rounded p-2 w-full'

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
      <h2 className="font-semibold text-lg text-grp-700">Teor de betume ({ROTULO_METODO_TEOR[metodo]})</h2>
      <p className="text-sm text-slate-500">
        Extração gravimétrica — o teor é calculado ao digitar; o método escolhido sai registrado no laudo.
      </p>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="space-y-2 text-sm">
          <label className="block">Método
            <select className={inp} value={metodo} disabled={!podeEditar}
              onChange={e => setMetodo(e.target.value === 'soxhlet' ? 'soxhlet' : 'rotarex')}>
              <option value="rotarex">Rotarex</option>
              <option value="soxhlet">Soxhlet</option>
            </select></label>
          <label className="block">Amostra com betume (g)
            <input className={inp} inputMode="decimal" value={teor.comBetume} disabled={!podeEditar}
              onChange={e => setTeor({ ...teor, comBetume: sanitizarDecimal(e.target.value) })} /></label>
          <label className="block">Amostra sem betume (g)
            <input className={inp} inputMode="decimal" value={teor.semBetume} disabled={!podeEditar}
              onChange={e => setTeor({ ...teor, semBetume: sanitizarDecimal(e.target.value) })} /></label>
          <label className="block">Umidade (%)
            <input className={inp} inputMode="decimal" value={teor.umidade} disabled={!podeEditar}
              onChange={e => setTeor({ ...teor, umidade: sanitizarDecimal(e.target.value) })} /></label>
          {calc?.ok && <p className="bg-slate-50 rounded p-2">Teor de betume ({ROTULO_METODO_TEOR[metodo]}): <b>{fmt(calc.teorPct, 2)}%</b></p>}
          {calc && !calc.ok && <p className="text-amber-700 bg-amber-50 p-2 rounded">{calc.problema}</p>}
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
