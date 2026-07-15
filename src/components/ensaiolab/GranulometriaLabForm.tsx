import { useEffect, useMemo, useState } from 'react'
import {
  calcularGranulometriaAgregado, aplicarFaixaEspecificacao,
  type DeterminacaoAgregado, type PeneiraRef, type LinhaAgregadoFaixa,
} from '../../lib/calculos/agregadoGranulometria'
import { normalizarPeneira, type LinhaGranulometria } from '../../lib/calculos/granulometria'
import GraficoGranulometria from '../GraficoGranulometria'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'
import { useEspecificacaoFaixa, useEspecificacoesAtivas } from './useEspecificacaoFaixa'

// Granulometria de agregado avulsa — MESMO shape persistido de agregado_granulometria
// (projeto): dados = { peneiras: [{peneira, aberturaMm}], determinacoes: [{pesoTotal,
// retidos: Record<peneira, g acumulado>}], especificacao_id? }. Cálculo 100% via
// calcularGranulometriaAgregado (golden-testado).
//
// "Especificação (faixa)" OPCIONAL (A2): selecionada, as linhas são REALINHADAS
// às peneiras da especificação (valores digitados preservados via
// normalizarPeneira — espelho do resync do GranulometriaMisturaLabForm), a tabela
// ganha Esp. mín/máx + Situação por peneira (aplicarFaixaEspecificacao) e o
// gráfico mostra a banda da especificação. SEM curva de trabalho: ensaio avulso
// não tem curva de projeto — a banda é honestamente a "Faixa da especificação".
// Sem especificação → comportamento inalterado (só a curva do material).

interface PeneiraForm { peneira: string; abertura: string }
interface DetForm { pesoTotal: string; retidos: Record<string, string> }

// Lista padrão editável (mesma do ensaio CAUQ diário quando não há especificação)
const peneirasPadrao: PeneiraForm[] = [
  { peneira: '3/4"', abertura: '19' }, { peneira: '1/2"', abertura: '12,5' },
  { peneira: '3/8"', abertura: '9,53' }, { peneira: 'N. 04', abertura: '4,76' },
  { peneira: 'N. 10', abertura: '2' }, { peneira: 'N. 40', abertura: '0,42' },
  { peneira: 'N. 80', abertura: '0,18' }, { peneira: 'N. 200', abertura: '0,075' },
]

const detVazia = (): DetForm => ({ pesoTotal: '', retidos: {} })

interface DadosGranulometria {
  peneiras?: { peneira: string; aberturaMm: number }[]
  determinacoes?: { pesoTotal: number; retidos: Record<string, number> }[]
  especificacao_id?: string
}

