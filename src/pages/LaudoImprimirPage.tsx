import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import GraficoGranulometria from '../components/GraficoGranulometria'

const ROTULOS: Record<string, string> = {
  vazios: 'Vazios (%)', rbv: 'R.B.V. (%)', vam: 'V.A.M. (%)', estabilidade: 'Estabilidade (kgf)',
  fluencia_mm: 'Fluência (mm)', rtd: 'RTD (MPa)', filler_ligante: 'Relação Fíler/Ligante', teor_ligante: 'Teor de Ligante (%)',
}

export default function LaudoImprimirPage() {
  const { id } = useParams()
  const { data: laudo } = useQuery({
    queryKey: ['laudo-print', id],
    queryFn: async () => (await supabase.from('laudos')
      .select('*, empresas(razao_social, nome_exibicao, cnpj, cabecalho, rodape), ensaios_cauq(data, periodo, placa_caminhao, operador, temperatura_cap, observacoes, dosagens(nome, especificacoes(nome, norma)), clientes_obras(cliente, obra, local_aplicacao))')
      .eq('id', id).single()).data,
  })
  if (!laudo) return <p>Carregando…</p>
  const s = laudo.snapshot ?? {}
  const e = laudo.ensaios_cauq
  return (
    <div className="max-w-[210mm] mx-auto bg-white p-8 text-sm print:p-0">
      <button onClick={() => window.print()} className="print:hidden mb-4 bg-slate-800 text-white rounded px-4 py-2">
        Imprimir / Salvar PDF
      </button>

      <header className="border-b-4 border-slate-800 pb-3 mb-4 flex justify-between items-end">
        <div>
          <h1 className="text-xl font-bold">{laudo.empresas.razao_social}</h1>
          <p className="text-slate-600">{laudo.empresas.cabecalho ?? 'Controle Tecnológico de Misturas Betuminosas'}</p>
          {laudo.empresas.cnpj && <p className="text-slate-500 text-xs">CNPJ: {laudo.empresas.cnpj}</p>}
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-lg">{laudo.numero}</p>
          <p>Rev. {laudo.revisao}</p>
          <p>{laudo.emitido_em ? new Date(laudo.emitido_em).toLocaleDateString('pt-BR') : 'NÃO EMITIDO'}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-8 gap-y-1 mb-4">
        <p><b>Cliente:</b> {e.clientes_obras?.cliente ?? '—'}</p>
        <p><b>Obra:</b> {e.clientes_obras?.obra ?? '—'}</p>
        <p><b>Dosagem/Faixa:</b> {e.dosagens?.nome}</p>
        <p><b>Especificação:</b> {e.dosagens?.especificacoes?.nome} {e.dosagens?.especificacoes?.norma}</p>
        <p><b>Data do ensaio:</b> {new Date(e.data + 'T12:00').toLocaleDateString('pt-BR')} ({e.periodo})</p>
        <p><b>Placa:</b> {e.placa_caminhao ?? '—'} · <b>Operador:</b> {e.operador ?? '—'}</p>
      </section>

      {s.avaliacoes?.length > 0 && (
        <section className="mb-4">
          <h2 className="font-bold border-b mb-2">Resultados × Especificação</h2>
          <table className="w-full border">
            <thead><tr className="bg-slate-100"><th className="border p-1 text-left">Parâmetro</th><th className="border p-1">Obtido</th><th className="border p-1">Especificado</th><th className="border p-1">Situação</th></tr></thead>
            <tbody>{s.avaliacoes.map((a: { parametro: string; valor: number; min: number | null; max: number | null; conforme: boolean }) => (
              <tr key={a.parametro}>
                <td className="border p-1">{ROTULOS[a.parametro] ?? a.parametro}</td>
                <td className="border p-1 text-center font-semibold">{a.valor.toFixed(2)}</td>
                <td className="border p-1 text-center">{a.min ?? '—'} a {a.max ?? '—'}</td>
                <td className={`border p-1 text-center font-bold ${a.conforme ? 'text-green-700' : 'text-red-700'}`}>{a.conforme ? 'CONFORME' : 'NÃO CONFORME'}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {s.granulometria && (
        <section className="mb-4">
          <h2 className="font-bold border-b mb-2">Análise Granulométrica — DNER-ME 083/98</h2>
          <table className="w-full border mb-3">
            <thead><tr className="bg-slate-100"><th className="border p-1">Peneira</th><th className="border p-1">mm</th><th className="border p-1">% Passando</th><th className="border p-1">Faixa de trabalho</th><th className="border p-1">Especificada</th></tr></thead>
            <tbody>{s.granulometria.linhas.map((l: { peneira: string; aberturaMm: number; pctPassando: number; trabMin?: number; trabMax?: number; espMin?: number; espMax?: number }) => (
              <tr key={l.peneira}>
                <td className="border p-1 text-center">{l.peneira}</td>
                <td className="border p-1 text-center">{l.aberturaMm}</td>
                <td className="border p-1 text-center font-semibold">{l.pctPassando.toFixed(1)}</td>
                <td className="border p-1 text-center">{l.trabMin !== undefined ? `${l.trabMin.toFixed(1)} – ${l.trabMax!.toFixed(1)}` : '—'}</td>
                <td className="border p-1 text-center">{l.espMin !== undefined ? `${l.espMin} – ${l.espMax}` : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          <GraficoGranulometria linhas={s.granulometria.linhas} largura={680} />
        </section>
      )}

      <footer className="mt-10 grid grid-cols-2 gap-8 text-center">
        <div className="border-t pt-2">Laboratorista<br /><b>{e.operador ?? ''}</b></div>
        <div className="border-t pt-2">Avaliador responsável<br /><b>(assinado eletronicamente em {laudo.aprovado_em ? new Date(laudo.aprovado_em).toLocaleString('pt-BR') : '—'})</b></div>
      </footer>
      {laudo.empresas.rodape && <p className="text-xs text-slate-500 mt-6 text-center">{laudo.empresas.rodape}</p>}
    </div>
  )
}
