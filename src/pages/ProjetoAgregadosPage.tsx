import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, Tooltip } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import {
  calcularGranulometriaAgregado, combinarGranulometrias,
  type PeneiraRef, type DeterminacaoAgregado, type LinhaAgregado,
} from '../lib/calculos/agregadoGranulometria'
import type { LinhaGranulometria } from '../lib/calculos/granulometria'
import GraficoGranulometria from '../components/GraficoGranulometria'
import { fmt } from '../lib/formato'

interface DetForm { pesoTotal: string; retidos: Record<string, string> }
interface AgregadoForm { id?: string; materialNome: string; origem: string; data: string; pctMistura: string; dets: DetForm[] }

const n = (s: string) => (s === '' ? NaN : Number(s))
const detVazio = (): DetForm => ({ pesoTotal: '', retidos: {} })
const agregadoVazio = (): AgregadoForm => ({ materialNome: '', origem: '', data: '', pctMistura: '', dets: [detVazio()] })

export default function ProjetoAgregadosPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const dosagemId = id!
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [agregados, setAgregados] = useState<AgregadoForm[]>([agregadoVazio()])
  const [erro, setErro] = useState('')
  const [carregado, setCarregado] = useState(false)

  const { data: dosagem } = useQuery({
    queryKey: ['dosagem-agregados', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagens').select('id, nome, especificacao_id').eq('id', dosagemId).single()
      if (error) throw error
      return data as { id: string; nome: string; especificacao_id: string }
    },
  })

  const { data: peneirasEspec } = useQuery({
    queryKey: ['peneiras-espec-agregados', dosagem?.especificacao_id],
    enabled: !!dosagem,
    queryFn: async () => {
      const { data, error } = await supabase.from('especificacao_peneiras').select('peneira, abertura_mm, passante_min, passante_max, tolerancia_trabalho')
        .eq('especificacao_id', dosagem!.especificacao_id).order('abertura_mm', { ascending: false })
      if (error) throw error
      return (data ?? []) as { peneira: string; abertura_mm: number; passante_min: number; passante_max: number; tolerancia_trabalho: number | null }[]
    },
  })

  const peneiras: PeneiraRef[] = useMemo(
    () => (peneirasEspec ?? []).map(p => ({ peneira: p.peneira, aberturaMm: p.abertura_mm })),
    [peneirasEspec],
  )

  // Faixa da norma (% passante mín/máx) + tolerância de trabalho por peneira,
  // para comparar com a curva combinada e montar a faixa de trabalho.
  const limitesPorPeneira = useMemo(() => {
    const m = new Map<string, { min: number; max: number; tol: number }>()
    for (const p of peneirasEspec ?? []) m.set(p.peneira, { min: p.passante_min, max: p.passante_max, tol: p.tolerancia_trabalho ?? 0 })
    return m
  }, [peneirasEspec])

  const { data: composicao } = useQuery({
    queryKey: ['composicao-agregados', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagem_composicao').select('material_nome, percentual').eq('dosagem_id', dosagemId)
      if (error) throw error
      return (data ?? []) as { material_nome: string | null; percentual: number }[]
    },
  })

  const { data: existentes } = useQuery({
    queryKey: ['agregado-granulometria', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('agregado_granulometria').select('*').eq('dosagem_id', dosagemId).order('ordem')
      if (error) throw error
      return (data ?? []) as {
        id: string; material_nome: string; origem: string | null; data: string | null
        peneiras: { peneira: string; aberturaMm: number }[]
        determinacoes: { pesoTotal: number; retidos: Record<string, number> }[]
        ordem: number; pct_na_mistura: number | null
      }[]
    },
  })

  // Prefill do formulário a partir dos dados já salvos (modo edição)
  useEffect(() => {
    if (!existentes || carregado) return
    if (existentes.length) {
      setAgregados(existentes.map((a): AgregadoForm => ({
        id: a.id,
        materialNome: a.material_nome,
        origem: a.origem ?? '',
        data: a.data ?? '',
        // % na mistura persistida é a fonte primária; se ausente, tenta a composição pelo nome do material (conveniência).
        pctMistura: a.pct_na_mistura != null
          ? String(a.pct_na_mistura)
          : (() => { const m = (composicao ?? []).find(c => (c.material_nome ?? '').trim().toLowerCase() === a.material_nome.trim().toLowerCase()); return m ? String(m.percentual) : '' })(),
        dets: (a.determinacoes.length ? a.determinacoes : [{ pesoTotal: 0, retidos: {} }]).slice(0, 3).map(d => ({
          pesoTotal: Number.isFinite(d.pesoTotal) ? String(d.pesoTotal) : '',
          retidos: Object.fromEntries(Object.entries(d.retidos ?? {}).map(([k, v]) => [k, String(v)])),
        })),
      })))
    }
    setCarregado(true)
  }, [existentes, carregado])

  function alterarAgregado(i: number, campo: 'materialNome' | 'origem' | 'data' | 'pctMistura', valor: string) {
    setAgregados(agregados.map((a, idx) => (idx === i ? { ...a, [campo]: valor } : a)))
  }
  function alterarPesoTotal(iAg: number, iDet: number, valor: string) {
    setAgregados(agregados.map((a, idx) => {
      if (idx !== iAg) return a
      const dets = a.dets.map((d, di) => (di === iDet ? { ...d, pesoTotal: valor } : d))
      return { ...a, dets }
    }))
  }
  function alterarRetido(iAg: number, iDet: number, peneira: string, valor: string) {
    setAgregados(agregados.map((a, idx) => {
      if (idx !== iAg) return a
      const dets = a.dets.map((d, di) => (di === iDet ? { ...d, retidos: { ...d.retidos, [peneira]: valor } } : d))
      return { ...a, dets }
    }))
  }
  function adicionarAgregado() { setAgregados([...agregados, agregadoVazio()]) }
  function removerAgregado(i: number) { setAgregados(agregados.filter((_, idx) => idx !== i)) }
  function adicionarDeterminacao(iAg: number) {
    setAgregados(agregados.map((a, idx) => (idx === iAg && a.dets.length < 3 ? { ...a, dets: [...a.dets, detVazio()] } : a)))
  }
  function removerDeterminacao(iAg: number, iDet: number) {
    setAgregados(agregados.map((a, idx) => (idx === iAg ? { ...a, dets: a.dets.filter((_, di) => di !== iDet) } : a)))
  }

  // ===== cálculo ao vivo por agregado =====
  const resultados = useMemo((): ({ ok: true; linhas: LinhaAgregado[] } | { ok: false; problema: string } | null)[] => {
    if (!peneiras.length) return agregados.map(() => null)
    return agregados.map((a) => {
      const dets: DeterminacaoAgregado[] = a.dets
        .filter(d => d.pesoTotal !== '')
        .map(d => ({
          pesoTotal: n(d.pesoTotal),
          retidos: Object.fromEntries(Object.entries(d.retidos).filter(([, v]) => v !== '').map(([k, v]) => [k, n(v)])),
        }))
      if (!dets.length) return null
      try {
        return { ok: true, linhas: calcularGranulometriaAgregado(peneiras, dets) }
      } catch (e) {
        return { ok: false, problema: (e as Error).message }
      }
    })
  }, [agregados, peneiras])

  // % na mistura vem exclusivamente do campo pctMistura de cada agregado (fonte única, persistida).
  function pctNaMistura(a: AgregadoForm): number | null {
    if (a.pctMistura.trim() === '') return null
    const v = n(a.pctMistura)
    return Number.isFinite(v) ? v : null
  }

  const combinada = useMemo((): { peneira: string; aberturaMm: number; pctPassa: number }[] | null => {
    const entradas: { pctNaMistura: number; linhas: LinhaAgregado[] }[] = []
    agregados.forEach((a, i) => {
      const res = resultados[i]
      if (!res || !res.ok) return
      const pct = pctNaMistura(a)
      if (pct == null || !Number.isFinite(pct)) return
      entradas.push({ pctNaMistura: pct, linhas: res.linhas })
    })
    if (!entradas.length) return null
    return combinarGranulometrias(entradas)
  }, [agregados, resultados])

  // Linhas para o gráfico padrão de granulometria (mesmo GraficoGranulometria dos laudos):
  // faixa de TRABALHO = combinada ± tolerância de trabalho da especificação, sempre DENTRO
  // da faixa especificada da norma (mesma semântica de granulometria.ts, o cálculo do laudo
  // diário) e de 0–100; faixa ESPECIFICADA = % passante mín/máx da norma.
  const linhasCombinada = useMemo((): LinhaGranulometria[] | null => {
    if (!combinada) return null
    return combinada.map(l => {
      const lim = limitesPorPeneira.get(l.peneira)
      const linha: LinhaGranulometria = {
        peneira: l.peneira, aberturaMm: l.aberturaMm, retidoAcum: 0,
        pctRetidaAcum: 100 - l.pctPassa, pctPassando: l.pctPassa,
      }
      if (lim) {
        linha.espMin = lim.min
        linha.espMax = lim.max
        linha.trabMin = Math.max(0, lim.min, l.pctPassa - lim.tol)
        linha.trabMax = Math.min(100, lim.max, l.pctPassa + lim.tol)
      }
      return linha
    })
  }, [combinada, limitesPorPeneira])

  // Soma das % informadas nos agregados com resultado válido (para o aviso não-bloqueante de 100%).
  const somaPct = useMemo(() => {
    return agregados.reduce((acc, a, i) => {
      const res = resultados[i]
      if (!res || !res.ok) return acc
      const pct = pctNaMistura(a)
      return pct == null ? acc : acc + pct
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 0)
  }, [agregados, resultados])

  const salvar = useMutation({
    mutationFn: async () => {
      const preenchidos = agregados.filter(a => a.materialNome.trim() || a.dets.some(d => d.pesoTotal !== ''))
      if (!preenchidos.length) throw new Error('Informe ao menos um agregado com granulometria.')
      for (const a of preenchidos) {
        if (!a.materialNome.trim()) throw new Error('Informe o nome do material em todos os agregados preenchidos.')
        if (!a.dets.some(d => d.pesoTotal !== '')) throw new Error(`Informe ao menos uma determinação (peso total) para "${a.materialNome}".`)
      }

      type LinhaSalvar = {
        id?: string; dosagem_id: string; material_nome: string; origem: string | null; data: string | null
        peneiras: PeneiraRef[]; determinacoes: { pesoTotal: number; retidos: Record<string, number> }[]; ordem: number
        pct_na_mistura: number | null
      }
      const linhas: LinhaSalvar[] = preenchidos.map((a, i) => ({
        id: a.id,
        dosagem_id: dosagemId,
        material_nome: a.materialNome.trim(),
        origem: a.origem.trim() || null,
        data: a.data || null,
        peneiras,
        determinacoes: a.dets.filter(d => d.pesoTotal !== '').map(d => ({
          pesoTotal: n(d.pesoTotal),
          retidos: Object.fromEntries(Object.entries(d.retidos).filter(([, v]) => v !== '').map(([k, v]) => [k, n(v)])),
        })),
        ordem: i,
        pct_na_mistura: a.pctMistura.trim() === '' ? null : Number(a.pctMistura),
      }))

      const comId = linhas.filter(l => l.id)
      const semId = linhas.filter(l => !l.id)

      if (comId.length) {
        const { error } = await supabase.from('agregado_granulometria').upsert(comId, { onConflict: 'id' })
        if (error) throw new Error('Falha ao salvar granulometria dos agregados: ' + error.message)
      }
      if (semId.length) {
        const { data, error } = await supabase.from('agregado_granulometria')
          .insert(semId.map(({ id: _id, ...resto }) => resto)).select('id')
        if (error) throw new Error('Falha ao salvar granulometria dos agregados: ' + error.message)
        data?.forEach((row: { id: string }, idx: number) => { semId[idx].id = row.id })
      }

      const { data: antigos, error: errAntigos } = await supabase.from('agregado_granulometria').select('id').eq('dosagem_id', dosagemId)
      if (errAntigos) throw new Error('Falha ao conferir agregados existentes: ' + errAntigos.message)
      const idsAtuais = new Set(linhas.map(l => l.id).filter((v): v is string => !!v))
      const idsRemover = (antigos ?? []).filter((x: { id: string }) => !idsAtuais.has(x.id)).map((x: { id: string }) => x.id)
      if (idsRemover.length) {
        const { error: errDel } = await supabase.from('agregado_granulometria').delete().in('id', idsRemover)
        if (errDel) throw new Error('Falha ao remover agregados excluídos: ' + errDel.message)
      }

      setAgregados(preenchidos.map((a, idx) => ({ ...a, id: linhas[idx].id })))
    },
    onSuccess: () => setErro(''),
    onError: (e: Error) => setErro(e.message),
  })

  const inp = 'border rounded p-2 w-full'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-grp-700">Granulometria dos agregados — {dosagem?.nome ?? '…'}</h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/dosagens')}>Voltar aos projetos</button>
      </div>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita a granulometria dos agregados. Exibindo em modo leitura.</p>}
      {!peneiras.length && <p className="text-amber-700 bg-amber-50 p-3 rounded">A especificação deste projeto não tem peneiras cadastradas.</p>}

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg text-grp-700">Agregados</h2>
        {podeEditar && <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarAgregado}>+ Adicionar agregado</button>}
      </div>

      {agregados.map((a, iAg) => {
        const res = resultados[iAg]
        const dadosGrafico = res?.ok ? res.linhas.map(l => ({ abertura: l.aberturaMm, pctPassa: Number(l.pctPassa.toFixed(2)) })) : []
        return (
          <section key={iAg} className="bg-white p-4 rounded-xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="grid grid-cols-3 gap-3 flex-1">
                <label className="text-sm">Material
                  <input className={inp} value={a.materialNome} disabled={!podeEditar}
                    onChange={e => alterarAgregado(iAg, 'materialNome', e.target.value)} /></label>
                <label className="text-sm">Origem
                  <input className={inp} value={a.origem} disabled={!podeEditar}
                    onChange={e => alterarAgregado(iAg, 'origem', e.target.value)} /></label>
                <label className="text-sm">Data
                  <input className={inp} type="date" value={a.data} disabled={!podeEditar}
                    onChange={e => alterarAgregado(iAg, 'data', e.target.value)} /></label>
              </div>
              {podeEditar && agregados.length > 1 && (
                <button type="button" className="text-red-600 text-sm ml-3" onClick={() => removerAgregado(iAg)}>Remover agregado</button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">Determinações</span>
              {podeEditar && a.dets.length < 3 && (
                <button type="button" className="text-sm border rounded px-2 py-1" onClick={() => adicionarDeterminacao(iAg)}>+ Determinação</button>
              )}
            </div>

            {peneiras.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="p-2">Peneira</th>
                      <th>Abertura (mm)</th>
                      {a.dets.map((d, iDet) => (
                        <th key={iDet}>
                          Det. {iDet + 1} — peso total (g)
                          <div className="flex items-center gap-1">
                            <input className="border rounded p-1 w-24" type="number" step="any" value={d.pesoTotal} disabled={!podeEditar}
                              onChange={e => alterarPesoTotal(iAg, iDet, e.target.value)} />
                            {podeEditar && a.dets.length > 1 && (
                              <button type="button" className="text-red-600 text-xs" onClick={() => removerDeterminacao(iAg, iDet)}>×</button>
                            )}
                          </div>
                        </th>
                      ))}
                      <th>% passa média</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peneiras.map(p => {
                      const linha = res?.ok ? res.linhas.find(l => l.peneira === p.peneira) : undefined
                      return (
                        <tr key={p.peneira} className="border-b">
                          <td className="p-2 font-semibold">{p.peneira}</td>
                          <td>{fmt(p.aberturaMm, 3)}</td>
                          {a.dets.map((d, iDet) => (
                            <td key={iDet}>
                              <input className="border rounded p-1 w-24" type="number" step="any" value={d.retidos[p.peneira] ?? ''} disabled={!podeEditar}
                                onChange={e => alterarRetido(iAg, iDet, p.peneira, e.target.value)} />
                            </td>
                          ))}
                          <td className="p-2">{linha ? `${fmt(linha.pctPassa, 2)}%` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {res && !res.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{res.problema}</p>}

            {res?.ok && (
              <div className="w-fit mx-auto max-w-full">
                <LineChart width={480} height={220} data={dadosGrafico}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="abertura" type="number" label={{ value: 'Abertura (mm)', position: 'insideBottom', offset: -4 }} />
                  <YAxis label={{ value: '% passa', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Line dataKey="pctPassa" name="% passa" stroke="#2563eb" strokeWidth={2} dot />
                </LineChart>
              </div>
            )}
          </section>
        )
      })}

      <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
        <h2 className="font-semibold text-lg text-grp-700">Granulometria combinada</h2>

        {(() => {
          const comResultado = agregados.map((a, i) => ({ a, i })).filter(({ i }) => resultados[i]?.ok)
          if (!comResultado.length) {
            return <p className="text-sm text-slate-500">Preencha ao menos um agregado com determinação válida para informar a % na mistura e ver a combinada.</p>
          }
          const foraFaixa = somaPct < 99.5 || somaPct > 100.5
          return (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Informe a % de cada agregado na mistura. A curva combinada abaixo é salva junto com a granulometria.</p>
              <div className="space-y-2">
                {comResultado.map(({ a, i }) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm flex-1">{a.materialNome || `Agregado ${i + 1}`}</span>
                    <input className="border rounded p-2 w-28" type="number" step="any" value={a.pctMistura} disabled={!podeEditar}
                      onChange={e => alterarAgregado(i, 'pctMistura', e.target.value)} />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                ))}
              </div>
              <p className="text-sm">Soma: <span className="font-semibold">{fmt(somaPct, 2)}%</span></p>
              {foraFaixa && <p className="text-amber-700 bg-amber-50 p-2 rounded text-sm">As % somam {fmt(somaPct, 2)}% (ideal 100%)</p>}
            </div>
          )
        })()}

        {combinada && (
          <>
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b">
                <th className="p-2">Peneira</th><th>Abertura (mm)</th><th>% passa combinada</th>
                <th>Faixa de trabalho (± tolerância)</th>
                <th>% mín (norma)</th><th>% máx (norma)</th><th>Situação</th>
              </tr></thead>
              <tbody>{combinada.map(l => {
                const lim = limitesPorPeneira.get(l.peneira)
                const conforme = lim ? l.pctPassa >= lim.min - 1e-9 && l.pctPassa <= lim.max + 1e-9 : null
                // Faixa de trabalho = combinada ± tolerância de trabalho da especificação, sempre
                // DENTRO da faixa da norma e de 0–100 (mesmos valores de linhasCombinada/gráfico).
                const trab = lim ? { min: Math.max(0, lim.min, l.pctPassa - lim.tol), max: Math.min(100, lim.max, l.pctPassa + lim.tol) } : null
                return (
                  <tr key={l.peneira} className="border-b">
                    <td className="p-2 font-semibold">{l.peneira}</td>
                    <td>{fmt(l.aberturaMm, 3)}</td>
                    <td className="p-2">{fmt(l.pctPassa, 2)}%</td>
                    <td>{trab ? `${fmt(trab.min, 1)} – ${fmt(trab.max, 1)}%` : '—'}</td>
                    <td>{lim ? `${fmt(lim.min, 1)}%` : '—'}</td>
                    <td>{lim ? `${fmt(lim.max, 1)}%` : '—'}</td>
                    <td className={conforme === null ? '' : conforme ? 'text-green-700' : 'text-red-600 font-semibold'}>
                      {conforme === null ? '—' : conforme ? 'Conforme' : 'Fora da faixa'}
                    </td>
                  </tr>
                )
              })}</tbody>
            </table>
            {/* Gráfico padrão de granulometria (eixo X em log, Y fixo 0–100): curva combinada,
                faixa de trabalho (combinada ± tolerância) e faixa da especificação. */}
            {linhasCombinada && <GraficoGranulometria linhas={linhasCombinada} largura={640} />}
          </>
        )}
      </section>

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50" disabled={salvar.isPending}
            onClick={() => salvar.mutate()}>
            Salvar granulometria dos agregados
          </button>
          {salvar.isSuccess && !erro && <span className="text-green-700 text-sm">Salvo.</span>}
        </div>
      )}
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </div>
  )
}
