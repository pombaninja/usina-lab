import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { calcularGranulometria, normalizarPeneira, type PeneiraLeitura } from '../lib/calculos/granulometria'
import { calcularMarshall } from '../lib/calculos/marshall'
import { teorRotarex, gmmRice } from '../lib/calculos/teorBetume'
import { calcularRtd } from '../lib/calculos/rtd'
import { avaliarParametros } from '../lib/calculos/avaliacao'
import { fmt } from '../lib/formato'

interface CpForm { pesoAr: string; pesoImerso: string; leituraEstab: string; fator: string; fluencia: string; altura: string }
const cpVazio: CpForm = { pesoAr: '', pesoImerso: '', leituraEstab: '', fator: '', fluencia: '', altura: '' }
const n = (s: string) => (s === '' ? NaN : Number(s))

// Lista padrão usada apenas como fallback quando a especificação não tem peneiras cadastradas
const peneirasPadrao: { peneira: string; abertura: string }[] = [
  { peneira: '3/4"', abertura: '19' }, { peneira: '1/2"', abertura: '12.5' },
  { peneira: '3/8"', abertura: '9.53' }, { peneira: 'N. 04', abertura: '4.76' },
  { peneira: 'N. 10', abertura: '2' }, { peneira: 'N. 40', abertura: '0.42' },
  { peneira: 'N. 80', abertura: '0.18' }, { peneira: 'N. 200', abertura: '0.075' },
]

