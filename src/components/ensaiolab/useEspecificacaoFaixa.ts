import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// Faixa (passante_min/max por peneira) de uma ESPECIFICAÇÃO avulsa — para o
// ensaio de granulometria de AGREGADO (A2 do Batch A). Diferente do
// useDosagemFaixas (projeto/dosagem), aqui NÃO existe curva de projeto nem faixa
// de trabalho: a banda mostrada é a PRÓPRIA especificação ("Faixa da
// especificação"), persistida no ensaio como dados.especificacao_id.
// Compartilhado entre o formulário (GranulometriaLabForm) e o laudo imprimível
// (LaudoLabImprimirPage) — mesma fonte, mesma semântica.

export interface EspecificacaoFaixa {
  id: string
  nome: string
  norma: string | null
  /** Peneiras da especificação (grafia cadastrada + abertura + faixa), da maior para a menor abertura. */
  peneiras: { peneira: string; aberturaMm: number; passanteMin: number; passanteMax: number }[]
}

export function useEspecificacaoFaixa(especificacaoId: string | undefined) {
  return useQuery({
    queryKey: ['especificacao-faixa', especificacaoId],
    enabled: !!especificacaoId,
    queryFn: async (): Promise<EspecificacaoFaixa | null> => {
      const { data: espec, error } = await supabase.from('especificacoes')
        .select('id, nome, norma').eq('id', especificacaoId).maybeSingle()
      if (error) throw error
      if (!espec) return null
      const { data: peneiras, error: errPen } = await supabase.from('especificacao_peneiras')
        .select('peneira, abertura_mm, passante_min, passante_max')
        .eq('especificacao_id', especificacaoId)
        .order('abertura_mm', { ascending: false })
      if (errPen) throw errPen
      const linhas = (peneiras ?? []) as { peneira: string; abertura_mm: number; passante_min: number; passante_max: number }[]
      return {
        id: espec.id as string,
        nome: espec.nome as string,
        norma: (espec.norma ?? null) as string | null,
        peneiras: linhas.map(p => ({
          peneira: p.peneira,
          aberturaMm: Number(p.abertura_mm),
          passanteMin: Number(p.passante_min),
          passanteMax: Number(p.passante_max),
        })),
      }
    },
  })
}

/** Lista de especificações ativas para o select "Especificação (faixa)". */
export function useEspecificacoesAtivas() {
  return useQuery({
    queryKey: ['especificacoes-ativas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('especificacoes')
        .select('id, nome, norma').eq('ativa', true).order('nome')
      if (error) throw error
      return (data ?? []) as { id: string; nome: string; norma: string | null }[]
    },
  })
}
