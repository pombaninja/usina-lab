import Crud from '../../components/Crud'

export default function EquipamentosPage() {
  return <Crud tabela="equipamentos" titulo="Equipamentos"
    colunas={[{ nome: 'nome', rotulo: 'Nome' }, { nome: 'tipo', rotulo: 'Tipo' }, { nome: 'constante', rotulo: 'Constante' }]}
    campos={[
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: [
        { valor: 'prensa', rotulo: 'Prensa' }, { valor: 'usina', rotulo: 'Usina' },
        { valor: 'estufa', rotulo: 'Estufa' }, { valor: 'balanca', rotulo: 'Balança' }, { valor: 'outro', rotulo: 'Outro' }] },
      { nome: 'constante', rotulo: 'Constante da prensa', tipo: 'numero' },
      { nome: 'observacoes', rotulo: 'Observações', tipo: 'texto' },
    ]} />
}
