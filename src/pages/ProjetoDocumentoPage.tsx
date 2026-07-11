import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, Tooltip, ReferenceArea } from 'recharts'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/formato'
import GraficoGranulometria from '../components/GraficoGranulometria'
import { calcularGranulometria, type PeneiraLeitura, type FaixaPeneira } from '../lib/calculos/granulometria'
import {
  calcularGranulometriaAgregado, combinarGranulometrias,
  type PeneiraRef, type DeterminacaoAgregado, type LinhaAgregado,
} from '../lib/calculos/agregadoGranulometria'
import { calcularDosagemMarshall, interpolarNoTeor, type CpDosagem } from '../lib/calculos/dosagemMarshall'
import { gmmRice } from '../lib/calculos/teorBetume'
import { densidadeAgregadoGraudo, densidadeAgregadoMiudo, massaEspecificaRealMedia } from '../lib/calculos/densidades'
import { equivalenteAreia, type DeterminacaoEA } from '../lib/calculos/equivalenteAreia'
import { curvaViscosidade, type PontoVisc } from '../lib/calculos/viscosidadeCap'
import { avaliarParametros, type ParametroEspec } from '../lib/calculos/avaliacao'

// ===== Tipos das linhas lidas do banco =====
interface DosagemRow {
  id: string; nome: string; contexto: string | null; tipo: string | null; revisao: number | null
  teor_otimo: number | null; dens_max_teorica_projeto: number | null; densidade_aparente_projeto: number | null; densidade_ligante: number | null
  curva_projeto: Record<string, number> | null; curva_tolerancias: Record<string, number> | null
  parametros_projeto: Record<string, unknown> | null
  especificacao_id: string
  empresas: { razao_social: string; nome_exibicao: string; cnpj: string | null; cabecalho: string | null; rodape: string | null } | null
  especificacoes: { nome: string; norma: string | null; tipo_mistura: string | null } | null
}
interface ComposicaoRow { origem: string | null; material_nome: string | null; local: string | null; percentual: number; densidade: number | null }
interface AgregadoRow { material_nome: string; origem: string | null; data: string | null; peneiras: PeneiraRef[]; determinacoes: DeterminacaoAgregado[] }
interface MarshallParamsRow { densidade_real_cap: number; constante_prensa: number; correcao_fluencia: number | null }
interface MarshallCpRow {
  teor: number; cp: number; peso_ar: number | null; peso_imerso: number | null; rice_teorica: number | null
  leitura_estabilidade: number | null; fator_correcao: number | null; altura_cm: number | null; leitura_fluencia: number | null
}
interface RiceTeorRow { teor: number; peso_amostra: number | null; frasco_agua: number | null; frasco_amostra_agua: number | null; fator_temp: number | null }
interface DensidadeRow { tipo: string; material_nome: string | null; entradas: { determinacoes: Record<string, number>[] } }
interface ComplementaresRow {
  ea_determinacoes: { leitura_areia: number; leitura_argila: number }[] | null; ea_resultado: number | null
  adesividade: string | null; adesividade_obs: string | null; durabilidade_sulfato: number | null
}
interface IndiceFormaRow { material_nome: string | null; media_il: number | null; pct_lamelar: number | null; graos: { espessura: number; comprimento: number }[] | null }
interface ViscosidadeRow {
  material: string | null; pontos: { temperatura: number; viscosidade: number }[] | null
  faixas: { usinagemMin: number; usinagemMax: number; compactacaoMin: number; compactacaoMax: number } | null
  ponto_fulgor: number | null; ponto_amolecimento: number | null; penetracao: number | null
  temp_usinagem_min: number | null; temp_usinagem_max: number | null; temp_compactacao_min: number | null; temp_compactacao_max: number | null
}

const CONTEXTO_LABEL: Record<string, string> = { obra: 'Obra', usina: 'Usina' }
const TIPO_LABEL: Record<string, string> = {
  cbuq: 'CBUQ', cbuqf: 'CBUQF', solo_brita: 'Solo-brita', solo_cimento: 'Solo-cimento', bgtc: 'BGTC', bgs: 'BGS',
}
// Rótulos das características de projeto — mesmas chaves usadas em dosagens.parametros_projeto
// (ver DosagensPage.CARACTERISTICAS_CBUQ) mais teor_ligante (comparado ao teor ótimo de projeto).
const ROTULOS_CARACTERISTICAS: Record<string, string> = {
  teor_ligante: 'Teor de ligante / teor ótimo (%)',
  vazios: 'Teor de vazios (%)',
  vam: 'V.A.M. (%)',
  rbv: 'R.B.V. (%)',
  estabilidade: 'Estabilidade Marshall (kgf)',
  fluencia_mm: 'Fluência (mm)',
  equivalente_areia: 'Equivalente de areia (%)',
  filler_ligante: 'Relação filler/betume',
  rtd: 'Resistência à tração diametral (MPa)',
  abrasao_los_angeles: 'Abrasão Los Angeles (%)',
  indice_forma: 'Índice de forma',
  durabilidade_sulfato: 'Durabilidade ao sulfato de sódio (%)',
}
const ORDEM_CARACTERISTICAS = [
  'teor_ligante', 'vazios', 'vam', 'rbv', 'estabilidade', 'fluencia_mm',
  'equivalente_areia', 'filler_ligante', 'rtd', 'abrasao_los_angeles', 'indice_forma', 'durabilidade_sulfato',
]
const ADESIVIDADE_LABEL: Record<string, string> = { satisfatoria: 'Satisfatória', nao_satisfatoria: 'Não satisfatória' }

interface LinhaCaracteristica {
  label: string; obtido: number | string | null; min: number | null; max: number | null
  conforme: boolean | undefined; temSpec: boolean
}

