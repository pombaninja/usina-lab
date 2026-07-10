import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { equivalenteAreia, type DeterminacaoEA } from '../lib/calculos/equivalenteAreia'
import { fmt } from '../lib/formato'

interface DetEAForm { leituraAreia: string; leituraArgila: string }

const n = (s: string) => (s === '' ? NaN : Number(s))
const detEAVazia = (): DetEAForm => ({ leituraAreia: '', leituraArgila: '' })

export default function ProjetoComplementaresPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const dosagemId = id!
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [dets, setDets] = useState<DetEAForm[]>([detEAVazia()])
  const [adesividade, setAdesividade] = useState('')
  const [adesividadeObs, setAdesividadeObs] = useState('')
  const [durabilidade, setDurabilidade] = useState('')
  const [erro, setErro] = useState('')
  const [carregado, setCarregado] = useState(false)

  const { data: dosagem } = useQuery({
    queryKey: ['dosagem-complementares', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagens').select('id, nome, parametros_projeto').eq('id', dosagemId).single()
      if (error) throw error
      return data as { id: string; nome: string; parametros_projeto: Record<string, unknown> | null }
    },
  })

  const { data: existente } = useQuery({
    queryKey: ['projeto-complementares', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_complementares').select('*').eq('dosagem_id', dosagemId).maybeSingle()
      if (error) throw error
      return data as {
        dosagem_id: string
        ea_determinacoes: { leitura_areia: number; leitura_argila: number }[] | null
        ea_resultado: number | null
        adesividade: string | null
        adesividade_obs: string | null
        durabilidade_sulfato: number | null
      } | null
    },
  })

  // Prefill do formulário a partir dos dados já salvos (modo edição)
  useEffect(() => {
    if (existente === undefined || carregado) return
    if (existente) {
      const determinacoes = existente.ea_determinacoes ?? []
      setDets(determinacoes.length
        ? determinacoes.map(d => ({ leituraAreia: String(d.leitura_areia), leituraArgila: String(d.leitura_argila) }))
        : [detEAVazia()])
      setAdesividade(existente.adesividade ?? '')
      setAdesividadeObs(existente.adesividade_obs ?? '')
      setDurabilidade(existente.durabilidade_sulfato !== null && existente.durabilidade_sulfato !== undefined ? String(existente.durabilidade_sulfato) : '')
    }
    setCarregado(true)
  }, [existente, carregado])

  function alterarDet(i: number, campo: keyof DetEAForm, valor: string) {
    setDets(dets.map((d, idx) => (idx === i ? { ...d, [campo]: valor } : d)))
  }
  function adicionarDet() { setDets([...dets, detEAVazia()]) }
  function removerDet(i: number) { setDets(dets.filter((_, idx) => idx !== i)) }

  const detsPreenchidas = useMemo(() => dets.filter(d => d.leituraAreia !== '' && d.leituraArgila !== ''), [dets])

  const resultadoEA = useMemo((): { ok: true; valor: number } | { ok: false; problema: string } | null => {
    if (!detsPreenchidas.length) return null
    try {
      const valor = equivalenteAreia(detsPreenchidas.map((d): DeterminacaoEA => ({
        leituraAreia: n(d.leituraAreia),
        leituraArgila: n(d.leituraArgila),
      })))
      return { ok: true, valor }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [detsPreenchidas])

  const salvar = useMutation({
    mutationFn: async () => {
      if (!detsPreenchidas.length && !adesividade && durabilidade === '') {
        throw new Error('Informe ao menos um ensaio complementar (equivalente de areia, adesividade ou durabilidade ao sulfato).')
      }
      if (dets.some(d => (d.leituraAreia !== '' && d.leituraArgila === '') || (d.leituraAreia === '' && d.leituraArgila !== ''))) {
        throw new Error('Informe as duas leituras (areia e argila) de cada determinação de equivalente de areia preenchida.')
      }
      if (resultadoEA && !resultadoEA.ok) throw new Error(resultadoEA.problema)
      if (durabilidade !== '') {
        const d = Number(durabilidade)
        if (!Number.isFinite(d) || d < 0) throw new Error('Durabilidade ao sulfato de sódio inválida (use um valor ≥ 0).')
      }

      const eaResultado = resultadoEA?.ok ? resultadoEA.valor : null

      const payload = {
        dosagem_id: dosagemId,
        ea_determinacoes: detsPreenchidas.length
          ? detsPreenchidas.map(d => ({ leitura_areia: n(d.leituraAreia), leitura_argila: n(d.leituraArgila) }))
          : null,
        ea_resultado: eaResultado,
        adesividade: adesividade || null,
        adesividade_obs: adesividadeObs.trim() || null,
        durabilidade_sulfato: durabilidade !== '' ? Number(durabilidade) : null,
      }

      const { error } = await supabase.from('projeto_complementares').upsert(payload, { onConflict: 'dosagem_id' })
      if (error) throw new Error('Falha ao salvar ensaios complementares: ' + error.message)

      // Reflete os resultados em dosagens.parametros_projeto para que o resumo/semáforo do
      // projeto enxergue equivalente de areia, durabilidade ao sulfato e adesividade.
      const { data: dosagemAtual, error: errDosagem } = await supabase.from('dosagens').select('parametros_projeto').eq('id', dosagemId).single()
      if (errDosagem) throw new Error('Falha ao ler parâmetros do projeto: ' + errDosagem.message)
      const parametros: Record<string, unknown> = { ...((dosagemAtual as { parametros_projeto: Record<string, unknown> | null }).parametros_projeto ?? {}) }
      if (eaResultado !== null) parametros.equivalente_areia = eaResultado
      else delete parametros.equivalente_areia
      if (durabilidade !== '') parametros.durabilidade_sulfato = Number(durabilidade)
      else delete parametros.durabilidade_sulfato
      if (adesividade) parametros.adesividade = adesividade
      else delete parametros.adesividade

      const { error: errUpdate } = await supabase.from('dosagens')
        .update({ parametros_projeto: Object.keys(parametros).length ? parametros : null })
        .eq('id', dosagemId)
      if (errUpdate) throw new Error('Falha ao atualizar parâmetros do projeto: ' + errUpdate.message)
    },
    onSuccess: () => setErro(''),
    onError: (e: Error) => setErro(e.message),
  })

  const inp = 'border rounded p-2 w-full'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ensaios complementares — {dosagem?.nome ?? '…'}</h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/dosagens')}>Voltar aos projetos</button>
      </div>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita os ensaios complementares. Exibindo em modo leitura.</p>}

      {/* ===== Equivalente de areia ===== */}
      <section className="bg-white p-4 rounded-xl shadow space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Equivalente de areia — DNER-ME 054/94</h2>
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
              {dets.map((d, i) => {
                let ea: number | null = null
                if (d.leituraAreia !== '' && d.leituraArgila !== '') {
                  try { ea = equivalenteAreia([{ leituraAreia: n(d.leituraAreia), leituraArgila: n(d.leituraArgila) }]) } catch { ea = null }
                }
                return (
                  <tr key={i} className="border-b">
                    <td className="p-2 font-semibold">{i + 1}</td>
                    <td><input className="border rounded p-1 w-24" type="number" step="any" value={d.leituraAreia} disabled={!podeEditar}
                      onChange={e => alterarDet(i, 'leituraAreia', e.target.value)} /></td>
                    <td><input className="border rounded p-1 w-24" type="number" step="any" value={d.leituraArgila} disabled={!podeEditar}
                      onChange={e => alterarDet(i, 'leituraArgila', e.target.value)} /></td>
                    <td>{ea !== null ? fmt(ea, 2) : '—'}</td>
                    <td>{podeEditar && dets.length > 1 && (
                      <button type="button" className="text-red-600 text-xs" onClick={() => removerDet(i)}>×</button>
                    )}</td>
                  </tr>
                )
              })}
              <tr className="bg-slate-50 font-semibold">
                <td className="p-2">Resultado (média)</td><td></td><td></td>
                <td>{resultadoEA?.ok ? fmt(resultadoEA.valor, 2) : '—'}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        {resultadoEA && !resultadoEA.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{resultadoEA.problema}</p>}
      </section>

      {/* ===== Adesividade ===== */}
      <section className="bg-white p-4 rounded-xl shadow space-y-3">
        <h2 className="font-semibold text-lg">Adesividade — DNER-ME 78/94</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Resultado
            <select className={inp} value={adesividade} disabled={!podeEditar} onChange={e => setAdesividade(e.target.value)}>
              <option value="">—</option>
              <option value="satisfatoria">Satisfatória</option>
              <option value="nao_satisfatoria">Não satisfatória</option>
            </select>
          </label>
          <label className="text-sm">Observações
            <input className={inp} value={adesividadeObs} disabled={!podeEditar} onChange={e => setAdesividadeObs(e.target.value)} /></label>
        </div>
      </section>

      {/* ===== Durabilidade ao sulfato de sódio ===== */}
      <section className="bg-white p-4 rounded-xl shadow space-y-3">
        <h2 className="font-semibold text-lg">Durabilidade ao sulfato de sódio — DNER-ME 089/94</h2>
        <label className="text-sm block max-w-xs">Perda (%)
          <input className={inp} type="number" step="any" min="0" value={durabilidade} disabled={!podeEditar}
            onChange={e => setDurabilidade(e.target.value)} /></label>
      </section>

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button className="bg-blue-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50" disabled={salvar.isPending}
            onClick={() => salvar.mutate()}>
            Salvar ensaios complementares
          </button>
          {salvar.isSuccess && !erro && <span className="text-green-700 text-sm">Salvo.</span>}
        </div>
      )}
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </div>
  )
}
