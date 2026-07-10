import { describe, it, expect } from 'vitest'
import { indiceLamelaridade } from './indiceForma'

describe('indiceLamelaridade - golden (NBR 7809 / DNIT 425/2020)', () => {
  it('16 primeiros grãos da planilha real (aba "Índice de forma", Pedra 19mm): IL, lamelares e média conferidos à mão', () => {
    // Por grão: IL = comprimento/espessura; lamelar se IL >= 3.
    // (E,C) -> IL -> lamelar?
    // (1,1.9)   -> 1.9      -> não
    // (1,1.6)   -> 1.6      -> não
    // (0.6,1.9) -> 3.166... -> LAMELAR
    // (1,1.8)   -> 1.8      -> não
    // (1,2.3)   -> 2.3      -> não
    // (0.4,1.1) -> 2.75     -> não
    // (0.6,1.9) -> 3.166... -> LAMELAR
    // (0.7,1.7) -> 2.428... -> não
    // (0.9,1.7) -> 1.888... -> não
    // (0.6,0.6) -> 1        -> não
    // (1.2,1.9) -> 1.583... -> não
    // (1.2,1.7) -> 1.416... -> não
    // (1,1.6)   -> 1.6      -> não
    // (0.6,1.7) -> 2.833... -> não
    // (1,1.9)   -> 1.9      -> não
    // (1.3,1.6) -> 1.230... -> não
    // soma dos IL = 32.5648962... / 16 = 2.0353060134310135
    // lamelares = 2 de 16 -> pctLamelar = 12.5
    const graos = [
      { espessura: 1, comprimento: 1.9 },
      { espessura: 1, comprimento: 1.6 },
      { espessura: 0.6, comprimento: 1.9 },
      { espessura: 1, comprimento: 1.8 },
      { espessura: 1, comprimento: 2.3 },
      { espessura: 0.4, comprimento: 1.1 },
      { espessura: 0.6, comprimento: 1.9 },
      { espessura: 0.7, comprimento: 1.7 },
      { espessura: 0.9, comprimento: 1.7 },
      { espessura: 0.6, comprimento: 0.6 },
      { espessura: 1.2, comprimento: 1.9 },
      { espessura: 1.2, comprimento: 1.7 },
      { espessura: 1, comprimento: 1.6 },
      { espessura: 0.6, comprimento: 1.7 },
      { espessura: 1, comprimento: 1.9 },
      { espessura: 1.3, comprimento: 1.6 },
    ]

    const r = indiceLamelaridade(graos)

    expect(r.totalGraos).toBe(16)
    expect(r.lamelares).toBe(2)
    expect(r.pctLamelar).toBeCloseTo(12.5, 6)
    expect(r.mediaIL).toBeCloseTo(2.0353060134310135, 6)
  })

  it('grão isolado: IL = comprimento/espessura; classificação por IL >= 3', () => {
    // 1.9/0.6 = 3.1666... -> lamelar
    const r = indiceLamelaridade([{ espessura: 0.6, comprimento: 1.9 }])
    expect(r.mediaIL).toBeCloseTo(3.1666666666666665, 10)
    expect(r.lamelares).toBe(1)
    expect(r.totalGraos).toBe(1)
    expect(r.pctLamelar).toBe(100)
  })

  it('grão com IL exatamente 3 é considerado lamelar (IL >= 3)', () => {
    const r = indiceLamelaridade([{ espessura: 0.6, comprimento: 1.8 }])
    expect(r.mediaIL).toBeCloseTo(3, 10)
    expect(r.lamelares).toBe(1)
    expect(r.pctLamelar).toBe(100)
  })

  it('100 grãos completos da aba "Índice de forma " (Pedra 19mm, 1º ensaio): confere contra a célula-resumo oficial', () => {
    // Fonte: aba 'Índice de forma ' da planilha "Projeto FX '' 9,5 ET-DE-P00/027 Rv.B 2026 Rv 05",
    // 1º bloco de ensaio (linhas 10-66, colunas N/E/C/IL/Condição duplicadas lado a lado).
    // Célula-resumo oficial (fórmulas lidas via openpyxl):
    //  - H57 (lamelares) = 19, J57 (total) = 100 -> H58 (%) = (H57/J57)*100 = 19
    //  - I62 "Média do IL" = AVERAGE(D10:D66,J10:J52) = 2.967270340770341
    // A nossa recontagem de lamelares/pctLamelar bate exatamente com a planilha (19 / 19%).
    // A média diverge de forma mínima (2.967270... na planilha vs 2.957937... recalculada
    // aqui) por causa de UMA inconsistência de digitação na própria planilha: na linha 63 do
    // 1º bloco (grão nº 54), as colunas E/C armazenam 0.3/0.5 (=> IL = 0.5/0.3 = 1.6666...),
    // mas a célula de IL daquela linha (D63) tem o valor 2.6 fixo (não é fórmula C/E) — não
    // afeta a classificação lamelar/não-lamelar (ambos os valores são < 3), só desloca a
    // média em ~0.0093. Como nossa função sempre deriva IL = comprimento/espessura a partir
    // dos grãos informados, o golden aqui usa o valor matematicamente consistente.
    const graos = [
      { espessura: 1, comprimento: 1.9 },
      { espessura: 1, comprimento: 1.6 },
      { espessura: 0.6, comprimento: 1.9 },
      { espessura: 1, comprimento: 1.8 },
      { espessura: 1, comprimento: 2.3 },
      { espessura: 0.4, comprimento: 1.1 },
      { espessura: 0.6, comprimento: 1.9 },
      { espessura: 0.7, comprimento: 1.7 },
      { espessura: 0.9, comprimento: 1.7 },
      { espessura: 0.6, comprimento: 0.6 },
      { espessura: 1.2, comprimento: 1.9 },
      { espessura: 1.2, comprimento: 1.7 },
      { espessura: 1, comprimento: 1.6 },
      { espessura: 0.6, comprimento: 1.7 },
      { espessura: 1, comprimento: 1.9 },
      { espessura: 1.3, comprimento: 1.6 },
      { espessura: 0.3, comprimento: 1.6 },
      { espessura: 0.4, comprimento: 0.9 },
      { espessura: 0.7, comprimento: 2.2 },
      { espessura: 0.6, comprimento: 1.7 },
      { espessura: 0.1, comprimento: 2 },
      { espessura: 0.5, comprimento: 1.6 },
      { espessura: 0.7, comprimento: 1.2 },
      { espessura: 0.6, comprimento: 1.6 },
      { espessura: 1.2, comprimento: 1.9 },
      { espessura: 0.6, comprimento: 2 },
      { espessura: 0.7, comprimento: 1.9 },
      { espessura: 0.5, comprimento: 1.6 },
      { espessura: 0.7, comprimento: 1.9 },
      { espessura: 1, comprimento: 1.8 },
      { espessura: 0.1, comprimento: 2.1 },
      { espessura: 0.6, comprimento: 1 },
      { espessura: 0.8, comprimento: 1.5 },
      { espessura: 0.7, comprimento: 1.6 },
      { espessura: 0.7, comprimento: 1.4 },
      { espessura: 1, comprimento: 1.8 },
      { espessura: 0.6, comprimento: 2 },
      { espessura: 0.7, comprimento: 1.8 },
      { espessura: 0.8, comprimento: 1.8 },
      { espessura: 1.5, comprimento: 2.4 },
      { espessura: 0.7, comprimento: 2.2 },
      { espessura: 1.1, comprimento: 1.6 },
      { espessura: 1, comprimento: 2 },
      { espessura: 0.8, comprimento: 2 },
      { espessura: 1, comprimento: 1.5 },
      { espessura: 1, comprimento: 1.5 },
      { espessura: 1, comprimento: 1.5 },
      { espessura: 0.9, comprimento: 1.6 },
      { espessura: 0.4, comprimento: 0.9 },
      { espessura: 0.8, comprimento: 1.5 },
      { espessura: 1.1, comprimento: 1.5 },
      { espessura: 1.2, comprimento: 2.3 },
      { espessura: 0.6, comprimento: 1.4 },
      { espessura: 0.3, comprimento: 0.5 },
      { espessura: 0.5, comprimento: 0.9 },
      { espessura: 0.9, comprimento: 1.7 },
      { espessura: 0.8, comprimento: 1.5 },
      { espessura: 0.8, comprimento: 1.5 },
      { espessura: 0.9, comprimento: 2.2 },
      { espessura: 0.4, comprimento: 1.1 },
      { espessura: 0.8, comprimento: 2.5 },
      { espessura: 1.2, comprimento: 1.8 },
      { espessura: 0.8, comprimento: 2.1 },
      { espessura: 0.7, comprimento: 2 },
      { espessura: 1.3, comprimento: 2.1 },
      { espessura: 0.9, comprimento: 2.4 },
      { espessura: 0.2, comprimento: 2.1 },
      { espessura: 0.7, comprimento: 1.6 },
      { espessura: 1.4, comprimento: 2.2 },
      { espessura: 0.9, comprimento: 1.8 },
      { espessura: 0.8, comprimento: 1.6 },
      { espessura: 1.2, comprimento: 2 },
      { espessura: 0.2, comprimento: 2.7 },
      { espessura: 0.3, comprimento: 1.9 },
      { espessura: 0.6, comprimento: 1.5 },
      { espessura: 1, comprimento: 2 },
      { espessura: 0.6, comprimento: 1.6 },
      { espessura: 0.5, comprimento: 1.8 },
      { espessura: 0.7, comprimento: 0.6 },
      { espessura: 0.7, comprimento: 1.3 },
      { espessura: 0.4, comprimento: 0.9 },
      { espessura: 0.2, comprimento: 0.5 },
      { espessura: 0.3, comprimento: 0.8 },
      { espessura: 0.7, comprimento: 1.2 },
      { espessura: 0.2, comprimento: 0.4 },
      { espessura: 0.5, comprimento: 0.4 },
      { espessura: 0.9, comprimento: 1.6 },
      { espessura: 0.3, comprimento: 0.8 },
      { espessura: 0.6, comprimento: 1.2 },
      { espessura: 0.4, comprimento: 1 },
      { espessura: 0.3, comprimento: 1.8 },
      { espessura: 0.4, comprimento: 0.8 },
      { espessura: 0.1, comprimento: 1.4 },
      { espessura: 0.6, comprimento: 0.9 },
      { espessura: 0.4, comprimento: 1.1 },
      { espessura: 0.9, comprimento: 0.4 },
      { espessura: 0.3, comprimento: 1.9 },
      { espessura: 0.3, comprimento: 0.5 },
      { espessura: 0.4, comprimento: 0.9 },
      { espessura: 0.5, comprimento: 0.7 },
    ]

    const r = indiceLamelaridade(graos)

    expect(r.totalGraos).toBe(100)
    expect(r.lamelares).toBe(19)
    expect(r.pctLamelar).toBeCloseTo(19, 6)
    expect(r.mediaIL).toBeCloseTo(2.9579370074370077, 6)
  })

  it('lança erro em PT-BR se a lista de grãos estiver vazia', () => {
    expect(() => indiceLamelaridade([])).toThrow(/grão/i)
  })

  it('lança erro em PT-BR se alguma espessura for <= 0', () => {
    expect(() => indiceLamelaridade([{ espessura: 0, comprimento: 1.5 }])).toThrow(/espessura/i)
    expect(() => indiceLamelaridade([{ espessura: -1, comprimento: 1.5 }])).toThrow(/espessura/i)
  })
})
