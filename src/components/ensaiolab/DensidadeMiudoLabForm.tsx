import { useMemo, useState } from 'react'
import { densidadeAgregadoMiudo } from '../../lib/calculos/densidades'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'

// Densidade do agregado miúdo avulsa (picnômetro, DNER-ME 084/95) — mesmo shape de
// determinação da ProjetoDensidadesPage (projeto_densidades.entradas.determinacoes,
// tipo 'agregado_miudo'): dados = { determinacoes: [{pesoPicnometro, pesoPicAgregado,
// pesoPicAgua, pesoPicAgregadoAgua, fatorCorrecaoTemp}] }.

interface DetForm { pesoPicnometro: string; pesoPicAgregado: string; pesoPicAgua: string; pesoPicAgregadoAgua: string; fatorCorrecaoTemp: string }
const detVazia = (): DetForm => ({ pesoPicnometro: '', pesoPicAgregado: '', pesoPicAgua: '', pesoPicAgregadoAgua: '', fatorCorrecaoTemp: '1' })

interface DadosMiudo {
  determinacoes?: { pesoPicnometro: number; pesoPicAgregado: number; pesoPicAgua: number; pesoPicAgregadoAgua: number; fatorCorrecaoTemp?: number }[]
}

function media(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null && Number.isFinite(v))
  if (!validos.length) return null
  return validos.reduce((s, v) => s + v, 0) / validos.length
}

export default function DensidadeMiudoLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosMiudo
  const [dets, setDets] = useState<DetForm[]>(() =>
    d.determinacoes?.length
      ? d.determinacoes.slice(0, 3).map(det => ({
          pesoPicnometro: decimalParaTexto(det.pesoPicnometro),
          pesoPicAgregado: decimalParaTexto(det.pesoPicAgregado),
          pesoPicAgua: decimalParaTexto(det.pesoPicAgua),
          pesoPicAgregadoAgua: decimalParaTexto(det.pesoPicAgregadoAgua),
          fatorCorrecaoTemp: det.fatorCorrecaoTemp !== undefined ? decimalParaTexto(det.fatorCorrecaoTemp) : '1',
        }))
      : [detVazia()])
  const [erroLocal, setErroLocal] = useState('')

  function alterarDet(i: number, campo: keyof DetForm, valor: string) {
    setDets(dets.map((det, idx) => (idx === i ? { ...det, [campo]: sanitizarDecimal(valor) } : det)))
  }
  function adicionarDet() { if (dets.length < 3) setDets([...dets, detVazia()]) }
  function removerDet(i: number) { setDets(dets.filter((_, idx) => idx !== i)) }

  const resultados = useMemo(() => {
    const porDet = dets.map((det): { ok: true; real: number } | { ok: false } | null => {
      if (det.pesoPicnometro === '' || det.pesoPicAgregado === '' || det.pesoPicAgua === '' || det.pesoPicAgregadoAgua === '') return null
      try {
        const fator = det.fatorCorrecaoTemp === '' ? 1 : parseDecimal(det.fatorCorrecaoTemp) ?? 1
        const real = densidadeAgregadoMiudo(
          parseDecimal(det.pesoPicnometro) ?? NaN, parseDecimal(det.pesoPicAgregado) ?? NaN,
          parseDecimal(det.pesoPicAgua) ?? NaN, parseDecimal(det.pesoPicAgregadoAgua) ?? NaN, fator)
        return { ok: true, real }
      } catch {
        return { ok: false }
      }
    })
    return { porDet, realMedia: media(porDet.map(x => (x?.ok ? x.real : null))) }
  }, [dets])

  function salvar() {
    const completas = dets.filter(det => det.pesoPicnometro !== '' && det.pesoPicAgregado !== '' && det.pesoPicAgua !== '' && det.pesoPicAgregadoAgua !== '')
    if (!completas.length) { setErroLocal('Informe ao menos uma determinação completa do picnômetro.'); return }
    setErroLocal('')
    salvarDados({
      determinacoes: completas.map(det => ({
        pesoPicnometro: parseDecimal(det.pesoPicnometro)!,
        pesoPicAgregado: parseDecimal(det.pesoPicAgregado)!,
        pesoPicAgua: parseDecimal(det.pesoPicAgua)!,
        pesoPicAgregadoAgua: parseDecimal(det.pesoPicAgregadoAgua)!,
        fatorCorrecaoTemp: det.fatorCorrecaoTemp === '' ? 1 : parseDecimal(det.fatorCorrecaoTemp) ?? 1,
      })),
    })
  }

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg text-grp-700">Densidade do agregado miúdo — picnômetro (DNER-ME 084/95)</h2>
        {podeEditar && dets.length < 3 && (
          <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarDet}>+ Determinação</button>
        )}
      </div>
      <p className="text-sm text-slate-500">
        Peso do picnômetro · picnômetro + agregado seco · picnômetro + água · picnômetro + agregado + água (g).
        Fator de correção de temperatura opcional (tabela DNER; padrão 1 = sem correção).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">Det.</th><th>Picnômetro</th><th>Pic.+agregado</th><th>Pic.+água</th><th>Pic.+agreg.+água</th>
              <th>Fator temp.</th><th>Real</th><th></th>
            </tr>
          </thead>
          <tbody>
            {dets.map((det, i) => {
              const r = resultados.porDet[i]
              return (
                <tr key={i} className="border-b">
                  <td className="p-2 font-semibold">{i + 1}</td>
                  <td><input className="border rounded p-1 w-24" inputMode="decimal" value={det.pesoPicnometro} disabled={!podeEditar}
                    onChange={e => alterarDet(i, 'pesoPicnometro', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-24" inputMode="decimal" value={det.pesoPicAgregado} disabled={!podeEditar}
                    onChange={e => alterarDet(i, 'pesoPicAgregado', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-24" inputMode="decimal" value={det.pesoPicAgua} disabled={!podeEditar}
                    onChange={e => alterarDet(i, 'pesoPicAgua', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-24" inputMode="decimal" value={det.pesoPicAgregadoAgua} disabled={!podeEditar}
                    onChange={e => alterarDet(i, 'pesoPicAgregadoAgua', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-20" inputMode="decimal" value={det.fatorCorrecaoTemp} disabled={!podeEditar}
                    onChange={e => alterarDet(i, 'fatorCorrecaoTemp', e.target.value)} /></td>
                  <td>{r?.ok ? fmt(r.real, 3) : '—'}</td>
                  <td>{podeEditar && dets.length > 1 && (
                    <button type="button" className="text-red-600 text-xs" onClick={() => removerDet(i)}>×</button>
                  )}</td>
                </tr>
              )
            })}
            <tr className="bg-slate-50 font-semibold">
              <td className="p-2">Média</td><td></td><td></td><td></td><td></td><td></td>
              <td>{fmt(resultados.realMedia, 3)}</td>
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
