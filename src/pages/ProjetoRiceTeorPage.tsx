import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, Tooltip, ReferenceLine, ReferenceDot } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { gmmRice } from '../lib/calculos/teorBetume'
import { interpolarValorNoTeor } from '../lib/calculos/dosagemMarshall'
import { fmt } from '../lib/formato'

// Uma linha por teor de CAP: massas do frasco Rice (A, B, C) + fator de temperatura.
// A DMT (Rice teórica / Gmm) é calculada ao vivo reutilizando gmmRice (AASHTO T-209).
interface RiceRow {
  id?: string; teor: string; pesoAmostra: string; frascoAgua: string; frascoAmostraAgua: string; fatorTemp: string
}

const n = (s: string) => (s === '' ? NaN : Number(s))
const riceVazio = (): RiceRow => ({ teor: '', pesoAmostra: '', frascoAgua: '', frascoAmostraAgua: '', fatorTemp: '1' })

// DMT ao vivo por linha: null quando incompleto; {erro} quando as leituras são inconsistentes.
function dmtDaLinha(r: RiceRow): { valor: number } | { erro: string } | null {
  if (r.pesoAmostra === '' || r.frascoAgua === '' || r.frascoAmostraAgua === '') return null
  const A = n(r.pesoAmostra), B = n(r.frascoAgua), C = n(r.frascoAmostraAgua)
  const f = r.fatorTemp === '' ? 1 : n(r.fatorTemp)
  if (![A, B, C, f].every(Number.isFinite)) return null
  try {
    return { valor: gmmRice(A, B, C, f) }
  } catch (e) {
    return { erro: (e as Error).message }
  }
}

