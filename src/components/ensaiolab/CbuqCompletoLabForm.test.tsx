import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FormEnsaioLabProps } from './tipos'
import CbuqCompletoLabForm from './CbuqCompletoLabForm'

// O composto agora consulta dosagens (react-query) para o vínculo de projeto;
// no smoke SSR nenhuma query roda (React Query não busca no servidor), basta o
// módulo do supabase existir sem exigir VITE_SUPABASE_URL/KEY no ambiente de teste.
vi.mock('../../lib/supabase', () => ({ supabase: {} }))

function render(props: Partial<FormEnsaioLabProps> & { dados: Record<string, unknown> }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    <QueryClientProvider client={qc}>
      <CbuqCompletoLabForm podeEditar={true} salvando={false} salvarDados={() => {}} erro="" salvo={false} {...props} />
    </QueryClientProvider>,
  )
}

// Smoke de renderização: o Ensaio CBUQ completo deve SEMPRE exibir as 5 seções
// (Marshall, teor de betume, granulometria da mistura, RTD e Rice/DMT), mesmo
// com dados vazios — regressão reportada pelo dono ("não tem Marshall") — e o
// seletor de Dosagem/Projeto (vínculo que traz as faixas p/ a curva da mistura).
describe('CbuqCompletoLabForm', () => {
  it('renderiza as 5 seções e o seletor de dosagem com dados vazios', () => {
    const html = render({ dados: {} })
    expect(html).toContain('Marshall (1 teor)')
    expect(html).toContain('Teor de betume')
    expect(html).toContain('Granulometria da mistura')
    expect(html).toContain('tração diametral')
    expect(html).toContain('Rice / DMT')
    expect(html).toContain('Dosagem / Projeto (opcional)')
    expect(html).toContain('sem projeto vinculado')
  })

  it('renderiza com dados parciais (só marshall salvo)', () => {
    const html = render({
      dados: { marshall: { teor_ligante: 4.5, cps: [{ cp: 1, peso_ar: 1200, peso_imerso: 720, leitura_estabilidade: 600, leitura_fluencia_mm: 3 }] } },
    })
    expect(html).toContain('Marshall (1 teor)')
    expect(html).toContain('Rice / DMT')
    expect(html).toContain('Dosagem / Projeto (opcional)')
  })
})
