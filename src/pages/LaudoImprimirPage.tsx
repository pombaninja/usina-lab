import { useParams } from 'react-router-dom'
import LaudoCauqConteudo from '../components/laudos/LaudoCauqConteudo'

// Página imprimível do laudo CBUQ DIÁRIO — wrapper fino (B2): todo o CONTEÚDO
// (cabeçalho GRP, resultados × especificação, Marshall, granulometria, teor,
// RTD, rodapé) mora em components/laudos/LaudoCauqConteudo, que se auto-busca
// pelo laudoId — o mesmo componente é reusado pela impressão POR LOTE
// (LaudosLotePage), um laudo por página. Aqui ficam só a moldura A4 e o botão.

export default function LaudoImprimirPage() {
  const { id } = useParams()
  return (
    <div className="max-w-[210mm] mx-auto bg-white p-8 text-sm print:p-0">
      <button onClick={() => window.print()} className="print:hidden mb-4 bg-grp-600 hover:bg-grp-700 text-white rounded px-4 py-2">
        Imprimir / Salvar PDF
      </button>
      <LaudoCauqConteudo laudoId={id!} />
    </div>
  )
}
