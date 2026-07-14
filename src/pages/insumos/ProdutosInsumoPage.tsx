import Crud from '../../components/Crud'

/** Cadastro dos materiais controlados em estoque (insumo_produtos).
 *  As 3 linhas são fixas (produto é PK com check) — só edição de rótulo e cor;
 *  a cor pinta o líquido nos desenhos da tela "Situação dos tanques". */
export default function ProdutosInsumoPage() {
  return <Crud tabela="insumo_produtos" titulo="Cores dos materiais"
    chave="produto" permitirCriar={false} ordem="produto"
    colunas={[
      { nome: 'produto', rotulo: 'Produto' },
      { nome: 'rotulo', rotulo: 'Rótulo' },
      { nome: 'cor', rotulo: 'Cor' },
    ]}
    campos={[
      { nome: 'rotulo', rotulo: 'Rótulo', tipo: 'texto', obrigatorio: true },
      { nome: 'cor', rotulo: 'Cor', tipo: 'cor', obrigatorio: true },
    ]} />
}
