import Crud from '../../components/Crud'

export default function EmpresasPage() {
  return <Crud
    tabela="empresas" titulo="Empresas Emissoras"
    colunas={[{ nome: 'nome_exibicao', rotulo: 'Nome' }, { nome: 'razao_social', rotulo: 'Razão Social' }, { nome: 'cnpj', rotulo: 'CNPJ' }]}
    campos={[
      { nome: 'nome_exibicao', rotulo: 'Nome de exibição (sigla do laudo)', tipo: 'texto', obrigatorio: true },
      { nome: 'razao_social', rotulo: 'Razão social', tipo: 'texto', obrigatorio: true },
      { nome: 'cnpj', rotulo: 'CNPJ', tipo: 'texto' },
      { nome: 'cabecalho', rotulo: 'Cabeçalho do laudo', tipo: 'texto' },
      { nome: 'rodape', rotulo: 'Rodapé do laudo', tipo: 'texto' },
    ]} />
}
