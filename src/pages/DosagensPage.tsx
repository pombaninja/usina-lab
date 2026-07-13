import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { normalizarPeneira } from '../lib/calculos/granulometria'
import { calcularDosagemMarshall, interpolarNoTeor, interpolarValorNoTeor, type CpDosagem, type InterpolacaoTeor } from '../lib/calculos/dosagemMarshall'
import { calcularGranulometriaAgregado, combinarGranulometrias, type LinhaAgregado } from '../lib/calculos/agregadoGranulometria'
import { gmmRice } from '../lib/calculos/teorBetume'
import { calcularRtd } from '../lib/calculos/rtd'
import { sanitizarDecimal, parseDecimal, decimalParaTexto } from '../lib/formato'

interface LinhaCurva { peneira: string; passante: string; tolerancia: string }
interface LinhaComposicao { origem: string; material: string; local: string; pct: string; densidade: string }
type Dosagem = Record<string, unknown> & {
  id: string
  empresas: { nome_exibicao: string }
  especificacoes: { nome: string }
  contexto?: string | null
  tipo?: string | null
  curva_projeto?: Record<string, number> | null
  curva_tolerancias?: Record<string, number> | null
  parametros_projeto?: Record<string, unknown> | null
  revisao?: number | null
  projeto_pai_id?: string | null
  criado_em?: string | null
}
const linhaVazia = (): LinhaCurva => ({ peneira: '', passante: '', tolerancia: '' })
const linhaComposicaoVazia = (): LinhaComposicao => ({ origem: '', material: '', local: '', pct: '', densidade: '' })
const formVazio: Record<string, unknown> = {}

const TIPOS_POR_CONTEXTO: Record<string, { value: string; label: string }[]> = {
  usina: [
    { value: 'cbuq', label: 'CBUQ' },
    { value: 'cbuqf', label: 'CBUQF' },
  ],
  obra: [
    { value: 'solo_brita', label: 'Solo-brita' },
    { value: 'solo_cimento', label: 'Solo-cimento' },
    { value: 'bgtc', label: 'BGTC' },
    { value: 'bgs', label: 'BGS' },
  ],
}
const CONTEXTO_LABEL: Record<string, string> = { obra: 'Obra', usina: 'Usina' }
const TIPO_LABEL: Record<string, string> = {
  cbuq: 'CBUQ', cbuqf: 'CBUQF', solo_brita: 'Solo-brita', solo_cimento: 'Solo-cimento', bgtc: 'BGTC', bgs: 'BGS',
}
const CARACTERISTICAS_CBUQ: { key: string; label: string }[] = [
  { key: 'vazios', label: 'Teor de vazios (%)' },
  { key: 'vam', label: 'V.A.M. (%)' },
  { key: 'rbv', label: 'R.B.V. (%)' },
  { key: 'estabilidade', label: 'Estabilidade Marshall (kgf)' },
  { key: 'fluencia_mm', label: 'Fluência (mm)' },
  { key: 'equivalente_areia', label: 'Equivalente de areia (%)' },
  { key: 'filler_ligante', label: 'Relação filler/betume' },
  { key: 'rtd', label: 'Resistência à tração diametral (MPa)' },
  { key: 'abrasao_los_angeles', label: 'Abrasão Los Angeles (%)' },
  { key: 'indice_forma', label: 'Índice de forma' },
  { key: 'durabilidade_sulfato', label: 'Durabilidade ao sulfato de sódio (%)' },
]

function validarCurva(linhas: LinhaCurva[]): string | null {
  const vistas = new Set<string>()
  for (const l of linhas) {
    const peneira = l.peneira.trim()
    if (!peneira) return 'Toda linha da curva precisa de uma peneira.'
    if (vistas.has(peneira)) return `Peneira repetida na curva de projeto: "${peneira}"`
    vistas.add(peneira)
    if (l.passante.trim() === '') return `Informe o % passando para a peneira "${peneira}".`
    const p = parseDecimal(l.passante)
    if (p === null || !Number.isFinite(p) || p < 0 || p > 100) return `% passando inválido para a peneira "${peneira}" (use um valor entre 0 e 100).`
    if (l.tolerancia.trim() !== '') {
      const t = parseDecimal(l.tolerancia)
      if (t === null || !Number.isFinite(t) || t < 0) return `Tolerância inválida para a peneira "${peneira}" (use um valor ≥ 0).`
    }
  }
  return null
}

function validarComposicao(linhas: LinhaComposicao[]): string | null {
  for (const l of linhas) {
    const preenchida = l.origem.trim() || l.material.trim() || l.local.trim() || l.pct.trim() !== '' || l.densidade.trim() !== ''
    if (!preenchida) continue
    if (l.pct.trim() === '') return 'Informe o "% na mistura" para toda linha de composição preenchida.'
    const p = parseDecimal(l.pct)
    if (p === null || !Number.isFinite(p) || p < 0 || p > 100) return '"% na mistura" inválido na composição (use um valor entre 0 e 100).'
    if (l.densidade.trim() !== '') {
      const dens = parseDecimal(l.densidade)
      if (dens === null || !Number.isFinite(dens) || dens <= 0) return 'Densidade inválida na composição (use um valor maior que 0).'
    }
  }
  return null
}

// Arredondamento "sensato" para os prefills (Number para não carregar zeros à direita).
const arred = (x: number, casas: number) => Number(x.toFixed(casas))

