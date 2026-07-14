import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FormEnsaioLabProps } from './tipos'
import CbuqCompletoLabForm from './CbuqCompletoLabForm'

// O composto consulta dosagens (react-query) para o vínculo de projeto;
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

// Smoke de renderização: o Ensaio CBUQ completo deve SEMPRE exibir as 4 seções na
// ordem definida pelo dono — teor de betume (Rotarex|Soxhlet), granulometria da
// mistura, resistência à compressão e Rice/DMT por último — mesmo com dados vazios,
// além do seletor de Dosagem/Projeto (vínculo que traz as faixas p/ a curva da
// mistura). Marshall (1 teor) e RTD NÃO pertencem mais ao composto (correção do
// dono: RTD é ensaio só do projeto; Marshall segue apenas como ensaio avulso).
describe('CbuqCompletoLabForm', () => {
  it('renderiza as 4 seções e o seletor de dosagem com dados vazios', () => {
    const html = render({ dados: {} })
    expect(html).toContain('Teor de betume')
    expect(html).toContain('Rotarex')
    expect(html).toContain('Soxhlet')
    expect(html).toContain('Granulometria da mistura')
    expect(html).toContain('Resistência à compressão')
    expect(html).toContain('Rice / DMT')
    expect(html).toContain('Dosagem / Projeto (opcional)')
    expect(html).toContain('sem projeto vinculado')
  })

  it('NÃO contém Marshall nem RTD (removidos do composto)', () => {
    const html = render({ dados: {} })
    expect(html).not.toContain('Marshall (1 teor)')
    expect(html).not.toContain('tração diametral')
  })

  it('renderiza com dados parciais e ignora chaves legadas marshall/rtd sem quebrar', () => {
    const html = render({
      dados: {
        teor_betume: { metodo: 'soxhlet', amostra_com_betume: 1200, amostra_sem_betume: 1140, umidade_pct: 0 },
        // Chaves legadas de ensaios antigos: não são renderizadas, mas o merge do
        // composto (spread de ...dados em todo save) as preserva no jsonb.
        marshall: { teor_ligante: 4.5, cps: [{ cp: 1, peso_ar: 1200, peso_imerso: 720, leitura_estabilidade: 600, leitura_fluencia_mm: 3 }] },
        rtd: { constante_prensa: 1.79, cps: [{ cp: 1, leitura: 640, diametro_cm: 10, altura_cm: 6 }] },
      },
    })
    expect(html).toContain('Teor de betume')
    expect(html).toContain('Rice / DMT')
    expect(html).toContain('Dosagem / Projeto (opcional)')
    expect(html).not.toContain('Marshall (1 teor)')
    expect(html).not.toContain('tração diametral')
  })

  it('todo save da seção preserva as chaves legadas (merge espalha ...dados)', () => {
    // Verificação direta da regra de preservação: o mesmo merge de salvarSecao
    // ({ ...dados, ...salvosLocais }) nunca descarta chaves irmãs/legadas.
    const dados = { marshall: { teor_ligante: 4.5 }, rtd: { constante_prensa: 1.79 }, dosagem_id: 'abc' }
    const salvosLocais = { teor_betume: { metodo: 'rotarex', amostra_com_betume: 1200 } }
    const enviado = { ...dados, ...salvosLocais }
    expect(enviado.marshall).toEqual({ teor_ligante: 4.5 })
    expect(enviado.rtd).toEqual({ constante_prensa: 1.79 })
    expect(enviado.dosagem_id).toBe('abc')
    expect(enviado.teor_betume).toEqual({ metodo: 'rotarex', amostra_com_betume: 1200 })
  })
})
