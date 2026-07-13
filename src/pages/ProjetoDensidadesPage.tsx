import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import {
  densidadeAgregadoGraudo, densidadeAgregadoMiudo, massaEspecificaRealMedia,
  type DensidadeGraudo,
} from '../lib/calculos/densidades'
import { fmt } from '../lib/formato'

interface DetGraudoForm { pesoArSeco: string; pesoSaturado: string; pesoImerso: string }
interface DetMiudoForm { pesoPicnometro: string; pesoPicAgregado: string; pesoPicAgua: string; pesoPicAgregadoAgua: string; fatorCorrecaoTemp: string }
interface GraudoForm { id?: string; materialNome: string; dets: DetGraudoForm[] }
interface MiudoForm { id?: string; materialNome: string; dets: DetMiudoForm[] }

const n = (s: string) => (s === '' ? NaN : Number(s))
const detGraudoVazio = (): DetGraudoForm => ({ pesoArSeco: '', pesoSaturado: '', pesoImerso: '' })
const detMiudoVazio = (): DetMiudoForm => ({ pesoPicnometro: '', pesoPicAgregado: '', pesoPicAgua: '', pesoPicAgregadoAgua: '', fatorCorrecaoTemp: '1' })
const graudoVazio = (): GraudoForm => ({ materialNome: '', dets: [detGraudoVazio()] })
const miudoVazio = (): MiudoForm => ({ materialNome: '', dets: [detMiudoVazio()] })

function media(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null && Number.isFinite(v))
  if (!validos.length) return null
  return validos.reduce((s, v) => s + v, 0) / validos.length
}

