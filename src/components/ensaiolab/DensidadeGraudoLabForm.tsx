import { useMemo, useState } from 'react'
import { densidadeAgregadoGraudo, type DensidadeGraudo } from '../../lib/calculos/densidades'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'

// Densidade do agregado graúdo avulsa (DNER-ME 081/98) — mesmo shape de determinação
// da ProjetoDensidadesPage (projeto_densidades.entradas.determinacoes, tipo
// 'agregado_graudo'): dados = { determinacoes: [{pesoArSeco, pesoSaturado, pesoImerso}] }.

interface DetForm { pesoArSeco: string; pesoSaturado: string; pesoImerso: string }
const detVazia = (): DetForm => ({ pesoArSeco: '', pesoSaturado: '', pesoImerso: '' })

interface DadosGraudo { determinacoes?: { pesoArSeco: number; pesoSaturado: number; pesoImerso: number }[] }

function media(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null && Number.isFinite(v))
  if (!validos.length) return null
  return validos.reduce((s, v) => s + v, 0) / validos.length
}

export default function DensidadeGraudoLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosGraudo
  const [dets, setDets] = useState<DetForm[]>(() =>
    d.determinacoes?.length
      ? d.determinacoes.slice(0, 3).map(det => ({
          pesoArSeco: decimalParaTexto(det.pesoArSeco),
          pesoSaturado: decimalParaTexto(det.pesoSaturado),
          pesoImerso: decimalParaTexto(det.pesoImerso),
        }))
      : [detVazia()])
  const [erroLocal, setErroLocal] = useState('')

  function alterarDet(i: number, campo: keyof DetForm, valor: string) {
    setDets(dets.map((det, idx) => (idx === i ? { ...det, [campo]: sanitizarDecimal(valor) } : det)))
  }
  function adicionarDet() { if (dets.length < 3) setDets([...dets, detVazia()]) }
  function removerDet(i: number) { setDets(dets.filter((_, idx) => idx !== i)) }

  const resultados = useMemo(() => {
    const porDet = dets.map((det): { ok: true; r: DensidadeGraudo } | { ok: false } | null => {
      if (det.pesoArSeco === '' || det.pesoSaturado === '' || det.pesoImerso === '') return null
      try {
        return { ok: true, r: densidadeAgregadoGraudo(parseDecimal(det.pesoArSeco) ?? NaN, parseDecimal(det.pesoSaturado) ?? NaN, parseDecimal(det.pesoImerso) ?? NaN) }
      } catch {
        return { ok: false }
      }
    })
    return {
      porDet,
      realMedia: media(porDet.map(x => (x?.ok ? x.r.real : null))),
      aparenteMedia: media(porDet.map(x => (x?.ok ? x.r.aparente : null))),
      absorcaoMedia: media(porDet.map(x => (x?.ok ? x.r.absorcao : null))),
    }
  }, [dets])

  function salvar() {
    const completas = dets.filter(det => det.pesoArSeco !== '' && det.pesoSaturado !== '' && det.pesoImerso !== '')
    if (!completas.length) { setErroLocal('Informe ao menos uma determinação completa (A, B e C).'); return }
    setErroLocal('')
    salvarDados({
      determinacoes: completas.map(det => ({
        pesoArSeco: parseDecimal(det.pesoArSeco)!,
        pesoSaturado: parseDecimal(det.pesoSaturado)!,
        pesoImerso: parseDecimal(det.pesoImerso)!,
      })),
    })
  }

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg text-grp-700">Densidade do agregado graúdo — DNER-ME 081/98</h2>
        {podeEditar && dets.length < 3 && (
          <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarDet}>+ Determinação</button>
        )}
      </div>
      <p className="text-sm text-slate-500">A = peso ao ar seco · B = peso ao ar saturado superfície seca · C = peso imerso (g).</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">Det.</th><th>A (g)</th><th>B (g)</th><th>C (g)</th>
              <th>Real</th><th>Aparente</th><th>Absorção (%)</th><th></th>
            </tr>
          </thead>
          <tbody>
            {dets.map((det, i) => {
              const r = resultados.porDet[i]
              return (
                <tr key={i} className="border-b">
                  <td className="p-2 font-semibold">{i + 1}</td>
                  <td><input className="border rounded p-1 w-24" inputMode="decimal" value={det.pesoArSeco} disabled={!podeEditar}
                    onChange={e => alterarDet(i, 'pesoArSeco', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-24" inputMode="decimal" value={det.pesoSaturado} disabled={!podeEditar}
                    onChange={e => alterarDet(i, 'pesoSaturado', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-24" inputMode="decimal" value={det.pesoImerso} disabled={!podeEditar}
                    onChange={e => alterarDet(i, 'pesoImerso', e.target.value)} /></td>
                  <td>{r?.ok ? fmt(r.r.real, 3) : '—'}</td>
                  <td>{r?.ok ? fmt(r.r.aparente, 3) : '—'}</td>
                  <td>{r?.ok ? fmt(r.r.absorcao, 3) : '—'}</td>
                  <td>{podeEditar && dets.length > 1 && (
                    <button type="button" className="text-red-600 text-xs" onClick={() => removerDet(i)}>×</button>
                  )}</td>
                </tr>
              )
            })}
            <tr className="bg-slate-50 font-semibold">
              <td className="p-2">Média</td><td></td><td></td><td></td>
              <td>{fmt(resultados.realMedia, 3)}</td>
              <td>{fmt(resultados.aparenteMedia, 3)}</td>
              <td>{fmt(resultados.absorcaoMedia, 3)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
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
