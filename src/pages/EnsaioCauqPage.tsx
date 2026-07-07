import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { calcularGranulometria, type PeneiraLeitura } from '../lib/calculos/granulometria'
import { calcularMarshall } from '../lib/calculos/marshall'
import { teorRotarex, gmmRice } from '../lib/calculos/teorBetume'
import { calcularRtd } from '../lib/calculos/rtd'
import { avaliarParametros } from '../lib/calculos/avaliacao'

interface CpForm { pesoAr: string; pesoImerso: string; leituraEstab: string; fator: string; fluencia: string }
const cpVazio: CpForm = { pesoAr: '', pesoImerso: '', leituraEstab: '', fator: '', fluencia: '' }
const n = (s: string) => (s === '' ? NaN : Number(s))

export default function EnsaioCauqPage() {
  const nav = useNavigate()
  const [cab, setCab] = useState({ dosagem_id: '', cliente_obra_id: '', periodo: 'manha', placa_caminhao: '', operador: '', temperatura_cap: '', observacoes: '' })
  const [constantePrensa, setConstantePrensa] = useState('1.79')
  const [cps, setCps] = useState<CpForm[]>([{ ...cpVazio }, { ...cpVazio }, { ...cpVazio }])
  const [gran, setGran] = useState<{ pesoTotal: string; leituras: { peneira: string; abertura: string; retido: string }[] }>({
    pesoTotal: '',
    leituras: [
      { peneira: '3/4"', abertura: '19', retido: '' }, { peneira: '1/2"', abertura: '12.5', retido: '' },
      { peneira: '3/8"', abertura: '9.53', retido: '' }, { peneira: 'N. 04', abertura: '4.76', retido: '' },
      { peneira: 'N. 10', abertura: '2', retido: '' }, { peneira: 'N. 40', abertura: '0.42', retido: '' },
      { peneira: 'N. 80', abertura: '0.18', retido: '' }, { peneira: 'N. 200', abertura: '0.075', retido: '' },
    ],
  })
  const [teor, setTeor] = useState({ comBetume: '', semBetume: '', umidade: '0' })
  const [rice, setRice] = useState({ pesoAmostra: '', frascoAgua: '', frascoAmostraAgua: '', fator: '1' })
  const [rtdCps, setRtdCps] = useState([{ leitura: '', d: '10', h: '6' }, { leitura: '', d: '10', h: '6' }, { leitura: '', d: '10', h: '6' }])
  const [erro, setErro] = useState('')

  const { data: dosagens } = useQuery({
    queryKey: ['dosagens'],
    queryFn: async () => (await supabase.from('dosagens').select('*, especificacoes(id, nome)').eq('ativa', true)).data ?? [],
  })
  const { data: obras } = useQuery({ queryKey: ['clientes_obras'], queryFn: async () => (await supabase.from('clientes_obras').select('id, cliente, obra')).data ?? [] })
  const dosagem = useMemo(() => (dosagens ?? []).find((d: { id: string }) => d.id === cab.dosagem_id), [dosagens, cab.dosagem_id])
  const { data: faixas } = useQuery({
    queryKey: ['faixas', dosagem?.especificacao_id],
    enabled: !!dosagem,
    queryFn: async () => ({
      peneiras: (await supabase.from('especificacao_peneiras').select('*').eq('especificacao_id', dosagem.especificacao_id)).data ?? [],
      parametros: (await supabase.from('especificacao_parametros').select('*').eq('especificacao_id', dosagem.especificacao_id)).data ?? [],
    }),
  })

  // ===== cálculo ao vivo =====
  const calc = useMemo((): { ok: true; teorPct: number; gmm: number; granRes: ReturnType<typeof calcularGranulometria> | null; marshallRes: ReturnType<typeof calcularMarshall> | null; rtdRes: ReturnType<typeof calcularRtd> | null; aval: ReturnType<typeof avaliarParametros>; conformeGeral: boolean } | { ok: false; problema: string } | null => {
    if (!dosagem) return null
    try {
      const teorPct = teor.comBetume && teor.semBetume
        ? teorRotarex(n(teor.comBetume), n(teor.semBetume), n(teor.umidade) || 0)
        : Number(dosagem.teor_otimo)
      const gmm = rice.pesoAmostra
        ? gmmRice(n(rice.pesoAmostra), n(rice.frascoAgua), n(rice.frascoAmostraAgua), n(rice.fator) || 1)
        : Number(dosagem.dens_max_teorica_projeto)

      if (!Number.isFinite(teorPct) || teorPct <= 0) {
        return { ok: false, problema: 'Dosagem sem teor ótimo cadastrado — informe o Rotarex ou complete a dosagem.' }
      }
      if (!Number.isFinite(gmm) || gmm <= 0) {
        return { ok: false, problema: 'Dosagem sem Gmm de projeto — informe o Rice ou complete a dosagem.' }
      }

      const temMarshall = cps.some(c => c.pesoAr && c.pesoImerso)
      const temGran = !!gran.pesoTotal && gran.leituras.some(l => l.retido !== '')
      const temRotarex = !!teor.comBetume
      if (!temMarshall && !temGran && !temRotarex) {
        return { ok: false, problema: 'Informe as leituras de ao menos um ensaio (Marshall, granulometria ou teor de betume).' }
      }

      const leituras: PeneiraLeitura[] = gran.leituras
        .filter(l => l.retido !== '')
        .map(l => ({ peneira: l.peneira, aberturaMm: n(l.abertura), retidoAcum: n(l.retido) }))
      const granRes = gran.pesoTotal && leituras.length
        ? calcularGranulometria(n(gran.pesoTotal), leituras,
            (faixas?.peneiras ?? []).map((f: { peneira: string; passante_min: number; passante_max: number; tolerancia_trabalho: number }) =>
              ({ peneira: f.peneira, passanteMin: f.passante_min, passanteMax: f.passante_max, toleranciaTrabalho: f.tolerancia_trabalho })),
            dosagem.curva_projeto ?? undefined)
        : null

      const cpsPreenchidos = cps.filter(c => c.pesoAr && c.pesoImerso)
      const marshallRes = cpsPreenchidos.length
        ? calcularMarshall(
            cpsPreenchidos.map(c => ({
              pesoAr: n(c.pesoAr), pesoImerso: n(c.pesoImerso),
              leituraEstabilidade: n(c.leituraEstab) || 0,
              fatorCorrecao: c.fator ? n(c.fator) : undefined,
              leituraFluenciaMm: n(c.fluencia) || 0,
            })),
            { teorLigante: teorPct, densidadeLigante: Number(dosagem.densidade_ligante),
              densMaxTeorica: gmm, constantePrensa: n(constantePrensa),
              passando200: granRes?.linhas.find(l => l.peneira === 'N. 200')?.pctPassando })
        : null

      const rtdPreenchidos = rtdCps.filter(c => c.leitura)
      const rtdRes = rtdPreenchidos.length
        ? calcularRtd(rtdPreenchidos.map(c => ({ leitura: n(c.leitura), constantePrensa: n(constantePrensa), diametroCm: n(c.d), alturaCm: n(c.h) })))
        : null

      const valores: Record<string, number> = { teor_ligante: teorPct }
      if (marshallRes) Object.assign(valores, {
        vazios: marshallRes.medias.vazios, rbv: marshallRes.medias.rbv, vam: marshallRes.medias.vam,
        estabilidade: marshallRes.medias.estabilidadeCorrigida, fluencia_mm: marshallRes.medias.fluenciaMm,
        ...(marshallRes.relacaoFillerLigante !== undefined && { filler_ligante: marshallRes.relacaoFillerLigante }),
      })
      if (rtdRes) valores.rtd = rtdRes.media
      const aval = avaliarParametros(valores, faixas?.parametros ?? [])
      const conformeGeral = aval.conformeGeral && (granRes ? granRes.conforme : true)
      return { ok: true, teorPct, gmm, granRes, marshallRes, rtdRes, aval, conformeGeral }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [dosagem, faixas, cps, gran, teor, rice, rtdCps, constantePrensa])

  // ===== salvar =====
  const salvar = useMutation({
    mutationFn: async () => {
      if (!dosagem) throw new Error('Selecione a dosagem')
      if (!calc?.ok) throw new Error('Preencha os dados do ensaio antes de salvar')
      const { data: ensaio, error } = await supabase.from('ensaios_cauq').insert({
        empresa_id: dosagem.empresa_id, dosagem_id: dosagem.id,
        cliente_obra_id: cab.cliente_obra_id || null, periodo: cab.periodo,
        placa_caminhao: cab.placa_caminhao || null, operador: cab.operador || null,
        temperatura_cap: cab.temperatura_cap ? n(cab.temperatura_cap) : null,
        observacoes: cab.observacoes || null,
        resultados: {
          teor: calc.teorPct, gmm: calc.gmm,
          marshall: calc.marshallRes, granulometria: calc.granRes, rtd: calc.rtdRes,
          avaliacoes: calc.aval.avaliacoes, conforme: calc.conformeGeral,
        },
      }).select('id').single()
      if (error) throw error
      const id = ensaio.id
      const inserts: PromiseLike<{ error: { message: string } | null }>[] = []
      const cpsPreenchidos = cps.map((c, i) => ({ ...c, cp: i + 1 })).filter(c => c.pesoAr)
      if (cpsPreenchidos.length) {
        inserts.push(supabase.from('cauq_marshall').insert({ ensaio_id: id, constante_prensa: n(constantePrensa), gmm_ensaio: rice.pesoAmostra ? calc.gmm : null }))
        inserts.push(supabase.from('cauq_marshall_cp').insert(cpsPreenchidos.map(c => ({
          ensaio_id: id, cp: c.cp, peso_ar: n(c.pesoAr), peso_imerso: n(c.pesoImerso),
          leitura_estabilidade: n(c.leituraEstab) || 0, fator_correcao: c.fator ? n(c.fator) : null,
          leitura_fluencia_mm: n(c.fluencia) || 0,
        }))))
      }
      if (gran.pesoTotal) inserts.push(supabase.from('cauq_granulometria').insert({
        ensaio_id: id, peso_total: n(gran.pesoTotal),
        leituras: gran.leituras.filter(l => l.retido !== '').map(l => ({ peneira: l.peneira, abertura_mm: n(l.abertura), retido_acum: n(l.retido) })),
      }))
      if (teor.comBetume || rice.pesoAmostra) inserts.push(supabase.from('cauq_teor_betume').insert({
        ensaio_id: id, metodo: 'rotarex',
        amostra_com_betume: teor.comBetume ? n(teor.comBetume) : null,
        amostra_sem_betume: teor.semBetume ? n(teor.semBetume) : null,
        umidade_pct: n(teor.umidade) || 0,
        rice_peso_amostra: rice.pesoAmostra ? n(rice.pesoAmostra) : null,
        rice_frasco_agua: rice.frascoAgua ? n(rice.frascoAgua) : null,
        rice_frasco_amostra_agua: rice.frascoAmostraAgua ? n(rice.frascoAmostraAgua) : null,
        rice_fator_temp: n(rice.fator) || 1,
      }))
      const rtdPreench = rtdCps.map((c, i) => ({ ...c, cp: i + 1 })).filter(c => c.leitura)
      if (rtdPreench.length) inserts.push(supabase.from('cauq_rtd_cp').insert(rtdPreench.map(c => ({
        ensaio_id: id, cp: c.cp, leitura: n(c.leitura), constante_prensa: n(constantePrensa), diametro_cm: n(c.d), altura_cm: n(c.h),
      }))))
      const resultados = await Promise.all(inserts)
      for (const r of resultados) {
        if (r.error) throw new Error('Falha ao salvar leituras do ensaio: ' + r.error.message)
      }
      return id
    },
    onSuccess: (id) => nav(`/ensaios/${id}`),
    onError: (e: Error) => setErro(e.message),
  })

  const inp = 'border rounded p-2 w-full'
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Novo Ensaio CAUQ</h1>
        {calc?.ok && (
          <span className={`px-4 py-2 rounded-full font-bold text-white ${calc.conformeGeral ? 'bg-green-600' : 'bg-red-600'}`}>
            {calc.conformeGeral ? 'DENTRO DA ESPECIFICAÇÃO' : 'FORA DA ESPECIFICAÇÃO'}
          </span>
        )}
        {calc && !calc.ok && (
          <span className="px-4 py-2 rounded-full font-bold text-white bg-amber-600">
            {calc.problema}
          </span>
        )}
      </div>

      <section className="bg-white p-4 rounded-xl shadow grid grid-cols-4 gap-3">
        <label className="text-sm col-span-2">Dosagem / Faixa *
          <select className={inp} value={cab.dosagem_id} onChange={e => setCab({ ...cab, dosagem_id: e.target.value })}>
            <option value="">—</option>
            {(dosagens ?? []).map((d: { id: string; nome: string }) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select></label>
        <label className="text-sm">Obra
          <select className={inp} value={cab.cliente_obra_id} onChange={e => setCab({ ...cab, cliente_obra_id: e.target.value })}>
            <option value="">—</option>
            {(obras ?? []).map((o: { id: string; cliente: string; obra: string }) => <option key={o.id} value={o.id}>{o.cliente} — {o.obra}</option>)}
          </select></label>
        <label className="text-sm">Período
          <select className={inp} value={cab.periodo} onChange={e => setCab({ ...cab, periodo: e.target.value })}>
            <option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option>
          </select></label>
        <label className="text-sm">Placa caminhão<input className={inp} value={cab.placa_caminhao} onChange={e => setCab({ ...cab, placa_caminhao: e.target.value })} /></label>
        <label className="text-sm">Operador<input className={inp} value={cab.operador} onChange={e => setCab({ ...cab, operador: e.target.value })} /></label>
        <label className="text-sm">Temp. CAP (°C)<input className={inp} type="number" value={cab.temperatura_cap} onChange={e => setCab({ ...cab, temperatura_cap: e.target.value })} /></label>
        <label className="text-sm">Constante da prensa<input className={inp} type="number" step="any" value={constantePrensa} onChange={e => setConstantePrensa(e.target.value)} /></label>
      </section>

      <section className="bg-white p-4 rounded-xl shadow">
        <h2 className="font-semibold mb-2">Marshall — corpos de prova</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b">
            <th className="p-2">CP</th><th>Peso ao ar (g)</th><th>Peso imerso (g)</th><th>Leitura estab.</th><th>Fator (vazio = tabela)</th><th>Fluência (mm)</th>
            <th>Dens. ap.</th><th>Vazios %</th><th>Estab. corrig.</th>
          </tr></thead>
          <tbody>{cps.map((c, i) => {
            const r = calc?.ok ? calc.marshallRes?.cps[cps.filter((x, j) => j < i && x.pesoAr && x.pesoImerso).length] : undefined
            const preenchido = c.pesoAr && c.pesoImerso
            return (
              <tr key={i} className="border-b">
                <td className="p-2 font-semibold">{i + 1}</td>
                {(['pesoAr', 'pesoImerso', 'leituraEstab', 'fator', 'fluencia'] as const).map(k => (
                  <td key={k}><input className="border rounded p-1 w-28" type="number" step="any" value={c[k]}
                        onChange={e => setCps(cps.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))} /></td>
                ))}
                <td className="p-2">{preenchido && r ? r.densidadeAparente.toFixed(3) : ''}</td>
                <td className="p-2">{preenchido && r ? r.vazios.toFixed(2) : ''}</td>
                <td className="p-2">{preenchido && r ? r.estabilidadeCorrigida.toFixed(0) : ''}</td>
              </tr>
            )
          })}</tbody>
        </table>
        {calc?.ok && calc.marshallRes && (
          <p className="mt-2 text-sm text-slate-700">
            Médias — Vazios: <b>{calc.marshallRes.medias.vazios.toFixed(2)}%</b> · VAM: <b>{calc.marshallRes.medias.vam.toFixed(1)}</b> ·
            RBV: <b>{calc.marshallRes.medias.rbv.toFixed(1)}%</b> · Estabilidade: <b>{calc.marshallRes.medias.estabilidadeCorrigida.toFixed(0)} kgf</b> ·
            Fluência: <b>{calc.marshallRes.medias.fluenciaMm.toFixed(1)} mm</b>
            {calc.marshallRes.relacaoFillerLigante !== undefined && <> · Fíler/Ligante: <b>{calc.marshallRes.relacaoFillerLigante.toFixed(2)}</b></>}
          </p>
        )}
      </section>

      <section className="bg-white p-4 rounded-xl shadow">
        <h2 className="font-semibold mb-2">Granulometria (DNER-ME 083/98)</h2>
        <label className="text-sm">Peso total (g)
          <input className="border rounded p-2 ml-2 w-32" type="number" step="any" value={gran.pesoTotal}
                 onChange={e => setGran({ ...gran, pesoTotal: e.target.value })} /></label>
        <table className="w-full text-sm mt-3">
          <thead><tr className="text-left border-b"><th className="p-2">Peneira</th><th>Abertura</th><th>Retido acum. (g)</th><th>% Passando</th><th>Faixa trabalho</th><th /></tr></thead>
          <tbody>{gran.leituras.map((l, i) => {
            const linha = calc?.ok ? calc.granRes?.linhas.find(x => x.peneira === l.peneira) : undefined
            return (
              <tr key={l.peneira} className="border-b">
                <td className="p-2">{l.peneira}</td><td>{l.abertura}</td>
                <td><input className="border rounded p-1 w-28" type="number" step="any" value={l.retido}
                      onChange={e => setGran({ ...gran, leituras: gran.leituras.map((x, j) => j === i ? { ...x, retido: e.target.value } : x) })} /></td>
                <td className="p-2">{linha ? linha.pctPassando.toFixed(1) : ''}</td>
                <td className="p-2">{linha?.trabMin !== undefined ? `${linha.trabMin.toFixed(1)} – ${linha.trabMax!.toFixed(1)}` : ''}</td>
                <td className="p-2">{linha?.conforme === false && <span className="text-red-600 font-bold">✗</span>}
                    {linha?.conforme === true && <span className="text-green-600 font-bold">✓</span>}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </section>

      <section className="bg-white p-4 rounded-xl shadow grid grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-2">Teor de Betume — Rotarex</h2>
          <div className="space-y-2 text-sm">
            <label className="block">Amostra com betume (g)<input className={inp} type="number" step="any" value={teor.comBetume} onChange={e => setTeor({ ...teor, comBetume: e.target.value })} /></label>
            <label className="block">Amostra sem betume (g)<input className={inp} type="number" step="any" value={teor.semBetume} onChange={e => setTeor({ ...teor, semBetume: e.target.value })} /></label>
            <label className="block">Umidade (%)<input className={inp} type="number" step="any" value={teor.umidade} onChange={e => setTeor({ ...teor, umidade: e.target.value })} /></label>
            {calc?.ok && <p>Teor de betume: <b>{calc.teorPct.toFixed(2)}%</b></p>}
          </div>
        </div>
        <div>
          <h2 className="font-semibold mb-2">Rice (AASHTO T-209) — opcional</h2>
          <div className="space-y-2 text-sm">
            <label className="block">Peso da amostra (g)<input className={inp} type="number" step="any" value={rice.pesoAmostra} onChange={e => setRice({ ...rice, pesoAmostra: e.target.value })} /></label>
            <label className="block">Frasco + água (g)<input className={inp} type="number" step="any" value={rice.frascoAgua} onChange={e => setRice({ ...rice, frascoAgua: e.target.value })} /></label>
            <label className="block">Frasco + amostra + água (g)<input className={inp} type="number" step="any" value={rice.frascoAmostraAgua} onChange={e => setRice({ ...rice, frascoAmostraAgua: e.target.value })} /></label>
            <label className="block">Fator de temperatura<input className={inp} type="number" step="any" value={rice.fator} onChange={e => setRice({ ...rice, fator: e.target.value })} /></label>
            {calc?.ok && <p>Gmm em uso: <b>{calc.gmm.toFixed(4)}</b> {rice.pesoAmostra ? '(Rice do dia)' : '(de projeto)'}</p>}
          </div>
        </div>
      </section>

      <section className="bg-white p-4 rounded-xl shadow">
        <h2 className="font-semibold mb-2">Resistência à Tração Diametral (opcional)</h2>
        <table className="text-sm">
          <thead><tr className="text-left border-b"><th className="p-2">CP</th><th>Leitura</th><th>Diâmetro (cm)</th><th>Altura (cm)</th><th>RTD (MPa)</th></tr></thead>
          <tbody>{rtdCps.map((c, i) => (
            <tr key={i} className="border-b">
              <td className="p-2">{i + 1}</td>
              {(['leitura', 'd', 'h'] as const).map(k => (
                <td key={k}><input className="border rounded p-1 w-24" type="number" step="any" value={c[k]}
                      onChange={e => setRtdCps(rtdCps.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))} /></td>
              ))}
              <td className="p-2">{calc?.ok ? (calc.rtdRes?.rtdMpa[rtdCps.filter((x, j) => j < i && x.leitura).length]?.toFixed(3) ?? '') : ''}</td>
            </tr>
          ))}</tbody>
        </table>
        {calc?.ok && calc.rtdRes && <p className="text-sm mt-2">RTD média: <b>{calc.rtdRes.media.toFixed(3)} MPa</b></p>}
      </section>

      {calc?.ok && calc.aval.avaliacoes.length > 0 && (
        <section className="bg-white p-4 rounded-xl shadow">
          <h2 className="font-semibold mb-2">Verificação contra a especificação</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th className="p-2">Parâmetro</th><th>Obtido</th><th>Especificado</th><th>Situação</th></tr></thead>
            <tbody>{calc.aval.avaliacoes.map(a => (
              <tr key={a.parametro} className="border-b">
                <td className="p-2">{a.parametro}</td><td>{a.valor.toFixed(2)}</td>
                <td>{a.min ?? '—'} a {a.max ?? '—'}</td>
                <td className={a.conforme ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{a.conforme ? 'Conforme' : 'NÃO CONFORME'}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      <label className="block text-sm">Observações
        <textarea className="w-full border rounded p-2" value={cab.observacoes} onChange={e => setCab({ ...cab, observacoes: e.target.value })} /></label>
      {erro && <p className="text-red-600">{erro}</p>}
      {!calc?.ok && <p className="text-amber-700">Preencha os dados do ensaio antes de salvar</p>}
      <button className="bg-blue-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!calc?.ok} onClick={() => salvar.mutate()}>Salvar Ensaio</button>
    </div>
  )
}