export default function EnsaioCauqPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const editando = !!id
  const [cab, setCab] = useState({ dosagem_id: '', cliente_obra_id: '', periodo: 'manha', placa_caminhao: '', operador: '', temperatura_cap: '', observacoes: '' })
  const [constantePrensa, setConstantePrensa] = useState('1.79')
  const [correcaoFluencia, setCorrecaoFluencia] = useState('1')
  const [cps, setCps] = useState<CpForm[]>([{ ...cpVazio }, { ...cpVazio }, { ...cpVazio }])
  const [gran, setGran] = useState<{ pesoTotal: string; leituras: { peneira: string; abertura: string; retido: string }[] }>({
    pesoTotal: '',
    leituras: peneirasPadrao.map(l => ({ ...l, retido: '' })),
  })
  const [granCarregado, setGranCarregado] = useState<{ peneira: string; retido_acum: number }[] | null>(null)
  const [teor, setTeor] = useState({ comBetume: '', semBetume: '', umidade: '0' })
  const [rice, setRice] = useState({ pesoAmostra: '', frascoAgua: '', frascoAmostraAgua: '', fator: '1' })
  const [rtdCps, setRtdCps] = useState([{ leitura: '', d: '10', h: '6' }, { leitura: '', d: '10', h: '6' }, { leitura: '', d: '10', h: '6' }])
  const [erro, setErro] = useState('')
  const [carregado, setCarregado] = useState(false)
  const [dataEnsaio, setDataEnsaio] = useState('')

  const { data: ensaioExistente } = useQuery({
    queryKey: ['ensaio-editar', id],
    enabled: editando,
    queryFn: async () => {
      const [ensaioR, marshallR, cpsR, granR, teorR, rtdR] = await Promise.all([
        supabase.from('ensaios_cauq').select('*').eq('id', id).single(),
        supabase.from('cauq_marshall').select('*').eq('ensaio_id', id).maybeSingle(),
        supabase.from('cauq_marshall_cp').select('*').eq('ensaio_id', id).order('cp'),
        supabase.from('cauq_granulometria').select('*').eq('ensaio_id', id).maybeSingle(),
        supabase.from('cauq_teor_betume').select('*').eq('ensaio_id', id).maybeSingle(),
        supabase.from('cauq_rtd_cp').select('*').eq('ensaio_id', id).order('cp'),
      ])
      if (ensaioR.error) throw ensaioR.error
      return {
        ensaio: ensaioR.data as { data: string; dosagem_id: string; cliente_obra_id: string | null; periodo: string | null; placa_caminhao: string | null; operador: string | null; temperatura_cap: number | null; observacoes: string | null },
        marshall: marshallR.data as { constante_prensa: number; correcao_fluencia: number | null } | null,
        cps: (cpsR.data ?? []) as { cp: number; peso_ar: number; peso_imerso: number; leitura_estabilidade: number; fator_correcao: number | null; leitura_fluencia_mm: number; altura_cm: number | null }[],
        gran: granR.data as { peso_total: number; leituras: { peneira: string; abertura_mm: number; retido_acum: number }[] } | null,
        teor: teorR.data as { amostra_com_betume: number | null; amostra_sem_betume: number | null; umidade_pct: number | null; rice_peso_amostra: number | null; rice_frasco_agua: number | null; rice_frasco_amostra_agua: number | null; rice_fator_temp: number | null } | null,
        rtd: (rtdR.data ?? []) as { cp: number; leitura: number; diametro_cm: number; altura_cm: number }[],
      }
    },
  })

  // Prefill de todos os estados do formulário a partir do ensaio existente (modo edição)
  useEffect(() => {
    if (!ensaioExistente || carregado) return
    const { ensaio: e, marshall, cps: cpsRows, gran: granRow, teor: teorRow, rtd: rtdRows } = ensaioExistente
    setDataEnsaio(e.data)
    setCab({
      dosagem_id: e.dosagem_id,
      cliente_obra_id: e.cliente_obra_id ?? '',
      periodo: e.periodo ?? 'manha',
      placa_caminhao: e.placa_caminhao ?? '',
      operador: e.operador ?? '',
      temperatura_cap: e.temperatura_cap != null ? String(e.temperatura_cap) : '',
      observacoes: e.observacoes ?? '',
    })
    if (marshall) {
      setConstantePrensa(String(marshall.constante_prensa))
      setCorrecaoFluencia(marshall.correcao_fluencia != null ? String(marshall.correcao_fluencia) : '1')
    }
    if (cpsRows.length) {
      setCps([1, 2, 3].map(cp => {
        const c = cpsRows.find(x => x.cp === cp)
        return c
          ? { pesoAr: String(c.peso_ar), pesoImerso: String(c.peso_imerso), leituraEstab: String(c.leitura_estabilidade), fator: c.fator_correcao != null ? String(c.fator_correcao) : '', fluencia: String(c.leitura_fluencia_mm), altura: c.altura_cm != null ? String(c.altura_cm) : '' }
          : { ...cpVazio }
      }))
    }
    if (granRow) {
      setGran(prev => ({ ...prev, pesoTotal: String(granRow.peso_total) }))
      setGranCarregado(granRow.leituras ?? [])
    }
    if (teorRow) {
      setTeor({
        comBetume: teorRow.amostra_com_betume != null ? String(teorRow.amostra_com_betume) : '',
        semBetume: teorRow.amostra_sem_betume != null ? String(teorRow.amostra_sem_betume) : '',
        umidade: String(teorRow.umidade_pct ?? 0),
      })
      setRice({
        pesoAmostra: teorRow.rice_peso_amostra != null ? String(teorRow.rice_peso_amostra) : '',
        frascoAgua: teorRow.rice_frasco_agua != null ? String(teorRow.rice_frasco_agua) : '',
        frascoAmostraAgua: teorRow.rice_frasco_amostra_agua != null ? String(teorRow.rice_frasco_amostra_agua) : '',
        fator: String(teorRow.rice_fator_temp ?? 1),
      })
    }
    if (rtdRows.length) {
      setRtdCps([1, 2, 3].map(cp => {
        const c = rtdRows.find(x => x.cp === cp)
        return c ? { leitura: String(c.leitura), d: String(c.diametro_cm), h: String(c.altura_cm) } : { leitura: '', d: '10', h: '6' }
      }))
    }
    setCarregado(true)
  }, [ensaioExistente, carregado])

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
      peneiras: (await supabase.from('especificacao_peneiras').select('*').eq('especificacao_id', dosagem.especificacao_id).order('abertura_mm', { ascending: false })).data ?? [],
      parametros: (await supabase.from('especificacao_parametros').select('*').eq('especificacao_id', dosagem.especificacao_id)).data ?? [],
    }),
  })

  // As linhas da granulometria devem vir da especificação selecionada (a grafia das peneiras
  // é a que o usuário cadastrou), preservando leituras já digitadas quando a peneira casa
  // (via normalizarPeneira) com a nova lista. Mantém a lista padrão só se a especificação
  // não tiver peneiras cadastradas.
  useEffect(() => {
    if (!dosagem) return
    const peneirasEspec = (faixas?.peneiras ?? []) as { peneira: string; abertura_mm: number }[]
    setGran(prev => {
      const preservados = new Map(prev.leituras.map(l => [normalizarPeneira(l.peneira), l.retido]))
      const carregados = new Map((granCarregado ?? []).map(l => [normalizarPeneira(l.peneira), String(l.retido_acum)]))
      const rows = peneirasEspec.length
        ? peneirasEspec.map(f => ({
            peneira: f.peneira,
            abertura: String(f.abertura_mm),
            retido: preservados.get(normalizarPeneira(f.peneira)) || carregados.get(normalizarPeneira(f.peneira)) || '',
          }))
        : peneirasPadrao.map(l => ({ ...l, retido: preservados.get(normalizarPeneira(l.peneira)) || carregados.get(normalizarPeneira(l.peneira)) || '' }))
      return { ...prev, leituras: rows }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dosagem?.especificacao_id, faixas, granCarregado])

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
      const curvaTolerancias = (dosagem.curva_tolerancias ?? null) as Record<string, number> | null
      const curvaTolerNorm = curvaTolerancias
        ? new Map(Object.entries(curvaTolerancias).map(([k, v]) => [normalizarPeneira(k), v]))
        : null
      const granRes = gran.pesoTotal && leituras.length
        ? calcularGranulometria(n(gran.pesoTotal), leituras,
            (faixas?.peneiras ?? []).map((f: { peneira: string; passante_min: number; passante_max: number; tolerancia_trabalho: number }) =>
              ({ peneira: f.peneira, passanteMin: f.passante_min, passanteMax: f.passante_max,
                 toleranciaTrabalho: curvaTolerNorm?.get(normalizarPeneira(f.peneira)) ?? f.tolerancia_trabalho })),
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
              alturaCm: c.altura ? n(c.altura) : undefined,
            })),
            { teorLigante: teorPct, densidadeLigante: Number(dosagem.densidade_ligante),
              densMaxTeorica: gmm, constantePrensa: n(constantePrensa),
              correcaoFluencia: n(correcaoFluencia) || 1,
              passando200: granRes?.linhas.find(l => normalizarPeneira(l.peneira) === normalizarPeneira('N. 200'))?.pctPassando })
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
  }, [dosagem, faixas, cps, gran, teor, rice, rtdCps, constantePrensa, correcaoFluencia])

  // ===== salvar (edição) =====
  const salvarEdicao = useMutation({
    mutationFn: async () => {
      if (!dosagem) throw new Error('Selecione a dosagem')
      if (!calc?.ok) throw new Error('Preencha os dados do ensaio antes de salvar')
      const ensaioId = id!

      const { error: errEnsaio } = await supabase.from('ensaios_cauq').update({
        dosagem_id: dosagem.id,
        cliente_obra_id: cab.cliente_obra_id || null, periodo: cab.periodo,
        placa_caminhao: cab.placa_caminhao || null, operador: cab.operador || null,
        temperatura_cap: cab.temperatura_cap ? n(cab.temperatura_cap) : null,
        observacoes: cab.observacoes || null,
        resultados: {
          teor: calc.teorPct, gmm: calc.gmm,
          marshall: calc.marshallRes, granulometria: calc.granRes, rtd: calc.rtdRes,
          avaliacoes: calc.aval.avaliacoes, conforme: calc.conformeGeral,
        },
      }).eq('id', ensaioId)
      if (errEnsaio) throw new Error('Falha ao salvar dados do ensaio: ' + errEnsaio.message)

      const cpsPreenchidos = cps.map((c, i) => ({ ...c, cp: i + 1 })).filter(c => c.pesoAr)
      if (cpsPreenchidos.length) {
        const { error: errM } = await supabase.from('cauq_marshall')
          .upsert({ ensaio_id: ensaioId, constante_prensa: n(constantePrensa), gmm_ensaio: rice.pesoAmostra ? calc.gmm : null, correcao_fluencia: correcaoFluencia ? n(correcaoFluencia) : null }, { onConflict: 'ensaio_id' })
        if (errM) throw new Error('Falha ao salvar dados Marshall: ' + errM.message)
      }
      if (cpsPreenchidos.length) {
        const { error: errCp } = await supabase.from('cauq_marshall_cp').upsert(cpsPreenchidos.map(c => ({
          ensaio_id: ensaioId, cp: c.cp, peso_ar: n(c.pesoAr), peso_imerso: n(c.pesoImerso),
          leitura_estabilidade: n(c.leituraEstab) || 0, fator_correcao: c.fator ? n(c.fator) : null,
          leitura_fluencia_mm: n(c.fluencia) || 0, altura_cm: c.altura ? n(c.altura) : null,
        })), { onConflict: 'ensaio_id,cp' })
        if (errCp) throw new Error('Falha ao salvar corpos de prova Marshall: ' + errCp.message)
      }
      const cpsMantidos = cpsPreenchidos.map(c => c.cp)
      let delCpQuery = supabase.from('cauq_marshall_cp').delete().eq('ensaio_id', ensaioId)
      if (cpsMantidos.length) delCpQuery = delCpQuery.not('cp', 'in', `(${cpsMantidos.join(',')})`)
      const { error: errDelCp } = await delCpQuery
      if (errDelCp) throw new Error('Falha ao remover corpos de prova Marshall excluídos: ' + errDelCp.message)

      if (gran.pesoTotal) {
        const { error: errGran } = await supabase.from('cauq_granulometria').upsert({
          ensaio_id: ensaioId, peso_total: n(gran.pesoTotal),
          leituras: gran.leituras.filter(l => l.retido !== '').map(l => ({ peneira: l.peneira, abertura_mm: n(l.abertura), retido_acum: n(l.retido) })),
        }, { onConflict: 'ensaio_id' })
        if (errGran) throw new Error('Falha ao salvar granulometria: ' + errGran.message)
      }

      if (teor.comBetume || rice.pesoAmostra) {
        const { error: errTeor } = await supabase.from('cauq_teor_betume').upsert({
          ensaio_id: ensaioId, metodo: 'rotarex',
          amostra_com_betume: teor.comBetume ? n(teor.comBetume) : null,
          amostra_sem_betume: teor.semBetume ? n(teor.semBetume) : null,
          umidade_pct: n(teor.umidade) || 0,
          rice_peso_amostra: rice.pesoAmostra ? n(rice.pesoAmostra) : null,
          rice_frasco_agua: rice.frascoAgua ? n(rice.frascoAgua) : null,
          rice_frasco_amostra_agua: rice.frascoAmostraAgua ? n(rice.frascoAmostraAgua) : null,
          rice_fator_temp: n(rice.fator) || 1,
        }, { onConflict: 'ensaio_id' })
        if (errTeor) throw new Error('Falha ao salvar teor de betume: ' + errTeor.message)
      }

      const rtdPreench = rtdCps.map((c, i) => ({ ...c, cp: i + 1 })).filter(c => c.leitura)
      if (rtdPreench.length) {
        const { error: errRtd } = await supabase.from('cauq_rtd_cp').upsert(rtdPreench.map(c => ({
          ensaio_id: ensaioId, cp: c.cp, leitura: n(c.leitura), constante_prensa: n(constantePrensa), diametro_cm: n(c.d), altura_cm: n(c.h),
        })), { onConflict: 'ensaio_id,cp' })
        if (errRtd) throw new Error('Falha ao salvar RTD: ' + errRtd.message)
      }
      const rtdMantidos = rtdPreench.map(c => c.cp)
      let delRtdQuery = supabase.from('cauq_rtd_cp').delete().eq('ensaio_id', ensaioId)
      if (rtdMantidos.length) delRtdQuery = delRtdQuery.not('cp', 'in', `(${rtdMantidos.join(',')})`)
      const { error: errDelRtd } = await delRtdQuery
      if (errDelRtd) throw new Error('Falha ao remover RTD excluídos: ' + errDelRtd.message)

      return ensaioId
    },
    onSuccess: (ensaioId) => nav(`/ensaios/${ensaioId}`),
    onError: (e: Error) => setErro(e.message),
  })

  // ===== salvar (novo) =====
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
        inserts.push(supabase.from('cauq_marshall').insert({ ensaio_id: id, constante_prensa: n(constantePrensa), gmm_ensaio: rice.pesoAmostra ? calc.gmm : null, correcao_fluencia: correcaoFluencia ? n(correcaoFluencia) : null }))
        inserts.push(supabase.from('cauq_marshall_cp').insert(cpsPreenchidos.map(c => ({
          ensaio_id: id, cp: c.cp, peso_ar: n(c.pesoAr), peso_imerso: n(c.pesoImerso),
          leitura_estabilidade: n(c.leituraEstab) || 0, fator_correcao: c.fator ? n(c.fator) : null,
          leitura_fluencia_mm: n(c.fluencia) || 0, altura_cm: c.altura ? n(c.altura) : null,
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
        <h1 className="text-2xl font-bold">
          {editando
            ? `Editar Ensaio de ${dataEnsaio ? new Date(dataEnsaio + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '…'}`
            : 'Novo Ensaio CAUQ'}
        </h1>
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
        <label className="text-sm">Correção de fluência<input className={inp} type="number" step="any" value={correcaoFluencia} onChange={e => setCorrecaoFluencia(e.target.value)} /></label>
      </section>

      <section className="bg-white p-4 rounded-xl shadow">
        <h2 className="font-semibold mb-2">Marshall — corpos de prova</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b">
            <th className="p-2">CP</th><th>Peso ao ar (g)</th><th>Peso imerso (g)</th><th>Leitura estab.</th><th>Altura (cm)</th><th>Fator (vazio = tabela)</th><th>Leitura fluência</th>
            <th>Dens. ap.</th><th>Vazios %</th><th>Estab. corrig.</th><th>Fluência (mm)</th>
          </tr></thead>
          <tbody>{cps.map((c, i) => {
            const r = calc?.ok ? calc.marshallRes?.cps[cps.filter((x, j) => j < i && x.pesoAr && x.pesoImerso).length] : undefined
            const preenchido = c.pesoAr && c.pesoImerso
            return (
              <tr key={i} className="border-b">
                <td className="p-2 font-semibold">{i + 1}</td>
                {(['pesoAr', 'pesoImerso', 'leituraEstab', 'altura', 'fator', 'fluencia'] as const).map(k => (
                  <td key={k}><input className="border rounded p-1 w-28" type="number" step="any" value={c[k]}
                        onChange={e => setCps(cps.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))} /></td>
                ))}
                <td className="p-2">{preenchido && r ? fmt(r.densidadeAparente, 3) : ''}</td>
                <td className="p-2">{preenchido && r ? fmt(r.vazios, 2) : ''}</td>
                <td className="p-2">{preenchido && r ? fmt(r.estabilidadeCorrigida, 0) : ''}</td>
                <td className="p-2">{preenchido && r ? fmt(r.fluenciaMm, 2) : ''}</td>
              </tr>
            )
          })}</tbody>
        </table>
        {calc?.ok && calc.marshallRes && (
          <p className="mt-2 text-sm text-slate-700">
            Médias — Vazios: <b>{fmt(calc.marshallRes.medias.vazios, 2)}%</b> · VAM: <b>{fmt(calc.marshallRes.medias.vam, 1)}</b> ·
            RBV: <b>{fmt(calc.marshallRes.medias.rbv, 1)}%</b> · Estabilidade: <b>{fmt(calc.marshallRes.medias.estabilidadeCorrigida, 0)} kgf</b> ·
            Fluência: <b>{fmt(calc.marshallRes.medias.fluenciaMm, 1)} mm</b>
            {calc.marshallRes.relacaoFillerLigante !== undefined && <> · Fíler/Ligante: <b>{fmt(calc.marshallRes.relacaoFillerLigante, 2)}</b></>}
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
                <td className="p-2">{linha ? fmt(linha.pctPassando, 1) : ''}</td>
                <td className="p-2">{linha?.trabMin !== undefined ? `${fmt(linha.trabMin, 1)} – ${fmt(linha.trabMax, 1)}` : ''}</td>
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
            {calc?.ok && <p>Teor de betume: <b>{fmt(calc.teorPct, 2)}%</b></p>}
          </div>
        </div>
        <div>
          <h2 className="font-semibold mb-2">Rice (AASHTO T-209) — opcional</h2>
          <div className="space-y-2 text-sm">
            <label className="block">Peso da amostra (g)<input className={inp} type="number" step="any" value={rice.pesoAmostra} onChange={e => setRice({ ...rice, pesoAmostra: e.target.value })} /></label>
            <label className="block">Frasco + água (g)<input className={inp} type="number" step="any" value={rice.frascoAgua} onChange={e => setRice({ ...rice, frascoAgua: e.target.value })} /></label>
            <label className="block">Frasco + amostra + água (g)<input className={inp} type="number" step="any" value={rice.frascoAmostraAgua} onChange={e => setRice({ ...rice, frascoAmostraAgua: e.target.value })} /></label>
            <label className="block">Fator de temperatura<input className={inp} type="number" step="any" value={rice.fator} onChange={e => setRice({ ...rice, fator: e.target.value })} /></label>
            {calc?.ok && <p>Gmm em uso: <b>{fmt(calc.gmm, 4)}</b> {rice.pesoAmostra ? '(Rice do dia)' : '(de projeto)'}</p>}
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
              <td className="p-2">{calc?.ok && calc.rtdRes?.rtdMpa[rtdCps.filter((x, j) => j < i && x.leitura).length] !== undefined ? fmt(calc.rtdRes.rtdMpa[rtdCps.filter((x, j) => j < i && x.leitura).length], 3) : ''}</td>
            </tr>
          ))}</tbody>
        </table>
        {calc?.ok && calc.rtdRes && <p className="text-sm mt-2">RTD média: <b>{fmt(calc.rtdRes.media, 3)} MPa</b></p>}
      </section>

      {calc?.ok && calc.aval.avaliacoes.length > 0 && (
        <section className="bg-white p-4 rounded-xl shadow">
          <h2 className="font-semibold mb-2">Verificação contra a especificação</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th className="p-2">Parâmetro</th><th>Obtido</th><th>Especificado</th><th>Situação</th></tr></thead>
            <tbody>{calc.aval.avaliacoes.map(a => (
              <tr key={a.parametro} className="border-b">
                <td className="p-2">{a.parametro}</td><td>{fmt(a.valor, 2)}</td>
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
      {editando
        ? <button className="bg-blue-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!calc?.ok || salvarEdicao.isPending} onClick={() => salvarEdicao.mutate()}>Salvar Alterações</button>
        : <button className="bg-blue-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!calc?.ok || salvar.isPending} onClick={() => salvar.mutate()}>Salvar Ensaio</button>}
    </div>
  )
}
