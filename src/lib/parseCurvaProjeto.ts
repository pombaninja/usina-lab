// Converte "3/4\"=100; N. 04=54.6" em { '3/4"': 100, 'N. 04': 54.6 }.
// Rejeita pares malformados com mensagem em português indicando o par ofensor.
export function parseCurvaProjeto(texto: string): Record<string, number> {
  const curva: Record<string, number> = {}
  for (const par of texto.split(';').map(s => s.trim()).filter(Boolean)) {
    const idx = par.indexOf('=')
    const pen = idx >= 0 ? par.slice(0, idx).trim() : ''
    const val = idx >= 0 ? par.slice(idx + 1).trim() : ''
    if (!pen || val === '' || isNaN(Number(val))) {
      throw new Error(`Curva de projeto inválida em: "${par}" (use PENEIRA=VALOR; valor com ponto decimal)`)
    }
    if (pen in curva) throw new Error(`Peneira repetida na curva de projeto: "${pen}"`)
    curva[pen] = Number(val)
  }
  return curva
}
