import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { normalizarPeneira } from '../lib/calculos/granulometria'
import { calcularGranulometriaAgregado, combinarGranulometrias, type LinhaAgregado } from '../lib/calculos/agregadoGranulometria'
import { calcularPesosMoldagem, type MoldagemTeor } from '../lib/calculos/pesosMoldagem'
import { fmt } from '../lib/formato'

const TEORES_PADRAO = ['4.0', '4.5', '5.0', '5.5', '6.0']
const n = (s: string) => (s === '' ? NaN : Number(s))

export default function ProjetoMoldagemPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const dosagemId = id!
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  // % passa combinada por peneira (chave normalizada) — pode vir do cálculo
  // automático (agregados + composição) ou ser confirmada/ajustada manualmente.
  const [combinadaManual, setCombinadaManual] = useState<Record<string, string>>({})
  const [combinadaCarregada, setCombinadaCarregada] = useState(false)
  const [pesoTotal, setPesoTotal] = useState('1200')
  const [teoresTexto, setTeoresTexto] = useState<string[]>(TEORES_PADRAO)
  const [teoresCarregados, setTeoresCarregados] = useState(false)

  const { data: dosagem } = useQuery({
    queryKey: ['dosagem-moldagem', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagens').select('id, nome, especificacao_id').eq('id', dosagemId).single()
      if (error) throw error
      return data as { id: string; nome: string; especificacao_id: string }
    },
  })

  const { data: peneirasEspec } = useQuery({
    queryKey: ['peneiras-espec-moldagem', dosagem?.especificacao_id],
    enabled: !!dosagem,
    queryFn: async () => {
      const { data, error } = await supabase.from('especificacao_peneiras').select('peneira, abertura_mm, passante_min, passante_max')
        .eq('especificacao_id', dosagem!.especificacao_id).order('abertura_mm', { ascending: false })
      if (error) throw error
      return (data ?? []) as { peneira: string; abertura_mm: number; passante_min: number; passante_max: number }[]
    },
  })

  const { data: composicao } = useQuery({
    queryKey: ['composicao-moldagem', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagem_composicao').select('material_nome, percentual').eq('dosagem_id', dosagemId)
      if (error) throw error
      return (data ?? []) as { material_nome: string | null; percentual: number }[]
    },
  })

  const { data: agregados } = useQuery({
    queryKey: ['agregados-moldagem', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('agregado_granulometria').select('*').eq('dosagem_id', dosagemId).order('ordem')
      if (error) throw error
      return (data ?? []) as {
        material_nome: string
        peneiras: { peneira: string; aberturaMm: number }[]
        determinacoes: { pesoTotal: number; retidos: Record<string, number> }[]
      }[]
    },
  })

  const { data: teoresMarshall } = useQuery({
    queryKey: ['teores-marshall-moldagem', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_marshall_cp').select('teor').eq('dosagem_id', dosagemId)
      if (error) throw error
      const unicos = [...new Set((data ?? []).map((r: { teor: number }) => r.teor))].sort((a, b) => a - b)
      return unicos
    },
  })

  // Combinada calculada automaticamente a partir das granulometrias dos agregados (M2)
  // ponderadas pela % na mistura da composição (Dosagem). Serve de ponto de partida;
  // o usuário pode ajustar manualmente cada peneira abaixo.
  const combinadaAuto = useMemo((): { peneira: string; aberturaMm: number; pctPassa: number }[] | null => {
    if (!agregados || !agregados.length || !composicao) return null
    const entradas: { pctNaMistura: number; linhas: LinhaAgregado[] }[] = []
    for (const a of agregados) {
      const match = (composicao ?? []).find(c => (c.material_nome ?? '').trim().toLowerCase() === a.material_nome.trim().toLowerCase())
      if (!match) continue
      const dets = a.determinacoes.filter(d => d.pesoTotal > 0)
      if (!dets.length) continue
      try {
        const linhas = calcularGranulometriaAgregado(a.peneiras, dets)
        entradas.push({ pctNaMistura: match.percentual, linhas })
      } catch {
        // agregado com dados insuficientes: ignora na combinada automática
      }
    }
    if (!entradas.length) return null
    return combinarGranulometrias(entradas)
  }, [agregados, composicao])

  // Prefill único: assim que a combinada automática (ou as peneiras da especificação)
  // estiver disponível, carrega os campos manuais; edições do usuário depois não são sobrescritas.
  useEffect(() => {
    if (combinadaCarregada) return
    if (!peneirasEspec || !peneirasEspec.length) return
    if (combinadaAuto === null && agregados === undefined) return // aguarda a query de agregados resolver
    const base: Record<string, string> = {}
    for (const p of peneirasEspec) {
      const achado = combinadaAuto?.find(l => normalizarPeneira(l.peneira) === normalizarPeneira(p.peneira))
      base[normalizarPeneira(p.peneira)] = achado ? String(Number(achado.pctPassa.toFixed(2))) : ''
    }
    setCombinadaManual(base)
    setCombinadaCarregada(true)
  }, [peneirasEspec, combinadaAuto, agregados, combinadaCarregada])

  useEffect(() => {
    if (teoresCarregados) return
    if (teoresMarshall === undefined) return
    if (teoresMarshall.length) setTeoresTexto(teoresMarshall.map(t => String(t)))
    setTeoresCarregados(true)
  }, [teoresMarshall, teoresCarregados])

  function alterarPctPassa(peneiraKey: string, valor: string) {
    setCombinadaManual(prev => ({ ...prev, [peneiraKey]: valor }))
  }
  function alterarTeor(i: number, valor: string) {
    setTeoresTexto(teoresTexto.map((t, idx) => (idx === i ? valor : t)))
  }
  function adicionarTeor() { setTeoresTexto([...teoresTexto, '']) }
  function removerTeor(i: number) { setTeoresTexto(teoresTexto.filter((_, idx) => idx !== i)) }

  const peneiras = peneirasEspec ?? []

  // Linhas de composição consolidada (combinada x especificação), com conformidade.
  const linhasComposicao = useMemo(() => {
    return peneiras.map(p => {
      const chave = normalizarPeneira(p.peneira)
      const valor = combinadaManual[chave]
      const pctPassa = valor !== undefined && valor !== '' ? Number(valor) : null
      const conforme = pctPassa !== null && Number.isFinite(pctPassa) ? pctPassa >= p.passante_min && pctPassa <= p.passante_max : null
      return { peneira: p.peneira, aberturaMm: p.abertura_mm, passanteMin: p.passante_min, passanteMax: p.passante_max, pctPassa, conforme }
    })
  }, [peneiras, combinadaManual])

  const combinadaParaCalculo = useMemo((): { peneira: string; aberturaMm: number; pctPassa: number }[] | null => {
    if (!peneiras.length) return null
    const linhas = peneiras.map(p => {
      const chave = normalizarPeneira(p.peneira)
      const valor = combinadaManual[chave]
      return { peneira: p.peneira, aberturaMm: p.abertura_mm, pctPassa: valor !== undefined && valor !== '' ? Number(valor) : NaN }
    })
    if (linhas.some(l => !Number.isFinite(l.pctPassa))) return null
    return linhas
  }, [peneiras, combinadaManual])

  const teoresNumericos = useMemo(() => teoresTexto.map(n).filter(Number.isFinite), [teoresTexto])

  const resultadoPesos = useMemo((): { ok: true; dados: MoldagemTeor[] } | { ok: false; problema: string } | null => {
    if (!combinadaParaCalculo) return null
    const pesoTotalNum = n(pesoTotal)
    if (!teoresNumericos.length) return null
    try {
      return { ok: true, dados: calcularPesosMoldagem(combinadaParaCalculo, pesoTotalNum, teoresNumericos) }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [combinadaParaCalculo, pesoTotal, teoresNumericos])

  const inp = 'border rounded p-2 w-full'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Composição e pesos de moldagem — {dosagem?.nome ?? '…'}</h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/dosagens')}>Voltar aos projetos</button>
      </div>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita os campos abaixo. Exibindo em modo leitura.</p>}
      {!peneiras.length && <p className="text-amber-700 bg-amber-50 p-3 rounded">A especificação deste projeto não tem peneiras cadastradas.</p>}

      <section className="bg-white p-4 rounded-xl shadow space-y-3">
        <h2 className="font-semibold text-lg">Composição consolidada</h2>
        <p className="text-sm text-slate-500">
          % passa combinada calculada automaticamente a partir das granulometrias dos agregados (aba "Agregados") ponderadas
          pela composição da mistura. Ajuste manualmente qualquer peneira caso os agregados ainda não tenham sido preenchidos.
        </p>
        {peneiras.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Peneira</th><th>Abertura (mm)</th><th>% passa combinada</th>
                  <th>Especificação (min–max)</th><th>Conformidade</th>
                </tr>
              </thead>
              <tbody>
                {linhasComposicao.map(l => {
                  const chave = normalizarPeneira(l.peneira)
                  return (
                    <tr key={l.peneira} className="border-b">
                      <td className="p-2 font-semibold">{l.peneira}</td>
                      <td>{fmt(l.aberturaMm, 3)}</td>
                      <td>
                        <input className="border rounded p-1 w-24" type="number" step="any" min="0" max="100"
                          value={combinadaManual[chave] ?? ''} disabled={!podeEditar}
                          onChange={e => alterarPctPassa(chave, e.target.value)} />
                      </td>
                      <td>{fmt(l.passanteMin, 1)}–{fmt(l.passanteMax, 1)}</td>
                      <td>
                        {l.conforme === null ? '—' : l.conforme
                          ? <span className="text-emerald-700 font-semibold">Conforme</span>
                          : <span className="text-red-600 font-semibold">Fora da faixa</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white p-4 rounded-xl shadow space-y-4">
        <h2 className="font-semibold text-lg">Pesos de moldagem</h2>
        <p className="text-sm text-slate-500">
          Peso total do CP e teores não são salvos no banco — servem apenas para o cálculo/impressão desta tela.
        </p>
        <div className="flex items-end gap-4 flex-wrap">
          <label className="text-sm">Peso total por CP (g)
            <input className={inp + ' w-40'} type="number" step="any" min="0" value={pesoTotal} disabled={!podeEditar}
              onChange={e => setPesoTotal(e.target.value)} /></label>
          <div>
            <span className="text-sm block mb-1">Teores (%)</span>
            <div className="flex gap-2 flex-wrap items-center">
              {teoresTexto.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input className="border rounded p-1 w-20" type="number" step="any" value={t} disabled={!podeEditar}
                    onChange={e => alterarTeor(i, e.target.value)} />
                  {podeEditar && teoresTexto.length > 1 && (
                    <button type="button" className="text-red-600 text-xs" onClick={() => removerTeor(i)}>×</button>
                  )}
                </div>
              ))}
              {podeEditar && <button type="button" className="text-sm border rounded px-2 py-1" onClick={adicionarTeor}>+ Teor</button>}
            </div>
          </div>
        </div>

        {!combinadaParaCalculo && (
          <p className="text-sm text-slate-500">Preencha o % passa combinada de todas as peneiras acima para calcular os pesos de moldagem.</p>
        )}
        {resultadoPesos && !resultadoPesos.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{resultadoPesos.problema}</p>}

        {resultadoPesos?.ok && (
          <div className="space-y-6">
            {resultadoPesos.dados.map(res => (
              <div key={res.teor} className="space-y-2">
                <h3 className="font-semibold">Teor {fmt(res.teor, 1)}% — peso total {fmt(res.pesoTotal, 0)} g</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="p-2">Peneira</th><th>% ret. passante</th><th>Peso individual (g)</th><th>Peso acumulado (g)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.linhas.map(l => (
                        <tr key={l.peneira} className="border-b">
                          <td className="p-2 font-semibold">{l.peneira}</td>
                          <td>{fmt(l.pctRetPassante * 100, 2)}%</td>
                          <td>{fmt(l.pesoIndividual, 1)}</td>
                          <td>{fmt(l.pesoAcumulado, 1)}</td>
                        </tr>
                      ))}
                      <tr className="border-b bg-slate-50 font-semibold">
                        <td className="p-2">CAP</td><td>—</td><td>{fmt(res.pesoCap, 1)}</td>
                        <td>{fmt(res.linhas[res.linhas.length - 1].pesoAcumulado + res.pesoCap, 1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}
