import { Link } from 'react-router-dom'
import Crud from '../../components/Crud'

/** Cadastro das baias de agregados do pátio da usina (Brita 1, Pó de pedra,
 *  Areia…). O estoque_atual muda no dia a dia, então a escrita (RLS) é de
 *  lancador+ de insumos — cadastro e atualização de estoque no mesmo nível. */
export default function BaiasPage() {
  return (
    <div className="space-y-4">
      <Crud tabela="baias" titulo="Baias de agregados" ordem="codigo"
        colunas={[
          { nome: 'codigo', rotulo: 'Código' }, { nome: 'nome', rotulo: 'Nome' },
          { nome: 'material', rotulo: 'Material' }, { nome: 'cor', rotulo: 'Cor' },
          { nome: 'capacidade', rotulo: 'Capacidade' }, { nome: 'unidade', rotulo: 'Unidade' },
          { nome: 'estoque_atual', rotulo: 'Estoque atual' },
          { nome: 'estoque_minimo', rotulo: 'Estoque mínimo' },
          { nome: 'ativa', rotulo: 'Ativa' },
        ]}
        campos={[
          { nome: 'codigo', rotulo: 'Código', tipo: 'texto', obrigatorio: true },
          { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
          { nome: 'material', rotulo: 'Material', tipo: 'texto', obrigatorio: true },
          { nome: 'cor', rotulo: 'Cor', tipo: 'cor' },
          { nome: 'capacidade', rotulo: 'Capacidade', tipo: 'numero' },
          { nome: 'unidade', rotulo: 'Unidade', tipo: 'select', obrigatorio: true, opcoes: [
            { valor: 't', rotulo: 't' }, { valor: 'm3', rotulo: 'm³' },
          ] },
          { nome: 'estoque_atual', rotulo: 'Estoque atual', tipo: 'numero' },
          { nome: 'estoque_minimo', rotulo: 'Estoque mínimo', tipo: 'numero' },
          { nome: 'ativa', rotulo: 'Ativa', tipo: 'checkbox' },
        ]} />
      <p className="text-sm">
        <Link to="/insumos/tanques-situacao" className="text-grp-600 hover:text-grp-700 font-medium">
          Ver situação (tanques e baias) →
        </Link>
      </p>
    </div>
  )
}
