export function fmt(n: number | null | undefined, casas = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

// ===== Entrada numérica com VÍRGULA decimal (padrão do laboratório) =====
// O valor fica como texto no estado do formulário enquanto o usuário digita e
// só vira Number na hora de salvar (parseDecimal). Aceita '.' e ',' ao digitar,
// mas padroniza a exibição em ',' (sanitizarDecimal).

/** Sanitiza o texto digitado: só dígitos, sinal no início e UMA vírgula ('.' vira ','). */
export function sanitizarDecimal(texto: string): string {
  let s = texto.replace(/\./g, ',').replace(/[^\d,-]/g, '')
  s = s.startsWith('-') ? '-' + s.slice(1).replace(/-/g, '') : s.replace(/-/g, '')
  const i = s.indexOf(',')
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '')
  return s
}

/** Converte o texto com vírgula em número. Vazio → null; inválido → NaN (valide antes de salvar). */
export function parseDecimal(texto: string): number | null {
  const t = texto.trim()
  if (t === '') return null
  return Number(t.replace(',', '.'))
}

/** Exibe um valor persistido (Number com '.') de volta como texto com vírgula. */
export function decimalParaTexto(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  return String(v).replace('.', ',')
}
