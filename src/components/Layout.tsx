import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

// Estilo dos itens do menu: azul GRP no ativo/hover, cinza-marrom GRP no repouso
function navClasse({ isActive }: { isActive: boolean }) {
  return 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' +
    (isActive ? 'bg-grp-100 text-grp-700' : 'text-grp-ink hover:bg-grp-50 hover:text-grp-700')
}

export default function Layout() {
  const { user, carregando, perfis, sair } = useAuth()
  if (carregando) return <p className="p-8">Carregando…</p>
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 shadow-sm px-4 sm:px-6 py-2.5 flex gap-1 items-center print:hidden">
        <img src="/logo-grp.png" alt="Grupo Ribeiro Porto" className="h-9 w-auto" />
        <span className="font-bold text-grp-700 mr-4 whitespace-nowrap">Usina &amp; Laboratório</span>
        {perfis['ensaios_usina'] && <>
          {/* A aba "Ensaios" (ensaio CAUQ diário) saiu do menu a pedido do dono; as rotas
              /ensaios* continuam ativas para laudos antigos que apontam para elas. */}
          <NavLink to="/ensaios-lab" className={navClasse}>Ensaios Lab</NavLink>
          <NavLink to="/laudos" className={navClasse}>Laudos</NavLink>
          <NavLink to="/dosagens" className={navClasse}>Projetos</NavLink>
        </>}
        {perfis['insumos'] && <>
          <NavLink to="/insumos/tanques-situacao" className={navClasse}>Tanques</NavLink>
          <NavLink to="/insumos" end className={navClasse}>Insumos</NavLink>
          <NavLink to="/insumos/entradas" className={navClasse}>Entradas</NavLink>
          <NavLink to="/insumos/historico" className={navClasse}>Histórico</NavLink>
        </>}
        {perfis['cadastros'] === 'admin' && <NavLink to="/cadastros" className={navClasse}>Cadastros</NavLink>}
        <button onClick={sair} className="ml-auto text-sm font-medium text-grp-ink hover:text-grp-700">Sair</button>
      </nav>
      <main className="p-6 max-w-6xl mx-auto px-4 sm:px-6"><Outlet /></main>
    </div>
  )
}
