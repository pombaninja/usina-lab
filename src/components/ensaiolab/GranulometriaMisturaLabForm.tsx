import { useMemo, useState } from 'react'
import { calcularGranulometria, type PeneiraLeitura } from '../../lib/calculos/granulometria'
import GraficoGranulometria from '../GraficoGranulometria'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'

// Granulometria da MISTURA (CBUQ/CBUQF) avulsa — espelho da seção de granulometria
// do ensaio CAUQ diário (EnsaioCauqPage): peso total + retido acumulado por peneira
// → % passando via calcularGranulometria (golden-testada), SEM faixas de
// especificação (ensaio avulso). dados jsonb espelha cauq_granulometria:
// { peso_total, leituras: [{peneira, abertura_mm, retido_acum}] }.

interface LeituraForm { peneira: string; abertura: string; retido: string }

// Lista padrão editável (mesma do ensaio CAUQ diário quando não há especificação)
const peneirasPadrao: LeituraForm[] = [
  { peneira: '3/4"', abertura: '19', retido: '' }, { peneira: '1/2"', abertura: '12,5', retido: '' },
  { peneira: '3/8"', abertura: '9,53', retido: '' }, { peneira: 'N. 04', abertura: '4,76', retido: '' },
  { peneira: 'N. 10', abertura: '2', retido: '' }, { peneira: 'N. 40', abertura: '0,42', retido: '' },
  { peneira: 'N. 80', abertura: '0,18', retido: '' }, { peneira: 'N. 200', abertura: '0,075', retido: '' },
]

interface DadosGranMistura {
  peso_total?: number
  leituras?: { peneira: string; abertura_mm: number; retido_acum: number }[]
}

export default function GranulometriaMisturaLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosGranMistura
  const [pesoTotal, setPesoTotal] = useState(() => decimalParaTexto(d.peso_total))
  const [leituras, setLeituras] = useState<LeituraForm[]>(() =>
    d.leituras?.length
      ? d.leituras.map(l => ({ peneira: l.peneira, abertura: decimalParaTexto(l.abertura_mm), retido: decimalParaTexto(l.retido_acum) }))
      : peneirasPadrao.map(l => ({ ...l })))
  const [erroLocal, setErroLocal] = useState('')

  function alterarLeitura(i: number, campo: keyof LeituraForm, valor: string) {
    setLeituras(leituras.map((l, idx) => (idx === i
      ? { ...l, [campo]: campo === 'peneira' ? valor : sanitizarDecimal(valor) } : l)))
  }
  function adicionarPeneira() { setLeituras([...leituras, { peneira: '', abertura: '', retido: '' }]) }
  function removerPeneira(i: number) { setLeituras(leituras.filter((_, idx) => idx !== i)) }

  const leiturasValidas = useMemo((): PeneiraLeitura[] => leituras
    .filter(l => l.peneira.trim() !== '' && l.retido !== ''
      && parseDecimal(l.abertura) !== null && Number.isFinite(parseDecimal(l.abertura)!)
      && parseDecimal(l.retido) !== null && Number.isFinite(parseDecimal(l.retido)!))
    .map(l => ({ peneira: l.peneira.trim(), aberturaMm: parseDecimal(l.abertura)!, retidoAcum: parseDecimal(l.retido)! })), [leituras])

  const resultado = useMemo((): { ok: true; r: ReturnType<typeof calcularGranulometria> } | { ok: false; problema: string } | null => {
    const peso = parseDecimal(pesoTotal)
    if (peso === null || !Number.isFinite(peso) || !leiturasValidas.length) return null
    try {
      // Sem faixas: ensaio avulso não tem especificação vinculada.
      return { ok: true, r: calcularGranulometria(peso, leiturasValidas) }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [pesoTotal, leiturasValidas])

  function salvar() {
    const peso = parseDecimal(pesoTotal)
    if (peso === null || !Number.isFinite(peso) || peso <= 0) { setErroLocal('Informe o peso total da amostra (> 0).'); return }
    if (!leiturasValidas.length) { setErroLocal('Informe o retido acumulado de ao menos uma peneira.'); return }
    if (resultado && !resultado.ok) { setErroLocal(resultado.problema); return }
    setErroLocal('')
    salvarDados({
      peso_total: peso,
      leituras: leiturasValidas.map(l => ({ peneira: l.peneira, abertura_mm: l.aberturaMm, retido_acum: l.retidoAcum })),
    })
  }

  const inpNum = 'border rounded p-1 w-24'

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg text-grp-700">Granulometria da mistura — DNER-ME 083/98</h2>
        {podeEditar && <button type="button" className="text-sm border rounded px-2 py-1" onClick={adicionarPeneira}>+ Peneira</button>}
      </div>
      <p className="text-sm text-slate-500">
        Peso retido acumulado por peneira (g). % passando = 100 − retida acumulada / peso total.
        Sem especificação vinculada, o gráfico mostra apenas a curva da mistura.
      </p>

      <label className="text-sm">Peso total (g)
        <input className="border rounded p-2 ml-2 w-32" inputMode="decimal" value={pesoTotal} disabled={!podeEditar}
          onChange={e => setPesoTotal(sanitizarDecimal(e.target.value))} /></label>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">Peneira</th><th>Abertura (mm)</th><th>Retido acum. (g)</th>
              <th>% retida acum.</th><th>% Passando</th><th />
            </tr>
          </thead>
          <tbody>
            {leituras.map((l, i) => {
              const linha = resultado?.ok ? resultado.r.linhas.find(x => x.peneira === l.peneira.trim()) : undefined
              return (
                <tr key={i} className="border-b">
                  <td className="p-2"><input className="border rounded p-1 w-20" value={l.peneira} disabled={!podeEditar}
                    onChange={e => alterarLeitura(i, 'peneira', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-20" inputMode="decimal" value={l.abertura} disabled={!podeEditar}
                    onChange={e => alterarLeitura(i, 'abertura', e.target.value)} /></td>
                  <td><input className={inpNum} inputMode="decimal" value={l.retido} disabled={!podeEditar}
                    onChange={e => alterarLeitura(i, 'retido', e.target.value)} /></td>
                  <td className="p-2">{linha ? fmt(linha.pctRetidaAcum, 1) : '—'}</td>
                  <td className="p-2 font-semibold">{linha ? fmt(linha.pctPassando, 1) : '—'}</td>
                  <td>{podeEditar && leituras.length > 1 && (
                    <button type="button" className="text-red-600 text-xs" onClick={() => removerPeneira(i)}>×</button>
                  )}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {resultado && !resultado.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{resultado.problema}</p>}
      {resultado?.ok && <GraficoGranulometria linhas={resultado.r.linhas} largura={640} />}

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
