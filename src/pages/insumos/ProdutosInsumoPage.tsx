import Crud from '../../components/Crud'

/** Cadastro dos produtos controlados em estoque (insumo_produtos): CAP, óleos e
 *  quaisquer novos (ex.: emulsão). A chave (slug) identifica o produto nos tanques
 *  (FK tanques.produto) e fica imutável após criada; a cor pinta o líquido nos
 *  desenhos da tela "Situação dos tanques". Escrita só para admin de insumos. */
const SLUG = /^[a-z0-9_]+$/
export default function ProdutosInsumoPage() {
  return <Crud tabela="insumo_produtos" titulo="Produtos de insumo"
    chave="produto" ordem="produto" camposImutaveisNaEdicao={['produto']}
    colunas={[
      { nome: 'produto', rotulo: 'Chave' },
      { nome: 'rotulo', rotulo: 'Rótulo' },
      { nome: 'cor', rotulo: 'Cor' },
    ]}
    campos={[
      { nome: 'produto', rotulo: 'Chave (ex.: emulsao)', tipo: 'texto', obrigatorio: true,
        validar: v => typeof v === 'string' && v !== '' && !SLUG.test(v)
          ? 'Chave inválida: use só letras minúsculas sem acento, números e _ (ex.: emulsao)'
          : null },
      { nome: 'rotulo', rotulo: 'Rótulo', tipo: 'texto', obrigatorio: true },
      { nome: 'cor', rotulo: 'Cor', tipo: 'cor', obrigatorio: true },
    ]} />
}
