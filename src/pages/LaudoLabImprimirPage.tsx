import { useParams } from 'react-router-dom'
import LaudoLabConteudo from '../components/laudos/LaudoLabConteudo'

// Página imprimível do laudo de ensaio de LABORATÓRIO — wrapper fino (B2): todo
// o CONTEÚDO (cabeçalho GRP, seções analíticas, rodapé) mora em
// components/laudos/LaudoLabConteudo, que se auto-busca pelo laudoId — o mesmo
// componente é reusado pela impressão POR LOTE (LaudosLotePage), um laudo por
// página. Aqui ficam só a moldura A4 e o botão de imprimir.

export default function LaudoLabImprimirPage() {
  const { id } = useParams()
  return (
    <div className="max-w-[210mm] mx-auto bg-white p-8 text-sm print:p-0">
      <button onClick={() => window.print()} className="print:hidden mb-4 bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2">
        Imprimir / Salvar PDF
      </button>
      <LaudoLabConteudo laudoId={id!} />
    </div>
  )
}
