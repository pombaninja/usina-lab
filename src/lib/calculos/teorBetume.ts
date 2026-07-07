// Fórmula da planilha (célula L14 do laudo FX III Olímpia): =((L12/L10)*100)-L13
// onde L12 = comBetume - semBetume, L10 = comBetume, L13 = umidade em %
export function teorRotarex(comBetume: number, semBetume: number, umidadePct = 0): number {
  if (comBetume <= 0 || semBetume <= 0 || semBetume > comBetume)
    throw new Error('Pesos inválidos: amostra sem betume deve ser menor que com betume')
  return ((comBetume - semBetume) / comBetume) * 100 - umidadePct
}

// Fórmula Rice AASHTO T-209: gmm = pesoAmostra / (pesoAmostra + frascoAgua − frascoAmostraAgua) × fatorTemp
export function gmmRice(pesoAmostra: number, frascoAgua: number, frascoAmostraAgua: number, fatorTemp = 1): number {
  const denominador = pesoAmostra + frascoAgua - frascoAmostraAgua
  if (denominador <= 0) throw new Error('Leituras Rice inconsistentes')
  return (pesoAmostra / denominador) * fatorTemp
}
