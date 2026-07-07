import Crud from '../../components/Crud'

export default function MateriaisPage() {
  return <Crud tabela="materiais" titulo="Materiais"
    colunas={[{ nome: 'nome', rotulo: 'Nome' }, { nome: 'tipo', rotulo: 'Tipo' }, { nome: 'procedencia', rotulo: 'Procedência' }]}
    campos={[
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: [
        { valor: 'agregado', rotulo: 'Agregado' }, { valor: 'ligante', rotulo: 'Ligante (CAP)' },
        { valor: 'solo', rotulo: 'Solo' }, { valor: 'filler', rotulo: 'Fíler' }] },
      { nome: 'procedencia', rotulo: 'Procedência', tipo: 'texto' },
      { nome: 'fornecedor', rotulo: 'Fornecedor', tipo: 'texto' },
      { nome: 'densidade_real', rotulo: 'Densidade real (g/cm³)', tipo: 'numero' },
    ]} />
}