export default function ProjetoRiceTeorPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const dosagemId = id!
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [linhas, setLinhas] = useState<RiceRow[]>([riceVazio()])
  const [erro, setErro] = useState('')
  const [carregado, setCarregado] = useState(false)

  const { data: dosagem } = useQuery({
    queryKey: ['dosagem-rice-teor', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagens').select('id, nome, teor_otimo').eq('id', dosagemId).single()
      if (error) throw error
      return data as { id: string; nome: string; teor_otimo: number | null }
    },
  })

  const { data: existentes } = useQuery({
    queryKey: ['projeto-rice-teor', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_rice_teor').select('*').eq('dosagem_id', dosagemId).order('teor')
      if (error) throw error
      return (data ?? []) as {
        id: string; teor: number; peso_amostra: number | null; frasco_agua: number | null
        frasco_amostra_agua: number | null; fator_temp: number | null; ordem: number
      }[]
    },
  })

  // Prefill do formulário a partir dos dados já salvos (modo edição)
  useEffect(() => {
    if (!existentes || carregado) return
    if (existentes.length) {
      setLinhas(existentes.map((r): RiceRow => ({
        id: r.id,
        teor: String(r.teor),
        pesoAmostra: r.peso_amostra != null ? String(r.peso_amostra) : '',
        frascoAgua: r.frasco_agua != null ? String(r.frasco_agua) : '',
        frascoAmostraAgua: r.frasco_amostra_agua != null ? String(r.frasco_amostra_agua) : '',
        fatorTemp: r.fator_temp != null ? String(r.fator_temp) : '1',
      })))
    }
    setCarregado(true)
  }, [existentes, carregado])

  function alterar(i: number, campo: keyof RiceRow, valor: string) {
    setLinhas(linhas.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)))
  }
  function adicionar() { setLinhas([...linhas, riceVazio()]) }
  function remover(i: number) { setLinhas(linhas.filter((_, idx) => idx !== i)) }

  const salvar = useMutation({
    mutationFn: async () => {
      const preenchidos = linhas.filter(r => r.teor.trim() !== '')
      if (!preenchidos.length) throw new Error('Informe ao menos um teor.')
      const teoresVistos = new Set<number>()
      for (const r of preenchidos) {
        const teor = n(r.teor)
        if (!Number.isFinite(teor)) throw new Error('Teor inválido em uma das linhas.')
        if (teoresVistos.has(teor)) throw new Error(`Teor ${fmt(teor, 2)}% repetido — há apenas uma Rice por teor.`)
        teoresVistos.add(teor)
      }

      type LinhaSalvar = {
        id?: string; dosagem_id: string; teor: number; peso_amostra: number | null; frasco_agua: number | null
        frasco_amostra_agua: number | null; fator_temp: number; ordem: number
      }
      // Persistir em ordem crescente de teor (ordem = índice na lista ordenada).
      const ordenados = [...preenchidos].sort((a, b) => n(a.teor) - n(b.teor))
      const salvar: LinhaSalvar[] = ordenados.map((r, i) => ({
        id: r.id,
        dosagem_id: dosagemId,
        teor: n(r.teor),
        peso_amostra: r.pesoAmostra.trim() === '' ? null : n(r.pesoAmostra),
        frasco_agua: r.frascoAgua.trim() === '' ? null : n(r.frascoAgua),
        frasco_amostra_agua: r.frascoAmostraAgua.trim() === '' ? null : n(r.frascoAmostraAgua),
        fator_temp: r.fatorTemp.trim() === '' ? 1 : n(r.fatorTemp),
        ordem: i,
      }))

      const comId = salvar.filter(l => l.id)
      const semId = salvar.filter(l => !l.id)

      if (comId.length) {
        const { error } = await supabase.from('projeto_rice_teor').upsert(comId, { onConflict: 'id' })
        if (error) throw new Error('Falha ao salvar o ensaio RICE-TEOR: ' + error.message)
      }
      if (semId.length) {
        const { data, error } = await supabase.from('projeto_rice_teor')
          .insert(semId.map(({ id: _id, ...resto }) => resto)).select('id')
        if (error) throw new Error('Falha ao salvar o ensaio RICE-TEOR: ' + error.message)
        data?.forEach((row: { id: string }, idx: number) => { semId[idx].id = row.id })
      }

      const { data: antigos, error: errAntigos } = await supabase.from('projeto_rice_teor').select('id').eq('dosagem_id', dosagemId)
      if (errAntigos) throw new Error('Falha ao conferir teores existentes: ' + errAntigos.message)
      const idsAtuais = new Set(salvar.map(l => l.id).filter((v): v is string => !!v))
      const idsRemover = (antigos ?? []).filter((x: { id: string }) => !idsAtuais.has(x.id)).map((x: { id: string }) => x.id)
      if (idsRemover.length) {
        const { error: errDel } = await supabase.from('projeto_rice_teor').delete().in('id', idsRemover)
        if (errDel) throw new Error('Falha ao remover teores excluídos: ' + errDel.message)
      }

      // Reflete os ids atribuídos, mantendo a ordem crescente de teor exibida.
      setLinhas(ordenados.map((r, idx) => ({ ...r, id: salvar[idx].id })))
    },
    onSuccess: () => setErro(''),
    onError: (e: Error) => setErro(e.message),
  })

  const inp = 'border rounded p-1 w-28'
  const dmts = useMemo(() => linhas.map(dmtDaLinha), [linhas])

  // Pontos DMT × teor calculados ao vivo (só linhas com teor válido e gmmRice sem erro), em ordem de teor.
  const pontosGrafico = useMemo(() => {
    const pts: { teor: number; DMT: number }[] = []
    linhas.forEach((r, i) => {
      const teor = n(r.teor)
      const dmt = dmts[i]
      if (!Number.isFinite(teor) || dmt == null || 'erro' in dmt) return
      pts.push({ teor, DMT: dmt.valor })
    })
    return pts.sort((a, b) => a.teor - b.teor)
  }, [linhas, dmts])

  // Cruzamento do teor ótimo do projeto na curva DMT × teor (mesmo idioma das curvas
  // da dosagem Marshall): DMT interpolada linearmente no teor ótimo. Sem cruzamento
  // quando o projeto ainda não tem teor ótimo ou há menos de 2 pontos válidos.
  const teorOtimo = dosagem?.teor_otimo ?? null
  const dmtNoOtimo = useMemo(() => {
    if (teorOtimo == null || pontosGrafico.length < 2) return null
    return interpolarValorNoTeor(pontosGrafico.map(p => ({ teor: p.teor, valor: p.DMT })), teorOtimo)
  }, [teorOtimo, pontosGrafico])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ensaio RICE-TEOR (Rice/DMT por teor) — {dosagem?.nome ?? '…'}</h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/dosagens')}>Voltar aos projetos</button>
      </div>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita o ensaio RICE-TEOR. Exibindo em modo leitura.</p>}
      <p className="text-sm text-slate-600">
        Para cada teor de CAP, informe as massas do frasco Rice — A: amostra seca ao ar; B: frasco + água (calibração);
        C: frasco + água + amostra. A DMT (Rice teórica) é calculada por A/(A+B−C)·fator (AASHTO T-209) e é puxada
        automaticamente na Dosagem Marshall.
      </p>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Teores</h2>
        {podeEditar && <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionar}>+ Adicionar teor</button>}
      </div>

      <div className="overflow-x-auto bg-white p-4 rounded-xl shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">Teor (% CAP)</th>
              <th>A — amostra seca (g)</th>
              <th>B — frasco + água (g)</th>
              <th>C — frasco + água + amostra (g)</th>
              <th>Fator temp.</th>
              <th>DMT (Rice teórica)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((r, i) => {
              const dmt = dmts[i]
              return (
                <tr key={r.id ?? `novo-${i}`} className="border-b">
                  <td className="p-2">
                    <input className={inp} type="number" step="any" value={r.teor} disabled={!podeEditar}
                      onChange={e => alterar(i, 'teor', e.target.value)} />
                  </td>
                  <td><input className={inp} type="number" step="any" value={r.pesoAmostra} disabled={!podeEditar}
                    onChange={e => alterar(i, 'pesoAmostra', e.target.value)} /></td>
                  <td><input className={inp} type="number" step="any" value={r.frascoAgua} disabled={!podeEditar}
                    onChange={e => alterar(i, 'frascoAgua', e.target.value)} /></td>
                  <td><input className={inp} type="number" step="any" value={r.frascoAmostraAgua} disabled={!podeEditar}
                    onChange={e => alterar(i, 'frascoAmostraAgua', e.target.value)} /></td>
                  <td><input className={inp} type="number" step="any" value={r.fatorTemp} disabled={!podeEditar}
                    onChange={e => alterar(i, 'fatorTemp', e.target.value)} /></td>
                  <td className="p-2 font-semibold">
                    {dmt == null
                      ? '—'
                      : 'erro' in dmt
                        ? <span className="text-amber-700">confira A, B e C (A+B−C deve ser &gt; 0)</span>
                        : fmt(dmt.valor, 3)}
                  </td>
                  <td>
                    {podeEditar && linhas.length > 1 && (
                      <button type="button" className="text-red-600 text-xs" onClick={() => remover(i)}>Remover</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pontosGrafico.length > 0 && (
        <section className="bg-white p-4 rounded-xl shadow space-y-2">
          <h2 className="font-semibold text-lg">Densidade máxima (DMT) × Teor</h2>
          <div className="flex justify-center">
          <LineChart width={520} height={280} data={pontosGrafico}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="teor" type="number" domain={['dataMin', 'dataMax']} label={{ value: 'Teor (%)', position: 'insideBottom', offset: -4 }} />
            <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => fmt(v, 3)} width={70} />
            <Tooltip />
            <Legend />
            {dmtNoOtimo != null && (
              <ReferenceLine x={teorOtimo!} stroke="#334155" strokeDasharray="4 4" />
            )}
            {dmtNoOtimo != null && (
              <ReferenceLine y={dmtNoOtimo} stroke="#334155" strokeDasharray="4 4" />
            )}
            {dmtNoOtimo != null && (
              <ReferenceDot x={teorOtimo!} y={dmtNoOtimo} r={4} fill="#65a30d" stroke="#fff"
                label={{ value: fmt(dmtNoOtimo, 3), position: 'top', fontSize: 11, fontWeight: 600 }} />
            )}
            <Line dataKey="DMT" stroke="#65a30d" strokeWidth={2} dot />
          </LineChart>
          </div>
          {dmtNoOtimo != null
            ? <p className="text-sm text-slate-600">DMT interpolada no teor ótimo ({fmt(teorOtimo, 2)}%): <b>{fmt(dmtNoOtimo, 3)}</b></p>
            : <p className="text-xs text-slate-500">
                {teorOtimo == null
                  ? 'Sem cruzamento: o projeto ainda não tem teor ótimo definido (Dosagem Marshall).'
                  : pontosGrafico.length < 2 ? 'Sem cruzamento: informe ao menos 2 teores com DMT válida.' : ''}
              </p>}
        </section>
      )}

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button className="bg-blue-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50" disabled={salvar.isPending}
            onClick={() => salvar.mutate()}>
            Salvar ensaio RICE-TEOR
          </button>
          {salvar.isSuccess && !erro && <span className="text-green-700 text-sm">Salvo.</span>}
        </div>
      )}
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </div>
  )
}