export default function DosagensPage() {
  const qc = useQueryClient()
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [editando, setEditando] = useState<Dosagem | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>(formVazio)
  const [curvaLinhas, setCurvaLinhas] = useState<LinhaCurva[]>([])
  const [composicaoLinhas, setComposicaoLinhas] = useState<LinhaComposicao[]>([])
  const [parametros, setParametros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [revisoesAbertas, setRevisoesAbertas] = useState<Set<string>>(new Set())
  // Prefill dos ensaios: roda UMA vez por abertura de edição (guard por dosagem);
  // resetado ao abrir outra dosagem ou fechar o formulário.
  const prefillRef = useRef<string | null>(null)
  const [prefillAplicado, setPrefillAplicado] = useState(false)

  const { data: empresas } = useQuery({ queryKey: ['empresas'], queryFn: async () => (await supabase.from('empresas').select('id, nome_exibicao')).data ?? [] })
  const { data: especs } = useQuery({ queryKey: ['especificacoes'], queryFn: async () => (await supabase.from('especificacoes').select('id, nome')).data ?? [] })
  const { data: dosagens } = useQuery({
    queryKey: ['dosagens'],
    queryFn: async () => (await supabase.from('dosagens').select('*, empresas(nome_exibicao), especificacoes(nome)').order('criado_em', { ascending: false })).data as Dosagem[] ?? [],
  })

  // ===== Fontes para o prefill dos resultados dos ensaios (somente leitura) =====
  // Carregadas quando o formulário de edição abre para um projeto CBUQ existente.
  const edicaoCbuqId = editando && editando.tipo === 'cbuq' ? editando.id : null

  const { data: marshallEdicao } = useQuery({
    queryKey: ['dosagem-edicao-marshall', edicaoCbuqId],
    enabled: !!edicaoCbuqId,
    queryFn: async () => {
      const [pmR, cpR] = await Promise.all([
        supabase.from('projeto_marshall').select('densidade_real_cap, constante_prensa, correcao_fluencia').eq('dosagem_id', edicaoCbuqId!).maybeSingle(),
        supabase.from('projeto_marshall_cp').select('teor, cp, peso_ar, peso_imerso, rice_teorica, leitura_estabilidade, fator_correcao, altura_cm, leitura_fluencia').eq('dosagem_id', edicaoCbuqId!),
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

  const { data: riceEdicao } = useQuery({
    queryKey: ['dosagem-edicao-rice-teor', edicaoCbuqId],
    enabled: !!edicaoCbuqId,
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_rice_teor')
        .select('teor, peso_amostra, frasco_agua, frasco_amostra_agua, fator_temp').eq('dosagem_id', edicaoCbuqId!)
      if (error) throw error
      return (data ?? []) as {
        teor: number; peso_amostra: number | null; frasco_agua: number | null
        frasco_amostra_agua: number | null; fator_temp: number | null
      }[]
    },
  })

  const { data: rtdEdicao } = useQuery({
    queryKey: ['dosagem-edicao-rtd', edicaoCbuqId],
    enabled: !!edicaoCbuqId,
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_rtd_cp')
        .select('cp, leitura, diametro_cm, altura_cm').eq('dosagem_id', edicaoCbuqId!)
      if (error) throw error
      return (data ?? []) as { cp: number; leitura: number | null; diametro_cm: number | null; altura_cm: number | null }[]
    },
  })

  const { data: agregadosEdicao } = useQuery({
    queryKey: ['dosagem-edicao-agregados', edicaoCbuqId],
    enabled: !!edicaoCbuqId,
    queryFn: async () => {
      const { data, error } = await supabase.from('agregado_granulometria')
        .select('material_nome, origem, peneiras, determinacoes, pct_na_mistura').eq('dosagem_id', edicaoCbuqId!).order('ordem')
      if (error) throw error
      return (data ?? []) as {
        material_nome: string
        origem: string | null
        peneiras: { peneira: string; aberturaMm: number }[]
        determinacoes: { pesoTotal: number; retidos: Record<string, number> }[]
        pct_na_mistura: number | null
      }[]
    },
  })

  // Curva combinada dos agregados do projeto em edição (usada no prefill e no
  // "Carregar peneiras da especificação", para preencher o % passando vazio).
  const combinadaEdicao = useMemo(() => {
    if (!agregadosEdicao) return null
    const entradas: { pctNaMistura: number; linhas: LinhaAgregado[] }[] = []
    for (const a of agregadosEdicao) {
      if (a.pct_na_mistura == null) continue
      try {
        entradas.push({ pctNaMistura: a.pct_na_mistura, linhas: calcularGranulometriaAgregado(a.peneiras ?? [], a.determinacoes ?? []) })
      } catch { /* determinações inválidas: agregado não participa da combinada */ }
    }
    return entradas.length ? combinarGranulometrias(entradas) : null
  }, [agregadosEdicao])

  // Preenche automaticamente SOMENTE campos vazios com os resultados dos ensaios
  // interpolados no teor ótimo (mesmo padrão do puxa-Rice da tela Marshall).
  // Espera TODAS as consultas-filhas resolverem antes de rodar o guard.
  useEffect(() => {
    if (!editando || editando.tipo !== 'cbuq') return
    if (prefillRef.current === editando.id) return
    if (marshallEdicao === undefined || riceEdicao === undefined || rtdEdicao === undefined || agregadosEdicao === undefined) return
    prefillRef.current = editando.id

    const teorOtimoRaw = form.teor_otimo ?? editando.teor_otimo
    const teorOtimo = teorOtimoRaw == null || teorOtimoRaw === '' ? NaN
      : typeof teorOtimoRaw === 'number' ? teorOtimoRaw : (parseDecimal(String(teorOtimoRaw)) ?? NaN)
    const temTeor = Number.isFinite(teorOtimo) && teorOtimo > 0

    // --- Dosagem Marshall: índices interpolados no teor ótimo ---
    let interp: InterpolacaoTeor | null = null
    const densLigante = marshallEdicao.pm?.densidade_real_cap ?? null
    if (temTeor && marshallEdicao.pm) {
      const cps: CpDosagem[] = []
      for (const c of marshallEdicao.cps) {
        if (c.peso_ar == null || c.peso_imerso == null || c.rice_teorica == null) continue
        cps.push({
          teor: Number(c.teor), cp: Number(c.cp),
          pesoAr: c.peso_ar, pesoImerso: c.peso_imerso, riceTeorica: c.rice_teorica,
          leituraEstabilidade: c.leitura_estabilidade ?? undefined,
          fatorCorrecao: c.fator_correcao ?? undefined,
          alturaCm: c.altura_cm ?? undefined,
          leituraFluencia: c.leitura_fluencia ?? undefined,
        })
      }
      if (cps.length) {
        try {
          const { pontos } = calcularDosagemMarshall(cps, {
            densidadeRealCap: marshallEdicao.pm.densidade_real_cap,
            constantePrensa: marshallEdicao.pm.constante_prensa,
            correcaoFluencia: marshallEdicao.pm.correcao_fluencia ?? 1,
          })
          interp = interpolarNoTeor(pontos, teorOtimo)
        } catch { /* dados incompletos/inconsistentes: sem prefill Marshall */ }
      }
    }

    // --- RICE-TEOR: DMT interpolada no teor ótimo (fallback: rice_teorica dos CPs Marshall) ---
    let dmt: number | null = null
    if (temTeor) {
      const pontosRice: { teor: number; valor: number }[] = []
      for (const r of riceEdicao) {
        if (r.peso_amostra == null || r.frasco_agua == null || r.frasco_amostra_agua == null) continue
        try {
          pontosRice.push({ teor: Number(r.teor), valor: gmmRice(r.peso_amostra, r.frasco_agua, r.frasco_amostra_agua, r.fator_temp ?? 1) })
        } catch { /* leituras Rice inconsistentes: ignora este teor */ }
      }
      if (pontosRice.length) {
        dmt = interpolarValorNoTeor(pontosRice, teorOtimo)
      } else if (marshallEdicao.cps.length) {
        const ricePorTeor = new Map<number, number[]>()
        for (const c of marshallEdicao.cps) {
          if (c.rice_teorica == null) continue
          const arr = ricePorTeor.get(Number(c.teor)) ?? []
          arr.push(c.rice_teorica)
          ricePorTeor.set(Number(c.teor), arr)
        }
        const pts = [...ricePorTeor.entries()].map(([teor, vs]) => ({ teor, valor: vs.reduce((a, b) => a + b, 0) / vs.length }))
        if (pts.length) dmt = interpolarValorNoTeor(pts, teorOtimo)
      }
    }

    // --- Granulometria dos agregados: curva combinada (memo compartilhado) ---
    const combinada = combinadaEdicao

    let fillerLigante: number | null = null
    if (combinada && temTeor) {
      const p200 = combinada.find(l => normalizarPeneira(l.peneira) === '200')
      if (p200) fillerLigante = p200.pctPassa / teorOtimo
    }

    // --- Ruptura Diametral (RTD) do projeto: média dos CPs (reutiliza calcularRtd,
    // constante da prensa vinda da Dosagem Marshall) ---
    let rtdMedia: number | null = null
    const constPrensa = marshallEdicao.pm?.constante_prensa
    if (constPrensa != null && rtdEdicao.length) {
      const cpsRtd = rtdEdicao
        .filter(r => r.leitura != null && r.diametro_cm != null && r.altura_cm != null)
        .map(r => ({ leitura: r.leitura!, constantePrensa: constPrensa, diametroCm: r.diametro_cm!, alturaCm: r.altura_cm! }))
      if (cpsRtd.length) {
        try { rtdMedia = calcularRtd(cpsRtd).media } catch { /* CPs inconsistentes: sem prefill RTD */ }
      }
    }

    let algumPreenchido = false

    // 1) Características (parametros_projeto) — só chaves vazias
    const novosParams: Record<string, string> = {}
    const paramSeVazio = (key: string, valor: number | null | undefined, casas: number) => {
      if (valor == null || !Number.isFinite(valor)) return
      if ((parametros[key] ?? '').trim() !== '') return
      novosParams[key] = String(arred(valor, casas))
    }
    paramSeVazio('vazios', interp?.vazios, 2)
    paramSeVazio('vam', interp?.vam, 2)
    paramSeVazio('rbv', interp?.rbv, 2)
    paramSeVazio('estabilidade', interp?.estabilidade, 0)
    paramSeVazio('fluencia_mm', interp?.fluencia, 2)
    paramSeVazio('filler_ligante', fillerLigante, 2)
    paramSeVazio('rtd', rtdMedia, 2)
    if (Object.keys(novosParams).length) {
      algumPreenchido = true
      setParametros(prev => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(novosParams)) {
          if ((prev[k] ?? '').trim() === '') next[k] = v
        }
        return next
      })
    }

    // 2) Massas específicas do cabeçalho — só campos vazios
    const novosForm: Record<string, number> = {}
    const formVazioEm = (k: string) => form[k] == null || form[k] === ''
    if (dmt != null && Number.isFinite(dmt) && formVazioEm('dens_max_teorica_projeto')) novosForm.dens_max_teorica_projeto = arred(dmt, 3)
    if (interp && formVazioEm('densidade_aparente_projeto')) novosForm.densidade_aparente_projeto = arred(interp.densidadeAparente, 3)
    if (densLigante != null && formVazioEm('densidade_ligante')) novosForm.densidade_ligante = arred(densLigante, 3)
    if (Object.keys(novosForm).length) {
      algumPreenchido = true
      setForm(prev => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(novosForm)) {
          if (prev[k] == null || prev[k] === '') next[k] = v
        }
        return next
      })
    }

    // 3) Curva de projeto — só "% passando projeto" vazios (tolerância intocada)
    if (combinada) {
      const passaPorPeneira = new Map(combinada.map(l => [normalizarPeneira(l.peneira), l.pctPassa]))
      let curvaMudou = false
      const novasLinhas = curvaLinhas.map(l => {
        if (l.passante.trim() !== '') return l
        const pct = passaPorPeneira.get(normalizarPeneira(l.peneira))
        if (pct == null || !Number.isFinite(pct)) return l
        curvaMudou = true
        return { ...l, passante: decimalParaTexto(arred(pct, 1)) }
      })
      if (curvaMudou) {
        algumPreenchido = true
        setCurvaLinhas(novasLinhas)
      }
    }

    // 4) Composição da mistura — só quando não há nenhuma linha preenchida:
    // uma linha por agregado com % na mistura definida (material, origem e %).
    const composicaoVazia = composicaoLinhas.every(l =>
      l.material.trim() === '' && l.pct.trim() === '' && l.origem.trim() === '' && l.local.trim() === '' && l.densidade.trim() === '')
    const linhasAgregados = agregadosEdicao
      .filter(a => a.pct_na_mistura != null && Number.isFinite(a.pct_na_mistura) && (a.material_nome ?? '').trim() !== '')
      .map(a => ({
        origem: a.origem ?? '',
        material: a.material_nome.trim(),
        local: '',
        pct: decimalParaTexto(a.pct_na_mistura),
        densidade: '',
      }))
    if (composicaoVazia && linhasAgregados.length) {
      algumPreenchido = true
      setComposicaoLinhas(prev => {
        const aindaVazia = prev.every(l =>
          l.material.trim() === '' && l.pct.trim() === '' && l.origem.trim() === '' && l.local.trim() === '' && l.densidade.trim() === '')
        return aindaVazia ? linhasAgregados : prev
      })
    }

    if (algumPreenchido) setPrefillAplicado(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, marshallEdicao, riceEdicao, rtdEdicao, agregadosEdicao, combinadaEdicao, form, parametros, curvaLinhas, composicaoLinhas])

  // A lista principal mostra só a revisão mais recente de cada família de projeto
  // (família = coalesce(projeto_pai_id, id)); o histórico completo fica disponível
  // via "Ver revisões" por linha.
  const { atuais, historicoPorFamilia } = useMemo(() => {
    const porFamilia = new Map<string, Dosagem[]>()
    for (const d of dosagens ?? []) {
      const familia = String(d.projeto_pai_id ?? d.id)
      const arr = porFamilia.get(familia) ?? []
      arr.push(d)
      porFamilia.set(familia, arr)
    }
    const atuais: Dosagem[] = []
    const historicoPorFamilia = new Map<string, Dosagem[]>()
    for (const [familia, rows] of porFamilia) {
      const ordenadas = [...rows].sort((a, b) => Number(a.revisao ?? 0) - Number(b.revisao ?? 0))
      atuais.push(ordenadas[ordenadas.length - 1])
      historicoPorFamilia.set(familia, ordenadas)
    }
    return { atuais, historicoPorFamilia }
  }, [dosagens])

  function toggleRevisoes(familia: string) {
    setRevisoesAbertas(prev => {
      const next = new Set(prev)
      if (next.has(familia)) next.delete(familia)
      else next.add(familia)
      return next
    })
  }

  function limparForm() {
    prefillRef.current = null
    setPrefillAplicado(false)
    setEditando(null)
    setForm(formVazio)
    setCurvaLinhas([])
    setComposicaoLinhas([])
    setParametros({})
    setErro('')
  }

  async function abrirEdicao(d: Dosagem) {
    prefillRef.current = null
    setPrefillAplicado(false)
    setEditando(d)
    setForm({
      contexto: d.contexto ?? '', tipo: d.tipo ?? '', nome: d.nome, empresa_id: d.empresa_id, especificacao_id: d.especificacao_id,
      teor_otimo: d.teor_otimo, dens_max_teorica_projeto: d.dens_max_teorica_projeto,
      densidade_aparente_projeto: d.densidade_aparente_projeto, densidade_ligante: d.densidade_ligante,
    })
    const curvaProjeto = d.curva_projeto ?? {}
    const curvaTolerancias = d.curva_tolerancias ?? {}
    setCurvaLinhas(Object.keys(curvaProjeto).map(peneira => ({
      peneira,
      passante: decimalParaTexto(curvaProjeto[peneira]),
      tolerancia: curvaTolerancias[peneira] != null ? decimalParaTexto(curvaTolerancias[peneira]) : '',
    })))
    const parametrosProjeto = (d.parametros_projeto ?? {}) as Record<string, unknown>
    setParametros(Object.fromEntries(Object.entries(parametrosProjeto).map(([k, v]) => [k, String(v)])))
    setErro('')

    if (d.tipo === 'cbuq') {
      const { data, error } = await supabase.from('dosagem_composicao').select('*').eq('dosagem_id', d.id)
      if (error) { setErro(error.message); return }
      setComposicaoLinhas((data ?? []).map((r: Record<string, unknown>) => ({
        origem: String(r.origem ?? ''),
        material: String(r.material_nome ?? ''),
        local: String(r.local ?? ''),
        pct: r.percentual != null ? decimalParaTexto(r.percentual) : '',
        densidade: r.densidade != null ? decimalParaTexto(r.densidade) : '',
      })))
    } else {
      setComposicaoLinhas([])
    }
  }

  async function carregarPeneirasDaEspecificacao() {
    const especId = String(form.especificacao_id ?? '')
    if (!especId) return
    const { data, error } = await supabase.from('especificacao_peneiras').select('*').eq('especificacao_id', especId).order('abertura_mm', { ascending: false })
    if (error) { setErro(error.message); return }
    // % passando vazio é preenchido com a granulometria combinada dos agregados do projeto
    // (mesma fonte do prefill automático); valor já existente na linha nunca é sobrescrito.
    const passaCombinada = new Map((combinadaEdicao ?? []).map(l => [normalizarPeneira(l.peneira), l.pctPassa]))
    setCurvaLinhas(prev => {
      const existentes = new Map(prev.map(l => [normalizarPeneira(l.peneira), l.passante]))
      return (data ?? []).map((p: { peneira: string; tolerancia_trabalho: number | null }) => {
        const chave = normalizarPeneira(p.peneira)
        const atual = existentes.get(chave) ?? ''
        const daCombinada = passaCombinada.get(chave)
        return {
          peneira: p.peneira,
          passante: atual.trim() !== '' ? atual : daCombinada != null && Number.isFinite(daCombinada) ? decimalParaTexto(arred(daCombinada, 1)) : '',
          tolerancia: p.tolerancia_trabalho != null ? decimalParaTexto(p.tolerancia_trabalho) : '',
        }
      })
    })
  }

  function alterarLinha(i: number, campo: keyof LinhaCurva, valor: string) {
    setCurvaLinhas(curvaLinhas.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)))
  }

  function alterarComposicao(i: number, campo: keyof LinhaComposicao, valor: string) {
    setComposicaoLinhas(composicaoLinhas.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)))
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.contexto) throw new Error('Selecione o contexto (Obra ou Usina).')
      if (!form.tipo) throw new Error('Selecione o tipo.')

      const erroCurva = validarCurva(curvaLinhas)
      if (erroCurva) throw new Error(erroCurva)

      const isCbuq = form.tipo === 'cbuq'
      if (isCbuq) {
        const erroComposicao = validarComposicao(composicaoLinhas)
        if (erroComposicao) throw new Error(erroComposicao)
      }

      const curva_projeto: Record<string, number> = {}
      const curva_tolerancias: Record<string, number> = {}
      for (const l of curvaLinhas) {
        const peneira = l.peneira.trim()
        // validarCurva já garantiu números válidos (vírgula decimal aceita).
        curva_projeto[peneira] = parseDecimal(l.passante) as number
        if (l.tolerancia.trim() !== '') curva_tolerancias[peneira] = parseDecimal(l.tolerancia) as number
      }

      let parametros_projeto: Record<string, number | string> | null = null
      if (isCbuq) {
        const p: Record<string, number | string> = {}
        for (const c of CARACTERISTICAS_CBUQ) {
          const v = (parametros[c.key] ?? '').trim()
          if (v !== '') {
            const n = parseDecimal(v)
            if (n === null || !Number.isFinite(n)) throw new Error(`Valor inválido em "${c.label}".`)
            p[c.key] = n
          }
        }
        if (parametros.adesividade) p.adesividade = parametros.adesividade
        parametros_projeto = Object.keys(p).length ? p : null
      }

      // Numéricos do formulário podem estar como texto com vírgula — converte aqui, com erro amigável.
      const numOuNull = (k: string, rotulo: string): number | null => {
        const v = form[k]
        if (v === null || v === undefined || v === '') return null
        if (typeof v === 'number') return v
        const n = parseDecimal(String(v))
        if (n === null || !Number.isFinite(n)) throw new Error(`Valor inválido em "${rotulo}" — use números com vírgula (ex.: 2,45).`)
        return n
      }

      const payload = {
        contexto: form.contexto,
        tipo: form.tipo,
        nome: form.nome,
        empresa_id: form.empresa_id,
        especificacao_id: form.especificacao_id,
        teor_otimo: numOuNull('teor_otimo', 'Teor ótimo (%)'),
        dens_max_teorica_projeto: numOuNull('dens_max_teorica_projeto', 'Massa esp. Rice (g/cm³)'),
        densidade_aparente_projeto: numOuNull('densidade_aparente_projeto', 'Massa esp. aparente (g/cm³)'),
        densidade_ligante: numOuNull('densidade_ligante', 'Massa esp. do asfalto (g/cm³)'),
        curva_projeto,
        curva_tolerancias: Object.keys(curva_tolerancias).length ? curva_tolerancias : null,
        parametros_projeto,
      }

      const { data: salvo, error } = editando
        ? await supabase.from('dosagens').update(payload).eq('id', editando.id).select('id').single()
        : await supabase.from('dosagens').insert(payload).select('id').single()
      if (error) throw error

      const dosagemId = (salvo as { id: string }).id

      // Reconciliação da composição roda para toda gravação, não só quando tipo === 'cbuq':
      // isso garante limpeza de linhas órfãs quando o tipo é trocado para fora de cbuq.
      const { data: antigas, error: errAntigas } = await supabase.from('dosagem_composicao').select('id').eq('dosagem_id', dosagemId)
      if (errAntigas) throw errAntigas
      const idsAntigos = (antigas ?? []).map((a: { id: string }) => a.id)

      const linhasPreenchidas = composicaoLinhas.filter(l =>
        l.origem.trim() || l.material.trim() || l.local.trim() || l.pct.trim() !== '' || l.densidade.trim() !== '')

      if (isCbuq && linhasPreenchidas.length) {
        // Insere as linhas novas primeiro; só remove as antigas se a inserção for bem-sucedida,
        // para nunca perder composição já salva em caso de falha parcial.
        const rows = linhasPreenchidas.map(l => ({
          dosagem_id: dosagemId,
          origem: l.origem.trim() || null,
          material_nome: l.material.trim() || null,
          local: l.local || null,
          percentual: parseDecimal(l.pct) as number,
          densidade: l.densidade.trim() !== '' ? (parseDecimal(l.densidade) as number) : null,
        }))
        const ins = await supabase.from('dosagem_composicao').insert(rows)
        if (ins.error) throw ins.error

        if (idsAntigos.length) {
          const del = await supabase.from('dosagem_composicao').delete().in('id', idsAntigos)
          if (del.error) throw del.error
        }
      } else if (idsAntigos.length) {
        // tipo não é cbuq (ou é cbuq sem linhas preenchidas): apenas limpa composição antiga.
        const del = await supabase.from('dosagem_composicao').delete().in('id', idsAntigos)
        if (del.error) throw del.error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dosagens'] }); limparForm() },
    onError: (e: Error) => setErro(e.message),
  })

  // Exclui a família inteira do projeto (todas as revisões + dados filhos).
  // Bloqueado no backend se houver ensaio/laudo vinculado a qualquer revisão da família.
  const excluirProjeto = useMutation({
    mutationFn: async (dosagemId: string) => {
      const { error } = await supabase.rpc('excluir_projeto', { p_dosagem: dosagemId })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dosagens'] }); limparForm() },
    onError: (e: Error) => setErro(e.message),
  })

  function confirmarExclusao(d: Dosagem) {
    if (window.confirm(`Excluir o projeto "${String(d.nome)}" e TODAS as suas revisões e dados de dosagem? Esta ação não pode ser desfeita.`)) {
      excluirProjeto.mutate(d.id)
    }
  }

  // Cria uma nova revisão (snapshot do projeto atual, revisao+1) e já abre a
  // revisão nova no formulário de edição.
  const criarRevisao = useMutation({
    mutationFn: async (dosagemId: string) => {
      const { data, error } = await supabase.rpc('criar_revisao_projeto', { p_dosagem: dosagemId })
      if (error) throw error
      return data as string
    },
    onSuccess: async (novoId) => {
      await qc.invalidateQueries({ queryKey: ['dosagens'] })
      const { data, error } = await supabase.from('dosagens')
        .select('*, empresas(nome_exibicao), especificacoes(nome)').eq('id', novoId).single()
      if (error) { setErro(error.message); return }
      await abrirEdicao(data as Dosagem)
    },
    onError: (e: Error) => setErro(e.message),
  })

  // Campos numéricos com VÍRGULA decimal: o estado guarda o texto digitado
  // (sanitizado para ','), e a conversão para Number acontece só ao salvar.
  const num = (k: string) => ({
    value: decimalParaTexto(form[k]), type: 'text', inputMode: 'decimal' as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: sanitizarDecimal(e.target.value) }),
    className: 'w-full border rounded p-2',
  })

  const paramNum = (k: string) => ({
    value: decimalParaTexto(parametros[k] ?? ''), type: 'text', inputMode: 'decimal' as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setParametros({ ...parametros, [k]: sanitizarDecimal(e.target.value) }),
    className: 'w-full border rounded p-2',
  })

  const tipoAtual = String(form.tipo ?? '')
  const contextoAtual = String(form.contexto ?? '')
  const isCbuq = tipoAtual === 'cbuq'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Projetos de Materiais</h1>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita projetos de materiais.</p>}

      {podeEditar && (
        <form onSubmit={e => { e.preventDefault(); salvar.mutate() }} className="bg-white p-4 rounded-xl shadow space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm">Nome *<input className="w-full border rounded p-2" value={String(form.nome ?? '')}
              onChange={e => setForm({ ...form, nome: e.target.value })} required /></label>
            <label className="text-sm">Empresa *<select className="w-full border rounded p-2" required value={String(form.empresa_id ?? '')}
              onChange={e => setForm({ ...form, empresa_id: e.target.value })}>
              <option value="">—</option>{(empresas ?? []).map((x: { id: string; nome_exibicao: string }) => <option key={x.id} value={x.id}>{x.nome_exibicao}</option>)}
            </select></label>
            <label className="text-sm">Especificação *<select className="w-full border rounded p-2" required value={String(form.especificacao_id ?? '')}
              onChange={e => setForm({ ...form, especificacao_id: e.target.value })}>
              <option value="">—</option>{(especs ?? []).map((x: { id: string; nome: string }) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select></label>
            <label className="text-sm">Contexto *<select className="w-full border rounded p-2" required value={contextoAtual}
              onChange={e => setForm({ ...form, contexto: e.target.value, tipo: '' })}>
              <option value="">—</option>
              <option value="obra">Obra</option>
              <option value="usina">Usina</option>
            </select></label>
            <label className="text-sm">Tipo *<select className="w-full border rounded p-2 disabled:bg-slate-100" required disabled={!contextoAtual} value={tipoAtual}
              onChange={e => setForm({ ...form, tipo: e.target.value })}>
              <option value="">—</option>
              {(TIPOS_POR_CONTEXTO[contextoAtual] ?? []).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select></label>
            <label className="text-sm">Teor ótimo (%)<input {...num('teor_otimo')} /></label>
            <label className="text-sm">Massa esp. Rice (g/cm³)<input {...num('dens_max_teorica_projeto')} /></label>
            <label className="text-sm">Massa esp. aparente (g/cm³)<input {...num('densidade_aparente_projeto')} /></label>
            <label className="text-sm">Massa esp. do asfalto (g/cm³)<input {...num('densidade_ligante')} /></label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Curva de projeto</h2>
              <div className="flex gap-2">
                <button type="button" className="text-sm border rounded px-3 py-1 disabled:opacity-50"
                  disabled={!form.especificacao_id} onClick={carregarPeneirasDaEspecificacao}>
                  Carregar peneiras da especificação
                </button>
                <button type="button" className="text-sm border rounded px-3 py-1" onClick={() => setCurvaLinhas([...curvaLinhas, linhaVazia()])}>
                  + Adicionar peneira
                </button>
              </div>
            </div>
            {curvaLinhas.length > 0 && (
              <table className="w-full text-sm">
                <thead><tr className="text-left border-b text-slate-600">
                  <th className="py-1 pr-2">Peneira</th><th className="py-1 pr-2">% passando projeto</th><th className="py-1 pr-2">Tolerância ±</th><th />
                </tr></thead>
                <tbody>
                  {curvaLinhas.map((l, i) => (
                    <tr key={i}>
                      <td className="pr-2 py-1"><input className="w-full border rounded p-1" value={l.peneira}
                        onChange={e => alterarLinha(i, 'peneira', e.target.value)} /></td>
                      <td className="pr-2 py-1"><input className="w-full border rounded p-1" type="text" inputMode="decimal" value={l.passante}
                        onChange={e => alterarLinha(i, 'passante', sanitizarDecimal(e.target.value))} /></td>
                      <td className="pr-2 py-1"><input className="w-full border rounded p-1" type="text" inputMode="decimal" value={l.tolerancia}
                        onChange={e => alterarLinha(i, 'tolerancia', sanitizarDecimal(e.target.value))} /></td>
                      <td className="py-1"><button type="button" className="text-red-600 px-2" onClick={() => setCurvaLinhas(curvaLinhas.filter((_, idx) => idx !== i))}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {tipoAtual && !isCbuq && (
            <p className="text-sm text-slate-500 italic">Formulário detalhado deste tipo será liberado em breve.</p>
          )}

          {isCbuq && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm">Composição da mistura</h2>
                  <button type="button" className="text-sm border rounded px-3 py-1" onClick={() => setComposicaoLinhas([...composicaoLinhas, linhaComposicaoVazia()])}>
                    + Adicionar material
                  </button>
                </div>
                {composicaoLinhas.length > 0 && (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left border-b text-slate-600">
                      <th className="py-1 pr-2">Origem</th><th className="py-1 pr-2">Material</th><th className="py-1 pr-2">Local</th>
                      <th className="py-1 pr-2">% na mistura</th><th className="py-1 pr-2">Densidade</th><th />
                    </tr></thead>
                    <tbody>
                      {composicaoLinhas.map((l, i) => (
                        <tr key={i}>
                          <td className="pr-2 py-1"><input className="w-full border rounded p-1" placeholder="Pedreira Diabásio" value={l.origem}
                            onChange={e => alterarComposicao(i, 'origem', e.target.value)} /></td>
                          <td className="pr-2 py-1"><input className="w-full border rounded p-1" placeholder="Pedrisco" value={l.material}
                            onChange={e => alterarComposicao(i, 'material', e.target.value)} /></td>
                          <td className="pr-2 py-1">
                            <select className="w-full border rounded p-1" value={l.local} onChange={e => alterarComposicao(i, 'local', e.target.value)}>
                              <option value="">—</option>
                              <option value="silo_frio">Silo frio</option>
                              <option value="silo_quente">Silo quente</option>
                            </select>
                          </td>
                          <td className="pr-2 py-1"><input className="w-full border rounded p-1" type="text" inputMode="decimal" value={l.pct}
                            onChange={e => alterarComposicao(i, 'pct', sanitizarDecimal(e.target.value))} /></td>
                          <td className="pr-2 py-1"><input className="w-full border rounded p-1" type="text" inputMode="decimal" value={l.densidade}
                            onChange={e => alterarComposicao(i, 'densidade', sanitizarDecimal(e.target.value))} /></td>
                          <td className="py-1"><button type="button" className="text-red-600 px-2" onClick={() => setComposicaoLinhas(composicaoLinhas.filter((_, idx) => idx !== i))}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="space-y-2">
                <h2 className="font-semibold text-sm">Características de projeto (obtido)</h2>
                {prefillAplicado && (
                  <p className="text-xs text-slate-500">Valores em branco preenchidos automaticamente com os resultados dos ensaios no teor ótimo (edite à vontade).</p>
                )}
                <div className="grid grid-cols-3 gap-3">
                  {CARACTERISTICAS_CBUQ.map(c => (
                    <label key={c.key} className="text-sm">{c.label}<input {...paramNum(c.key)} /></label>
                  ))}
                  <label className="text-sm">Adesividade
                    <select className="w-full border rounded p-2" value={parametros.adesividade ?? ''}
                      onChange={e => setParametros({ ...parametros, adesividade: e.target.value })}>
                      <option value="">—</option>
                      <option value="satisfatoria">Satisfatória</option>
                      <option value="nao_satisfatoria">Não satisfatória</option>
                    </select>
                  </label>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 items-center">
            <button className="bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-50" disabled={salvar.isPending}>
              {editando ? 'Atualizar' : 'Adicionar'}
            </button>
            {editando && <button type="button" className="border rounded px-3 py-2 disabled:opacity-50" disabled={salvar.isPending} onClick={limparForm}>Cancelar</button>}
          </div>
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
        </form>
      )}

      <table className="w-full bg-white rounded-xl shadow text-sm">
        <thead><tr className="text-left border-b"><th className="p-3">Nome</th><th>Rev.</th><th>Empresa</th><th>Especificação</th><th>Contexto/Tipo</th><th>Teor ótimo</th><th>Gmm</th><th /></tr></thead>
        <tbody>{atuais.map(d => {
          const familia = String(d.projeto_pai_id ?? d.id)
          const historico = historicoPorFamilia.get(familia) ?? [d]
          const temHistorico = historico.length > 1
          const aberto = revisoesAbertas.has(familia)
          return (
            <Fragment key={familia}>
              <tr className="border-b">
                <td className="p-3">{String(d.nome)}</td>
                <td>Rev. {String(d.revisao ?? 0)}</td>
                <td>{d.empresas?.nome_exibicao}</td>
                <td>{d.especificacoes?.nome}</td>
                <td>{CONTEXTO_LABEL[String(d.contexto ?? '')] ?? '—'} · {TIPO_LABEL[String(d.tipo ?? '')] ?? String(d.tipo ?? '—')}</td>
                <td>{String(d.teor_otimo ?? '')}</td><td>{String(d.dens_max_teorica_projeto ?? '')}</td>
                <td className="p-3 space-x-2 whitespace-nowrap">
                  {podeEditar && (
                    <>
                      <button className="text-blue-700" disabled={salvar.isPending || criarRevisao.isPending || excluirProjeto.isPending} onClick={() => abrirEdicao(d)}>Editar</button>
                      <button className="text-emerald-700" disabled={salvar.isPending || criarRevisao.isPending || excluirProjeto.isPending} onClick={() => criarRevisao.mutate(d.id)}>Criar revisão</button>
                      <button className="text-red-600" disabled={salvar.isPending || criarRevisao.isPending || excluirProjeto.isPending} onClick={() => confirmarExclusao(d)}>Excluir</button>
                    </>
                  )}
                  {(d.tipo === 'cbuq' || d.tipo === 'cbuqf') && (
                    <>
                      <Link className="text-purple-700" to={`/projetos/${d.id}/marshall`}>Dosagem Marshall</Link>
                      <Link className="text-lime-700" to={`/projetos/${d.id}/rice-teor`}>RICE-TEOR</Link>
                      <Link className="text-amber-700" to={`/projetos/${d.id}/rtd`}>Ruptura Diametral</Link>
                      <Link className="text-indigo-700" to={`/projetos/${d.id}/agregados`}>Agregados</Link>
                      <Link className="text-teal-700" to={`/projetos/${d.id}/moldagem`}>Composição/Moldagem</Link>
                      <Link className="text-fuchsia-700" to={`/projetos/${d.id}/densidades`}>Densidades</Link>
                      <Link className="text-orange-700" to={`/projetos/${d.id}/complementares`}>Complementares</Link>
                      <Link className="text-rose-700" to={`/projetos/${d.id}/indice-forma`}>Índice de forma</Link>
                      <Link className="text-sky-700" to={`/projetos/${d.id}/lamelaridade`}>Lamelaridade</Link>
                      <Link className="text-cyan-700" to={`/projetos/${d.id}/viscosidade`}>Viscosidade do CAP</Link>
                      <Link className="text-slate-700" to={`/projetos/${d.id}/documento`}>Documento / PDF</Link>
                    </>
                  )}
                </td>
              </tr>
              {temHistorico && (
                <tr className="border-b bg-slate-50">
                  <td colSpan={8} className="px-3 py-1 text-xs text-slate-500">
                    <button type="button" className="underline" onClick={() => toggleRevisoes(familia)}>
                      {aberto ? 'Ocultar revisões anteriores' : `Ver revisões (${historico.length})`}
                    </button>
                    {aberto && (
                      <ul className="mt-1 space-y-0.5">
                        {historico.map(h => (
                          <li key={h.id}>
                            Rev. {String(h.revisao ?? 0)} — {String(h.nome)}
                            {h.criado_em ? ` — ${new Date(h.criado_em).toLocaleDateString('pt-BR')}` : ''}
                            {String(h.id) === String(d.id) ? ' (atual)' : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}</tbody>
      </table>
    </div>
  )
}
