import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { normalizarPeneira, type FaixaPeneira } from '../../lib/calculos/granulometria'

// Faixas da dosagem/projeto vinculada a um ensaio de laboratório — MESMA semântica
// do ensaio CAUQ diário (EnsaioCauqPage): a especificação dá passante_min/max e a
// tolerância de trabalho por peneira; dosagens.curva_tolerancias (quando cadastrada)
// SOBREPÕE a tolerância da especificação (cruzamento tolerante via normalizarPeneira);
// calcularGranulometria centra a faixa de trabalho em curva_projeto ± tolerância,
// cortada nos limites da especificação.

export interface EspecificacaoMistura {
  faixas: FaixaPeneira[]
  curvaProjeto?: Record<string, number>
}

export interface DosagemVinculada {
  id: string
  nome: string
  revisao: number | null
  /** null quando a especificação do projeto não tem peneiras cadastradas. */
  especificacao: EspecificacaoMistura | null
}

export function useDosagemFaixas(dosagemId: string | undefined) {
  return useQuery({
    queryKey: ['dosagem-faixas-lab', dosagemId],
    enabled: !!dosagemId,
    queryFn: async (): Promise<DosagemVinculada | null> => {
      const { data: dosagem, error } = await supabase.from('dosagens')
        .select('id, nome, revisao, especificacao_id, curva_projeto, curva_tolerancias')
        .eq('id', dosagemId).maybeSingle()
      if (error) throw error
      if (!dosagem) return null
      const { data: peneiras, error: errPeneiras } = await supabase.from('especificacao_peneiras')
        .select('peneira, abertura_mm, passante_min, passante_max, tolerancia_trabalho')
        .eq('especificacao_id', dosagem.especificacao_id)
        .order('abertura_mm', { ascending: false })
      if (errPeneiras) throw errPeneiras
      const curvaTolerancias = (dosagem.curva_tolerancias ?? null) as Record<string, number> | null
      const tolerNorm = curvaTolerancias
        ? new Map(Object.entries(curvaTolerancias).map(([k, v]) => [normalizarPeneira(k), Number(v)]))
        : null
      const faixas: FaixaPeneira[] = ((peneiras ?? []) as { peneira: string; passante_min: number; passante_max: number; tolerancia_trabalho: number }[])
        .map(f => ({
          peneira: f.peneira,
          passanteMin: Number(f.passante_min),
          passanteMax: Number(f.passante_max),
          toleranciaTrabalho: tolerNorm?.get(normalizarPeneira(f.peneira)) ?? Number(f.tolerancia_trabalho),
        }))
      return {
        id: dosagem.id as string,
        nome: dosagem.nome as string,
        revisao: (dosagem.revisao ?? null) as number | null,
        especificacao: faixas.length
          ? { faixas, curvaProjeto: (dosagem.curva_projeto ?? undefined) as Record<string, number> | undefined }
          : null,
      }
    },
  })
}
