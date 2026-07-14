import { Link } from 'react-router-dom'
import Crud from '../../components/Crud'

export default function TanquesPage() {
  return (
    <div className="space-y-4">
      <Crud tabela="tanques" titulo="Tanques"
        colunas={[
          { nome: 'codigo', rotulo: 'Código' }, { nome: 'nome', rotulo: 'Nome' },
          { nome: 'produto', rotulo: 'Produto' }, { nome: 'unidade', rotulo: 'Unidade' },
          { nome: 'formato', rotulo: 'Formato' }, { nome: 'capacidade', rotulo: 'Capacidade' },
          { nome: 'estoque_minimo', rotulo: 'Estoque mínimo' }, { nome: 'ativa', rotulo: 'Ativa' },
        ]}
        campos={[
          { nome: 'codigo', rotulo: 'Código', tipo: 'texto', obrigatorio: true },
          { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
          { nome: 'produto', rotulo: 'Produto', tipo: 'select', obrigatorio: true, opcoes: [
            { valor: 'cap', rotulo: 'CAP' },
            { valor: 'oleo_queima', rotulo: 'Óleo de queima' },
            { valor: 'oleo_termico', rotulo: 'Óleo térmico (caldeira)' },
          ] },
          { nome: 'unidade', rotulo: 'Unidade', tipo: 'select', obrigatorio: true, opcoes: [
            { valor: 't', rotulo: 't' }, { valor: 'litros', rotulo: 'litros' },
          ] },
          { nome: 'formato', rotulo: 'Formato', tipo: 'select', obrigatorio: true, opcoes: [
            { valor: 'vertical', rotulo: 'Vertical' }, { valor: 'horizontal', rotulo: 'Horizontal' },
          ] },
          { nome: 'capacidade', rotulo: 'Capacidade', tipo: 'numero' },
          { nome: 'estoque_minimo', rotulo: 'Estoque mínimo', tipo: 'numero', obrigatorio: true },
          { nome: 'tem_horimetro', rotulo: 'Tem horímetro', tipo: 'checkbox' },
          { nome: 'ativa', rotulo: 'Ativa', tipo: 'checkbox' },
        ]} />
      <p className="text-sm">
        <Link to="/insumos/produtos" className="text-grp-600 hover:text-grp-700 font-medium">
          Cores dos materiais (CAP, óleos) →
        </Link>
      </p>
    </div>
  )
}
