import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { calcularAgregadoMes, type LancamentoMes } from '../../lib/calculos/insumos'
import { fmt } from '../../lib/formato'
import { limitesDoMes, mesAtualLocal } from '../../lib/datas'

interface TanqueTodo { id: string; codigo: string; nome: string; produto: string; unidade: string }

export default function InsumosHistoricoPage() {
  const [mes, setMes] = useState(mesAtualLocal())
  const { inicio, fimExclusivo: fim } = limitesDoMes(mes)

  const { data: tanques } = useQuery({
    queryKey: ['tanques-todos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tanques').select('id, codigo, nome, produto, unidade').order('codigo')
      if (error) throw error
      return (data ?? []) as TanqueTodo[]
    },
  })

  const { data: lancamentos } = useQuery({
    queryKey: ['insumos-historico-lancamentos', mes],
    queryFn: async () => {
      const { data, error } = await supabase.from('insumos_lancamentos')
        .select('data, producao_ton, insumos_leituras(*)')
        .gte('data', inicio).lt('data', fim)
        .order('data', { ascending: true })
      if (error) throw error
      return (data ?? []) as LancamentoMes[]
    },
  })

  const { data: entradasMes } = useQuery({
    queryKey: ['insumos-historico-entradas', mes],
    queryFn: async () => {
      const { data, error } = await supabase.from('insumos_entradas')
        .select('tanque_id, quantidade')
        .gte('data', inicio).lt('data', fim)
      if (error) throw error
      return (data ?? []) as { tanque_id: string; quantidade: number }[]
    },
  })

  const agregado = useMemo(
    () => calcularAgregadoMes(lancamentos ?? [], tanques ?? []),
    [lancamentos, tanques],
  )

  const entradasPorTanque = useMemo(() => {
    const somas = new Map<string, number>()
    for (const e of entradasMes ?? []) somas.set(e.tanque_id, (somas.get(e.tanque_id) ?? 0) + Number(e.quantidade))
    return (tanques ?? [])
      .filter(t => somas.has(t.id))
      .map(t => ({ tanque: t, total: somas.get(t.id)! }))
      .sort((a, b) => a.tanque.codigo.localeCompare(b.tanque.codigo))
  }, [entradasMes, tanques])

  const exportarCsv = () => {
    const linhas: string[] = []
    linhas.push(['Data', 'Produção (t)', 'CAP deslocado (t)', 'Óleo (L)', 'CAP/ton', 'Óleo L/ton'].join(';'))
    for (const dia of agregado.dias) {
      const dataFmt = dia.data.split('-').reverse().join('/')
      if (dia.resultado.ok) {
        const { ind } = dia.resultado
        linhas.push([
          dataFmt,
          fmt(dia.producaoTon, 3),
          fmt(ind.capDeslocadoTon, 3),
          fmt(ind.oleoQueimaDeslocado, 3),
          fmt(ind.capPorTon, 4),
          fmt(ind.oleoPorTon, 2),
        ].join(';'))
      } else {
        linhas.push([dataFmt, '—', '—', '—', '—', '—'].join(';'))
      }
    }
    linhas.push(['TOTAL', fmt(agregado.totalProducaoTon, 3), fmt(agregado.totalCapTon, 3), fmt(agregado.totalOleoL, 3), '', ''].join(';'))
    linhas.push(['MÉDIA PONDERADA', '', '', '', fmt(agregado.capPorTonMedio, 4), fmt(agregado.oleoPorTonMedio, 2)].join(';'))
    const conteudo = '﻿' + linhas.join('\r\n')
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `insumos-${mes}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-grp-700">Histórico mensal de insumos</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm">Mês
            <input type="month" className="border rounded p-2 ml-2" value={mes} onChange={e => setMes(e.target.value)} /></label>
          <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2 font-semibold" onClick={exportarCsv}>
            Exportar CSV
          </button>
        </div>
      </div>

      <section className="bg-white p-4 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b">
            <th className="p-2">Data</th><th>Produção (t)</th><th>CAP deslocado (t)</th><th>Óleo (L)</th><th>CAP/ton</th><th>Óleo L/ton</th>
          </tr></thead>
          <tbody>
            {agregado.dias.map(dia => (
              <tr key={dia.data} className="border-b">
                <td className="p-2 whitespace-nowrap">{dia.data.split('-').reverse().join('/')}</td>
                {dia.resultado.ok ? (
                  <>
                    <td>{fmt(dia.producaoTon, 3)}</td>
                    <td>{fmt(dia.resultado.ind.capDeslocadoTon, 3)}</td>
                    <td>{fmt(dia.resultado.ind.oleoQueimaDeslocado, 3)}</td>
                    <td>{fmt(dia.resultado.ind.capPorTon, 4)}</td>
                    <td>{fmt(dia.resultado.ind.oleoPorTon, 2)}</td>
                  </>
                ) : (
                  <td colSpan={5} className="text-amber-700 cursor-help" title={dia.resultado.erro}>
                    — — — — — (dia com divergência de leitura, veja Insumos do dia)
                  </td>
                )}
              </tr>
            ))}
            {(lancamentos ?? []).length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-slate-500">Nenhum lançamento no mês</td></tr>
            )}
          </tbody>
          {(lancamentos ?? []).length > 0 && (
            <tfoot>
              <tr className="border-t font-semibold bg-slate-50">
                <td className="p-2">TOTAL</td>
                <td>{fmt(agregado.totalProducaoTon, 3)}</td>
                <td>{fmt(agregado.totalCapTon, 3)}</td>
                <td>{fmt(agregado.totalOleoL, 3)}</td>
                <td /><td />
              </tr>
              <tr className="font-semibold bg-slate-50">
                <td className="p-2">MÉDIA PONDERADA</td>
                <td /><td /><td />
                <td>{fmt(agregado.capPorTonMedio, 4)}</td>
                <td>{fmt(agregado.oleoPorTonMedio, 2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <section className="bg-white p-4 rounded-xl shadow-sm">
        <h2 className="font-semibold mb-2">Entradas do mês</h2>
        {entradasPorTanque.length === 0
          ? <p className="text-slate-500 text-sm">Nenhuma entrada no mês</p>
          : (
            <ul className="text-sm space-y-1">
              {entradasPorTanque.map(({ tanque, total }) => (
                <li key={tanque.id}>{tanque.codigo} — {tanque.nome}: <b>{fmt(total, 3)} {tanque.unidade}</b></li>
              ))}
            </ul>
          )}
      </section>
    </div>
  )
}
