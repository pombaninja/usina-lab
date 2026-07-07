import { Link, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Layout() {
  const { user, carregando, perfis, sair } = useAuth()
  if (carregando) return <p className="p-8">Carregando…</p>
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-slate-900 text-white px-6 py-3 flex gap-6 items-center print:hidden">
        <span className="font-bold">GRP Lab</span>
        {perfis['ensaios_usina'] && <>
          <Link to="/ensaios">Ensaios</Link>
          <Link to="/laudos">Laudos</Link>
          <Link to="/dosagens">Dosagens</Link>
        </>}
        {perfis['insumos'] && <>
          <Link to="/insumos">Insumos</Link>
          <Link to="/insumos/entradas">Entradas</Link>
          <Link to="/insumos/historico">Histórico</Link>
        </>}
        {perfis['cadastros'] === 'admin' && <Link to="/cadastros">Cadastros</Link>}
        <button onClick={sair} className="ml-auto text-slate-300">Sair</button>
      </nav>
      <main className="p-6 max-w-6xl mx-auto"><Outlet /></main>
    </div>
  )
}
