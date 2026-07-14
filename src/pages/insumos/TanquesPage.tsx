import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import Crud from '../../components/Crud'

interface ProdutoInsumo { produto: string; rotulo: string; cor: string }

export default function TanquesPage() {
  // Opções do select de produto vêm do cadastro (insumo_produtos): produto novo
  // (ex.: emulsão) aparece aqui sem mexer em código. Mesma queryKey/consulta da
  // tela "Situação dos tanques" para compartilhar o cache.
  const { data: produtos } = useQuery({
    queryKey: ['insumo-produtos'],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('insumo_produtos').select('*').order('produto')
      if (error) throw error
      return (rows ?? []) as ProdutoInsumo[]
    },
  })
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
          { nome: 'produto', rotulo: 'Produto', tipo: 'select', obrigatorio: true,
            opcoes: (produtos ?? []).map(p => ({ valor: p.produto, rotulo: p.rotulo })) },
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
          Cadastro de produtos (CAP, óleos, emulsão…) →
        </Link>
      </p>
    </div>
  )
}