function media(xs: (number | null)[]): number | null {
  const validos = xs.filter((v): v is number => v !== null && Number.isFinite(v))
  if (!validos.length) return null
  return validos.reduce((s, v) => s + v, 0) / validos.length
}

function SeloConformidade({ conforme }: { conforme: boolean | undefined }) {
  if (conforme === undefined) return <span className="text-slate-400">—</span>
  return <span className={conforme ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>{conforme ? 'CONFORME' : 'NÃO CONFORME'}</span>
}

export default function ProjetoDocumentoPage() {
  const { id } = useParams()
  const dosagemId = id!

  const { data } = useQuery({
    queryKey: ['documento-projeto', dosagemId],
    queryFn: async () => {
      const { data: dosagem, error: errDos } = await supabase.from('dosagens')
        .select('*, empresas(razao_social, nome_exibicao, cnpj, cabecalho, rodape), especificacoes(nome, norma, tipo_mistura)')
        .eq('id', dosagemId).single()
      if (errDos) throw errDos
      const d = dosagem as unknown as DosagemRow

      const [peneirasR, parametrosR, composicaoR, agregadosR, marshallR, marshallCpR, riceTeorR, densidadesR, complementaresR, indiceFormaR, viscosidadeR] = await Promise.all([
        supabase.from('especificacao_peneiras').select('peneira, abertura_mm, passante_min, passante_max, tolerancia_trabalho')
          .eq('especificacao_id', d.especificacao_id).order('abertura_mm', { ascending: false }),
        supabase.from('especificacao_parametros').select('parametro, valor_min, valor_max, unidade').eq('especificacao_id', d.especificacao_id),
        supabase.from('dosagem_composicao').select('origem, material_nome, local, percentual, densidade').eq('dosagem_id', dosagemId),
        supabase.from('agregado_granulometria').select('material_nome, origem, data, peneiras, determinacoes').eq('dosagem_id', dosagemId).order('ordem'),
        supabase.from('projeto_marshall').select('densidade_real_cap, constante_prensa, correcao_fluencia').eq('dosagem_id', dosagemId).maybeSingle(),
        supabase.from('projeto_marshall_cp').select('teor, cp, peso_ar, peso_imerso, rice_teorica, leitura_estabilidade, fator_correcao, altura_cm, leitura_fluencia')
          .eq('dosagem_id', dosagemId).order('teor').order('cp'),
        supabase.from('projeto_rice_teor').select('teor, peso_amostra, frasco_agua, frasco_amostra_agua, fator_temp').eq('dosagem_id', dosagemId).order('teor'),
        supabase.from('projeto_densidades').select('tipo, material_nome, entradas').eq('dosagem_id', dosagemId).order('ordem'),
        supabase.from('projeto_complementares').select('ea_determinacoes, ea_resultado, adesividade, adesividade_obs, durabilidade_sulfato').eq('dosagem_id', dosagemId).maybeSingle(),
        supabase.from('projeto_indice_forma').select('material_nome, media_il, pct_lamelar, graos').eq('dosagem_id', dosagemId).maybeSingle(),
        supabase.from('projeto_viscosidade').select('material, pontos, faixas, ponto_fulgor, ponto_amolecimento, penetracao, temp_usinagem_min, temp_usinagem_max, temp_compactacao_min, temp_compactacao_max')
          .eq('dosagem_id', dosagemId).maybeSingle(),
      ])
      for (const r of [peneirasR, parametrosR, composicaoR, agregadosR, marshallR, marshallCpR, riceTeorR, densidadesR, complementaresR, indiceFormaR, viscosidadeR]) {
        if (r.error) throw r.error
      }

      return {
        dosagem: d,
        peneiras: (peneirasR.data ?? []) as { peneira: string; abertura_mm: number; passante_min: number; passante_max: number; tolerancia_trabalho: number | null }[],
        parametros: (parametrosR.data ?? []) as ParametroEspec[],
        composicao: (composicaoR.data ?? []) as ComposicaoRow[],
        agregados: (agregadosR.data ?? []) as AgregadoRow[],
        marshall: marshallR.data as MarshallParamsRow | null,
        marshallCps: (marshallCpR.data ?? []) as MarshallCpRow[],
        riceTeor: (riceTeorR.data ?? []) as RiceTeorRow[],
        densidades: (densidadesR.data ?? []) as DensidadeRow[],
        complementares: complementaresR.data as ComplementaresRow | null,
        indiceForma: indiceFormaR.data as IndiceFormaRow | null,
        viscosidade: viscosidadeR.data as ViscosidadeRow | null,
      }
    },
  })

  // ===== Granulometria combinada (reaproveita agregadoGranulometria.ts + granulometria.ts) =====
  const granulometria = useMemo(() => {
    if (!data) return null
    const entradas: { pctNaMistura: number; linhas: LinhaAgregado[] }[] = []
    for (const a of data.agregados) {
      const match = data.composicao.find(c => (c.material_nome ?? '').trim().toLowerCase() === a.material_nome.trim().toLowerCase())
      if (!match || !a.determinacoes?.length) continue
      try {
        entradas.push({ pctNaMistura: match.percentual, linhas: calcularGranulometriaAgregado(a.peneiras, a.determinacoes) })
      } catch { /* ignora agregado com dados inconsistentes */ }
    }
    if (!entradas.length) return null
    const combinada = combinarGranulometrias(entradas)
    if (!combinada.length) return null
    // Reaproveita calcularGranulometria (golden) passando a % passa combinada como se fosse
    // um retido acumulado de uma amostra de 100g — assim a mesma fórmula de faixa de
    // trabalho/especificação usada nos ensaios (granulometria.ts) é reutilizada aqui, sem duplicar lógica.
    const leituras: PeneiraLeitura[] = combinada.map(l => ({ peneira: l.peneira, aberturaMm: l.aberturaMm, retidoAcum: 100 - l.pctPassa }))
    const faixa: FaixaPeneira[] = data.peneiras.map(p => ({
      peneira: p.peneira, passanteMin: p.passante_min, passanteMax: p.passante_max, toleranciaTrabalho: p.tolerancia_trabalho ?? 0,
    }))
    try {
      return calcularGranulometria(100, leituras, faixa, data.dosagem.curva_projeto ?? undefined)
    } catch { return null }
  }, [data])

  // ===== Dosagem Marshall (reaproveita dosagemMarshall.ts) =====
  const marshallResultado = useMemo(() => {
    if (!data?.marshallCps.length) return null
    const cps: CpDosagem[] = data.marshallCps
      .filter(c => c.peso_ar != null && c.peso_imerso != null && c.rice_teorica != null)
      .map(c => ({
        teor: c.teor, cp: c.cp, pesoAr: c.peso_ar!, pesoImerso: c.peso_imerso!, riceTeorica: c.rice_teorica!,
        leituraEstabilidade: c.leitura_estabilidade ?? undefined, fatorCorrecao: c.fator_correcao ?? undefined,
        alturaCm: c.altura_cm ?? undefined, leituraFluencia: c.leitura_fluencia ?? undefined,
      }))
    if (!cps.length) return null
    try {
      return calcularDosagemMarshall(cps, {
        densidadeRealCap: data.marshall?.densidade_real_cap ?? 1.004,
        constantePrensa: data.marshall?.constante_prensa ?? 1.79,
        correcaoFluencia: data.marshall?.correcao_fluencia ?? 1,
      })
    } catch { return null }
  }, [data])
  const dadosGraficoMarshall = marshallResultado?.pontos.map(p => ({
    teor: p.teor, Densidade: p.densidadeAparente, Vazios: p.vazios, Estabilidade: p.estabilidade, Fluência: p.fluencia, RBV: p.rbv,
  })) ?? []

  // ===== Ensaio RICE-TEOR — DMT por teor (reaproveita gmmRice) =====
  const riceTeorRows = useMemo(() => {
    if (!data?.riceTeor.length) return []
    return data.riceTeor.map(r => {
      let dmt: number | null = null
      if (r.peso_amostra != null && r.frasco_agua != null && r.frasco_amostra_agua != null) {
        try { dmt = gmmRice(r.peso_amostra, r.frasco_agua, r.frasco_amostra_agua, r.fator_temp ?? 1) } catch { dmt = null }
      }
      return { ...r, dmt }
    })
  }, [data])

  // ===== Densidades (reaproveita densidades.ts) =====
  const densidadesCalc = useMemo(() => {
    if (!data) return null
    const graudos = data.densidades.filter(d => d.tipo === 'agregado_graudo')
    const miudos = data.densidades.filter(d => d.tipo === 'agregado_miudo')
    const graudosCalc = graudos.map(g => {
      const reais = g.entradas.determinacoes.map(det => {
        try { return densidadeAgregadoGraudo(det.pesoArSeco, det.pesoSaturado, det.pesoImerso) } catch { return null }
      })
      return {
        materialNome: g.material_nome ?? '(sem nome)',
        real: media(reais.map(r => r?.real ?? null)),
        aparente: media(reais.map(r => r?.aparente ?? null)),
        absorcao: media(reais.map(r => r?.absorcao ?? null)),
      }
    })
    const miudosCalc = miudos.map(m => {
      const reais = m.entradas.determinacoes.map(det => {
        try { return densidadeAgregadoMiudo(det.pesoPicnometro, det.pesoPicAgregado, det.pesoPicAgua, det.pesoPicAgregadoAgua, det.fatorCorrecaoTemp ?? 1) } catch { return null }
      })
      return { materialNome: m.material_nome ?? '(sem nome)', real: media(reais) }
    })
    const densidadesPorMaterial = new Map<string, number>()
    for (const g of graudosCalc) if (g.real !== null) densidadesPorMaterial.set(g.materialNome.trim().toLowerCase(), g.real)
    for (const m of miudosCalc) if (m.real !== null) densidadesPorMaterial.set(m.materialNome.trim().toLowerCase(), m.real)

    let merm: number | null = null
    if (data.composicao.length) {
      const linhas = data.composicao.map(c => ({
        pct: c.percentual, densidadeReal: densidadesPorMaterial.get((c.material_nome ?? '').trim().toLowerCase()) ?? null,
      }))
      if (linhas.every(l => l.densidadeReal !== null)) {
        try { merm = massaEspecificaRealMedia(linhas.map(l => ({ pct: l.pct, densidadeReal: l.densidadeReal! }))) } catch { merm = null }
      }
    }
    return { graudosCalc, miudosCalc, merm }
  }, [data])

  // ===== Equivalente de areia (reaproveita equivalenteAreia.ts, se necessário recalcular) =====
  const eaResultado = useMemo(() => {
    if (!data?.complementares) return null
    if (data.complementares.ea_resultado != null) return data.complementares.ea_resultado
    const dets = data.complementares.ea_determinacoes
    if (!dets?.length) return null
    try {
      return equivalenteAreia(dets.map((d): DeterminacaoEA => ({ leituraAreia: d.leitura_areia, leituraArgila: d.leitura_argila })))
    } catch { return null }
  }, [data])

  // ===== Viscosidade do CAP (reaproveita viscosidadeCap.ts para o gráfico) =====
  const viscosidadeResultado = useMemo(() => {
    const v = data?.viscosidade
    if (!v?.pontos || v.pontos.length < 2 || !v.faixas) return null
    try {
      return curvaViscosidade(v.pontos.map((p): PontoVisc => p), v.faixas)
    } catch { return null }
  }, [data])
  const dadosGraficoViscosidade = useMemo(() => {
    const v = data?.viscosidade
    if (!viscosidadeResultado || !v?.pontos) return []
    const { coefA, coefB } = viscosidadeResultado
    const temps = v.pontos.map(p => p.temperatura)
    const tMin = Math.min(...temps) - 5
    const tMax = Math.max(...temps) + 15
    const passo = Math.max(1, (tMax - tMin) / 60)
    const linhas: { temperatura: number; regressao: number; amostra?: number }[] = []
    for (let t = tMin; t <= tMax; t += passo) linhas.push({ temperatura: Math.round(t * 100) / 100, regressao: Math.exp(coefA + coefB * t) })
    for (const p of v.pontos) linhas.push({ temperatura: p.temperatura, regressao: Math.exp(coefA + coefB * p.temperatura), amostra: p.viscosidade })
    return linhas.sort((a, b) => a.temperatura - b.temperatura)
  }, [data, viscosidadeResultado])

  // ===== Tabela de características (obtido × especificado — reaproveita avaliacao.ts) =====
  const linhasCaracteristicas = useMemo((): LinhaCaracteristica[] => {
    if (!data) return []
    const d = data.dosagem
    const parametrosProjeto = (d.parametros_projeto ?? {}) as Record<string, unknown>
    const valores: Record<string, number> = {}
    for (const [k, v] of Object.entries(parametrosProjeto)) {
      if (typeof v === 'number' && Number.isFinite(v)) valores[k] = v
    }
    if (d.teor_otimo != null && Number.isFinite(d.teor_otimo)) valores.teor_ligante = d.teor_otimo

    const aval = avaliarParametros(valores, data.parametros)
    const avalMap = new Map(aval.avaliacoes.map(a => [a.parametro, a]))

    const linhas: LinhaCaracteristica[] = []
    if (d.densidade_ligante != null) linhas.push({ label: 'Massa específica do ligante asfáltico (g/cm³)', obtido: d.densidade_ligante, min: null, max: null, conforme: undefined, temSpec: false })
    if (d.densidade_aparente_projeto != null) linhas.push({ label: 'Massa específica aparente de projeto (g/cm³)', obtido: d.densidade_aparente_projeto, min: null, max: null, conforme: undefined, temSpec: false })
    if (d.dens_max_teorica_projeto != null) linhas.push({ label: 'Massa específica máxima teórica — Rice/Gmm (g/cm³)', obtido: d.dens_max_teorica_projeto, min: null, max: null, conforme: undefined, temSpec: false })

    for (const k of ORDEM_CARACTERISTICAS) {
      const a = avalMap.get(k)
      if (valores[k] === undefined && !a) continue
      linhas.push({ label: ROTULOS_CARACTERISTICAS[k] ?? k, obtido: valores[k] ?? null, min: a?.min ?? null, max: a?.max ?? null, conforme: a?.conforme, temSpec: !!a })
    }

    const adesividade = parametrosProjeto.adesividade
    if (typeof adesividade === 'string' && adesividade) {
      linhas.push({
        label: 'Adesividade', obtido: ADESIVIDADE_LABEL[adesividade] ?? adesividade, min: null, max: null,
        conforme: adesividade === 'satisfatoria' ? true : adesividade === 'nao_satisfatoria' ? false : undefined, temSpec: false,
      })
    }
    return linhas
  }, [data])

  if (!data) return <p>Carregando…</p>
  const d = data.dosagem
  // Índices interpolados no teor ótimo de projeto (dosagens.teor_otimo) — mesmo interpolarNoTeor da tela Marshall
  const resultadoTeorOtimo = marshallResultado && d.teor_otimo != null
    ? interpolarNoTeor(marshallResultado.pontos, d.teor_otimo)
    : null
  const granulometriaLinhas = granulometria ? [...granulometria.linhas].sort((a, b) => b.aberturaMm - a.aberturaMm) : null
  const temMarshall = !!marshallResultado?.pontos.length
  const temDensidades = !!densidadesCalc && (densidadesCalc.graudosCalc.length > 0 || densidadesCalc.miudosCalc.length > 0)
  const temEA = eaResultado != null || !!data.complementares?.ea_determinacoes?.length
  const temAdesividade = !!data.complementares?.adesividade
  const temDurabilidade = data.complementares?.durabilidade_sulfato != null
  const temIndiceForma = !!data.indiceForma && data.indiceForma.media_il != null
  const temViscosidade = !!viscosidadeResultado
  const temComplementares = temEA || temAdesividade || temDurabilidade || temIndiceForma || temViscosidade

  return (
    <div className="max-w-[210mm] mx-auto bg-white p-8 text-sm print:p-0">
      <div className="print:hidden mb-4 flex gap-3">
        <button onClick={() => window.print()} className="bg-slate-800 text-white rounded px-4 py-2">Imprimir / Salvar PDF</button>
        <Link to="/dosagens" className="border rounded px-4 py-2 text-slate-700">Voltar aos projetos</Link>
      </div>

      {/* ===== 1. Capa ===== */}
      <header className="border-b-4 border-slate-800 pb-4 mb-6 doc-evitar-quebra">
        <p className="text-xs uppercase tracking-widest text-slate-500 mb-6">Documento do Projeto</p>
        <h1 className="text-2xl font-bold">{d.empresas?.razao_social ?? '—'}</h1>
        <p className="text-slate-600">{d.empresas?.cabecalho ?? 'Controle Tecnológico de Misturas Betuminosas'}</p>
        {d.empresas?.cnpj && <p className="text-slate-500 text-xs mb-4">CNPJ: {d.empresas.cnpj}</p>}

        <div className="mt-8 grid grid-cols-2 gap-y-2 gap-x-8 text-base">
          <p><b>Projeto:</b> {d.nome}</p>
          <p><b>Tipo:</b> {CONTEXTO_LABEL[d.contexto ?? ''] ?? '—'} · {TIPO_LABEL[d.tipo ?? ''] ?? d.tipo ?? '—'}</p>
          <p><b>Especificação:</b> {d.especificacoes?.nome ?? '—'}</p>
          <p><b>Norma:</b> {d.especificacoes?.norma ?? '—'}</p>
          <p><b>Revisão:</b> Rev. {d.revisao ?? 0}</p>
          <p><b>Documento gerado em:</b> {new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </header>

      {/* ===== 2. Resumo do projeto ===== */}
      <section className="mb-6">
        <h2 className="text-lg font-bold border-b-2 border-slate-800 mb-3">Resumo do projeto</h2>

        {/* 2a. Composição */}
        <h3 className="font-semibold mb-2">Composição da mistura</h3>
        {!data.composicao.length && <p className="text-slate-500 mb-4">Este projeto não tem composição cadastrada.</p>}
        {!!data.composicao.length && (
          <table className="w-full border mb-6 doc-evitar-quebra">
            <thead><tr className="bg-slate-100">
              <th className="border p-1 text-left">Origem</th><th className="border p-1 text-left">Material</th>
              <th className="border p-1">Silo</th><th className="border p-1">% na mistura</th><th className="border p-1">Densidade</th>
            </tr></thead>
            <tbody>{data.composicao.map((c, i) => (
              <tr key={i}>
                <td className="border p-1">{c.origem ?? '—'}</td>
                <td className="border p-1">{c.material_nome ?? '—'}</td>
                <td className="border p-1 text-center">{c.local === 'silo_frio' ? 'Silo frio' : c.local === 'silo_quente' ? 'Silo quente' : '—'}</td>
                <td className="border p-1 text-center">{fmt(c.percentual, 2)}%</td>
                <td className="border p-1 text-center">{c.densidade != null ? fmt(c.densidade, 3) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}

        {/* 2b. Granulometria combinada */}
        <h3 className="font-semibold mb-2">Granulometria combinada</h3>
        {!granulometriaLinhas && <p className="text-slate-500 mb-4">Sem dados de granulometria dos agregados vinculados à composição.</p>}
        {granulometriaLinhas && (
          <div className="mb-6">
            <table className="w-full border mb-3 doc-evitar-quebra">
              <thead><tr className="bg-slate-100">
                <th className="border p-1">Peneira</th><th className="border p-1">mm</th><th className="border p-1">% passa combinada</th>
                <th className="border p-1">Faixa de trabalho</th><th className="border p-1">Especificada</th>
              </tr></thead>
              <tbody>{granulometriaLinhas.map(l => (
                <tr key={l.peneira}>
                  <td className="border p-1 text-center">{l.peneira}</td>
                  <td className="border p-1 text-center">{l.aberturaMm}</td>
                  <td className="border p-1 text-center font-semibold">{fmt(l.pctPassando, 1)}</td>
                  <td className="border p-1 text-center">{l.trabMin !== undefined ? `${fmt(l.trabMin, 1)} – ${fmt(l.trabMax, 1)}` : '—'}</td>
                  <td className="border p-1 text-center">{l.espMin !== undefined ? `${l.espMin} – ${l.espMax}` : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            <GraficoGranulometria linhas={granulometriaLinhas} largura={680} />
          </div>
        )}

        {/* 2c. Características */}
        <h3 className="font-semibold mb-2">Características — obtido × especificado</h3>
        {!linhasCaracteristicas.length && <p className="text-slate-500">Este projeto ainda não tem características lançadas.</p>}
        {!!linhasCaracteristicas.length && (
          <table className="w-full border doc-evitar-quebra">
            <thead><tr className="bg-slate-100">
              <th className="border p-1 text-left">Parâmetro</th><th className="border p-1">Obtido</th>
              <th className="border p-1">Especificado</th><th className="border p-1">Situação</th>
            </tr></thead>
            <tbody>{linhasCaracteristicas.map((l, i) => (
              <tr key={i}>
                <td className="border p-1">{l.label}</td>
                <td className="border p-1 text-center font-semibold">{typeof l.obtido === 'number' ? fmt(l.obtido, 2) : (l.obtido ?? '—')}</td>
                <td className="border p-1 text-center">{l.temSpec ? `${l.min ?? '—'} a ${l.max ?? '—'}` : '—'}</td>
                <td className="border p-1 text-center"><SeloConformidade conforme={l.conforme} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {/* ===== 3. Dosagem Marshall ===== */}
      {temMarshall && (
        <section className="mb-6 doc-pagina">
          <h2 className="text-lg font-bold border-b-2 border-slate-800 mb-3">Dosagem Marshall</h2>
          <table className="w-full border mb-4 doc-evitar-quebra">
            <thead><tr className="bg-slate-100">
              <th className="border p-1">Teor</th><th className="border p-1">Densidade aparente</th><th className="border p-1">Vazios (%)</th>
              <th className="border p-1">Estabilidade</th><th className="border p-1">Fluência</th><th className="border p-1">VAM</th><th className="border p-1">RBV</th>
            </tr></thead>
            <tbody>{marshallResultado!.pontos.map(p => {
              const destaque = d.teor_otimo != null && Math.abs(p.teor - d.teor_otimo) < 0.01
              return (
                <tr key={p.teor} className={destaque ? 'bg-amber-100 font-semibold' : ''}>
                  <td className="border p-1 text-center">{fmt(p.teor, 1)}%{destaque && ' (ótimo)'}</td>
                  <td className="border p-1 text-center">{fmt(p.densidadeAparente, 3)}</td>
                  <td className="border p-1 text-center">{fmt(p.vazios, 2)}</td>
                  <td className="border p-1 text-center">{fmt(p.estabilidade, 0)}</td>
                  <td className="border p-1 text-center">{fmt(p.fluencia, 2)}</td>
                  <td className="border p-1 text-center">{fmt(p.vam, 2)}</td>
                  <td className="border p-1 text-center">{fmt(p.rbv, 1)}</td>
                </tr>
              )
            })}</tbody>
          </table>
          <p className="mb-3"><b>Teor ótimo de projeto:</b> {d.teor_otimo != null ? `${fmt(d.teor_otimo, 2)}%` : '—'}
            {marshallResultado!.teorOtimoSugerido != null && ` (sugerido pelo cruzamento em 4% de vazios: ${fmt(marshallResultado!.teorOtimoSugerido, 2)}%)`}</p>
          <div className="grid grid-cols-2 gap-4">
            {([
              ['Densidade aparente × teor', 'Densidade', '#dc2626'],
              ['Vazios (%) × teor', 'Vazios', '#2563eb'],
              ['Estabilidade × teor', 'Estabilidade', '#059669'],
              ['Fluência × teor', 'Fluência', '#7c3aed'],
              ['RBV (%) × teor', 'RBV', '#ea580c'],
            ] as const).map(([titulo, chave, cor]) => (
              <div key={chave} className="doc-evitar-quebra">
                <h3 className="text-xs font-semibold mb-1">{titulo}</h3>
                <LineChart width={320} height={190} data={dadosGraficoMarshall}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="teor" type="number" tick={{ fontSize: 11 }} label={{ value: 'Teor (%)', position: 'insideBottom', offset: -4, fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line dataKey={chave} stroke={cor} strokeWidth={2} dot />
                </LineChart>
              </div>
            ))}
          </div>

          {/* Resultados detalhados por corpo de prova — mesmos dados (detalhes) da tela Marshall */}
          {marshallResultado!.detalhes.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Resultados detalhados por corpo de prova</h3>
              {marshallResultado!.detalhes.map(det => {
                const temInconsistente = det.cps.some(c => c.inconsistente)
                return (
                  <div key={det.teor} className="mb-3 doc-evitar-quebra">
                    <h4 className="font-semibold text-xs mb-1">Teor {fmt(det.teor, 1)}%</h4>
                    <table className="w-full border-collapse text-[8px] leading-tight">
                      <thead>
                        <tr className="bg-slate-100 text-center">
                          <th className="border p-0.5" rowSpan={2}>CP</th>
                          <th className="border p-0.5" rowSpan={2}>% CAP</th>
                          <th className="border p-0.5" colSpan={2}>Peso (g)</th>
                          <th className="border p-0.5" colSpan={5}>Densidade</th>
                          <th className="border p-0.5" colSpan={2}>V.A.M. / R.B.V.</th>
                          <th className="border p-0.5" colSpan={2}>Corpo de prova</th>
                          <th className="border p-0.5" colSpan={4}>Estabilidade</th>
                          <th className="border p-0.5" colSpan={2}>Fluência</th>
                        </tr>
                        <tr className="bg-slate-100 text-center">
                          <th className="border p-0.5">Peso no ar</th>
                          <th className="border p-0.5">Peso na água</th>
                          <th className="border p-0.5">Volume cm³</th>
                          <th className="border p-0.5">Densidade aparente</th>
                          <th className="border p-0.5">Teórica Rice</th>
                          <th className="border p-0.5">V.V (% vazios)</th>
                          <th className="border p-0.5">V.C.B. (%)</th>
                          <th className="border p-0.5">V.A.M. (%)</th>
                          <th className="border p-0.5">R.B.V. (%)</th>
                          <th className="border p-0.5">Vol. cm³</th>
                          <th className="border p-0.5">Altura cm</th>
                          <th className="border p-0.5">Fator correção</th>
                          <th className="border p-0.5">Leitura</th>
                          <th className="border p-0.5">Calcul.</th>
                          <th className="border p-0.5">Corrig. kg</th>
                          <th className="border p-0.5">Leitura mm</th>
                          <th className="border p-0.5">Pol.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {det.cps.map(c => (
                          <tr key={c.cp} className="text-center">
                            <td className="border p-0.5 font-semibold">{c.cp}</td>
                            <td className="border p-0.5">{fmt(c.teor, 1)}</td>
                            <td className="border p-0.5">{fmt(c.pesoAr, 1)}</td>
                            <td className="border p-0.5">{fmt(c.pesoImerso, 1)}</td>
                            <td className="border p-0.5">{fmt(c.volume, 1)}</td>
                            <td className={'border p-0.5' + (c.inconsistente ? ' text-red-700 font-bold' : '')}>{fmt(c.densidadeAparente, 3)}</td>
                            <td className={'border p-0.5' + (c.inconsistente ? ' text-red-700 font-bold' : '')}>{fmt(c.riceTeorica, 3)}</td>
                            <td className={'border p-0.5' + (c.inconsistente ? ' text-red-700 font-bold' : '')}>{fmt(c.vazios, 1)}</td>
                            <td className="border p-0.5">{fmt(c.vcb, 1)}</td>
                            <td className="border p-0.5">{fmt(c.vam, 1)}</td>
                            <td className="border p-0.5">{fmt(c.rbv, 1)}</td>
                            <td className="border p-0.5">{fmt(c.volume, 1)}</td>
                            <td className="border p-0.5">{c.alturaCm != null ? fmt(c.alturaCm, 2) : '—'}</td>
                            <td className="border p-0.5">{fmt(c.fator, 2)}</td>
                            <td className="border p-0.5">{fmt(c.leitura, 0)}</td>
                            <td className="border p-0.5">{fmt(c.calcul, 0)}</td>
                            <td className="border p-0.5">{fmt(c.corrig, 0)}</td>
                            <td className="border p-0.5">{fmt(c.fluenciaMm, 1)}</td>
                            <td className="border p-0.5">{fmt(c.fluenciaPol, 1)}</td>
                          </tr>
                        ))}
                        <tr className="text-center font-semibold bg-slate-50">
                          <td className="border p-0.5">Média</td>
                          <td className="border p-0.5">—</td>
                          <td className="border p-0.5">—</td>
                          <td className="border p-0.5">—</td>
                          <td className="border p-0.5">{fmt(det.media.volume, 1)}</td>
                          <td className="border p-0.5">{fmt(det.media.densidadeAparente, 3)}</td>
                          <td className="border p-0.5">{fmt(det.media.riceTeorica, 3)}</td>
                          <td className="border p-0.5">{fmt(det.media.vazios, 1)}</td>
                          <td className="border p-0.5">{fmt(det.media.vcb, 1)}</td>
                          <td className="border p-0.5">{fmt(det.media.vam, 1)}</td>
                          <td className="border p-0.5">{fmt(det.media.rbv, 1)}</td>
                          <td className="border p-0.5">{fmt(det.media.volume, 1)}</td>
                          <td className="border p-0.5">{det.media.alturaCm != null ? fmt(det.media.alturaCm, 2) : '—'}</td>
                          <td className="border p-0.5">{fmt(det.media.fator, 2)}</td>
                          <td className="border p-0.5">{fmt(det.media.leitura, 0)}</td>
                          <td className="border p-0.5">{fmt(det.media.calcul, 0)}</td>
                          <td className="border p-0.5">{fmt(det.media.corrig, 0)}</td>
                          <td className="border p-0.5">{fmt(det.media.fluenciaMm, 1)}</td>
                          <td className="border p-0.5">{fmt(det.media.fluenciaPol, 1)}</td>
                        </tr>
                      </tbody>
                    </table>
                    {temInconsistente && (
                      <p className="text-[8px] text-red-700 font-semibold mt-0.5">
                        Rice teórica ≤ densidade aparente em CP destacado — confira a Rice (vazios impossível ≤ 0).
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Resultado interpolado no teor ótimo de projeto */}
          {resultadoTeorOtimo && (
            <div className="mt-4 doc-evitar-quebra">
              <h3 className="font-semibold mb-2">Resultado no teor ótimo ({fmt(d.teor_otimo, 2)}%)</h3>
              <div className="grid grid-cols-4 gap-x-6 gap-y-2 text-xs">
                <div><span className="text-slate-500 block">Densidade aparente</span>{fmt(resultadoTeorOtimo.densidadeAparente, 3)}</div>
                <div><span className="text-slate-500 block">Vazios (%)</span>{fmt(resultadoTeorOtimo.vazios, 1)}</div>
                <div><span className="text-slate-500 block">VCB (%)</span>{fmt(resultadoTeorOtimo.vcb, 1)}</div>
                <div><span className="text-slate-500 block">VAM (%)</span>{fmt(resultadoTeorOtimo.vam, 1)}</div>
                <div><span className="text-slate-500 block">RBV (%)</span>{fmt(resultadoTeorOtimo.rbv, 1)}</div>
                <div><span className="text-slate-500 block">Estabilidade (kg)</span>{fmt(resultadoTeorOtimo.estabilidade, 0)}</div>
                <div><span className="text-slate-500 block">Fluência (mm)</span>{fmt(resultadoTeorOtimo.fluencia, 1)}</div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ===== 3b. Ensaio RICE-TEOR (DMT por teor) ===== */}
      {riceTeorRows.length > 0 && (
        <section className="mb-6 doc-evitar-quebra">
          <h2 className="text-lg font-bold border-b-2 border-slate-800 mb-3">Ensaio RICE-TEOR — DMT por teor</h2>
          <table className="w-full border">
            <thead><tr className="bg-slate-100">
              <th className="border p-1">Teor (% CAP)</th><th className="border p-1">A — amostra seca (g)</th>
              <th className="border p-1">B — frasco + água (g)</th><th className="border p-1">C — frasco + água + amostra (g)</th>
              <th className="border p-1">Fator temp.</th><th className="border p-1">DMT (Rice teórica)</th>
            </tr></thead>
            <tbody>{riceTeorRows.map((r, i) => (
              <tr key={i}>
                <td className="border p-1 text-center">{fmt(r.teor, 2)}</td>
                <td className="border p-1 text-center">{r.peso_amostra != null ? fmt(r.peso_amostra, 2) : '—'}</td>
                <td className="border p-1 text-center">{r.frasco_agua != null ? fmt(r.frasco_agua, 2) : '—'}</td>
                <td className="border p-1 text-center">{r.frasco_amostra_agua != null ? fmt(r.frasco_amostra_agua, 2) : '—'}</td>
                <td className="border p-1 text-center">{r.fator_temp != null ? fmt(r.fator_temp, 4) : '1'}</td>
                <td className="border p-1 text-center font-semibold">{r.dmt != null ? fmt(r.dmt, 3) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {/* ===== 4. Densidades ===== */}
      {temDensidades && (
        <section className="mb-6 doc-pagina">
          <h2 className="text-lg font-bold border-b-2 border-slate-800 mb-3">Densidades</h2>
          {densidadesCalc!.graudosCalc.length > 0 && (
            <>
              <h3 className="font-semibold mb-2">Agregado graúdo — DNER-ME 081/98</h3>
              <table className="w-full border mb-4 doc-evitar-quebra">
                <thead><tr className="bg-slate-100"><th className="border p-1 text-left">Material</th><th className="border p-1">Real</th><th className="border p-1">Aparente</th><th className="border p-1">Absorção (%)</th></tr></thead>
                <tbody>{densidadesCalc!.graudosCalc.map((g, i) => (
                  <tr key={i}>
                    <td className="border p-1">{g.materialNome}</td>
                    <td className="border p-1 text-center">{fmt(g.real, 3)}</td>
                    <td className="border p-1 text-center">{fmt(g.aparente, 3)}</td>
                    <td className="border p-1 text-center">{fmt(g.absorcao, 3)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </>
          )}
          {densidadesCalc!.miudosCalc.length > 0 && (
            <>
              <h3 className="font-semibold mb-2">Agregado miúdo — picnômetro (DNER-ME 084/95)</h3>
              <table className="w-full border mb-4 doc-evitar-quebra">
                <thead><tr className="bg-slate-100"><th className="border p-1 text-left">Material</th><th className="border p-1">Real</th></tr></thead>
                <tbody>{densidadesCalc!.miudosCalc.map((m, i) => (
                  <tr key={i}><td className="border p-1">{m.materialNome}</td><td className="border p-1 text-center">{fmt(m.real, 3)}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          <p><b>Massa específica real média da mistura (MERM):</b> {densidadesCalc!.merm != null ? `${fmt(densidadesCalc!.merm, 3)} g/cm³` : '—'}</p>
        </section>
      )}

      {/* ===== 5. Ensaios complementares ===== */}
      {temComplementares && (
        <section className="mb-6 doc-pagina">
          <h2 className="text-lg font-bold border-b-2 border-slate-800 mb-3">Ensaios complementares</h2>

          {temEA && (
            <p className="mb-2 doc-evitar-quebra"><b>Equivalente de areia (DNER-ME 054/94):</b> {eaResultado != null ? `${fmt(eaResultado, 2)}%` : '—'}</p>
          )}
          {temAdesividade && (
            <p className="mb-2 doc-evitar-quebra">
              <b>Adesividade (DNER-ME 78/94):</b> {ADESIVIDADE_LABEL[data.complementares!.adesividade ?? ''] ?? data.complementares!.adesividade}
              {data.complementares!.adesividade_obs && ` — ${data.complementares!.adesividade_obs}`}
            </p>
          )}
          {temDurabilidade && (
            <p className="mb-2 doc-evitar-quebra"><b>Durabilidade ao sulfato de sódio (DNER-ME 089/94):</b> {fmt(data.complementares!.durabilidade_sulfato, 2)}% de perda</p>
          )}
          {temIndiceForma && (
            <p className="mb-4 doc-evitar-quebra">
              <b>Índice de forma / lamelaridade (NBR 7809 / DNIT 425/2020)</b>
              {data.indiceForma!.material_nome && ` — ${data.indiceForma!.material_nome}`}:{' '}
              média do IL = {fmt(data.indiceForma!.media_il, 3)}, % lamelar = {fmt(data.indiceForma!.pct_lamelar, 2)}%
            </p>
          )}

          {temViscosidade && (
            <div className="doc-evitar-quebra">
              <h3 className="font-semibold mb-2">Viscosidade do CAP — Saybolt-Furol × temperatura</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-3">
                <p><b>Material:</b> {data.viscosidade!.material ?? '—'}</p>
                <p><b>Ponto de fulgor:</b> {data.viscosidade!.ponto_fulgor != null ? `${fmt(data.viscosidade!.ponto_fulgor, 1)} °C` : '—'}</p>
                <p><b>Ponto de amolecimento:</b> {data.viscosidade!.ponto_amolecimento != null ? `${fmt(data.viscosidade!.ponto_amolecimento, 1)} °C` : '—'}</p>
                <p><b>Penetração:</b> {data.viscosidade!.penetracao != null ? `${fmt(data.viscosidade!.penetracao, 0)} (0,1mm)` : '—'}</p>
                <p><b>Temperatura de usinagem:</b> {fmt(data.viscosidade!.temp_usinagem_min, 1)} a {fmt(data.viscosidade!.temp_usinagem_max, 1)} °C</p>
                <p><b>Temperatura de compactação:</b> {fmt(data.viscosidade!.temp_compactacao_min, 1)} a {fmt(data.viscosidade!.temp_compactacao_max, 1)} °C</p>
              </div>
              <LineChart width={640} height={260} data={dadosGraficoViscosidade}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="temperatura" type="number" domain={['dataMin', 'dataMax']} label={{ value: 'Temperatura (°C)', position: 'insideBottom', offset: -4 }} />
                <YAxis scale="log" domain={['auto', 'auto']} allowDataOverflow label={{ value: 'Viscosidade (seg SSF)', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                {data.viscosidade!.faixas && (
                  <ReferenceArea y1={data.viscosidade!.faixas.usinagemMin} y2={data.viscosidade!.faixas.usinagemMax} fill="#f59e0b" fillOpacity={0.15}
                    label={{ value: 'Usinagem', position: 'insideTopLeft', fontSize: 11 }} />
                )}
                {data.viscosidade!.faixas && (
                  <ReferenceArea y1={data.viscosidade!.faixas.compactacaoMin} y2={data.viscosidade!.faixas.compactacaoMax} fill="#2563eb" fillOpacity={0.15}
                    label={{ value: 'Compactação', position: 'insideTopLeft', fontSize: 11 }} />
                )}
                <Line dataKey="regressao" name="Regressão" stroke="#059669" strokeWidth={2} dot={false} />
                <Line dataKey="amostra" name="Amostra" stroke="#dc2626" strokeWidth={0} dot={{ r: 5 }} />
              </LineChart>
            </div>
          )}
        </section>
      )}

      {/* ===== 6. Rodapé ===== */}
      <footer className="mt-10 grid grid-cols-2 gap-8 text-center doc-evitar-quebra">
        <div className="border-t pt-2">Responsável técnico<br /><b>&nbsp;</b></div>
        <div className="border-t pt-2">Assinatura<br /><b>&nbsp;</b></div>
      </footer>
      {d.empresas?.rodape && <p className="text-xs text-slate-500 mt-6 text-center">{d.empresas.rodape}</p>}
    </div>
  )
}
