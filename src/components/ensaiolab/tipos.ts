// Tipos de ensaio de laboratório avulso (ensaios_lab.tipo_ensaio) e rótulos.
// F3-A entregou os ensaios de AGREGADO; F3-B completou os de CBUQ/CBUQF.

export const TIPOS_AGREGADO = [
  'granulometria', 'lamelaridade', 'indice_forma', 'equivalente_areia',
  'densidade_graudo', 'densidade_miudo',
] as const

// RTD saiu dos ensaios de laboratório (é ensaio SÓ do projeto/dosagem); Marshall
// segue disponível como ensaio AVULSO, mas fora do composto cbuq_completo.
export const TIPOS_CBUQ = ['cbuq_completo', 'marshall', 'teor_betume', 'granulometria_mistura', 'resistencia_compressao', 'rice_dmt'] as const

/** Sub-chaves de ensaios_lab.dados no ensaio composto cbuq_completo — cada chave
 *  guarda EXATAMENTE o shape que o formulário individual correspondente persiste.
 *  Ordem definida pelo dono: teor de betume (Rotarex|Soxhlet), granulometria da
 *  mistura, resistência à compressão e Rice/DMT por último. Ensaios antigos podem
 *  ter chaves marshall/rtd em dados: não são renderizadas, mas os saves preservam. */
export const SECOES_CBUQ_COMPLETO = ['teor_betume', 'granulometria_mistura', 'resistencia_compressao', 'rice_dmt'] as const

export const ROTULO_TIPO_ENSAIO: Record<string, string> = {
  granulometria: 'Granulometria — DNER-ME 083/98',
  lamelaridade: 'Índice de lamelaridade (frações) — DAER/RS-EL 108/01',
  indice_forma: 'Índice de forma (grão a grão) — NBR 7809',
  equivalente_areia: 'Equivalente de areia — DNER-ME 054/94',
  densidade_graudo: 'Densidade do agregado graúdo — DNER-ME 081/98',
  densidade_miudo: 'Densidade do agregado miúdo — DNER-ME 084/95',
  cbuq_completo: 'Ensaio CBUQ completo (todos os ensaios)',
  marshall: 'Marshall (1 teor)',
  teor_betume: 'Teor de betume (Rotarex / Soxhlet)',
  granulometria_mistura: 'Granulometria da mistura',
  resistencia_compressao: 'Resistência à compressão',
  // rtd não é mais oferecido em ensaios novos (é ensaio do projeto), mas o rótulo
  // fica para ensaios/laudos legados já gravados com tipo_ensaio = 'rtd'.
  rtd: 'Resistência à tração diametral (RTD)',
  rice_dmt: 'Rice / DMT',
}

/** Rótulo curto do tipo (antes do " — norma") para chips e linhas compactas. */
export function rotuloCurtoTipo(tipo: string): string {
  return (ROTULO_TIPO_ENSAIO[tipo] ?? tipo).split(' — ')[0]
}

export const ROTULO_MATERIAL: Record<string, string> = {
  agregado: 'Agregado',
  cbuq: 'CBUQ',
  cbuqf: 'CBUQF',
}

/** Props comuns dos formulários por tipo de ensaio: entradas brutas em `dados`
 *  (mesmo shape que os módulos do projeto persistem) + salvamento pelo pai. */
export interface FormEnsaioLabProps {
  dados: Record<string, unknown>
  podeEditar: boolean
  salvando: boolean
  /** Persiste o jsonb `dados` (o pai anexa data/material/origem do cabeçalho). */
  salvarDados: (dados: Record<string, unknown>) => void
  erro: string
  salvo: boolean
}
