import { useMemo, useState } from 'react'
import { calcularMarshall, fatorCorrecaoPorVolume } from '../../lib/calculos/marshall'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../../lib/formato'
import type { FormEnsaioLabProps } from './tipos'

// Marshall AVULSO (1 teor, como o ensaio CAUQ diário) — sem dosagem vinculada, os
// parâmetros de projeto (teor de ligante, densidade do ligante, Gmm/Rice) são
// digitados aqui. Cálculo 100% via calcularMarshall (golden-testado). dados jsonb
// espelha cauq_marshall + cauq_marshall_cp: { teor_ligante, densidade_ligante, gmm,
// constante_prensa, correcao_fluencia, cps: [{cp, peso_ar, peso_imerso,
// leitura_estabilidade, fator_correcao, altura_cm, leitura_fluencia_mm}] }.

interface CpForm { pesoAr: string; pesoImerso: string; leituraEstab: string; fator: string; altura: string; fluencia: string }
const cpVazio = (): CpForm => ({ pesoAr: '', pesoImerso: '', leituraEstab: '', fator: '', altura: '', fluencia: '' })

// Leitura de fluência em mm (fator 1) ou em unidades do extensômetro (1 unid = 0,254 mm)
// — mesmo seletor da ProjetoMarshallPage.
const FATOR_UNIDADE_FLUENCIA = 0.254

interface DadosMarshall {
  teor_ligante?: number
  densidade_ligante?: number
  gmm?: number
  constante_prensa?: number
  correcao_fluencia?: number
  cps?: {
    cp: number; peso_ar: number; peso_imerso: number; leitura_estabilidade: number
    fator_correcao: number | null; altura_cm: number | null; leitura_fluencia_mm: number
  }[]
}

