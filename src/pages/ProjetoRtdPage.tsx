import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { calcularRtd } from '../lib/calculos/rtd'
import { fmt } from '../lib/formato'

// Um CP por linha: leitura da prensa + dimensões do corpo de prova. O RTD (MPa) é
// calculado ao vivo reutilizando calcularRtd (o mesmo do ensaio diário cauq_rtd_cp),
// com a constante da prensa lida da Dosagem Marshall do projeto (projeto_marshall).
interface RtdRow { id?: string; leitura: string; diametro: string; altura: string }

const n = (s: string) => (s === '' ? NaN : Number(s))
const rtdVazio = (): RtdRow => ({ leitura: '', diametro: '10', altura: '' })

export default function ProjetoRtdPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const dosagemId = id!
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [linhas, setLinhas] = useState<RtdRow[]>([rtdVazio()])
  // Constante da prensa local: usada SOMENTE quando o projeto ainda não tem
  // projeto_marshall salvo (a da dosagem Marshall, quando existe, prevalece).
  const [constanteLocal, setConstanteLocal] = useState('1.79')
  const [erro, setErro] = useState('')
  const [carregado, setCarregado] = useState(false)

  const { data: dosagem } = useQuery({
    queryKey: ['dosagem-rtd', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagens').select('id, nome').eq('id', dosagemId).single()
      if (error) throw error
      return data as { id: string; nome: string }
    },
  })

  const { data: marshall } = useQuery({
    queryKey: ['rtd-marshall', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_marshall').select('constante_prensa').eq('dosagem_id', dosagemId).maybeSingle()
      if (error) throw error
      return (data ?? null) as { constante_prensa: number } | null
    },
  })

  const { data: existentes } = useQuery({
    queryKey: ['projeto-rtd', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_rtd_cp').select('*').eq('dosagem_id', dosagemId).order('ordem').order('cp')
      if (error) throw error
      return (data ?? []) as { id: string; cp: number; leitura: number | null; diametro_cm: number | null; altura_cm: number | null; ordem: number }[]
    },
  })

  // Prefill do formulário a partir dos dados já salvos (modo edição)
  useEffect(() => {
    if (!existentes || carregado) return
    if (existentes.length) {
      setLinhas(existentes.map((r): RtdRow => ({
        id: r.id,
        leitura: r.leitura != null ? String(r.leitura) : '',
        diametro: r.diametro_cm != null ? String(r.diametro_cm) : '10',
        altura: r.altura_cm != null ? String(r.altura_cm) : '',
      })))
    }
    setCarregado(true)
  }, [existentes, carregado])

  function alterar(i: number, campo: keyof RtdRow, valor: string) {
    setLinhas(linhas.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)))
  }
  function adicionar() { setLinhas([...linhas, rtdVazio()]) }
  function remover(i: number) { setLinhas(linhas.filter((_, idx) => idx !== i)) }

  const constantePrensa = marshall?.constante_prensa ?? n(constanteLocal)

  // RTD ao vivo por CP (MPa) e média dos CPs válidos — reutiliza calcularRtd.
  const rtds = useMemo(() => linhas.map(r => {
    if (r.leitura === '' || r.diametro === '' || r.altura === '') return null
    const leitura = n(r.leitura), d = n(r.diametro), h = n(r.altura)
    if (![leitura, d, h, constantePrensa].every(Number.isFinite) || d <= 0 || h <= 0) return null
    return calcularRtd([{ leitura, constantePrensa, diametroCm: d, alturaCm: h }]).rtdMpa[0]
  }), [linhas, constantePrensa])
  const rtdMedia = useMemo(() => {
    const validos = rtds.filter((v): v is number => v != null)
    return validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null
  }, [rtds])

  const salvar = useMutation({
    mutationFn: async () => {
      const preenchidos = linhas.filter(r => r.leitura.trim() !== '' || r.diametro.trim() !== '' || r.altura.trim() !== '')
      if (!preenchidos.length) throw new Error('Informe ao menos um corpo de prova.')

      type LinhaSalvar = { id?: string; dosagem_id: string; cp: number; leitura: number | null; diametro_cm: number | null; altura_cm: number | null; ordem: number }
      const salvar: LinhaSalvar[] = preenchidos.map((r, i) => ({
        id: r.id,
        dosagem_id: dosagemId,
        cp: i + 1,
        leitura: r.leitura.trim() === '' ? null : n(r.leitura),
        diametro_cm: r.diametro.trim() === '' ? null : n(r.diametro),
        altura_cm: r.altura.trim() === '' ? null : n(r.altura),
        ordem: i,
      }))
      for (const l of salvar) {
        if (l.leitura != null && !Number.isFinite(l.leitura)) throw new Error('Leitura inválida em um dos corpos de prova.')
        if (l.diametro_cm != null && !Number.isFinite(l.diametro_cm)) throw new Error('Diâmetro inválido em um dos corpos de prova.')
        if (l.altura_cm != null && !Number.isFinite(l.altura_cm)) throw new Error('Altura inválida em um dos corpos de prova.')
      }

      const comId = salvar.filter(l => l.id)
      const semId = salvar.filter(l => !l.id)

      if (comId.length) {
        const { error } = await supabase.from('projeto_rtd_cp').upsert(comId, { onConflict: 'id' })
        if (error) throw new Error('Falha ao salvar o ensaio de Ruptura Diametral: ' + error.message)
      }
      if (semId.length) {
        const { data, error } = await supabase.from('projeto_rtd_cp')
          .insert(semId.map(({ id: _id, ...resto }) => resto)).select('id')
        if (error) throw new Error('Falha ao salvar o ensaio de Ruptura Diametral: ' + error.message)
        data?.forEach((row: { id: string }, idx: number) => { semId[idx].id = row.id })
      }

      const { data: antigos, error: errAntigos } = await supabase.from('projeto_rtd_cp').select('id').eq('dosagem_id', dosagemId)
      if (errAntigos) throw new Error('Falha ao conferir corpos de prova existentes: ' + errAntigos.message)
      const idsAtuais = new Set(salvar.map(l => l.id).filter((v): v is string => !!v))
      const idsRemover = (antigos ?? []).filter((x: { id: string }) => !idsAtuais.has(x.id)).map((x: { id: string }) => x.id)
      if (idsRemover.length) {
        const { error: errDel } = await supabase.from('projeto_rtd_cp').delete().in('id', idsRemover)
        if (errDel) throw new Error('Falha ao remover corpos de prova excluídos: ' + errDel.message)
      }

      // Reflete os ids atribuídos, mantendo a ordem exibida (CP = posição na lista).
      setLinhas(preenchidos.map((r, idx) => ({ ...r, id: salvar[idx].id })))
    },
    onSuccess: () => setErro(''),
    onError: (e: Error) => setErro(e.message),
  })

  const inp = 'border rounded p-1 w-28'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ruptura Diametral (RTD) — {dosagem?.nome ?? '…'}</h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/dosagens')}>Voltar aos projetos</button>
      </div>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita o ensaio de Ruptura Diametral. Exibindo em modo leitura.</p>}
      <p className="text-sm text-slate-600">
        Para cada corpo de prova, informe a leitura da prensa e as dimensões (diâmetro e altura em cm).
        O RTD é calculado por 2·carga/(π·D·H), com carga = leitura × constante da prensa, convertido para MPa.
        A média é puxada automaticamente para a característica "Resistência à tração diametral" do projeto.
      </p>

      <section className="bg-white p-4 rounded-xl shadow">
        {marshall?.constante_prensa != null ? (
          <p className="text-sm">Constante da prensa (da Dosagem Marshall): <b>{fmt(marshall.constante_prensa, 4)}</b></p>
        ) : (
          <label className="text-sm">Constante da prensa (projeto ainda sem Dosagem Marshall salva)
            <input className="border rounded p-2 w-28 ml-2" type="number" step="any" value={constanteLocal} disabled={!podeEditar}
              onChange={e => setConstanteLocal(e.target.value)} /></label>
        )}
      </section>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Corpos de prova</h2>
        {podeEditar && <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionar}>+ Adicionar CP</button>}
      </div>

      <div className="overflow-x-auto bg-white p-4 rounded-xl shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">CP nº</th>
              <th>Leitura</th>
              <th>Diâmetro (cm)</th>
              <th>Altura (cm)</th>
              <th>RTD (MPa)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((r, i) => (
              <tr key={r.id ?? `novo-${i}`} className="border-b">
                <td className="p-2 font-semibold">{i + 1}</td>
                <td><input className={inp} type="number" step="any" value={r.leitura} disabled={!podeEditar}
                  onChange={e => alterar(i, 'leitura', e.target.value)} /></td>
                <td><input className={inp} type="number" step="any" value={r.diametro} disabled={!podeEditar}
                  onChange={e => alterar(i, 'diametro', e.target.value)} /></td>
                <td><input className={inp} type="number" step="any" value={r.altura} disabled={!podeEditar}
                  onChange={e => alterar(i, 'altura', e.target.value)} /></td>
                <td className="p-2 font-semibold">{rtds[i] != null ? fmt(rtds[i], 2) : '—'}</td>
                <td>
                  {podeEditar && linhas.length > 1 && (
                    <button type="button" className="text-red-600 text-xs" onClick={() => remover(i)}>Remover</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rtdMedia != null && (
          <p className="mt-3 text-sm bg-lime-50 border border-lime-200 rounded p-2">
            RTD média: <b className="text-lime-800">{fmt(rtdMedia, 2)} MPa</b>
          </p>
        )}
      </div>

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button className="bg-blue-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50" disabled={salvar.isPending}
            onClick={() => salvar.mutate()}>
            Salvar Ruptura Diametral
          </button>
          {salvar.isSuccess && !erro && <span className="text-green-700 text-sm">Salvo.</span>}
        </div>
      )}
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </div>
  )
}
