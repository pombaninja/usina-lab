import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import type { LinhaGranulometria } from '../lib/calculos/granulometria'

export default function GraficoGranulometria({ linhas, largura = 640 }: { linhas: LinhaGranulometria[]; largura?: number }) {
  const dados = [...linhas].sort((a, b) => a.aberturaMm - b.aberturaMm).map(l => ({
    abertura: l.aberturaMm, log: Math.log10(l.aberturaMm),
    Média: l.pctPassando, 'Trab. mín': l.trabMin, 'Trab. máx': l.trabMax,
    'Esp. mín': l.espMin, 'Esp. máx': l.espMax,
  }))
  return (
    <div className="flex justify-center w-full">
      <LineChart width={largura} height={340} data={dados}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="log" type="number" domain={[-1.3, 1.6]}
               tickFormatter={(v: number) => Number((10 ** v).toFixed(2)).toString()}
               label={{ value: 'Abertura (mm) — escala log', position: 'insideBottom', offset: -4 }} />
        <YAxis domain={[0, 100]} label={{ value: '% Passando', angle: -90, position: 'insideLeft' }} />
        <Legend />
        <Line dataKey="Média" stroke="#dc2626" strokeWidth={2} dot />
        <Line dataKey="Trab. mín" stroke="#2563eb" dot={false} />
        <Line dataKey="Trab. máx" stroke="#2563eb" dot={false} />
        <Line dataKey="Esp. mín" stroke="#111827" dot={false} />
        <Line dataKey="Esp. máx" stroke="#111827" dot={false} />
      </LineChart>
    </div>
  )
}