export default function MarshallLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  const d = dados as DadosMarshall
  const [teorLigante, setTeorLigante] = useState(() => decimalParaTexto(d.teor_ligante))
  const [densidadeLigante, setDensidadeLigante] = useState(() => d.densidade_ligante !== undefined ? decimalParaTexto(d.densidade_ligante) : '1,004')
  const [gmm, setGmm] = useState(() => decimalParaTexto(d.gmm))
  const [constantePrensa, setConstantePrensa] = useState(() => d.constante_prensa !== undefined ? decimalParaTexto(d.constante_prensa) : '1,79')
  const [fluenciaUnidade, setFluenciaUnidade] = useState<'mm' | 'unidades'>(() =>
    d.correcao_fluencia != null && Math.abs(d.correcao_fluencia - FATOR_UNIDADE_FLUENCIA) < 1e-9 ? 'unidades' : 'mm')
  const [cps, setCps] = useState<CpForm[]>(() => {
    if (!d.cps?.length) return [cpVazio(), cpVazio(), cpVazio()]
    return [1, 2, 3].map(cp => {
      const c = d.cps!.find(x => x.cp === cp)
      return c
        ? {
            pesoAr: decimalParaTexto(c.peso_ar), pesoImerso: decimalParaTexto(c.peso_imerso),
            leituraEstab: decimalParaTexto(c.leitura_estabilidade),
            fator: c.fator_correcao != null ? decimalParaTexto(c.fator_correcao) : '',
            altura: c.altura_cm != null ? decimalParaTexto(c.altura_cm) : '',
            fluencia: decimalParaTexto(c.leitura_fluencia_mm),
          }
        : cpVazio()
    })
  })
  const [erroLocal, setErroLocal] = useState('')

  const correcaoFluenciaNum = fluenciaUnidade === 'unidades' ? FATOR_UNIDADE_FLUENCIA : 1

  function alterarCp(i: number, campo: keyof CpForm, valor: string) {
    setCps(cps.map((c, idx) => (idx === i ? { ...c, [campo]: sanitizarDecimal(valor) } : c)))
  }

  const cpsPreenchidos = useMemo(() => cps.filter(c => c.pesoAr !== '' && c.pesoImerso !== ''), [cps])

  const calc = useMemo((): { ok: true; r: ReturnType<typeof calcularMarshall> } | { ok: false; problema: string } | null => {
    const teor = parseDecimal(teorLigante)
    const dens = parseDecimal(densidadeLigante)
    const g = parseDecimal(gmm)
    const k = parseDecimal(constantePrensa)
    if (!cpsPreenchidos.length) return null
    if (teor === null || !Number.isFinite(teor) || teor <= 0) return { ok: false, problema: 'Informe o teor de ligante (%) do ensaio.' }
    if (dens === null || !Number.isFinite(dens) || dens <= 0) return { ok: false, problema: 'Informe a densidade do ligante.' }
    if (g === null || !Number.isFinite(g) || g <= 0) return { ok: false, problema: 'Informe a Gmm (Rice teórica) da mistura.' }
    if (k === null || !Number.isFinite(k) || k <= 0) return { ok: false, problema: 'Informe a constante da prensa.' }
    try {
      const r = calcularMarshall(
        cpsPreenchidos.map(c => ({
          pesoAr: parseDecimal(c.pesoAr) ?? NaN,
          pesoImerso: parseDecimal(c.pesoImerso) ?? NaN,
          leituraEstabilidade: parseDecimal(c.leituraEstab) ?? 0,
          fatorCorrecao: c.fator !== '' ? parseDecimal(c.fator) ?? undefined : undefined,
          leituraFluenciaMm: parseDecimal(c.fluencia) ?? 0,
          alturaCm: c.altura !== '' ? parseDecimal(c.altura) ?? undefined : undefined,
        })),
        { teorLigante: teor, densidadeLigante: dens, densMaxTeorica: g, constantePrensa: k, correcaoFluencia: correcaoFluenciaNum },
      )
      return { ok: true, r }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [cpsPreenchidos, teorLigante, densidadeLigante, gmm, constantePrensa, correcaoFluenciaNum])

  function salvar() {
    if (!cpsPreenchidos.length) { setErroLocal('Informe ao menos um corpo de prova (peso ao ar e peso imerso).'); return }
    if (!calc || !calc.ok) { setErroLocal(calc && !calc.ok ? calc.problema : 'Preencha os dados do ensaio.'); return }
    setErroLocal('')
    salvarDados({
      teor_ligante: parseDecimal(teorLigante)!,
      densidade_ligante: parseDecimal(densidadeLigante)!,
      gmm: parseDecimal(gmm)!,
      constante_prensa: parseDecimal(constantePrensa)!,
      correcao_fluencia: correcaoFluenciaNum,
      cps: cps.map((c, i) => ({ ...c, cp: i + 1 }))
        .filter(c => c.pesoAr !== '' && c.pesoImerso !== '')
        .map(c => ({
          cp: c.cp,
          peso_ar: parseDecimal(c.pesoAr)!,
          peso_imerso: parseDecimal(c.pesoImerso)!,
          leitura_estabilidade: parseDecimal(c.leituraEstab) ?? 0,
          fator_correcao: c.fator !== '' ? parseDecimal(c.fator) : null,
          altura_cm: c.altura !== '' ? parseDecimal(c.altura) : null,
          leitura_fluencia_mm: parseDecimal(c.fluencia) ?? 0,
        })),
    })
  }

  const inp = 'border rounded p-2 w-full'
  const inpNum = 'border rounded p-1 w-24'

  return (
    <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
      <h2 className="font-semibold text-lg text-grp-700">Marshall (1 teor)</h2>
      <p className="text-sm text-slate-500">
        Ensaio avulso: informe os parâmetros da mistura (teor de ligante, densidade do ligante e Gmm/Rice teórica)
        e as leituras dos corpos de prova. Fator de correção vazio usa a tabela DER pelo volume do CP.
      </p>

      <div className="grid sm:grid-cols-5 gap-3">
        <label className="text-sm">Teor de ligante (%)
          <input className={inp} inputMode="decimal" value={teorLigante} disabled={!podeEditar}
            onChange={e => setTeorLigante(sanitizarDecimal(e.target.value))} /></label>
        <label className="text-sm">Densidade do ligante
          <input className={inp} inputMode="decimal" value={densidadeLigante} disabled={!podeEditar}
            onChange={e => setDensidadeLigante(sanitizarDecimal(e.target.value))} /></label>
        <label className="text-sm">Gmm — Rice teórica
          <input className={inp} inputMode="decimal" value={gmm} disabled={!podeEditar}
            onChange={e => setGmm(sanitizarDecimal(e.target.value))} /></label>
        <label className="text-sm">Constante da prensa
          <input className={inp} inputMode="decimal" value={constantePrensa} disabled={!podeEditar}
            onChange={e => setConstantePrensa(sanitizarDecimal(e.target.value))} /></label>
        <label className="text-sm">Leitura de fluência em
          <select className={inp} value={fluenciaUnidade} disabled={!podeEditar}
            onChange={e => setFluenciaUnidade(e.target.value as 'mm' | 'unidades')}>
            <option value="mm">mm</option>
            <option value="unidades">unidades de leitura (1 unid = 0,254 mm)</option>
          </select></label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">CP</th><th>Peso ao ar (g)</th><th>Peso imerso (g)</th><th>Leitura estab.</th>
              <th>Fator (vazio = tabela)</th><th>Altura (cm)</th><th>Leitura fluência ({fluenciaUnidade === 'unidades' ? 'unid.' : 'mm'})</th>
              <th>Volume</th><th>Dens. ap.</th><th>Vazios %</th><th>VCB %</th><th>VAM %</th><th>RBV %</th>
              <th>Estab. corrig.</th><th>Fluência (mm)</th><th>Fluência (pol)</th>
            </tr>
          </thead>
          <tbody>
            {cps.map((c, i) => {
              const preenchido = c.pesoAr !== '' && c.pesoImerso !== ''
              const r = calc?.ok && preenchido
                ? calc.r.cps[cps.filter((x, j) => j < i && x.pesoAr !== '' && x.pesoImerso !== '').length]
                : undefined
              // Fator da tabela DER pelo volume do CP — mesmo parâmetro do projeto CBUQ.
              const pesoAr = parseDecimal(c.pesoAr)
              const pesoImerso = parseDecimal(c.pesoImerso)
              const volume = pesoAr !== null && pesoImerso !== null ? pesoAr - pesoImerso : NaN
              const fatorTabela = Number.isFinite(volume) && volume > 0 ? fatorCorrecaoPorVolume(volume) : null
              const fatorDiverge = fatorTabela != null && c.fator !== ''
                && Math.abs((parseDecimal(c.fator) ?? NaN) - fatorTabela) > 1e-9
              return (
                <tr key={i} className="border-b">
                  <td className="p-2 font-semibold">{i + 1}</td>
                  {(['pesoAr', 'pesoImerso', 'leituraEstab', 'fator', 'altura', 'fluencia'] as const).map(k => (
                    <td key={k}><input
                      className={`${inpNum} ${k === 'fator' && fatorDiverge ? 'border-amber-500 bg-amber-50 text-amber-800' : ''}`}
                      placeholder={k === 'fator' && fatorTabela != null ? `tabela: ${fmt(fatorTabela, 2)}` : undefined}
                      title={k === 'fator' && fatorDiverge ? `Difere da tabela pelo volume (${fmt(fatorTabela!, 2)}). Deixe vazio para usar a tabela.` : undefined}
                      inputMode="decimal" value={c[k]} disabled={!podeEditar}
                      onChange={e => alterarCp(i, k, e.target.value)} /></td>
                  ))}
                  <td className="p-2">{r ? fmt(r.volume, 1) : '—'}</td>
                  <td className="p-2">{r ? fmt(r.densidadeAparente, 3) : '—'}</td>
                  <td className="p-2">{r ? fmt(r.vazios, 2) : '—'}</td>
                  <td className="p-2">{r ? fmt(r.vcb, 1) : '—'}</td>
                  <td className="p-2">{r ? fmt(r.vam, 1) : '—'}</td>
                  <td className="p-2">{r ? fmt(r.rbv, 1) : '—'}</td>
                  <td className="p-2">{r ? fmt(r.estabilidadeCorrigida, 0) : '—'}</td>
                  <td className="p-2">{r ? fmt(r.fluenciaMm, 2) : '—'}</td>
                  <td className="p-2">{r ? fmt(r.fluenciaPol, 1) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {calc?.ok && (
        <p className="text-sm bg-slate-50 rounded p-2 text-slate-700">
          Médias — Volume: <b>{fmt(calc.r.medias.volume, 1)} cm³</b> · Dens. aparente: <b>{fmt(calc.r.medias.densidadeAparente, 3)}</b> ·
          Vazios: <b>{fmt(calc.r.medias.vazios, 2)}%</b> · VCB: <b>{fmt(calc.r.medias.vcb, 1)}%</b> ·
          VAM: <b>{fmt(calc.r.medias.vam, 1)}%</b> · RBV: <b>{fmt(calc.r.medias.rbv, 1)}%</b> ·
          Estabilidade: <b>{fmt(calc.r.medias.estabilidadeCorrigida, 0)} kgf</b> ·
          Fluência: <b>{fmt(calc.r.medias.fluenciaMm, 2)} mm</b> ({fmt(calc.r.medias.fluenciaPol, 1)} pol)
        </p>
      )}
      {calc && !calc.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{calc.problema}</p>}

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50"
            disabled={salvando} onClick={salvar}>Salvar ensaio</button>
          {salvo && !erro && !erroLocal && <span className="text-green-700 text-sm">Salvo.</span>}
        </div>
      )}
      {(erroLocal || erro) && <p className="text-red-600 text-sm">{erroLocal || erro}</p>}
    </section>
  )
}
