import { useMemo, useState } from 'react'
import { indiceLamelaridade, type GraoMedicao } from '../../lib/calculos/indiceForma'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'

// Índice de forma GRÃO A GRÃO avulso (NBR 7809 / DNIT 425/2020) — mesmo shape de
// grão da ProjetoIndiceFormaPage (projeto_indice_forma.graos): dados = { graos:
// [{espessura, comprimento}] }. Cálculo via indiceLamelaridade (golden-testado).

interface GraoForm { espessura: string; comprimento: string }
const graoVazio = (): GraoForm => ({ espessura: '', comprimento: '' })

// Aceita linhas coladas do Excel (tab), ponto-e-vírgula ou espaço; vírgula = decimal BR.
function parseLinhaGrao(linha: string): GraoForm | null {
  let partes = linha.split('\t').map(p => p.trim()).filter(Boolean)
  if (partes.length < 2) partes = linha.split(';').map(p => p.trim()).filter(Boolean)
  if (partes.length < 2) partes = linha.trim().split(/\s+/).filter(Boolean)
  if (partes.length < 2) return null
  const espessura = sanitizarDecimal(partes[0])
  const comprimento = sanitizarDecimal(partes[1])
  const e = parseDecimal(espessura)
  const c = parseDecimal(comprimento)
  if (e === null || c === null || !Number.isFinite(e) || !Number.isFinite(c)) return null
  return { espessura, comprimento }
}

interface DadosIndiceForma { graos?: { espessura: number; comprimento: number }[] }

