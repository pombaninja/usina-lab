import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, Tooltip, ReferenceArea } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { curvaViscosidade, type PontoVisc } from '../lib/calculos/viscosidadeCap'
import { fmt } from '../lib/formato'

interface PontoForm { temperatura: string; viscosidade: string }

const n = (s: string) => (s === '' ? NaN : Number(s))
const pontosPadrao = (): PontoForm[] => [
  { temperatura: '120', viscosidade: '' },
  { temperatura: '135', viscosidade: '' },
  { temperatura: '150', viscosidade: '' },
]

export default function ProjetoViscosidadePage() {
  const nav = useNavigate()
  const { id } = useParams()
  const dosagemId = id!
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [material, setMaterial] = useState('')
  const [pontoFulgor, setPontoFulgor] = useState('')
  const [pontoAmolecimento, setPontoAmolecimento] = useState('')
  const [penetracao, setPenetracao] = useState('')
  const [pontos, setPontos] = useState<PontoForm[]>(pontosPadrao())
  // Faixas-alvo de viscosidade Saybolt-Furol (padrão DNIT/Marshall extraído da
  // planilha real, aba "Visc.cap 30 - 45"): usinagem 75-95 seg, compactação 125-155 seg.
  const [usinagemMin, setUsinagemMin] = useState('75')
  const [usinagemMax, setUsinagemMax] = useState('95')
  const [compactacaoMin, setCompactacaoMin] = useState('125')
  const [compactacaoMax, setCompactacaoMax] = useState('155')
  const [erro, setErro] = useState('')
  const [carregado, setCarregado] = useState(false)

  const { data: dosagem } = useQuery({
    queryKey: ['dosagem-viscosidade', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagens').select('id, nome').eq('id', dosagemId).single()
      if (error) throw error
      return data as { id: string; nome: string }
    },
  })

  const { data: existente } = useQuery({
    queryKey: ['projeto-viscosidade', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_viscosidade').select('*').eq('dosagem_id', dosagemId).maybeSingle()
      if (error) throw error
      return data as {
        dosagem_id: string
        material: string | null
        pontos: { temperatura: number; viscosidade: number }[] | null
        faixas: { usinagemMin: number; usinagemMax: number; compactacaoMin: number; compactacaoMax: number } | null
        ponto_fulgor: number | null
        ponto_amolecimento: number | null
        penetracao: number | null
      } | null
    },
  })

  // Prefill do formulário a partir dos dados já salvos (modo edição)
  useEffect(() => {
    if (existente === undefined || carregado) return
    if (existente) {
      setMaterial(existente.material ?? '')
      setPontoFulgor(existente.ponto_fulgor != null ? String(existente.ponto_fulgor) : '')
      setPontoAmolecimento(existente.ponto_amolecimento != null ? String(existente.ponto_amolecimento) : '')
      setPenetracao(existente.penetracao != null ? String(existente.penetracao) : '')
      const lista = existente.pontos ?? []
      if (lista.length) setPontos(lista.map(p => ({ temperatura: String(p.temperatura), viscosidade: String(p.viscosidade) })))
      if (existente.faixas) {
        setUsinagemMin(String(existente.faixas.usinagemMin))
        setUsinagemMax(String(existente.faixas.usinagemMax))
        setCompactacaoMin(String(existente.faixas.compactacaoMin))
        setCompactacaoMax(String(existente.faixas.compactacaoMax))
      }
    }
    setCarregado(true)
  }, [existente, carregado])

  function alterarPonto(i: number, campo: keyof PontoForm, valor: string) {
    setPontos(pontos.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)))
  }
  function adicionarPonto() { setPontos([...pontos, { temperatura: '', viscosidade: '' }]) }
  function removerPonto(i: number) { setPontos(pontos.filter((_, idx) => idx !== i)) }

  const pontosPreenchidos = useMemo(() => pontos.filter(p => p.temperatura !== '' && p.viscosidade !== ''), [pontos])

  const faixas = useMemo(() => ({
    usinagemMin: n(usinagemMin), usinagemMax: n(usinagemMax),
    compactacaoMin: n(compactacaoMin), compactacaoMax: n(compactacaoMax),
  }), [usinagemMin, usinagemMax, compactacaoMin, compactacaoMax])

  const resultado = useMemo((): { ok: true; r: ReturnType<typeof curvaViscosidade> } | { ok: false; problema: string } | null => {
    if (pontosPreenchidos.length < 2) return null
    try {
      const medicoes: PontoVisc[] = pontosPreenchidos.map(p => ({ temperatura: n(p.temperatura), viscosidade: n(p.viscosidade) }))
      return { ok: true, r: curvaViscosidade(medicoes, faixas) }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [pontosPreenchidos, faixas])

  const dadosGrafico = useMemo(() => {
    if (!resultado?.ok) return []
    const { coefA, coefB } = resultado.r
    const temps = pontosPreenchidos.map(p => n(p.temperatura))
    const tMin = Math.min(...temps) - 5
    const tMax = Math.max(...temps) + 15
    const passo = Math.max(1, (tMax - tMin) / 60)
    const linhas: { temperatura: number; regressao: number; amostra?: number }[] = []
    for (let t = tMin; t <= tMax; t += passo) {
      linhas.push({ temperatura: Math.round(t * 100) / 100, regressao: Math.exp(coefA + coefB * t) })
    }
    for (const p of pontosPreenchidos) {
      const t = n(p.temperatura)
      linhas.push({ temperatura: t, regressao: Math.exp(coefA + coefB * t), amostra: n(p.viscosidade) })
    }
    return linhas.sort((a, b) => a.temperatura - b.temperatura)
  }, [resultado, pontosPreenchidos, faixas])

  const salvar = useMutation({
    mutationFn: async () => {
      if (pontosPreenchidos.length < 2) throw new Error('Informe ao menos dois pontos de temperatura/viscosidade.')
      if (!resultado) throw new Error('Informe ao menos dois pontos válidos.')
      if (!resultado.ok) throw new Error(resultado.problema)
      const r = resultado.r

      const payload = {
        dosagem_id: dosagemId,
        material: material.trim() || null,
        pontos: pontosPreenchidos.map(p => ({ temperatura: n(p.temperatura), viscosidade: n(p.viscosidade) })),
        faixas,
        ponto_fulgor: pontoFulgor === '' ? null : n(pontoFulgor),
        ponto_amolecimento: pontoAmolecimento === '' ? null : n(pontoAmolecimento),
        penetracao: penetracao === '' ? null : n(penetracao),
        temp_usinagem_min: r.tempUsinagem.min,
        temp_usinagem_max: r.tempUsinagem.max,
        temp_compactacao_min: r.tempCompactacao.min,
        temp_compactacao_max: r.tempCompactacao.max,
      }
      const { error } = await supabase.from('projeto_viscosidade').upsert(payload, { onConflict: 'dosagem_id' })
      if (error) throw new Error('Falha ao salvar viscosidade do CAP: ' + error.message)
    },
    onSuccess: () => setErro(''),
    onError: (e: Error) => setErro(e.message),
  })

  const inp = 'border rounded p-2 w-full'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-grp-700">Viscosidade do CAP — {dosagem?.nome ?? '…'}</h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/dosagens')}>Voltar aos projetos</button>
      </div>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita a viscosidade do CAP. Exibindo em modo leitura.</p>}

      <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
        <h2 className="font-semibold text-lg text-grp-700">Ensaios de caracterização do ligante</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="text-sm">Material / amostra
            <input className={inp} value={material} disabled={!podeEditar}
              onChange={e => setMaterial(e.target.value)} placeholder="ex.: CAP 30-45" /></label>
          <label className="text-sm">Ponto de fulgor (°C)
            <input className={inp} type="number" step="any" value={pontoFulgor} disabled={!podeEditar}
              onChange={e => setPontoFulgor(e.target.value)} /></label>
          <label className="text-sm">Ponto de amolecimento (°C)
            <input className={inp} type="number" step="any" value={pontoAmolecimento} disabled={!podeEditar}
              onChange={e => setPontoAmolecimento(e.target.value)} /></label>
          <label className="text-sm">Penetração (0,1 mm)
            <input className={inp} type="number" step="any" value={penetracao} disabled={!podeEditar}
              onChange={e => setPenetracao(e.target.value)} /></label>
        </div>
      </section>

      <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
        <h2 className="font-semibold text-lg text-grp-700">Viscosidade Saybolt-Furol × temperatura</h2>
        <p className="text-sm text-slate-500">
          Para cada temperatura (°C), informe o tempo de escoamento (segundos SSF). A curva é ajustada por
          regressão de mínimos quadrados de ln(viscosidade) em função da temperatura — equivalente ao LOGEST
          usado na planilha original.
        </p>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm max-w-lg">
            <thead>
              <tr className="text-left border-b">
                <th className="p-2">Ponto</th><th>Temperatura (°C)</th><th>Viscosidade (seg SSF)</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((p, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2 font-semibold">{i + 1}</td>
                  <td><input className="border rounded p-1 w-28" type="number" step="any" value={p.temperatura} disabled={!podeEditar}
                    onChange={e => alterarPonto(i, 'temperatura', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-28" type="number" step="any" value={p.viscosidade} disabled={!podeEditar}
                    onChange={e => alterarPonto(i, 'viscosidade', e.target.value)} /></td>
                  <td>{podeEditar && pontos.length > 2 && (
                    <button type="button" className="text-red-600 text-xs" onClick={() => removerPonto(i)}>×</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {podeEditar && (
          <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarPonto}>+ Ponto</button>
        )}

        <h3 className="font-semibold text-sm mt-4">Faixas-alvo de viscosidade (segundos SSF)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
          <label className="text-sm">Usinagem — mínima
            <input className={inp} type="number" step="any" value={usinagemMin} disabled={!podeEditar}
              onChange={e => setUsinagemMin(e.target.value)} /></label>
          <label className="text-sm">Usinagem — máxima
            <input className={inp} type="number" step="any" value={usinagemMax} disabled={!podeEditar}
              onChange={e => setUsinagemMax(e.target.value)} /></label>
          <label className="text-sm">Compactação — mínima
            <input className={inp} type="number" step="any" value={compactacaoMin} disabled={!podeEditar}
              onChange={e => setCompactacaoMin(e.target.value)} /></label>
          <label className="text-sm">Compactação — máxima
            <input className={inp} type="number" step="any" value={compactacaoMax} disabled={!podeEditar}
              onChange={e => setCompactacaoMax(e.target.value)} /></label>
        </div>

        {resultado && !resultado.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{resultado.problema}</p>}
        {resultado?.ok && (
          <>
            <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><p className="text-xs text-slate-500">Coeficiente a (ln V = a + b·T)</p><p className="text-lg font-semibold">{fmt(resultado.r.coefA, 4)}</p></div>
              <div><p className="text-xs text-slate-500">Coeficiente b</p><p className="text-lg font-semibold">{fmt(resultado.r.coefB, 6)}</p></div>
              <div><p className="text-xs text-slate-500">Temperatura de usinagem</p><p className="text-lg font-semibold">{fmt(resultado.r.tempUsinagem.min, 1)} a {fmt(resultado.r.tempUsinagem.max, 1)} °C</p></div>
              <div><p className="text-xs text-slate-500">Temperatura de compactação</p><p className="text-lg font-semibold">{fmt(resultado.r.tempCompactacao.min, 1)} a {fmt(resultado.r.tempCompactacao.max, 1)} °C</p></div>
            </div>

            <div className="flex flex-col items-center">
              <h3 className="text-sm font-semibold mb-1 text-center">Curva viscosidade × temperatura (escala log)</h3>
              <LineChart width={520} height={280} data={dadosGrafico}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="temperatura" type="number" domain={['dataMin', 'dataMax']}
                  label={{ value: 'Temperatura (°C)', position: 'insideBottom', offset: -4 }} />
                <YAxis scale="log" domain={['auto', 'auto']} allowDataOverflow
                  label={{ value: 'Viscosidade (seg SSF)', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <ReferenceArea y1={faixas.usinagemMin} y2={faixas.usinagemMax} fill="#f59e0b" fillOpacity={0.15}
                  label={{ value: 'Usinagem', position: 'insideTopLeft', fontSize: 11 }} />
                <ReferenceArea y1={faixas.compactacaoMin} y2={faixas.compactacaoMax} fill="#2563eb" fillOpacity={0.15}
                  label={{ value: 'Compactação', position: 'insideTopLeft', fontSize: 11 }} />
                <Line dataKey="regressao" name="Regressão" stroke="#059669" strokeWidth={2} dot={false} />
                <Line dataKey="amostra" name="Amostra" stroke="#dc2626" strokeWidth={0} dot={{ r: 5 }} />
              </LineChart>
            </div>
          </>
        )}
      </section>

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50" disabled={salvar.isPending}
            onClick={() => salvar.mutate()}>
            Salvar viscosidade do CAP
          </button>
          {salvar.isSuccess && !erro && <span className="text-green-700 text-sm">Salvo.</span>}
        </div>
      )}
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </div>
  )
}
