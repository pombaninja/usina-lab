import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { calcularIndicadoresDia, divergenciaContinuidade, type LeituraTanque } from '../../lib/calculos/insumos'
import { fmt } from '../../lib/formato'

interface Tanque {
  id: string; codigo: string; nome: string
  produto: 'cap' | 'oleo_queima' | 'oleo_termico'
  unidade: string; estoque_minimo: number; tem_horimetro: boolean; ativa: boolean
}
interface LinhaForm {
  volumeInicial: string; volumeFinal: string
  horimetroLigou: string; horimetroDesligou: string
}
const linhaVazia: LinhaForm = { volumeInicial: '', volumeFinal: '', horimetroLigou: '', horimetroDesligou: '' }
const n = (s: string) => (s === '' ? NaN : Number(s))
const hoje = () => new Date().toISOString().slice(0, 10)

export default function InsumosDiaPage() {
  const qc = useQueryClient()
  const [data, setData] = useState(hoje())
  const [linhas, setLinhas] = useState<Record<string, LinhaForm>>({})
  const [producaoTon, setProducaoTon] = useState('')
  const [producaoDescricao, setProducaoDescricao] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  const { data: tanques } = useQuery({
    queryKey: ['tanques-ativos'],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('tanques').select('*').eq('ativa', true).order('codigo')
      if (error) throw error
      return (rows ?? []) as Tanque[]
    },
  })

  const { data: lancamento } = useQuery({
    queryKey: ['insumos-lancamento', data],
    queryFn: async () => {
      const { data: row, error } = await supabase.from('insumos_lancamentos')
        .select('*, insumos_leituras(*)')
        .eq('data', data)
        .maybeSingle()
      if (error) throw error
      return row
    },
  })

  const { data: entradasDia } = useQuery({
    queryKey: ['insumos-entradas-dia', data],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('insumos_entradas').select('tanque_id, quantidade').eq('data', data)
      if (error) throw error
      const somas: Record<string, number> = {}
      for (const r of rows ?? []) somas[r.tanque_id] = (somas[r.tanque_id] ?? 0) + Number(r.quantidade)
      return somas
    },
  })

  const { data: leiturasOntem } = useQuery({
    queryKey: ['insumos-lancamento-anterior', data],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('insumos_lancamentos')
        .select('id, data, insumos_leituras(tanque_id, volume_final)')
        .lt('data', data)
        .order('data', { ascending: false })
        .limit(1)
      if (error) throw error
      const anterior = rows?.[0] as { insumos_leituras: { tanque_id: string; volume_final: number | null }[] } | undefined
      const map: Record<string, number> = {}
      for (const l of anterior?.insumos_leituras ?? []) {
        if (l.volume_final != null) map[l.tanque_id] = l.volume_final
      }
      return map
    },
  })

  // ===== carrega/reseta o formulário quando a data ou os dados do dia mudam =====
  useEffect(() => {
    if (!tanques) return
    const existentes = (lancamento?.insumos_leituras ?? []) as {
      tanque_id: string; volume_inicial: number | null; volume_final: number | null
      horimetro_ligou: number | null; horimetro_desligou: number | null
    }[]
    const novo: Record<string, LinhaForm> = {}
    for (const t of tanques) {
      const existente = existentes.find(l => l.tanque_id === t.id)
      novo[t.id] = existente
        ? {
            volumeInicial: existente.volume_inicial != null ? String(existente.volume_inicial) : '',
            volumeFinal: existente.volume_final != null ? String(existente.volume_final) : '',
            horimetroLigou: existente.horimetro_ligou != null ? String(existente.horimetro_ligou) : '',
            horimetroDesligou: existente.horimetro_desligou != null ? String(existente.horimetro_desligou) : '',
          }
        : { ...linhaVazia, volumeInicial: leiturasOntem?.[t.id] != null ? String(leiturasOntem[t.id]) : '' }
    }
    setLinhas(novo)
    setProducaoTon(lancamento?.producao_ton != null ? String(lancamento.producao_ton) : '')
    setProducaoDescricao(lancamento?.producao_descricao ?? '')
    setObservacoes(lancamento?.observacoes ?? '')
    setSucesso(false)
    setErro('')
  }, [tanques, lancamento, leiturasOntem, data])

  const atualizarLinha = (tanqueId: string, campo: keyof LinhaForm, valor: string) =>
    setLinhas(l => ({ ...l, [tanqueId]: { ...(l[tanqueId] ?? linhaVazia), [campo]: valor } }))

  // ===== cálculo ao vivo =====
  const calc = useMemo((): { ok: true; ind: ReturnType<typeof calcularIndicadoresDia> } | { ok: false; problema: string } | null => {
    if (!tanques || tanques.length === 0) return null
    try {
      const leituras: LeituraTanque[] = tanques.map(t => {
        const l = linhas[t.id] ?? linhaVazia
        return {
          tanqueId: t.id, produto: t.produto,
          volumeInicial: l.volumeInicial !== '' ? n(l.volumeInicial) : null,
          volumeFinal: l.volumeFinal !== '' ? n(l.volumeFinal) : null,
          horimetroLigou: l.horimetroLigou !== '' ? n(l.horimetroLigou) : null,
          horimetroDesligou: l.horimetroDesligou !== '' ? n(l.horimetroDesligou) : null,
        }
      })
      const producao = producaoTon !== '' ? n(producaoTon) : null
      const ind = calcularIndicadoresDia(leituras, producao)
      return { ok: true, ind }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [tanques, linhas, producaoTon])

  // ===== salvar =====
  const salvar = useMutation({
    mutationFn: async () => {
      if (!calc?.ok) throw new Error('Corrija a divergência de leitura antes de salvar')
      const { data: lanc, error: errLanc } = await supabase.from('insumos_lancamentos')
        .upsert({
          data,
          producao_ton: producaoTon !== '' ? n(producaoTon) : null,
          producao_descricao: producaoDescricao || null,
          observacoes: observacoes || null,
        }, { onConflict: 'data' })
        .select('id')
        .single()
      if (errLanc) throw new Error('Falha ao salvar o lançamento do dia: ' + errLanc.message)

      const registros = (tanques ?? [])
        .map(t => {
          const l = linhas[t.id] ?? linhaVazia
          const algumPreenchido = l.volumeInicial !== '' || l.volumeFinal !== '' || l.horimetroLigou !== '' || l.horimetroDesligou !== ''
          if (!algumPreenchido) return null
          return {
            lancamento_id: lanc.id,
            tanque_id: t.id,
            volume_inicial: l.volumeInicial !== '' ? n(l.volumeInicial) : null,
            volume_final: l.volumeFinal !== '' ? n(l.volumeFinal) : null,
            horimetro_ligou: l.horimetroLigou !== '' ? n(l.horimetroLigou) : null,
            horimetro_desligou: l.horimetroDesligou !== '' ? n(l.horimetroDesligou) : null,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (registros.length > 0) {
        const { error: errLeit } = await supabase.from('insumos_leituras').upsert(registros, { onConflict: 'lancamento_id,tanque_id' })
        if (errLeit) throw new Error('Falha ao salvar as leituras dos tanques: ' + errLeit.message)
      }
      return lanc.id
    },
    onSuccess: () => {
      setSucesso(true)
      setErro('')
      qc.invalidateQueries({ queryKey: ['insumos-lancamento', data] })
      qc.invalidateQueries({ queryKey: ['insumos-entradas-dia', data] })
      // sem sufixo de data: o lançamento de hoje pode ser o "dia anterior" prefill de outra data em cache
      qc.invalidateQueries({ queryKey: ['insumos-lancamento-anterior'] })
    },
    onError: (e: Error) => { setErro(e.message); setSucesso(false) },
  })

  const inp = 'border rounded p-2 w-full'
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Insumos do dia</h1>
        <label className="text-sm">Data
          <input type="date" className="border rounded p-2 ml-2" value={data} onChange={e => setData(e.target.value)} /></label>
        {calc && !calc.ok && (
          <span className="px-4 py-2 rounded-full font-bold text-white bg-amber-600">{calc.problema}</span>
        )}
      </div>

      <section className="bg-white p-4 rounded-xl shadow grid grid-cols-3 gap-3">
        <label className="text-sm">Produção (ton)
          <input className={inp} type="number" step="any" value={producaoTon} onChange={e => setProducaoTon(e.target.value)} /></label>
        <label className="text-sm col-span-2">Descrição da produção
          <input className={inp} value={producaoDescricao} onChange={e => setProducaoDescricao(e.target.value)} /></label>
      </section>

      <section className="bg-white p-4 rounded-xl shadow overflow-x-auto">
        <h2 className="font-semibold mb-2">Tanques</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b">
            <th className="p-2">Tanque</th><th>Volume inicial</th><th>Volume final</th><th>Deslocado</th>
            <th>Entradas do dia</th><th>Saldo (físico)</th>
            <th>Horím. ligou</th><th>Horím. desligou</th><th>L/h</th><th />
          </tr></thead>
          <tbody>{(tanques ?? []).map(t => {
            const l = linhas[t.id] ?? linhaVazia
            const vi = l.volumeInicial !== '' ? n(l.volumeInicial) : null
            const vf = l.volumeFinal !== '' ? n(l.volumeFinal) : null
            const deslocado = vi != null && vf != null ? vi - vf : null
            const entradas = entradasDia?.[t.id] ?? 0
            const div = divergenciaContinuidade(vi, leiturasOntem?.[t.id], entradas)
            const temDivergenciaContinuidade = div !== null && Math.abs(div) > 0.01
            const litrosHora = t.tem_horimetro && calc?.ok ? calc.ind.caldeiraLitrosHora : null
            const abaixoMinimo = vf != null && vf < t.estoque_minimo
            return (
              <Fragment key={t.id}>
                <tr className="border-b">
                  <td className="p-2 font-semibold whitespace-nowrap">{t.codigo} — {t.nome}</td>
                  <td><input className="border rounded p-1 w-24" type="number" step="any" value={l.volumeInicial}
                        onChange={e => atualizarLinha(t.id, 'volumeInicial', e.target.value)} /></td>
                  <td><input className="border rounded p-1 w-24" type="number" step="any" value={l.volumeFinal}
                        onChange={e => atualizarLinha(t.id, 'volumeFinal', e.target.value)} /></td>
                  <td className={`p-2 ${deslocado != null && deslocado < 0 ? 'text-red-600 font-bold' : ''}`}>
                    {deslocado != null ? fmt(deslocado, 3) : ''}
                  </td>
                  <td className="p-2">{fmt(entradas, 3)}</td>
                  <td className="p-2">{vf != null ? fmt(vf, 3) : ''}</td>
                  <td>{t.tem_horimetro
                    ? <input className="border rounded p-1 w-24" type="number" step="any" value={l.horimetroLigou}
                        onChange={e => atualizarLinha(t.id, 'horimetroLigou', e.target.value)} />
                    : <span className="text-slate-300">—</span>}</td>
                  <td>{t.tem_horimetro
                    ? <input className="border rounded p-1 w-24" type="number" step="any" value={l.horimetroDesligou}
                        onChange={e => atualizarLinha(t.id, 'horimetroDesligou', e.target.value)} />
                    : <span className="text-slate-300">—</span>}</td>
                  <td className="p-2">{litrosHora != null ? fmt(litrosHora, 2) : ''}</td>
                  <td className="p-2">{abaixoMinimo && <span className="bg-red-600 text-white rounded-full px-2 py-0.5 text-xs font-bold">ABAIXO DO MÍNIMO</span>}</td>
                </tr>
                {temDivergenciaContinuidade && (
                  <tr className="border-b">
                    <td colSpan={9} className="px-2 pb-2 text-amber-700 text-xs">
                      Difere do fechamento de ontem em {fmt(div, 2)} — confira leitura ou registre a entrada
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}</tbody>
        </table>
      </section>

      {calc?.ok && (
        <section className="bg-white p-4 rounded-xl shadow">
          <h2 className="font-semibold mb-2">Indicadores do dia</h2>
          <p className="text-sm text-slate-700">
            CAP deslocado: <b>{fmt(calc.ind.capDeslocadoTon, 3)} t</b> · CAP/ton: <b>{fmt(calc.ind.capPorTon, 4)}</b> ·
            Óleo de queima deslocado: <b>{fmt(calc.ind.oleoQueimaDeslocado, 3)} L</b> · Óleo/ton: <b>{fmt(calc.ind.oleoPorTon, 2)}</b> ·
            Caldeira: <b>{fmt(calc.ind.caldeiraConsumo, 0)} L</b> em <b>{fmt(calc.ind.caldeiraHoras, 2)} h</b> = <b>{fmt(calc.ind.caldeiraLitrosHora, 2)} L/h</b>
          </p>
        </section>
      )}

      <label className="block text-sm">Observações do dia
        <textarea className="w-full border rounded p-2" value={observacoes} onChange={e => setObservacoes(e.target.value)} /></label>

      {erro && <p className="text-red-600">{erro}</p>}
      {sucesso && <p className="text-green-700 font-semibold">Lançamento salvo</p>}
      {!calc?.ok && <p className="text-amber-700">Preencha as leituras dos tanques antes de salvar</p>}
      <button className="bg-blue-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!calc?.ok || salvar.isPending} onClick={() => salvar.mutate()}>
        {salvar.isPending ? 'Salvando…' : 'Salvar lançamento'}
      </button>
    </div>
  )
}