export default function IndiceFormaLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosIndiceForma
  const [graos, setGraos] = useState<GraoForm[]>(() =>
    d.graos?.length
      ? d.graos.map(g => ({ espessura: decimalParaTexto(g.espessura), comprimento: decimalParaTexto(g.comprimento) }))
      : [graoVazio()])
  const [colarTexto, setColarTexto] = useState('')
  const [aviso, setAviso] = useState('')
  const [erroLocal, setErroLocal] = useState('')

  function alterarGrao(i: number, campo: keyof GraoForm, valor: string) {
    setGraos(graos.map((g, idx) => (idx === i ? { ...g, [campo]: sanitizarDecimal(valor) } : g)))
  }
  function adicionarGrao() { setGraos([...graos, graoVazio()]) }
  function removerGrao(i: number) { setGraos(graos.filter((_, idx) => idx !== i)) }
  function limparTudo() { setGraos([graoVazio()]); setAviso(''); setErroLocal('') }

  function adicionarEmLote() {
    const linhas = colarTexto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const novos: GraoForm[] = []
    let invalidas = 0
    for (const linha of linhas) {
      const g = parseLinhaGrao(linha)
      if (g) novos.push(g); else invalidas++
    }
    if (!novos.length) {
      setAviso('')
      setErroLocal('Nenhuma linha válida encontrada para colar. Use "espessura  comprimento" por linha (colado do Excel, separado por tab, ponto-e-vírgula ou espaço).')
      return
    }
    setGraos(prev => {
      const semVazios = prev.filter(g => g.espessura !== '' || g.comprimento !== '')
      return [...semVazios, ...novos]
    })
    setColarTexto('')
    setErroLocal('')
    setAviso(invalidas
      ? `${novos.length} grão(s) adicionado(s); ${invalidas} linha(s) ignorada(s) por formato inválido.`
      : `${novos.length} grão(s) adicionado(s).`)
  }

  const graosPreenchidos = useMemo(() => graos.filter(g => g.espessura !== '' && g.comprimento !== ''), [graos])

  const resultado = useMemo((): { ok: true; r: ReturnType<typeof indiceLamelaridade> } | { ok: false; problema: string } | null => {
    if (!graosPreenchidos.length) return null
    try {
      const medicoes: GraoMedicao[] = graosPreenchidos.map(g => ({
        espessura: parseDecimal(g.espessura) ?? NaN, comprimento: parseDecimal(g.comprimento) ?? NaN,
      }))
      return { ok: true, r: indiceLamelaridade(medicoes) }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [graosPreenchidos])

  function ilLinha(g: GraoForm): { ok: true; il: number; lamelar: boolean } | { ok: false } | null {
    if (g.espessura === '' || g.comprimento === '') return null
    try {
      const r = indiceLamelaridade([{ espessura: parseDecimal(g.espessura) ?? NaN, comprimento: parseDecimal(g.comprimento) ?? NaN }])
      return { ok: true, il: r.mediaIL, lamelar: r.lamelares > 0 }
    } catch {
      return { ok: false }
    }
  }

  function salvar() {
    if (!graosPreenchidos.length) { setErroLocal('Informe ao menos um grão (espessura e comprimento).'); return }
    if (graos.some(g => (g.espessura !== '' && g.comprimento === '') || (g.espessura === '' && g.comprimento !== ''))) {
      setErroLocal('Informe espessura e comprimento de cada grão preenchido.'); return
    }
    if (!resultado || !resultado.ok) { setErroLocal(resultado && !resultado.ok ? resultado.problema : 'Informe ao menos um grão válido.'); return }
    setErroLocal('')
    salvarDados({
      graos: graosPreenchidos.map(g => ({ espessura: parseDecimal(g.espessura)!, comprimento: parseDecimal(g.comprimento)! })),
    })
  }

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
      <h2 className="font-semibold text-lg text-grp-700">Índice de forma (grão a grão) — NBR 7809 / DNIT 425/2020</h2>
      <p className="text-sm text-slate-500">
        Para cada grão medem-se espessura (E) e comprimento (C), em mm. IL = C/E. Um grão é lamelar quando IL ≥ 3.
        O resultado do ensaio é a média dos IL de todos os grãos e o percentual de grãos lamelares.
      </p>

      {podeEditar && (
        <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
          <label className="text-sm block font-semibold">Colar grãos em lote</label>
          <p className="text-xs text-slate-500">
            Uma linha por grão, no formato "espessura&nbsp;&nbsp;comprimento" — cole direto do Excel (colunas separadas
            por tab) ou digite separando por ponto-e-vírgula ou espaço.
          </p>
          <textarea className="border rounded p-2 w-full font-mono text-xs" rows={4} value={colarTexto}
            placeholder={'1\t1,9\n1\t1,6\n0,6\t1,9\n...'} onChange={e => setColarTexto(e.target.value)} />
          <div className="flex items-center gap-2">
            <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarEmLote} disabled={!colarTexto.trim()}>
              Adicionar em lote
            </button>
            <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarGrao}>+ Grão</button>
            {graos.length > 1 && (
              <button type="button" className="text-sm text-red-600 border rounded px-3 py-1" onClick={limparTudo}>Limpar tudo</button>
            )}
          </div>
          {aviso && <p className="text-sm text-emerald-700">{aviso}</p>}
        </div>
      )}

      <div className="overflow-x-auto max-h-[32rem] overflow-y-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left border-b">
              <th className="p-2">Grão</th><th>E (mm)</th><th>C (mm)</th><th>IL = C/E</th><th>Condição</th><th></th>
            </tr>
          </thead>
          <tbody>
            {graos.map((g, i) => {
              const il = ilLinha(g)
              return (
                <tr key={i} className="border-b">
                  <td className="p-2 font-semibold">{i + 1}</td>
                  <td><input className="border rounded p-1 w-24" inputMode="decimal" value={g.espessura} disabled={!podeEditar}
                    onChange={e => alterarGrao(i, 'espessura', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-24" inputMode="decimal" value={g.comprimento} disabled={!podeEditar}
                    onChange={e => alterarGrao(i, 'comprimento', e.target.value)} /></td>
                  <td>{il?.ok ? fmt(il.il, 3) : '—'}</td>
                  <td>{il?.ok ? (il.lamelar
                    ? <span className="text-red-700 font-semibold">Lamelar</span>
                    : <span className="text-slate-600">Não lamelar</span>) : '—'}</td>
                  <td>{podeEditar && graos.length > 1 && (
                    <button type="button" className="text-red-600 text-xs" onClick={() => removerGrao(i)}>×</button>
                  )}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {resultado && !resultado.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{resultado.problema}</p>}
      {resultado?.ok && (
        <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><p className="text-xs text-slate-500">Total de grãos</p><p className="text-lg font-semibold">{resultado.r.totalGraos}</p></div>
          <div><p className="text-xs text-slate-500">Grãos lamelares</p><p className="text-lg font-semibold">{resultado.r.lamelares}</p></div>
          <div><p className="text-xs text-slate-500">% lamelar</p><p className="text-lg font-semibold">{fmt(resultado.r.pctLamelar, 2)}%</p></div>
          <div><p className="text-xs text-slate-500">Média do IL</p><p className="text-lg font-semibold">{fmt(resultado.r.mediaIL, 3)}</p></div>
        </div>
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