export default function GranulometriaLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosGranulometria
  const [peneiras, setPeneiras] = useState<PeneiraForm[]>(() =>
    d.peneiras?.length
      ? d.peneiras.map(p => ({ peneira: p.peneira, abertura: decimalParaTexto(p.aberturaMm) }))
      : peneirasPadrao.map(p => ({ ...p })))
  const [dets, setDets] = useState<DetForm[]>(() =>
    d.determinacoes?.length
      ? d.determinacoes.map(det => ({
          pesoTotal: decimalParaTexto(det.pesoTotal),
          retidos: Object.fromEntries(Object.entries(det.retidos ?? {}).map(([k, v]) => [k, decimalParaTexto(v)])),
        }))
      : [detVazia()])
  const [erroLocal, setErroLocal] = useState('')
  const [especificacaoId, setEspecificacaoId] = useState(() =>
    typeof d.especificacao_id === 'string' ? d.especificacao_id : '')

  const { data: especificacoes } = useEspecificacoesAtivas()
  const { data: espec } = useEspecificacaoFaixa(especificacaoId || undefined)
  const comFaixa = !!espec?.peneiras.length

  // Com especificação selecionada, as LINHAS são realinhadas às peneiras da
  // especificação (grafia cadastrada), preservando os retidos já digitados quando
  // a peneira casa via normalizarPeneira — espelho do resync do
  // GranulometriaMisturaLabForm. As chaves de `retidos` das determinações seguem
  // a grafia da linha, então são re-chaveadas junto. Sem especificação, a lista
  // atual (salva ou padrão) fica intocada.
  useEffect(() => {
    const peneirasEspec = espec?.peneiras ?? []
    if (!peneirasEspec.length) return
    setPeneiras(prev => {
      const rows = peneirasEspec.map(p => ({ peneira: p.peneira, abertura: decimalParaTexto(p.aberturaMm) }))
      // Evita re-render desnecessário quando nada muda de fato
      const igual = rows.length === prev.length && rows.every((r, i) =>
        r.peneira === prev[i].peneira && r.abertura === prev[i].abertura)
      return igual ? prev : rows
    })
    setDets(prev => prev.map(det => {
      const preservados = new Map(Object.entries(det.retidos).map(([k, v]) => [normalizarPeneira(k), v]))
      const retidos: Record<string, string> = {}
      for (const p of peneirasEspec) {
        const v = preservados.get(normalizarPeneira(p.peneira))
        if (v !== undefined && v !== '') retidos[p.peneira] = v
      }
      const igual = Object.keys(retidos).length === Object.keys(det.retidos).length
        && Object.entries(retidos).every(([k, v]) => det.retidos[k] === v)
      return igual ? det : { ...det, retidos }
    }))
  }, [espec])

  function alterarPeneira(i: number, campo: keyof PeneiraForm, valor: string) {
    setPeneiras(peneiras.map((p, idx) => (idx === i
      ? { ...p, [campo]: campo === 'abertura' ? sanitizarDecimal(valor) : valor } : p)))
  }
  function adicionarPeneira() { setPeneiras([...peneiras, { peneira: '', abertura: '' }]) }
  function removerPeneira(i: number) { setPeneiras(peneiras.filter((_, idx) => idx !== i)) }
  function alterarPesoTotal(iDet: number, valor: string) {
    setDets(dets.map((det, idx) => (idx === iDet ? { ...det, pesoTotal: sanitizarDecimal(valor) } : det)))
  }
  function alterarRetido(iDet: number, peneira: string, valor: string) {
    setDets(dets.map((det, idx) => (idx === iDet
      ? { ...det, retidos: { ...det.retidos, [peneira]: sanitizarDecimal(valor) } } : det)))
  }
  function adicionarDet() { if (dets.length < 3) setDets([...dets, detVazia()]) }
  function removerDet(i: number) { setDets(dets.filter((_, idx) => idx !== i)) }

  const peneirasRef = useMemo((): PeneiraRef[] => peneiras
    .filter(p => p.peneira.trim() !== '' && parseDecimal(p.abertura) !== null && Number.isFinite(parseDecimal(p.abertura)!))
    .map(p => ({ peneira: p.peneira.trim(), aberturaMm: parseDecimal(p.abertura)! })), [peneiras])

  const resultado = useMemo((): { ok: true; linhas: LinhaAgregadoFaixa[]; conforme: boolean; julgadas: number } | { ok: false; problema: string } | null => {
    const detsValidas: DeterminacaoAgregado[] = dets
      .filter(det => parseDecimal(det.pesoTotal) !== null)
      .map(det => ({
        pesoTotal: parseDecimal(det.pesoTotal) ?? NaN,
        retidos: Object.fromEntries(Object.entries(det.retidos)
          .filter(([, v]) => v !== '' && parseDecimal(v) !== null)
          .map(([k, v]) => [k, parseDecimal(v)!])),
      }))
    if (!peneirasRef.length || !detsValidas.length) return null
    try {
      const linhas = calcularGranulometriaAgregado(peneirasRef, detsValidas)
      if (!espec?.peneiras.length) return { ok: true, linhas, conforme: false, julgadas: 0 }
      // Com especificação: anota Esp. mín/máx + situação por peneira (sem faixa
      // de trabalho — a banda é a própria especificação).
      return { ok: true, ...aplicarFaixaEspecificacao(linhas, espec.peneiras) }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [dets, peneirasRef, espec])

  // Linhas para o gráfico padrão; com especificação, espMin/espMax desenham a
  // banda "Esp." (sem curvas de trabalho — ensaio avulso não tem curva de projeto).
  const linhasGrafico = useMemo((): LinhaGranulometria[] | null => {
    if (!resultado?.ok) return null
    return resultado.linhas.map(l => ({
      peneira: l.peneira, aberturaMm: l.aberturaMm, retidoAcum: l.retidoMedio,
      pctRetidaAcum: l.pctRetida, pctPassando: l.pctPassa,
      espMin: l.espMin, espMax: l.espMax,
    }))
  }, [resultado])

  function salvar() {
    if (!peneirasRef.length) { setErroLocal('Informe ao menos uma peneira com abertura válida.'); return }
    const determinacoes = dets
      .filter(det => parseDecimal(det.pesoTotal) !== null)
      .map(det => ({
        pesoTotal: parseDecimal(det.pesoTotal)!,
        retidos: Object.fromEntries(Object.entries(det.retidos)
          .filter(([, v]) => v !== '' && parseDecimal(v) !== null)
          .map(([k, v]) => [k, parseDecimal(v)!])),
      }))
    if (!determinacoes.length) { setErroLocal('Informe ao menos uma determinação (peso total).'); return }
    if (determinacoes.every(det => det.pesoTotal <= 0)) { setErroLocal('O peso total deve ser maior que zero.'); return }
    setErroLocal('')
    salvarDados({
      peneiras: peneirasRef.map(p => ({ peneira: p.peneira, aberturaMm: p.aberturaMm })),
      determinacoes,
      ...(especificacaoId ? { especificacao_id: especificacaoId } : {}),
    })
  }

  const inpNum = 'border rounded p-1 w-24'

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg text-grp-700">Granulometria — DNER-ME 083/98</h2>
        {podeEditar && (
          <div className="flex gap-2">
            <button type="button" className="text-sm border rounded px-2 py-1" onClick={adicionarPeneira}>+ Peneira</button>
            {dets.length < 3 && <button type="button" className="text-sm border rounded px-2 py-1" onClick={adicionarDet}>+ Determinação</button>}
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500">
        Peso acumulado retido por peneira (g), até 3 determinações. % passa = 100 − retida acumulada média / peso total médio.
        {comFaixa
          ? ' Com especificação selecionada, as peneiras seguem a faixa cadastrada e cada peneira é julgada Conforme/Fora (sem faixa de trabalho — ensaio avulso não tem curva de projeto).'
          : ' Sem especificação vinculada, o gráfico mostra apenas a curva do material.'}
      </p>

      <label className="text-sm block">Especificação (faixa) — opcional
        <select className="border rounded p-2 sm:ml-2 w-full sm:w-auto sm:min-w-72" value={especificacaoId} disabled={!podeEditar}
          onChange={e => setEspecificacaoId(e.target.value)}>
          <option value="">— sem especificação —</option>
          {(especificacoes ?? []).map(s => (
            <option key={s.id} value={s.id}>{s.nome}{s.norma ? ` (${s.norma})` : ''}</option>
          ))}
        </select></label>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">Peneira</th>
              <th>Abertura (mm)</th>
              {dets.map((det, iDet) => (
                <th key={iDet}>
                  Det. {iDet + 1} — peso total (g)
                  <div className="flex items-center gap-1">
                    <input className={inpNum} inputMode="decimal" value={det.pesoTotal} disabled={!podeEditar}
                      onChange={e => alterarPesoTotal(iDet, e.target.value)} />
                    {podeEditar && dets.length > 1 && (
                      <button type="button" className="text-red-600 text-xs" onClick={() => removerDet(iDet)}>×</button>
                    )}
                  </div>
                </th>
              ))}
              <th>% retida acum.</th>
              <th>% passa</th>
              {comFaixa && <><th>Esp. mín</th><th>Esp. máx</th><th>Situação</th></>}
              <th />
            </tr>
          </thead>
          <tbody>
            {peneiras.map((p, iP) => {
              const linha = resultado?.ok ? resultado.linhas.find(l => l.peneira === p.peneira.trim()) : undefined
              return (
                <tr key={iP} className="border-b">
                  <td className="p-2"><input className="border rounded p-1 w-20" value={p.peneira} disabled={!podeEditar}
                    onChange={e => alterarPeneira(iP, 'peneira', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-20" inputMode="decimal" value={p.abertura} disabled={!podeEditar}
                    onChange={e => alterarPeneira(iP, 'abertura', e.target.value)} /></td>
                  {dets.map((det, iDet) => (
                    <td key={iDet}>
                      <input className={inpNum} inputMode="decimal" value={det.retidos[p.peneira] ?? ''} disabled={!podeEditar}
                        onChange={e => alterarRetido(iDet, p.peneira, e.target.value)} />
                    </td>
                  ))}
                  <td>{linha ? fmt(linha.pctRetida, 2) : '—'}</td>
                  <td className="font-semibold">{linha ? fmt(linha.pctPassa, 2) : '—'}</td>
                  {comFaixa && <>
                    <td>{linha?.espMin !== undefined ? fmt(linha.espMin, 1) : '—'}</td>
                    <td>{linha?.espMax !== undefined ? fmt(linha.espMax, 1) : '—'}</td>
                    <td>
                      {linha?.conforme === true && <span className="text-green-600 font-semibold">Conforme</span>}
                      {linha?.conforme === false && <span className="text-red-600 font-semibold">Fora</span>}
                      {linha?.conforme === undefined && '—'}
                    </td>
                  </>}
                  <td>{podeEditar && peneiras.length > 1 && (
                    <button type="button" className="text-red-600 text-xs" onClick={() => removerPeneira(iP)}>×</button>
                  )}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {resultado && !resultado.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{resultado.problema}</p>}
      {resultado?.ok && comFaixa && resultado.julgadas > 0 && (
        <p className={`text-sm font-semibold ${resultado.conforme ? 'text-green-700' : 'text-red-600'}`}>
          {resultado.conforme ? 'Curva DENTRO da faixa da especificação.' : 'Curva FORA da faixa da especificação.'}
        </p>
      )}
      {linhasGrafico && <GraficoGranulometria linhas={linhasGrafico} largura={640} />}
      {linhasGrafico && comFaixa && espec && (
        <p className="text-xs text-slate-500 text-center">
          Faixa da especificação: {espec.nome}{espec.norma ? ` (${espec.norma})` : ''}
        </p>
      )}

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
