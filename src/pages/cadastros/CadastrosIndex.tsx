import { Link } from 'react-router-dom'
const itens = [
  ['empresas', 'Empresas emissoras'], ['especificacoes', 'Especificações normativas'],
  ['obras', 'Clientes e obras'], ['materiais', 'Materiais'], ['equipamentos', 'Equipamentos'],
  ['/insumos/tanques', 'Tanques da usina'],
]
export default function CadastrosIndex() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {itens.map(([rota, nome]) => (
        <Link key={rota} to={rota.startsWith('/') ? rota : `/cadastros/${rota}`} className="bg-white p-6 rounded-xl shadow hover:shadow-md font-semibold">{nome}</Link>
      ))}
    </div>
  )
}
