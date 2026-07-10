// Viscosidade do CAP e temperaturas de usinagem/compactação — Módulo 5c do
// Projeto CAUQ completo.
//
// Método extraído da planilha real ("Projeto FX '' 9,5 ET-DE-P00/027 Rv.B 2026
// Rv 05", aba "Visc.cap 30 - 45"): o viscosímetro Saybolt-Furol lê o tempo de
// escoamento (segundos SSF) em várias temperaturas (na planilha real: 120,
// 135, 150, 165 e 177 °C — cada uma com 2 leituras cuja média vira o ponto da
// curva). A planilha ajusta esses pontos com LOGEST(viscosidade, temperatura),
// que no Excel resolve viscosidade = b * m^T por mínimos quadrados — o que é
// matematicamente idêntico a uma regressão linear de ln(viscosidade) em T:
//   ln(V) = a + b·T           (a = ln(b_excel), b = ln(m_excel))
// Para achar a temperatura correspondente a uma viscosidade-alvo V, a
// planilha inverte com LOG(V/b_excel, m_excel), que é o mesmo que
//   T = (ln(V) − a) / b
// (célula Q54/R54 = LOGEST; Q36/Q38/Q41/Q43 = a inversão para os alvos de
// compactação e usinagem; E62=$Q$38, G62=$Q$36, M62=$Q$43, N62=$Q$41).
//
// Faixas-alvo de viscosidade Saybolt-Furol usadas na planilha (padrão
// DNIT/Marshall para CAP): usinagem 75–95 seg SSF, compactação 125–155 seg
// SSF. Como a viscosidade cai com o aumento de T, a temperatura correspondente
// à borda de MAIOR viscosidade da faixa é a de MENOR temperatura (e
// vice-versa) — por isso resolvemos as duas bordas e ordenamos o resultado,
// sem assumir o sinal do coeficiente.

export interface PontoVisc {
  temperatura: number
  viscosidade: number
}

export interface FaixasViscosidade {
  usinagemMin: number
  usinagemMax: number
  compactacaoMin: number
  compactacaoMax: number
}

export interface ResultadoViscosidade {
  coefA: number // intercepto: ln(V) = coefA + coefB * T
  coefB: number // inclinação
  tempUsinagem: { min: number; max: number }
  tempCompactacao: { min: number; max: number }
}

export function curvaViscosidade(pontos: PontoVisc[], faixas: FaixasViscosidade): ResultadoViscosidade {
  if (pontos.length < 2) {
    throw new Error('Informe ao menos dois pontos de temperatura/viscosidade para ajustar a curva.')
  }
  if (pontos.some(p => !Number.isFinite(p.viscosidade) || p.viscosidade <= 0)) {
    throw new Error('A viscosidade deve ser maior que zero em todos os pontos.')
  }
  if (pontos.some(p => !Number.isFinite(p.temperatura))) {
    throw new Error('A temperatura deve ser um número válido em todos os pontos.')
  }

  // Regressão de mínimos quadrados de ln(V) em T (equivalente ao LOGEST do Excel).
  const n = pontos.length
  const xs = pontos.map(p => p.temperatura)
  const ys = pontos.map(p => Math.log(p.viscosidade))
  const sx = xs.reduce((s, x) => s + x, 0)
  const sy = ys.reduce((s, y) => s + y, 0)
  const sxx = xs.reduce((s, x) => s + x * x, 0)
  const sxy = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const denom = n * sxx - sx * sx
  if (denom === 0) {
    throw new Error('Não é possível ajustar a curva: as temperaturas informadas são todas iguais.')
  }
  const coefB = (n * sxy - sx * sy) / denom
  const coefA = (sy - coefB * sx) / n

  // T tal que ln(V) = coefA + coefB*T  =>  T = (ln(V) - coefA) / coefB
  const tempParaViscosidade = (v: number): number => {
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error('A viscosidade-alvo deve ser maior que zero.')
    }
    if (coefB === 0) {
      throw new Error('Não é possível calcular a temperatura: a curva ajustada é constante (inclinação zero).')
    }
    return (Math.log(v) - coefA) / coefB
  }

  const usinA = tempParaViscosidade(faixas.usinagemMin)
  const usinB = tempParaViscosidade(faixas.usinagemMax)
  const compA = tempParaViscosidade(faixas.compactacaoMin)
  const compB = tempParaViscosidade(faixas.compactacaoMax)

  return {
    coefA,
    coefB,
    tempUsinagem: { min: Math.min(usinA, usinB), max: Math.max(usinA, usinB) },
    tempCompactacao: { min: Math.min(compA, compB), max: Math.max(compA, compB) },
  }
}
