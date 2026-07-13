// Tipos de ensaio de laboratório avulso (ensaios_lab.tipo_ensaio) e rótulos.
// F3-A: só os ensaios de AGREGADO têm formulário; os de CBUQ/CBUQF chegam na F3-B
// (aparecem desabilitados como "em breve" na criação).

export const TIPOS_AGREGADO = [
  'granulometria', 'lamelaridade', 'indice_forma', 'equivalente_areia',
  'densidade_graudo', 'densidade_miudo',
] as const

export const TIPOS_CBUQ = ['marshall', 'teor_betume', 'granulometria_mistura', 'rtd', 'rice_dmt'] as const

export const ROTULO_TIPO_ENSAIO: Record<string, string> = {
  granulometria: 'Granulometria — DNER-ME 083/98',
  lamelaridade: 'Índice de lamelaridade (frações) — DAER/RS-EL 108/01',
  indice_forma: 'Índice de forma (grão a grão) — NBR 7809',
  equivalente_areia: 'Equivalente de areia — DNER-ME 054/94',
  densidade_graudo: 'Densidade do agregado graúdo — DNER-ME 081/98',
  densidade_miudo: 'Densidade do agregado miúdo — DNER-ME 084/95',
  marshall: 'Marshall (1 teor)',
  teor_betume: 'Teor de betume (Rotarex / Rice)',
  granulometria_mistura: 'Granulometria da mistura',
  rtd: 'Resistência à tração diametral (RTD)',
  rice_dmt: 'Rice / DMT',
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
