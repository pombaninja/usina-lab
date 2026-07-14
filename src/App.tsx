import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import DashboardPage from './pages/DashboardPage'
import CadastrosIndex from './pages/cadastros/CadastrosIndex'
import EmpresasPage from './pages/cadastros/EmpresasPage'
import ObrasPage from './pages/cadastros/ObrasPage'
import MateriaisPage from './pages/cadastros/MateriaisPage'
import EquipamentosPage from './pages/cadastros/EquipamentosPage'
import EspecificacoesPage from './pages/cadastros/EspecificacoesPage'
import TanquesPage from './pages/insumos/TanquesPage'
import ProdutosInsumoPage from './pages/insumos/ProdutosInsumoPage'
import InsumosDiaPage from './pages/insumos/InsumosDiaPage'
import EntradasPage from './pages/insumos/EntradasPage'
import InsumosHistoricoPage from './pages/insumos/InsumosHistoricoPage'
import DosagensPage from './pages/DosagensPage'
import ProjetoMarshallPage from './pages/ProjetoMarshallPage'
import ProjetoAgregadosPage from './pages/ProjetoAgregadosPage'
import ProjetoRiceTeorPage from './pages/ProjetoRiceTeorPage'
import ProjetoRtdPage from './pages/ProjetoRtdPage'
import ProjetoMoldagemPage from './pages/ProjetoMoldagemPage'
import ProjetoDensidadesPage from './pages/ProjetoDensidadesPage'
import ProjetoComplementaresPage from './pages/ProjetoComplementaresPage'
import ProjetoIndiceFormaPage from './pages/ProjetoIndiceFormaPage'
import ProjetoLamelaridadePage from './pages/ProjetoLamelaridadePage'
import ProjetoViscosidadePage from './pages/ProjetoViscosidadePage'
import ProjetoDocumentoPage from './pages/ProjetoDocumentoPage'
import EnsaiosListaPage from './pages/EnsaiosListaPage'
import EnsaiosLabPage from './pages/EnsaiosLabPage'
import EnsaioLabPage from './pages/EnsaioLabPage'
import EnsaioCauqPage from './pages/EnsaioCauqPage'
import EnsaioDetalhePage from './pages/EnsaioDetalhePage'
import LaudosListaPage from './pages/LaudosListaPage'
import LaudoImprimirPage from './pages/LaudoImprimirPage'
import LaudoLabImprimirPage from './pages/LaudoLabImprimirPage'

const qc = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/cadastros" element={<CadastrosIndex />} />
              <Route path="/cadastros/empresas" element={<EmpresasPage />} />
              <Route path="/cadastros/obras" element={<ObrasPage />} />
              <Route path="/cadastros/materiais" element={<MateriaisPage />} />
              <Route path="/cadastros/equipamentos" element={<EquipamentosPage />} />
              <Route path="/cadastros/especificacoes" element={<EspecificacoesPage />} />
              <Route path="/insumos" element={<InsumosDiaPage />} />
              <Route path="/insumos/tanques" element={<TanquesPage />} />
              <Route path="/insumos/produtos" element={<ProdutosInsumoPage />} />
              <Route path="/insumos/entradas" element={<EntradasPage />} />
              <Route path="/insumos/historico" element={<InsumosHistoricoPage />} />
              <Route path="/dosagens" element={<DosagensPage />} />
              <Route path="/projetos/:id/marshall" element={<ProjetoMarshallPage />} />
              <Route path="/projetos/:id/rice-teor" element={<ProjetoRiceTeorPage />} />
              <Route path="/projetos/:id/rtd" element={<ProjetoRtdPage />} />
              <Route path="/projetos/:id/agregados" element={<ProjetoAgregadosPage />} />
              <Route path="/projetos/:id/moldagem" element={<ProjetoMoldagemPage />} />
              <Route path="/projetos/:id/densidades" element={<ProjetoDensidadesPage />} />
              <Route path="/projetos/:id/complementares" element={<ProjetoComplementaresPage />} />
              <Route path="/projetos/:id/indice-forma" element={<ProjetoIndiceFormaPage />} />
              <Route path="/projetos/:id/lamelaridade" element={<ProjetoLamelaridadePage />} />
              <Route path="/projetos/:id/viscosidade" element={<ProjetoViscosidadePage />} />
              <Route path="/projetos/:id/documento" element={<ProjetoDocumentoPage />} />
              <Route path="/ensaios" element={<EnsaiosListaPage />} />
              <Route path="/ensaios/novo" element={<EnsaioCauqPage />} />
              <Route path="/ensaios/:id/editar" element={<EnsaioCauqPage />} />
              <Route path="/ensaios/:id" element={<EnsaioDetalhePage />} />
              <Route path="/ensaios-lab" element={<EnsaiosLabPage />} />
              <Route path="/ensaios-lab/:id" element={<EnsaioLabPage />} />
              <Route path="/laudos" element={<LaudosListaPage />} />
              <Route path="/laudos/:id/imprimir" element={<LaudoImprimirPage />} />
              <Route path="/laudos-lab/:id/imprimir" element={<LaudoLabImprimirPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
