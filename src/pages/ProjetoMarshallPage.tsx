import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, Tooltip, ReferenceLine, ReferenceDot } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { calcularDosagemMarshall, interpolarNoTeor, type CpDosagem, type CpDetalhe } from '../lib/calculos/dosagemMarshall'
import { gmmRice } from '../lib/calculos/teorBetume'
import { fmt } from '../lib/formato'

interface CpForm { pesoAr: string; pesoImerso: string; riceTeorica: string; leituraEstab: string; fator: string; altura: string; fluencia: string }
interface TeorBloco { teor: string; cps: [CpForm, CpForm, CpForm] }

const cpVazio = (): CpForm => ({ pesoAr: '', pesoImerso: '', riceTeorica: '', leituraEstab: '', fator: '', altura: '', fluencia: '' })
const teorVazio = (): TeorBloco => ({ teor: '', cps: [cpVazio(), cpVazio(), cpVazio()] })
const n = (s: string) => (s === '' ? NaN : Number(s))

export default function ProjetoMarshallPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const dosagemId = id!
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [densidadeRealCap, setDensidadeRealCap] = useState('1.004')
  const [constantePrensa, setConstantePrensa] = useState('1.79')
  // Leitura de fluência por CP em mm (fator 1) ou em unidades do extensômetro (1 unid = 0,254 mm).
  const [fluenciaUnidade, setFluenciaUnidade] = useState<'mm' | 'unidades'>('mm')
  const FATOR_UNIDADE_FLUENCIA = 0.254
  const correcaoFluenciaNum = fluenciaUnidade === 'unidades' ? FATOR_UNIDADE_FLUENCIA : 1
  // Faixa da especificação: 2 a 4 mm, que equivale a 8 a 16 unidades de leitura.
  const faixaFluencia = fluenciaUnidade === 'unidades' ? { min: 8, max: 16, rotulo: '8 a 16 unidades' } : { min: 2, max: 4, rotulo: '2 a 4 mm' }
  const [teores, setTeores] = useState<TeorBloco[]>([teorVazio()])
  const [teorOtimoInput, setTeorOtimoInput] = useState('')
  const [erro, setErro] = useState('')
  const [carregado, setCarregado] = useState(false)

  const { data: dosagem } = useQuery({
    queryKey: ['dosagem-marshall-projeto', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagens').select('id, nome, teor_otimo, tipo').eq('id', dosagemId).single()
      if (error) throw error
      return data as { id: string; nome: string; teor_otimo: number | null; tipo: string | null }
    },
  })

  const { data: existente } = useQuery({
    queryKey: ['projeto-marshall', dosagemId],
    queryFn: async () => {
      const [pmR, cpR] = await Promise.all([
        supabase.from('projeto_marshall').select('*').eq('dosagem_id', dosagemId).maybeSingle(),
        supabase.from('projeto_marshall_cp').select('*').eq('dosagem_id', dosagemId).order('teor').order('cp'),
      ])
      if (pmR.error) throw pmR.error
      if (cpR.error) throw cpR.error
      return {
        pm: pmR.data as { densidade_real_cap: number; constante_prensa: number; correcao_fluencia: number | null } | null,
        cps: (cpR.data ?? []) as {
          teor: number; cp: number; peso_ar: number | null; peso_imerso: number | null; rice_teorica: number | null
          leitura_estabilidade: number | null; fator_correcao: number | null; altura_cm: number | null; leitura_fluencia: number | null
        }[],
      }
    },
  })

  // Ensaio RICE-TEOR: DMT (Rice teórica) por teor de CAP. Uma Rice por teor, puxada
  // para os 3 CPs daquele teor na dosagem Marshall.
  const { data: riceTeor } = useQuery({
    queryKey: ['marshall-rice-teor', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_rice_teor')
        .select('teor, peso_amostra, frasco_agua, frasco_amostra_agua, fator_temp').eq('dosagem_id', dosagemId)
      if (error) throw error
      return (data ?? []) as {
        teor: number; peso_amostra: number | null; frasco_agua: number | null
        frasco_amostra_agua: number | null; fator_temp: number | null
      }[]
    },
  })

  // Mapa teor(number) → DMT(number). Ignora linhas com massas incompletas ou leituras inconsistentes.
  const riceTeorPorTeor = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of riceTeor ?? []) {
      if (r.peso_amostra == null || r.frasco_agua == null || r.frasco_amostra_agua == null) continue
      try {
        m.set(Number(r.teor), gmmRice(r.peso_amostra, r.frasco_agua, r.frasco_amostra_agua, r.fator_temp ?? 1))
      } catch { /* leituras Rice inconsistentes: ignora este teor */ }
    }
    return m
  }, [riceTeor])

  // Prefill do formulário a partir dos dados já salvos (modo edição)
  useEffect(() => {
    if (!existente || carregado) return
    if (existente.pm) {
      setDensidadeRealCap(String(existente.pm.densidade_real_cap))
      setConstantePrensa(String(existente.pm.constante_prensa))
      setFluenciaUnidade(existente.pm.correcao_fluencia != null && Math.abs(existente.pm.correcao_fluencia - 0.254) < 1e-9 ? 'unidades' : 'mm')
    }
    if (existente.cps.length) {
      const porTeor = new Map<number, typeof existente.cps>()
      for (const c of existente.cps) {
        const arr = porTeor.get(c.teor) ?? []
        arr.push(c)
        porTeor.set(c.teor, arr)
      }
      const blocos: TeorBloco[] = [...porTeor.entries()].sort(([a], [b]) => a - b).map(([teor, cps]) => {
        const bloco = teorVazio()
        bloco.teor = String(teor)
        for (let i = 0; i < 3; i++) {
          const c = cps.find(x => x.cp === i + 1)
          if (c) {
            bloco.cps[i] = {
              pesoAr: c.peso_ar != null ? String(c.peso_ar) : '',
              pesoImerso: c.peso_imerso != null ? String(c.peso_imerso) : '',
              riceTeorica: c.rice_teorica != null ? String(c.rice_teorica) : '',
              leituraEstab: c.leitura_estabilidade != null ? String(c.leitura_estabilidade) : '',
              fator: c.fator_correcao != null ? String(c.fator_correcao) : '',
              altura: c.altura_cm != null ? String(c.altura_cm) : '',
              fluencia: c.leitura_fluencia != null ? String(c.leitura_fluencia) : '',
            }
          }
        }
        return bloco
      })
      setTeores(blocos)
    }
    setCarregado(true)
  }, [existente, carregado])

  useEffect(() => {
    if (dosagem?.teor_otimo != null && teorOtimoInput === '') setTeorOtimoInput(String(dosagem.teor_otimo))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dosagem])

  // Puxa a Rice teórica do ensaio RICE-TEOR para os CPs de cada teor casado, SEM sobrescrever
  // valores digitados à mão: só preenche campos riceTeorica vazios. O preenchimento é feito
  // UMA ÚNICA VEZ por teor (rastreado em riceAplicadaRef) — assim, se o usuário apagar a Rice
  // puxada, ela NÃO volta sozinha a cada tecla. Um teor novo (ainda não aplicado) que casa com
  // o ensaio é puxado na hora. Só chama setState quando algo muda de fato — evita laço infinito.
  const riceAplicadaRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!carregado || riceTeorPorTeor.size === 0) return
    let mudou = false
    const novos = teores.map(t => {
      const teorNum = n(t.teor)
      if (!Number.isFinite(teorNum)) return t
      const chave = String(teorNum)
      if (riceAplicadaRef.current.has(chave)) return t
      const dmt = riceTeorPorTeor.get(teorNum)
      if (dmt == null) return t
      const dmtStr = String(dmt)
      let blocoMudou = false
      const cps = t.cps.map(c => {
        if (c.riceTeorica === '') { blocoMudou = true; return { ...c, riceTeorica: dmtStr } }
        return c
      }) as [CpForm, CpForm, CpForm]
      riceAplicadaRef.current.add(chave)
      if (!blocoMudou) return t
      mudou = true
      return { ...t, cps }
    })
    if (mudou) setTeores(novos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregado, riceTeorPorTeor, teores])

  function alterarTeor(i: number, valor: string) {
    setTeores(teores.map((t, idx) => (idx === i ? { ...t, teor: valor } : t)))
  }
  function alterarCp(iTeor: number, iCp: number, campo: keyof CpForm, valor: string) {
    setTeores(teores.map((t, idx) => {
      if (idx !== iTeor) return t
      const cps = [...t.cps] as [CpForm, CpForm, CpForm]
      cps[iCp] = { ...cps[iCp], [campo]: valor }
      return { ...t, cps }
    }))
  }
  function adicionarTeor() { setTeores([...teores, teorVazio()]) }
  function removerTeor(i: number) { setTeores(teores.filter((_, idx) => idx !== i)) }

  const cpsParaCalculo = useMemo((): CpDosagem[] => {
    const lista: CpDosagem[] = []
    teores.forEach(t => {
      const teor = n(t.teor)
      if (!Number.isFinite(teor)) return
      t.cps.forEach((c, i) => {
        if (!c.pesoAr || !c.pesoImerso || !c.riceTeorica) return
        lista.push({
          teor, cp: i + 1,
          pesoAr: n(c.pesoAr), pesoImerso: n(c.pesoImerso), riceTeorica: n(c.riceTeorica),
          leituraEstabilidade: c.leituraEstab ? n(c.leituraEstab) : undefined,
          fatorCorrecao: c.fator ? n(c.fator) : undefined,
          alturaCm: c.altura ? n(c.altura) : undefined,
          leituraFluencia: c.fluencia ? n(c.fluencia) : undefined,
        })
      })
    })
    return lista
  }, [teores])

  const resultado = useMemo(() => {
    if (cpsParaCalculo.length === 0) return null
    try {
      return { ok: true as const, ...calcularDosagemMarshall(cpsParaCalculo, {
        densidadeRealCap: n(densidadeRealCap) || 1.004,
        constantePrensa: n(constantePrensa) || 1.79,
        correcaoFluencia: correcaoFluenciaNum,
      }) }
    } catch (e) {
      return { ok: false as const, problema: (e as Error).message }
    }
  }, [cpsParaCalculo, densidadeRealCap, constantePrensa, correcaoFluenciaNum])

  useEffect(() => {
    if (resultado?.ok && resultado.teorOtimoSugerido != null && teorOtimoInput === '') {
      setTeorOtimoInput(resultado.teorOtimoSugerido.toFixed(2))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado?.ok && resultado.teorOtimoSugerido])

  // Parâmetros calculados AO VIVO por CP (teor|cp → detalhe) para exibir na própria
  // tabela de lançamento enquanto o lançador digita — mesma fonte (resultado.detalhes)
  // da tabela de resultados detalhados abaixo.
  const detalhePorTeorCp = useMemo(() => {
    const m = new Map<string, CpDetalhe>()
    if (resultado?.ok) {
      for (const d of resultado.detalhes) for (const c of d.cps) m.set(`${d.teor}|${c.cp}`, c)
    }
    return m
  }, [resultado])

  const dadosGrafico = resultado?.ok
    ? resultado.pontos.map(p => ({
        teor: p.teor, Densidade: p.densidadeAparente, Vazios: p.vazios, Estabilidade: p.estabilidade,
        Fluência: p.fluencia, VAM: p.vam, RBV: p.rbv,
      }))
    : []

  // Cruzamento do teor ótimo escolhido nas curvas: índices interpolados no teor digitado,
  // desenhados em cada gráfico como linhas tracejadas (vertical no teor, horizontal no valor).
  const otimoCurvas = useMemo(() => {
    if (!resultado?.ok || resultado.pontos.length === 0) return null
    const alvo = n(teorOtimoInput)
    if (!Number.isFinite(alvo)) return null
    return interpolarNoTeor(resultado.pontos, alvo)
  }, [resultado, teorOtimoInput])

  const salvar = useMutation({
    mutationFn: async () => {
      const densRealCapNum = n(densidadeRealCap)
      if (!Number.isFinite(densRealCapNum) || densRealCapNum <= 0) throw new Error('Informe a densidade real do CAP (valor maior que zero).')
      const constPrensaNum = n(constantePrensa)
      if (!Number.isFinite(constPrensaNum) || constPrensaNum <= 0) throw new Error('Informe a constante da prensa (valor maior que zero).')

      const { error: errPm } = await supabase.from('projeto_marshall').upsert({
        dosagem_id: dosagemId,
        densidade_real_cap: densRealCapNum,
        constante_prensa: constPrensaNum,
        correcao_fluencia: correcaoFluenciaNum,
      }, { onConflict: 'dosagem_id' })
      if (errPm) throw new Error('Falha ao salvar parâmetros da dosagem Marshall: ' + errPm.message)

      const linhasCp: { dosagem_id: string; teor: number; cp: number; peso_ar: number | null; peso_imerso: number | null; rice_teorica: number | null; leitura_estabilidade: number | null; fator_correcao: number | null; altura_cm: number | null; leitura_fluencia: number | null }[] = []
      for (const t of teores) {
        const teor = n(t.teor)
        if (!Number.isFinite(teor)) continue
        t.cps.forEach((c, i) => {
          const preenchido = c.pesoAr || c.pesoImerso || c.riceTeorica || c.leituraEstab || c.fator || c.altura || c.fluencia
          if (!preenchido) return
          linhasCp.push({
            dosagem_id: dosagemId, teor, cp: i + 1,
            peso_ar: c.pesoAr ? n(c.pesoAr) : null,
            peso_imerso: c.pesoImerso ? n(c.pesoImerso) : null,
            rice_teorica: c.riceTeorica ? n(c.riceTeorica) : null,
            leitura_estabilidade: c.leituraEstab ? n(c.leituraEstab) : null,
            fator_correcao: c.fator ? n(c.fator) : null,
            altura_cm: c.altura ? n(c.altura) : null,
            leitura_fluencia: c.fluencia ? n(c.fluencia) : null,
          })
        })
      }

      if (linhasCp.length) {
        const { error: errCp } = await supabase.from('projeto_marshall_cp').upsert(linhasCp, { onConflict: 'dosagem_id,teor,cp' })
        if (errCp) throw new Error('Falha ao salvar corpos de prova da dosagem Marshall: ' + errCp.message)
      }

      const { data: antigos, error: errAntigos } = await supabase.from('projeto_marshall_cp').select('id, teor, cp').eq('dosagem_id', dosagemId)
      if (errAntigos) throw new Error('Falha ao conferir corpos de prova existentes: ' + errAntigos.message)
      const chaves = new Set(linhasCp.map(l => `${l.teor}|${l.cp}`))
      const idsRemover = (antigos ?? []).filter((a: { teor: number; cp: number }) => !chaves.has(`${a.teor}|${a.cp}`)).map((a: { id: string }) => a.id)
      if (idsRemover.length) {
        const { error: errDel } = await supabase.from('projeto_marshall_cp').delete().in('id', idsRemover)
        if (errDel) throw new Error('Falha ao remover corpos de prova excluídos: ' + errDel.message)
      }

      if (teorOtimoInput.trim() !== '') {
        const teorOtimoNum = n(teorOtimoInput)
        if (!Number.isFinite(teorOtimoNum)) throw new Error('Teor ótimo inválido.')
        const { error: errDos } = await supabase.from('dosagens').update({ teor_otimo: teorOtimoNum }).eq('id', dosagemId)
        if (errDos) throw new Error('Falha ao salvar o teor ótimo no projeto: ' + errDos.message)
      }
    },
    onSuccess: () => setErro(''),
    onError: (e: Error) => setErro(e.message),
  })

  const inp = 'border rounded p-2 w-full'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dosagem Marshall — {dosagem?.nome ?? '…'}</h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/dosagens')}>Voltar aos projetos</button>
      </div>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita a dosagem Marshall. Exibindo em modo leitura.</p>}

      <section className="bg-white p-4 rounded-xl shadow grid grid-cols-3 gap-3">
        <label className="text-sm">Densidade real do CAP (g/cm³)
          <input className={inp} type="number" step="any" value={densidadeRealCap} disabled={!podeEditar}
            onChange={e => setDensidadeRealCap(e.target.value)} /></label>
        <label className="text-sm">Constante da prensa
          <input className={inp} type="number" step="any" value={constantePrensa} disabled={!podeEditar}
            onChange={e => setConstantePrensa(e.target.value)} /></label>
        <label className="text-sm">Leitura de fluência em
          <select className={inp} value={fluenciaUnidade} disabled={!podeEditar}
            onChange={e => setFluenciaUnidade(e.target.value as 'mm' | 'unidades')}>
            <option value="mm">mm (direto)</option>
            <option value="unidades">unidades de leitura (1 unid = 0,254 mm)</option>
          </select>
          <span className="block text-xs text-slate-500 mt-1">Faixa da especificação: {faixaFluencia.rotulo}. Conversão aplicada por corpo de prova.</span></label>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Teores ensaiados</h2>
          {podeEditar && <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarTeor}>+ Adicionar teor</button>}
        </div>

        {teores.map((t, iTeor) => (
          <div key={iTeor} className="bg-white p-4 rounded-xl shadow space-y-2">
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold">Teor (%)
                <input className="border rounded p-2 w-28 ml-2" type="number" step="any" value={t.teor} disabled={!podeEditar}
                  onChange={e => alterarTeor(iTeor, e.target.value)} /></label>
              {podeEditar && teores.length > 1 && (
                <button type="button" className="text-red-600 text-sm" onClick={() => removerTeor(iTeor)}>Remover teor</button>
              )}
            </div>
            {(() => {
              const teorNum = n(t.teor)
              const dmt = Number.isFinite(teorNum) ? riceTeorPorTeor.get(teorNum) : undefined
              return dmt != null
                ? <p className="text-xs text-lime-700">Rice (DMT) do RICE-TEOR: {fmt(dmt, 3)} — preenchida automaticamente nos 3 CPs (editável).</p>
                : null
            })()}
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b">
                <th className="p-2">CP</th><th>Peso ar (g)</th><th>Peso imerso (g)</th><th>Rice teórica</th>
                <th>Leitura estab.</th><th>Fator (vazio = tabela)</th><th>Altura (cm)</th><th>Leitura fluência ({fluenciaUnidade === 'unidades' ? 'unid.' : 'mm'})</th>
                {/* Colunas CALCULADAS ao vivo (somente leitura) */}
                {(['Volume', 'Dens. apar.', 'V.V (%)', 'V.C.B.', 'V.A.M.', 'R.B.V.', 'Estab. corrig. (kg)', 'Fluência (mm)'] as const).map(h => (
                  <th key={h} className="bg-slate-50 text-slate-600 text-xs font-semibold px-2">{h}</th>
                ))}
              </tr></thead>
              <tbody>{t.cps.map((c, iCp) => {
                // Detalhe calculado ao vivo deste CP (— enquanto os campos não fecham o cálculo).
                const det = detalhePorTeorCp.get(`${n(t.teor)}|${iCp + 1}`)
                return (
                <tr key={iCp} className="border-b">
                  <td className="p-2 font-semibold">{iCp + 1}</td>
                  {(['pesoAr', 'pesoImerso', 'riceTeorica', 'leituraEstab', 'fator', 'altura', 'fluencia'] as const).map(campo => {
                    // Fator de correção plausível fica na faixa da tabela DER (0,76–1,46); valor muito
                    // fora disso é quase sempre outro dado digitado no campo errado (ex.: % de vazios).
                    const fatorSuspeito = campo === 'fator' && c.fator !== '' && (n(c.fator) < 0.5 || n(c.fator) > 2)
                    // Fluência fora da faixa da especificação (2–4 mm ou 8–16 unidades, conforme o seletor).
                    const fluenciaFora = campo === 'fluencia' && c.fluencia !== ''
                      && (n(c.fluencia) < faixaFluencia.min || n(c.fluencia) > faixaFluencia.max)
                    return (
                      <td key={campo}><input
                        className={`border rounded p-1 w-24 ${fatorSuspeito ? 'border-red-500 bg-red-50 text-red-700' : ''}${fluenciaFora ? ' border-amber-500 bg-amber-50 text-amber-800' : ''}`}
                        title={fatorSuspeito ? 'Fator fora da faixa da tabela (0,76–1,46). Deixe vazio para usar a tabela pelo volume.'
                          : fluenciaFora ? `Fluência fora da faixa da especificação (${faixaFluencia.rotulo}).` : undefined}
                        type="number" step="any" value={c[campo]} disabled={!podeEditar}
                        onChange={e => alterarCp(iTeor, iCp, campo, e.target.value)} /></td>
                    )
                  })}
                  {/* Parâmetros calculados ao vivo por CP — visual distinto de campo editável */}
                  {([
                    det ? fmt(det.volume, 1) : '—',
                    det ? fmt(det.densidadeAparente, 3) : '—',
                    det ? fmt(det.vazios, 1) : '—',
                    det ? fmt(det.vcb, 1) : '—',
                    det ? fmt(det.vam, 1) : '—',
                    det ? fmt(det.rbv, 1) : '—',
                    det ? fmt(det.corrig, 0) : '—',
                    det ? fmt(det.fluenciaMm, 1) : '—',
                  ]).map((v, iCol) => (
                    <td key={iCol} className="bg-slate-50 text-slate-700 font-medium text-xs px-2 whitespace-nowrap">{v}</td>
                  ))}
                </tr>
                )
              })}</tbody>
            </table>
            </div>
            {t.cps.some(c => c.fator !== '' && (n(c.fator) < 0.5 || n(c.fator) > 2)) && (
              <p className="text-red-600 text-sm">Fator de correção fora da faixa da tabela DER (0,76–1,46) — confira se não foi digitado outro dado no campo. Deixe o fator vazio para o sistema buscar na tabela pelo volume do CP.</p>
            )}
            {t.cps.some(c => c.fluencia !== '' && (n(c.fluencia) < faixaFluencia.min || n(c.fluencia) > faixaFluencia.max)) && (
              <p className="text-amber-700 text-sm">Fluência fora da faixa da especificação ({faixaFluencia.rotulo}) em CP destacado.</p>
            )}
          </div>
        ))}
      </section>

      {resultado && !resultado.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{resultado.problema}</p>}

      {resultado?.ok && resultado.pontos.length > 0 && (
        <section className="bg-white p-4 rounded-xl shadow space-y-4">
          <h2 className="font-semibold text-lg">Curvas de dosagem</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b">
              <th className="p-2">Teor</th><th>Densidade aparente</th><th>Vazios %</th><th>Estabilidade</th><th>Fluência</th><th>VAM</th><th>RBV</th>
            </tr></thead>
            <tbody>{resultado.pontos.map(p => (
              <tr key={p.teor} className="border-b">
                <td className="p-2">{fmt(p.teor, 1)}%</td>
                <td className="p-2">{fmt(p.densidadeAparente, 3)}</td>
                <td className="p-2">{fmt(p.vazios, 2)}</td>
                <td className="p-2">{fmt(p.estabilidade, 0)}</td>
                <td className="p-2">{fmt(p.fluencia, 2)}</td>
                <td className="p-2">{fmt(p.vam, 2)}</td>
                <td className="p-2">{fmt(p.rbv, 1)}</td>
              </tr>
            ))}</tbody>
          </table>

          {/* justify-items-center + mx-auto: cada gráfico centrado na célula e grade centrada na página */}
          <div className="grid grid-cols-2 gap-6 justify-items-center max-w-4xl mx-auto">
            {([
              ['Densidade aparente × teor', 'Densidade', '#dc2626', 'densidadeAparente', 3],
              ['Vazios (%) × teor', 'Vazios', '#2563eb', 'vazios', 2],
              ['Estabilidade × teor', 'Estabilidade', '#059669', 'estabilidade', 0],
              ['Fluência × teor', 'Fluência', '#7c3aed', 'fluencia', 2],
              ['RBV (%) × teor', 'RBV', '#ea580c', 'rbv', 1],
              ['V.A.M. (%) × teor', 'VAM', '#0891b2', 'vam', 2],
            ] as const).map(([titulo, chave, cor, campo, dec]) => {
              const valorOtimo = otimoCurvas ? otimoCurvas[campo] : null
              return (
                <div key={chave}>
                  <h3 className="text-sm font-semibold mb-1">{titulo}</h3>
                  <LineChart width={380} height={220} data={dadosGrafico}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="teor" type="number" label={{ value: 'Teor (%)', position: 'insideBottom', offset: -4 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {otimoCurvas != null && valorOtimo != null && (
                      <ReferenceLine x={otimoCurvas.teor} stroke="#334155" strokeDasharray="4 4" />
                    )}
                    {otimoCurvas != null && valorOtimo != null && (
                      <ReferenceLine y={valorOtimo} stroke="#334155" strokeDasharray="4 4" />
                    )}
                    {otimoCurvas != null && valorOtimo != null && (
                      <ReferenceDot x={otimoCurvas.teor} y={valorOtimo} r={4} fill={cor} stroke="#fff"
                        label={{ value: fmt(valorOtimo, dec), position: 'top', fontSize: 11, fontWeight: 600 }} />
                    )}
                    <Line dataKey={chave} stroke={cor} strokeWidth={2} dot />
                  </LineChart>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-4">
            <p className="text-sm text-slate-700">
              Teor ótimo sugerido (cruzamento em 4% de vazios): <b>{resultado.teorOtimoSugerido != null ? `${fmt(resultado.teorOtimoSugerido, 2)}%` : 'não identificado na faixa ensaiada'}</b>
            </p>
            <label className="text-sm">Teor ótimo (%)
              <input className="border rounded p-2 w-28 ml-2" type="number" step="any" value={teorOtimoInput} disabled={!podeEditar}
                onChange={e => setTeorOtimoInput(e.target.value)} /></label>
          </div>
        </section>
      )}

      {resultado?.ok && resultado.detalhes.length > 0 && (
        <section className="bg-white p-4 rounded-xl shadow space-y-6">
          <h2 className="font-semibold text-lg">Resultados detalhados por corpo de prova</h2>
          {resultado.detalhes.map(d => {
            const temInconsistente = d.cps.some(c => c.inconsistente)
            return (
              <div key={d.teor} className="space-y-1">
                <h3 className="font-semibold text-sm">Teor {fmt(d.teor, 1)}%</h3>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse min-w-full">
                    <thead>
                      <tr className="bg-slate-100 text-center">
                        <th className="border p-1" rowSpan={2}>Corpo de prova</th>
                        <th className="border p-1" rowSpan={2}>% CAP</th>
                        <th className="border p-1" colSpan={2}>Peso em gramas</th>
                        <th className="border p-1" colSpan={5}>Densidade</th>
                        <th className="border p-1" colSpan={2}>V.A.M. / R.B.V.</th>
                        <th className="border p-1" colSpan={2}>Corpo de prova</th>
                        <th className="border p-1" colSpan={4}>Estabilidade</th>
                        <th className="border p-1" colSpan={2}>Fluência</th>
                      </tr>
                      <tr className="bg-slate-100 text-center">
                        <th className="border p-1">Peso no ar</th>
                        <th className="border p-1">Peso na água</th>
                        <th className="border p-1">Volume cm³</th>
                        <th className="border p-1">Densidade aparente</th>
                        <th className="border p-1">Teórica Rice</th>
                        <th className="border p-1">V.V (% vazios)</th>
                        <th className="border p-1">V.C.B. (% vazios cheio de betume)</th>
                        <th className="border p-1">V.A.M. (vaz. agr. mineral)</th>
                        <th className="border p-1">R.B.V. (relação betume vazios)</th>
                        <th className="border p-1">Vol. cm³</th>
                        <th className="border p-1">Altura cm</th>
                        <th className="border p-1">Fator correção</th>
                        <th className="border p-1">Leitura</th>
                        <th className="border p-1">Calcul.</th>
                        <th className="border p-1">Corrig. kg</th>
                        <th className="border p-1">Leitura mm</th>
                        <th className="border p-1">Pol.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.cps.map(c => (
                        <tr key={c.cp} className="text-center">
                          <td className="border p-1 font-semibold">{c.cp}</td>
                          <td className="border p-1">{fmt(c.teor, 1)}</td>
                          <td className="border p-1">{fmt(c.pesoAr, 1)}</td>
                          <td className="border p-1">{fmt(c.pesoImerso, 1)}</td>
                          <td className="border p-1">{fmt(c.volume, 1)}</td>
                          <td className={'border p-1' + (c.inconsistente ? ' bg-red-100 text-red-700 font-semibold' : '')}>{fmt(c.densidadeAparente, 3)}</td>
                          <td className={'border p-1' + (c.inconsistente ? ' bg-red-100 text-red-700 font-semibold' : '')}>{fmt(c.riceTeorica, 3)}</td>
                          <td className={'border p-1' + (c.inconsistente ? ' bg-red-100 text-red-700 font-semibold' : '')}>{fmt(c.vazios, 1)}</td>
                          <td className="border p-1">{fmt(c.vcb, 1)}</td>
                          <td className="border p-1">{fmt(c.vam, 1)}</td>
                          <td className="border p-1">{fmt(c.rbv, 1)}</td>
                          <td className="border p-1">{fmt(c.volume, 1)}</td>
                          <td className="border p-1">{c.alturaCm != null ? fmt(c.alturaCm, 2) : '—'}</td>
                          <td className="border p-1">{fmt(c.fator, 2)}</td>
                          <td className="border p-1">{fmt(c.leitura, 0)}</td>
                          <td className="border p-1">{fmt(c.calcul, 0)}</td>
                          <td className="border p-1">{fmt(c.corrig, 0)}</td>
                          <td className="border p-1">{fmt(c.fluenciaMm, 1)}</td>
                          <td className="border p-1">{fmt(c.fluenciaPol, 1)}</td>
                        </tr>
                      ))}
                      <tr className="text-center font-semibold bg-slate-50">
                        <td className="border p-1">Média</td>
                        <td className="border p-1">—</td>
                        <td className="border p-1">—</td>
                        <td className="border p-1">—</td>
                        <td className="border p-1">{fmt(d.media.volume, 1)}</td>
                        <td className="border p-1">{fmt(d.media.densidadeAparente, 3)}</td>
                        <td className="border p-1">{fmt(d.media.riceTeorica, 3)}</td>
                        <td className="border p-1">{fmt(d.media.vazios, 1)}</td>
                        <td className="border p-1">{fmt(d.media.vcb, 1)}</td>
                        <td className="border p-1">{fmt(d.media.vam, 1)}</td>
                        <td className="border p-1">{fmt(d.media.rbv, 1)}</td>
                        <td className="border p-1">{fmt(d.media.volume, 1)}</td>
                        <td className="border p-1">{d.media.alturaCm != null ? fmt(d.media.alturaCm, 2) : '—'}</td>
                        <td className="border p-1">{fmt(d.media.fator, 2)}</td>
                        <td className="border p-1">{fmt(d.media.leitura, 0)}</td>
                        <td className="border p-1">{fmt(d.media.calcul, 0)}</td>
                        <td className="border p-1">{fmt(d.media.corrig, 0)}</td>
                        <td className="border p-1">{fmt(d.media.fluenciaMm, 1)}</td>
                        <td className="border p-1">{fmt(d.media.fluenciaPol, 1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {temInconsistente && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    Rice teórica ≤ densidade aparente neste CP — confira a Rice (vazios impossível ≤ 0).
                  </p>
                )}
              </div>
            )
          })}

          {(() => {
            const teorAlvo = n(teorOtimoInput)
            if (teorOtimoInput.trim() === '' || !Number.isFinite(teorAlvo)) {
              return (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-sm mb-1">Resultado no teor ótimo</h3>
                  <p className="text-sm text-slate-500">Escolha o teor ótimo (campo acima) para ver os índices interpolados nesse teor.</p>
                </div>
              )
            }
            const r = interpolarNoTeor(resultado.pontos, teorAlvo)
            if (!r) return null
            return (
              <div className="border-t pt-4">
                <h3 className="font-semibold text-sm mb-2">Resultado no teor ótimo ({fmt(teorAlvo, 2)}%)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-slate-500 block text-xs">Densidade aparente</span>{fmt(r.densidadeAparente, 3)}</div>
                  <div><span className="text-slate-500 block text-xs">Vazios (%)</span>{fmt(r.vazios, 1)}</div>
                  <div><span className="text-slate-500 block text-xs">VCB (%)</span>{fmt(r.vcb, 1)}</div>
                  <div><span className="text-slate-500 block text-xs">VAM (%)</span>{fmt(r.vam, 1)}</div>
                  <div><span className="text-slate-500 block text-xs">RBV (%)</span>{fmt(r.rbv, 1)}</div>
                  <div><span className="text-slate-500 block text-xs">Estabilidade (kg)</span>{fmt(r.estabilidade, 0)}</div>
                  <div><span className="text-slate-500 block text-xs">Fluência (mm)</span>{fmt(r.fluencia, 1)}</div>
                </div>
              </div>
            )
          })()}
        </section>
      )}

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button className="bg-blue-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50" disabled={salvar.isPending}
            onClick={() => salvar.mutate()}>
            Salvar dosagem Marshall
          </button>
          {salvar.isSuccess && !erro && <span className="text-green-700 text-sm">Salvo.</span>}
        </div>
      )}
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </div>
  )
}
