// Datas no fuso local — nunca usar toISOString() para "hoje" (UTC vira amanhã à noite).
export function hojeLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function mesAtualLocal(): string {
  return hojeLocal().slice(0, 7)
}

/** Limites [inicio, fimExclusivo) de um mês "AAAA-MM" como strings de data locais. */
export function limitesDoMes(anoMes: string): { inicio: string; fimExclusivo: string } {
  const [ano, mes] = anoMes.split('-').map(Number)
  const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`
  return { inicio: `${anoMes}-01`, fimExclusivo: fim }
}
