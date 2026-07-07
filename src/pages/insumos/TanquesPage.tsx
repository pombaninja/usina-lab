import Crud from '../../components/Crud'

export default function TanquesPage() {
  return <Crud tabela="tanques" titulo="Tanques"
    colunas={[
      { nome: 'codigo', rotulo: 'Código' }, { nome: 'nome', rotulo: 'Nome' },
      { nome: 'produto', rotulo: 'Produto' }, { nome: 'unidade', rotulo: 'Unidade' },
      { nome: 'estoque_minimo', rotulo: 'Estoque mínimo' },
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
      { nome: 'capacidade', rotulo: 'Capacidade', tipo: 'numero' },
      { nome: 'estoque_minimo', rotulo: 'Estoque mínimo', tipo: 'numero', obrigatorio: true },
      { nome: 'tem_horimetro', rotulo: 'Tem horímetro', tipo: 'checkbox' },
    ]} />
}
