import Crud from '../../components/Crud'

export default function ObrasPage() {
  return <Crud tabela="clientes_obras" titulo="Clientes e Obras"
    colunas={[{ nome: 'cliente', rotulo: 'Cliente' }, { nome: 'obra', rotulo: 'Obra' }, { nome: 'local_aplicacao', rotulo: 'Local' }]}
    campos={[
      { nome: 'cliente', rotulo: 'Cliente', tipo: 'texto', obrigatorio: true },
      { nome: 'obra', rotulo: 'Obra', tipo: 'texto' },
      { nome: 'local_aplicacao', rotulo: 'Local de aplicação', tipo: 'texto' },
    ]} />
}
