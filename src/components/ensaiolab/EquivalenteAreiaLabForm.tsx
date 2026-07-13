import { useMemo, useState } from 'react'
import { equivalenteAreia, type DeterminacaoEA } from '../../lib/calculos/equivalenteAreia'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'

// Equivalente de areia avulso (DNER-ME 054/94) — mesmo shape de determinação da
// ProjetoComplementaresPage (projeto_complementares.ea_determinacoes): dados =
// { determinacoes: [{leitura_areia, leitura_argila}] }. Cálculo via equivalenteAreia.

interface DetEAForm { leituraAreia: string; leituraArgila: string }
const detEAVazia = (): DetEAForm => ({ leituraAreia: '', leituraArgila: '' })

interface DadosEA { determinacoes?: { leitura_areia: number; leitura_argila: number }[] }

export default function EquivalenteAreiaLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosEA
  const [dets, setDets] = useState<DetEAForm[]>(() =>
    d.determinacoes?.length
      ? d.determinacoes.map(det => ({ leituraAreia: decimalParaTexto(det.leitura_areia), leituraArgila: decimalParaTexto(det.leitura_argila) }))
      : [detEAVazia()])
  const [erroLocal, setErroLocal] = useState('')

  function alterarDet(i: number, campo: keyof DetEAForm, valor: string) {
    setDets(dets.map((det, idx) => (idx === i ? { ...det, [campo]: sanitizarDecimal(valor) } : det)))
  }
  function adicionarDet() { setDets([...dets, detEAVazia()]) }
  function removerDet(i: number) { setDets(dets.filter((_, idx) => idx !== i)) }

  const detsPreenchidas = useMemo(() => dets.filter(det => det.leituraAreia !== '' && det.leituraArgila !== ''), [dets])

  const resultado = useMemo((): { ok: true; valor: number } | { ok: false; problema: string } | null => {
    if (!detsPreenchidas.length) return null
    try {
      const valor = equivalenteAreia(detsPreenchidas.map((det): DeterminacaoEA => ({
        leituraAreia: parseDecimal(det.leituraAreia) ?? NaN,
        leituraArgila: parseDecimal(det.leituraArgila) ?? NaN,
      })))
      return { ok: true, valor }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [detsPreenchidas])

  function salvar() {
    if (!detsPreenchidas.length) { setErroLocal('Informe ao menos uma determinação (leitura de areia e de argila).'); return }
    if (dets.some(det => (det.leituraAreia !== '' && det.leituraArgila === '') || (det.leituraAreia === '' && det.leituraArgila !== ''))) {
      setErroLocal('Informe as duas leituras (areia e argila) de cada determinação preenchida.'); return
    }
    if (resultado && !resultado.ok) { setErroLocal(resultado.problema); return }
    setErroLocal('')
    salvarDados({
      determinacoes: detsPreenchidas.map(det => ({
        leitura_areia: parseDecimal(det.leituraAreia)!,
        leitura_argila: parseDecimal(det.leituraArgila)!,
      })),
    })
  }

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg text-grp-700">Equivalente de areia — DNER-ME 054/94</h2>
        {podeEditar && <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarDet}>+ Determinação</button>}
      </div>
      <p className="text-sm text-slate-500">
        EA = leitura do topo da areia / leitura do topo da argila x 100, por determinação. O resultado é a média das determinações.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">Det.</th><th>Leitura areia</th><th>Leitura argila</th><th>EA (%)</th><th></th>
            </tr>
          </thead>
          <tbody>
            {dets.map((det, i) => {
              let ea: number | null = null
              if (det.leituraAreia !== '' && det.leituraArgila !== '') {
                try {
                  ea = equivalenteAreia([{ leituraAreia: parseDecimal(det.leituraAreia) ?? NaN, leituraArgila: parseDecimal(det.leituraArgila) ?? NaN }])
                } catch { ea = null }
              }
              return (
                <tr key={i} className="border-b">
                  <td className="p-2 font-semibold">{i + 1}</td>
                  <td><input className="border rounded p-1 w-24" inputMode="decimal" value={det.leituraAreia} disabled={!podeEditar}
                    onChange={e => alterarDet(i, 'leituraAreia', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-24" inputMode="decimal" value={det.leituraArgila} disabled={!podeEditar}
                    onChange={e => alterarDet(i, 'leituraArgila', e.target.value)} /></td>
                  <td>{ea !== null && Number.isFinite(ea) ? fmt(ea, 2) : '—'}</td>
                  <td>{podeEditar && dets.length > 1 && (
                    <button type="button" className="text-red-600 text-xs" onClick={() => removerDet(i)}>×</button>
                  )}</td>
                </tr>
              )
            })}
            <tr className="bg-slate-50 font-semibold">
              <td className="p-2">Resultado (média)</td><td></td><td></td>
              <td>{resultado?.ok ? fmt(resultado.valor, 2) : '—'}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
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
