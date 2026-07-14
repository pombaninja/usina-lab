export function fmt(n: number | null | undefined, casas = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

// ===== Entrada numérica com VÍRGULA decimal (padrão do laboratório) =====
// O valor fica como texto no estado do formulário enquanto o usuário digita e
// só vira Number na hora de salvar (parseDecimal). Aceita '.' e ',' ao digitar,
// mas padroniza a exibição em ',' (sanitizarDecimal).
//
// Semântica pt-BR do PONTO (corrige "30.000" — trinta mil — virar 30):
// - agrupamento de milhar ("30.000", "1.234.567", "1.234,56") → pontos são
//   separadores de MILHAR e caem no parse;
// - qualquer outro ponto único ("0.075", "20.00", "54.6") é decimal digitado
//   no teclado numérico e vira vírgula.

/** Milhar completo: 1.234 | 30.000 | 1.234.567 | 1.234,56 (vírgula decimal opcional,
 *  tolerando "1.234," durante a digitação — mesma tolerância de "1,").
 *  O primeiro grupo nunca começa em 0: "0.075" é decimal, ninguém escreve "75" assim. */
const MILHAR_COMPLETO = /^[1-9]\d{0,2}(\.\d{3})+(,\d*)?$/
/** Milhar em digitação: último grupo ainda incompleto (0 a 2 dígitos) — "30.", "30.0",
 *  "30.00", "1.234.5". Sem isso, o ponto viraria vírgula na hora e digitar "30.000"
 *  tecla a tecla acabaria em "30,000" (= 30) de novo. */
const MILHAR_DIGITANDO = /^[1-9]\d{0,2}(\.\d{3})*\.\d{0,2}$/

/** Sanitiza o texto digitado: só dígitos, sinal no início e UMA vírgula.
 *  Pontos de milhar (ou a caminho de formar milhar) ficam; ponto solto vira ','. */
export function sanitizarDecimal(texto: string): string {
  let s = texto.replace(/[^\d.,-]/g, '')
  s = s.startsWith('-') ? '-' + s.slice(1).replace(/-/g, '') : s.replace(/-/g, '')
  const sinal = s.startsWith('-') ? '-' : ''
  let u = sinal ? s.slice(1) : s
  if (!MILHAR_COMPLETO.test(u) && !MILHAR_DIGITANDO.test(u)) u = u.replace(/\./g, ',')
  const i = u.indexOf(',')
  if (i !== -1) u = u.slice(0, i + 1) + u.slice(i + 1).replace(/,/g, '')
  return sinal + u
}

/** Converte o texto com vírgula em número. Vazio → null; inválido → NaN (valide antes de salvar).
 *  Milhar completo ("30.000", "1.234,56") perde os pontos; ponto único solto é decimal. */
export function parseDecimal(texto: string): number | null {
  const t = texto.trim()
  if (t === '') return null
  const sinal = t.startsWith('-') ? '-' : ''
  let u = sinal ? t.slice(1) : t
  if (MILHAR_COMPLETO.test(u)) u = u.replace(/\./g, '')
  else if (!u.includes(',') && (u.match(/\./g) ?? []).length === 1) u = u.replace('.', ',')
  return Number(sinal + u.replace(',', '.'))
}

/** Exibe um valor persistido (Number com '.') de volta como texto com vírgula. */
export function decimalParaTexto(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  return String(v).replace('.', ',')
}
