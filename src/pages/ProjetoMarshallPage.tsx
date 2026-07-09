import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, Tooltip } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { calcularDosagemMarshall, type CpDosagem } from '../lib/calculos/dosagemMarshall'
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
  const [correcaoFluencia, setCorrecaoFluencia] = useState('1')
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

  // Prefill do formulário a partir dos dados já salvos (modo edição)
  useEffect(() => {
    if (!existente || carregado) return
    if (existente.pm) {
      setDensidadeRealCap(String(existente.pm.densidade_real_cap))
      setConstantePrensa(String(existente.pm.constante_prensa))
      setCorrecaoFluencia(existente.pm.correcao_fluencia != null ? String(existente.pm.correcao_fluencia) : '1')
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
        correcaoFluencia: n(correcaoFluencia) || 1,
      }) }
    } catch (e) {
      return { ok: false as const, problema: (e as Error).message }
    }
  }, [cpsParaCalculo, densidadeRealCap, constantePrensa, correcaoFluencia])

  useEffect(() => {
    if (resultado?.ok && resultado.teorOtimoSugerido != null && teorOtimoInput === '') {
      setTeorOtimoInput(resultado.teorOtimoSugerido.toFixed(2))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado?.ok && resultado.teorOtimoSugerido])

  const dadosGrafico = resultado?.ok
    ? resultado.pontos.map(p => ({
        teor: p.teor, Densidade: p.densidadeAparente, Vazios: p.vazios, Estabilidade: p.estabilidade,
        Fluência: p.fluencia, VAM: p.vam, RBV: p.rbv,
      }))
    : []

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
        correcao_fluencia: n(correcaoFluencia) || 1,
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
        <label className="text-sm">Correção de fluência
          <input className={inp} type="number" step="any" value={correcaoFluencia} disabled={!podeEditar}
            onChange={e => setCorrecaoFluencia(e.target.value)} /></label>
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
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b">
                <th className="p-2">CP</th><th>Peso ar (g)</th><th>Peso imerso (g)</th><th>Rice teórica</th>
                <th>Leitura estab.</th><th>Fator (vazio = tabela)</th><th>Altura (cm)</th><th>Leitura fluência</th>
              </tr></thead>
              <tbody>{t.cps.map((c, iCp) => (
                <tr key={iCp} className="border-b">
                  <td className="p-2 font-semibold">{iCp + 1}</td>
                  {(['pesoAr', 'pesoImerso', 'riceTeorica', 'leituraEstab', 'fator', 'altura', 'fluencia'] as const).map(campo => (
                    <td key={campo}><input className="border rounded p-1 w-24" type="number" step="any" value={c[campo]} disabled={!podeEditar}
                      onChange={e => alterarCp(iTeor, iCp, campo, e.target.value)} /></td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
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

          <div className="grid grid-cols-2 gap-6">
            {([
              ['Densidade aparente × teor', 'Densidade', '#dc2626'],
              ['Vazios (%) × teor', 'Vazios', '#2563eb'],
              ['Estabilidade × teor', 'Estabilidade', '#059669'],
              ['Fluência × teor', 'Fluência', '#7c3aed'],
              ['RBV (%) × teor', 'RBV', '#ea580c'],
            ] as const).map(([titulo, chave, cor]) => (
              <div key={chave}>
                <h3 className="text-sm font-semibold mb-1">{titulo}</h3>
                <LineChart width={380} height={220} data={dadosGrafico}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="teor" type="number" label={{ value: 'Teor (%)', position: 'insideBottom', offset: -4 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line dataKey={chave} stroke={cor} strokeWidth={2} dot />
                </LineChart>
              </div>
            ))}
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
