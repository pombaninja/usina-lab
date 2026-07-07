import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import CadastrosIndex from './pages/cadastros/CadastrosIndex'
import EmpresasPage from './pages/cadastros/EmpresasPage'
import ObrasPage from './pages/cadastros/ObrasPage'
import MateriaisPage from './pages/cadastros/MateriaisPage'
import EquipamentosPage from './pages/cadastros/EquipamentosPage'
import EspecificacoesPage from './pages/cadastros/EspecificacoesPage'
import DosagensPage from './pages/DosagensPage'
import EnsaiosListaPage from './pages/EnsaiosListaPage'
import EnsaioCauqPage from './pages/EnsaioCauqPage'
import EnsaioDetalhePage from './pages/EnsaioDetalhePage'
import LaudosListaPage from './pages/LaudosListaPage'

const qc = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}>
              <Route path="/" element={<p>Bem-vindo. Use o menu acima.</p>} />
              <Route path="/cadastros" element={<CadastrosIndex />} />
              <Route path="/cadastros/empresas" element={<EmpresasPage />} />
              <Route path="/cadastros/obras" element={<ObrasPage />} />
              <Route path="/cadastros/materiais" element={<MateriaisPage />} />
              <Route path="/cadastros/equipamentos" element={<EquipamentosPage />} />
              <Route path="/cadastros/especificacoes" element={<EspecificacoesPage />} />
              <Route path="/dosagens" element={<DosagensPage />} />
              <Route path="/ensaios" element={<EnsaiosListaPage />} />
              <Route path="/ensaios/novo" element={<EnsaioCauqPage />} />
              <Route path="/ensaios/:id" element={<EnsaioDetalhePage />} />
              <Route path="/laudos" element={<LaudosListaPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