export default function ProjetoDensidadesPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const dosagemId = id!
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [graudos, setGraudos] = useState<GraudoForm[]>([graudoVazio()])
  const [miudos, setMiudos] = useState<MiudoForm[]>([miudoVazio()])
  const [erro, setErro] = useState('')
  const [carregado, setCarregado] = useState(false)

  const { data: dosagem } = useQuery({
    queryKey: ['dosagem-densidades', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagens').select('id, nome').eq('id', dosagemId).single()
      if (error) throw error
      return data as { id: string; nome: string }
    },
  })

  const { data: composicao } = useQuery({
    queryKey: ['composicao-densidades', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagem_composicao').select('material_nome, percentual').eq('dosagem_id', dosagemId)
      if (error) throw error
      return (data ?? []) as { material_nome: string | null; percentual: number }[]
    },
  })

  const { data: existentes } = useQuery({
    queryKey: ['projeto-densidades', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_densidades').select('*').eq('dosagem_id', dosagemId).order('ordem')
      if (error) throw error
      return (data ?? []) as {
        id: string; tipo: string; material_nome: string | null
        entradas: { determinacoes: Record<string, string | number>[] }
        ordem: number
      }[]
    },
  })

  // Prefill do formulário a partir dos dados já salvos (modo edição)
  useEffect(() => {
    if (!existentes || carregado) return
    const gs = existentes.filter(e => e.tipo === 'agregado_graudo')
    const ms = existentes.filter(e => e.tipo === 'agregado_miudo')
    if (gs.length) {
      setGraudos(gs.map((g): GraudoForm => ({
        id: g.id,
        materialNome: g.material_nome ?? '',
        dets: (g.entradas.determinacoes.length ? g.entradas.determinacoes : [{}]).slice(0, 3).map(d => ({
          pesoArSeco: d.pesoArSeco !== undefined ? String(d.pesoArSeco) : '',
          pesoSaturado: d.pesoSaturado !== undefined ? String(d.pesoSaturado) : '',
          pesoImerso: d.pesoImerso !== undefined ? String(d.pesoImerso) : '',
        })),
      })))
    }
    if (ms.length) {
      setMiudos(ms.map((m): MiudoForm => ({
        id: m.id,
        materialNome: m.material_nome ?? '',
        dets: (m.entradas.determinacoes.length ? m.entradas.determinacoes : [{}]).slice(0, 3).map(d => ({
          pesoPicnometro: d.pesoPicnometro !== undefined ? String(d.pesoPicnometro) : '',
          pesoPicAgregado: d.pesoPicAgregado !== undefined ? String(d.pesoPicAgregado) : '',
          pesoPicAgua: d.pesoPicAgua !== undefined ? String(d.pesoPicAgua) : '',
          pesoPicAgregadoAgua: d.pesoPicAgregadoAgua !== undefined ? String(d.pesoPicAgregadoAgua) : '',
          fatorCorrecaoTemp: d.fatorCorrecaoTemp !== undefined ? String(d.fatorCorrecaoTemp) : '1',
        })),
      })))
    }
    setCarregado(true)
  }, [existentes, carregado])

  // ===== agregado graúdo =====
  function alterarGraudoNome(i: number, valor: string) {
    setGraudos(graudos.map((g, idx) => (idx === i ? { ...g, materialNome: valor } : g)))
  }
  function alterarDetGraudo(iG: number, iDet: number, campo: keyof DetGraudoForm, valor: string) {
    setGraudos(graudos.map((g, idx) => {
      if (idx !== iG) return g
      return { ...g, dets: g.dets.map((d, di) => (di === iDet ? { ...d, [campo]: valor } : d)) }
    }))
  }
  function adicionarGraudo() { setGraudos([...graudos, graudoVazio()]) }
  function removerGraudo(i: number) { setGraudos(graudos.filter((_, idx) => idx !== i)) }
  function adicionarDetGraudo(iG: number) {
    setGraudos(graudos.map((g, idx) => (idx === iG && g.dets.length < 3 ? { ...g, dets: [...g.dets, detGraudoVazio()] } : g)))
  }
  function removerDetGraudo(iG: number, iDet: number) {
    setGraudos(graudos.map((g, idx) => (idx === iG ? { ...g, dets: g.dets.filter((_, di) => di !== iDet) } : g)))
  }

  const resultadosGraudo = useMemo(() => {
    return graudos.map((g) => {
      const porDet = g.dets.map((d): { ok: true; r: DensidadeGraudo } | { ok: false } | null => {
        if (d.pesoArSeco === '' || d.pesoSaturado === '' || d.pesoImerso === '') return null
        try {
          return { ok: true, r: densidadeAgregadoGraudo(n(d.pesoArSeco), n(d.pesoSaturado), n(d.pesoImerso)) }
        } catch {
          return { ok: false }
        }
      })
      const realMedia = media(porDet.map(x => (x?.ok ? x.r.real : null)))
      const aparenteMedia = media(porDet.map(x => (x?.ok ? x.r.aparente : null)))
      const absorcaoMedia = media(porDet.map(x => (x?.ok ? x.r.absorcao : null)))
      return { porDet, realMedia, aparenteMedia, absorcaoMedia }
    })
  }, [graudos])

  // ===== agregado miúdo =====
  function alterarMiudoNome(i: number, valor: string) {
    setMiudos(miudos.map((m, idx) => (idx === i ? { ...m, materialNome: valor } : m)))
  }
  function alterarDetMiudo(iM: number, iDet: number, campo: keyof DetMiudoForm, valor: string) {
    setMiudos(miudos.map((m, idx) => {
      if (idx !== iM) return m
      return { ...m, dets: m.dets.map((d, di) => (di === iDet ? { ...d, [campo]: valor } : d)) }
    }))
  }
  function adicionarMiudo() { setMiudos([...miudos, miudoVazio()]) }
  function removerMiudo(i: number) { setMiudos(miudos.filter((_, idx) => idx !== i)) }
  function adicionarDetMiudo(iM: number) {
    setMiudos(miudos.map((m, idx) => (idx === iM && m.dets.length < 3 ? { ...m, dets: [...m.dets, detMiudoVazio()] } : m)))
  }
  function removerDetMiudo(iM: number, iDet: number) {
    setMiudos(miudos.map((m, idx) => (idx === iM ? { ...m, dets: m.dets.filter((_, di) => di !== iDet) } : m)))
  }

  const resultadosMiudo = useMemo(() => {
    return miudos.map((m) => {
      const porDet = m.dets.map((d): { ok: true; real: number } | { ok: false } | null => {
        if (d.pesoPicnometro === '' || d.pesoPicAgregado === '' || d.pesoPicAgua === '' || d.pesoPicAgregadoAgua === '') return null
        try {
          const fator = d.fatorCorrecaoTemp === '' ? 1 : n(d.fatorCorrecaoTemp)
          const real = densidadeAgregadoMiudo(n(d.pesoPicnometro), n(d.pesoPicAgregado), n(d.pesoPicAgua), n(d.pesoPicAgregadoAgua), fator)
          return { ok: true, real }
        } catch {
          return { ok: false }
        }
      })
      const realMedia = media(porDet.map(x => (x?.ok ? x.real : null)))
      return { porDet, realMedia }
    })
  }, [miudos])

  // ===== massa específica real média da mistura (MERM) =====
  const densidadesPorMaterial = useMemo(() => {
    const mapa = new Map<string, number>()
    graudos.forEach((g, i) => {
      const r = resultadosGraudo[i].realMedia
      if (g.materialNome.trim() && r !== null) mapa.set(g.materialNome.trim().toLowerCase(), r)
    })
    miudos.forEach((m, i) => {
      const r = resultadosMiudo[i].realMedia
      if (m.materialNome.trim() && r !== null) mapa.set(m.materialNome.trim().toLowerCase(), r)
    })
    return mapa
  }, [graudos, resultadosGraudo, miudos, resultadosMiudo])

  const linhasMerm = useMemo(() => {
    return (composicao ?? []).map(c => {
      const nome = (c.material_nome ?? '').trim()
      const densidadeReal = densidadesPorMaterial.get(nome.toLowerCase()) ?? null
      return { materialNome: nome, pct: c.percentual, densidadeReal }
    })
  }, [composicao, densidadesPorMaterial])

  const merm = useMemo((): { ok: true; valor: number } | { ok: false; problema: string } | null => {
    if (!composicao || !composicao.length) return null
    const faltando = linhasMerm.filter(l => l.densidadeReal === null)
    if (faltando.length) {
      return { ok: false, problema: `Falta a densidade real de: ${faltando.map(l => l.materialNome || '(sem nome)').join(', ')}. Preencha o agregado graúdo ou miúdo correspondente acima com o mesmo nome do material da composição.` }
    }
    try {
      const valor = massaEspecificaRealMedia(linhasMerm.map(l => ({ pct: l.pct, densidadeReal: l.densidadeReal! })))
      return { ok: true, valor }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [composicao, linhasMerm])

  const salvar = useMutation({
    mutationFn: async () => {
      const graudosPreenchidos = graudos.filter(g => g.materialNome.trim() || g.dets.some(d => d.pesoArSeco !== ''))
      const miudosPreenchidos = miudos.filter(m => m.materialNome.trim() || m.dets.some(d => d.pesoPicnometro !== ''))
      if (!graudosPreenchidos.length && !miudosPreenchidos.length) {
        throw new Error('Informe ao menos um agregado (graúdo ou miúdo) com leituras de densidade.')
      }
      for (const g of graudosPreenchidos) {
        if (!g.materialNome.trim()) throw new Error('Informe o nome do material em todos os agregados graúdos preenchidos.')
        if (!g.dets.some(d => d.pesoArSeco !== '' && d.pesoSaturado !== '' && d.pesoImerso !== '')) {
          throw new Error(`Informe ao menos uma determinação completa (A, B e C) para "${g.materialNome}".`)
        }
      }
      for (const m of miudosPreenchidos) {
        if (!m.materialNome.trim()) throw new Error('Informe o nome do material em todos os agregados miúdos preenchidos.')
        if (!m.dets.some(d => d.pesoPicnometro !== '' && d.pesoPicAgregado !== '' && d.pesoPicAgua !== '' && d.pesoPicAgregadoAgua !== '')) {
          throw new Error(`Informe ao menos uma determinação completa do picnômetro para "${m.materialNome}".`)
        }
      }

      type LinhaSalvar = {
        id?: string; dosagem_id: string; tipo: string; material_nome: string
        entradas: { determinacoes: Record<string, number>[] }; ordem: number
      }
      const linhasGraudo: LinhaSalvar[] = graudosPreenchidos.map((g, i) => ({
        id: g.id,
        dosagem_id: dosagemId,
        tipo: 'agregado_graudo',
        material_nome: g.materialNome.trim(),
        entradas: {
          determinacoes: g.dets
            .filter(d => d.pesoArSeco !== '' && d.pesoSaturado !== '' && d.pesoImerso !== '')
            .map(d => ({ pesoArSeco: n(d.pesoArSeco), pesoSaturado: n(d.pesoSaturado), pesoImerso: n(d.pesoImerso) })),
        },
        ordem: i,
      }))
      const linhasMiudo: LinhaSalvar[] = miudosPreenchidos.map((m, i) => ({
        id: m.id,
        dosagem_id: dosagemId,
        tipo: 'agregado_miudo',
        material_nome: m.materialNome.trim(),
        entradas: {
          determinacoes: m.dets
            .filter(d => d.pesoPicnometro !== '' && d.pesoPicAgregado !== '' && d.pesoPicAgua !== '' && d.pesoPicAgregadoAgua !== '')
            .map(d => ({
              pesoPicnometro: n(d.pesoPicnometro), pesoPicAgregado: n(d.pesoPicAgregado),
              pesoPicAgua: n(d.pesoPicAgua), pesoPicAgregadoAgua: n(d.pesoPicAgregadoAgua),
              fatorCorrecaoTemp: d.fatorCorrecaoTemp === '' ? 1 : n(d.fatorCorrecaoTemp),
            })),
        },
        ordem: i,
      }))
      const linhas = [...linhasGraudo, ...linhasMiudo]

      const comId = linhas.filter(l => l.id)
      const semId = linhas.filter(l => !l.id)

      if (comId.length) {
        const { error } = await supabase.from('projeto_densidades').upsert(comId, { onConflict: 'id' })
        if (error) throw new Error('Falha ao salvar densidades: ' + error.message)
      }
      if (semId.length) {
        const { data, error } = await supabase.from('projeto_densidades')
          .insert(semId.map(({ id: _id, ...resto }) => resto)).select('id')
        if (error) throw new Error('Falha ao salvar densidades: ' + error.message)
        data?.forEach((row: { id: string }, idx: number) => { semId[idx].id = row.id })
      }

      const { data: antigos, error: errAntigos } = await supabase.from('projeto_densidades').select('id').eq('dosagem_id', dosagemId)
      if (errAntigos) throw new Error('Falha ao conferir densidades existentes: ' + errAntigos.message)
      const idsAtuais = new Set(linhas.map(l => l.id).filter((v): v is string => !!v))
      const idsRemover = (antigos ?? []).filter((x: { id: string }) => !idsAtuais.has(x.id)).map((x: { id: string }) => x.id)
      if (idsRemover.length) {
        const { error: errDel } = await supabase.from('projeto_densidades').delete().in('id', idsRemover)
        if (errDel) throw new Error('Falha ao remover densidades excluídas: ' + errDel.message)
      }

      setGraudos(graudosPreenchidos.map((g, idx) => ({ ...g, id: linhasGraudo[idx].id })))
      setMiudos(miudosPreenchidos.map((m, idx) => ({ ...m, id: linhasMiudo[idx].id })))
    },
    onSuccess: () => setErro(''),
    onError: (e: Error) => setErro(e.message),
  })

  const inp = 'border rounded p-2 w-full'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-grp-700">Densidades — {dosagem?.nome ?? '…'}</h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/dosagens')}>Voltar aos projetos</button>
      </div>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita as densidades. Exibindo em modo leitura.</p>}

      {/* ===== Agregado graúdo ===== */}
      <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg text-grp-700">Agregado graúdo — DNER-ME 081/98</h2>
          {podeEditar && <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarGraudo}>+ Adicionar agregado</button>}
        </div>
        <p className="text-sm text-slate-500">A = peso ao ar seco · B = peso ao ar saturado superfície seca · C = peso imerso (g).</p>

        {graudos.map((g, iG) => {
          const res = resultadosGraudo[iG]
          return (
            <div key={iG} className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm flex-1">Material
                  <input className={inp} value={g.materialNome} disabled={!podeEditar}
                    onChange={e => alterarGraudoNome(iG, e.target.value)} /></label>
                {podeEditar && g.dets.length < 3 && (
                  <button type="button" className="text-sm border rounded px-2 py-1 whitespace-nowrap" onClick={() => adicionarDetGraudo(iG)}>+ Determinação</button>
                )}
                {podeEditar && graudos.length > 1 && (
                  <button type="button" className="text-red-600 text-sm whitespace-nowrap" onClick={() => removerGraudo(iG)}>Remover</button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="p-2">Det.</th><th>A (g)</th><th>B (g)</th><th>C (g)</th>
                      <th>Real</th><th>Aparente</th><th>Absorção (%)</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.dets.map((d, iDet) => {
                      const r = res.porDet[iDet]
                      return (
                        <tr key={iDet} className="border-b">
                          <td className="p-2 font-semibold">{iDet + 1}</td>
                          <td><input className="border rounded p-1 w-24" type="number" step="any" value={d.pesoArSeco} disabled={!podeEditar}
                            onChange={e => alterarDetGraudo(iG, iDet, 'pesoArSeco', e.target.value)} /></td>
                          <td><input className="border rounded p-1 w-24" type="number" step="any" value={d.pesoSaturado} disabled={!podeEditar}
                            onChange={e => alterarDetGraudo(iG, iDet, 'pesoSaturado', e.target.value)} /></td>
                          <td><input className="border rounded p-1 w-24" type="number" step="any" value={d.pesoImerso} disabled={!podeEditar}
                            onChange={e => alterarDetGraudo(iG, iDet, 'pesoImerso', e.target.value)} /></td>
                          <td>{r?.ok ? fmt(r.r.real, 3) : '—'}</td>
                          <td>{r?.ok ? fmt(r.r.aparente, 3) : '—'}</td>
                          <td>{r?.ok ? fmt(r.r.absorcao, 3) : '—'}</td>
                          <td>{podeEditar && g.dets.length > 1 && (
                            <button type="button" className="text-red-600 text-xs" onClick={() => removerDetGraudo(iG, iDet)}>×</button>
                          )}</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-slate-50 font-semibold">
                      <td className="p-2">Média</td><td></td><td></td><td></td>
                      <td>{fmt(res.realMedia, 3)}</td>
                      <td>{fmt(res.aparenteMedia, 3)}</td>
                      <td>{fmt(res.absorcaoMedia, 3)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </section>

      {/* ===== Agregado miúdo ===== */}
      <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg text-grp-700">Agregado miúdo — picnômetro (DNER-ME 084/95)</h2>
          {podeEditar && <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarMiudo}>+ Adicionar agregado</button>}
        </div>
        <p className="text-sm text-slate-500">
          Peso do picnômetro · picnômetro + agregado seco · picnômetro + água · picnômetro + agregado + água (g).
          Fator de correção de temperatura opcional (tabela DNER; padrão 1 = sem correção).
        </p>

        {miudos.map((m, iM) => {
          const res = resultadosMiudo[iM]
          return (
            <div key={iM} className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm flex-1">Material
                  <input className={inp} value={m.materialNome} disabled={!podeEditar}
                    onChange={e => alterarMiudoNome(iM, e.target.value)} /></label>
                {podeEditar && m.dets.length < 3 && (
                  <button type="button" className="text-sm border rounded px-2 py-1 whitespace-nowrap" onClick={() => adicionarDetMiudo(iM)}>+ Determinação</button>
                )}
                {podeEditar && miudos.length > 1 && (
                  <button type="button" className="text-red-600 text-sm whitespace-nowrap" onClick={() => removerMiudo(iM)}>Remover</button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="p-2">Det.</th><th>Picnômetro</th><th>Pic.+agregado</th><th>Pic.+água</th><th>Pic.+agreg.+água</th>
                      <th>Fator temp.</th><th>Real</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.dets.map((d, iDet) => {
                      const r = res.porDet[iDet]
                      return (
                        <tr key={iDet} className="border-b">
                          <td className="p-2 font-semibold">{iDet + 1}</td>
                          <td><input className="border rounded p-1 w-24" type="number" step="any" value={d.pesoPicnometro} disabled={!podeEditar}
                            onChange={e => alterarDetMiudo(iM, iDet, 'pesoPicnometro', e.target.value)} /></td>
                          <td><input className="border rounded p-1 w-24" type="number" step="any" value={d.pesoPicAgregado} disabled={!podeEditar}
                            onChange={e => alterarDetMiudo(iM, iDet, 'pesoPicAgregado', e.target.value)} /></td>
                          <td><input className="border rounded p-1 w-24" type="number" step="any" value={d.pesoPicAgua} disabled={!podeEditar}
                            onChange={e => alterarDetMiudo(iM, iDet, 'pesoPicAgua', e.target.value)} /></td>
                          <td><input className="border rounded p-1 w-24" type="number" step="any" value={d.pesoPicAgregadoAgua} disabled={!podeEditar}
                            onChange={e => alterarDetMiudo(iM, iDet, 'pesoPicAgregadoAgua', e.target.value)} /></td>
                          <td><input className="border rounded p-1 w-20" type="number" step="any" value={d.fatorCorrecaoTemp} disabled={!podeEditar}
                            onChange={e => alterarDetMiudo(iM, iDet, 'fatorCorrecaoTemp', e.target.value)} /></td>
                          <td>{r?.ok ? fmt(r.real, 3) : '—'}</td>
                          <td>{podeEditar && m.dets.length > 1 && (
                            <button type="button" className="text-red-600 text-xs" onClick={() => removerDetMiudo(iM, iDet)}>×</button>
                          )}</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-slate-50 font-semibold">
                      <td className="p-2">Média</td><td></td><td></td><td></td><td></td><td></td>
                      <td>{fmt(res.realMedia, 3)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </section>

      {/* ===== Massa específica real média da mistura ===== */}
      <section className="bg-white p-4 rounded-xl shadow-sm space-y-3">
        <h2 className="font-semibold text-lg text-grp-700">Massa específica real média da mistura (MERM)</h2>
        <p className="text-sm text-slate-500">
          MERM = 100 / Σ (% do agregado na composição / densidade real do agregado). Os percentuais vêm da composição
          do projeto (aba "Composição/Moldagem") e a densidade real de cada material é buscada pelo nome nos agregados
          graúdo/miúdo preenchidos acima.
        </p>
        {!composicao?.length && <p className="text-sm text-slate-500">Este projeto ainda não tem composição cadastrada.</p>}
        {!!composicao?.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b"><th className="p-2">Material</th><th>% na mistura</th><th>Densidade real</th></tr></thead>
              <tbody>
                {linhasMerm.map((l, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 font-semibold">{l.materialNome || '(sem nome)'}</td>
                    <td>{fmt(l.pct, 2)}%</td>
                    <td>{l.densidadeReal !== null ? fmt(l.densidadeReal, 3) : <span className="text-amber-700">não encontrada</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {merm && !merm.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{merm.problema}</p>}
        {merm?.ok && (
          <p className="text-lg font-semibold">MERM = {fmt(merm.valor, 3)} g/cm³</p>
        )}
      </section>

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50" disabled={salvar.isPending}
            onClick={() => salvar.mutate()}>
            Salvar densidades
          </button>
          {salvar.isSuccess && !erro && <span className="text-green-700 text-sm">Salvo.</span>}
        </div>
      )}
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </div>
  )
}
