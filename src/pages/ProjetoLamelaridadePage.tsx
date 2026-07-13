import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import {
  calcularLamelaridade, PENEIRAS_LAMELARIDADE, FRACOES_LAMELARIDADE,
  type ResultadoLamelaridadeFracoes,
} from '../lib/calculos/lamelaridade'
import { fmt, sanitizarDecimal, parseDecimal, decimalParaTexto } from '../lib/formato'

// Índice de Lamelaridade POR FRAÇÃO (DAER/RS-EL 108/01, planilha da Pedreira):
// UM bloco por material/amostra — granulometria na sequência fixa 2" … 1/4" +
// pesos ensaiados por fração. Todo o cálculo reutiliza calcularLamelaridade
// (golden-testado). DIFERENTE do "Índice de forma" grão a grão (NBR 7809).
interface FracaoForm { pesoFracao: string; pesoLamelar: string }
interface MaterialLamForm {
  id?: string
  materialNome: string
  origem: string
  data: string
  pesoTotal: string
  granulometria: string[]   // alinhada a PENEIRAS_LAMELARIDADE (8 posições)
  fracoes: FracaoForm[]     // alinhadas a FRACOES_LAMELARIDADE (7 posições)
}

const materialVazio = (): MaterialLamForm => ({
  materialNome: '', origem: '', data: '', pesoTotal: '',
  granulometria: PENEIRAS_LAMELARIDADE.map(() => ''),
  fracoes: FRACOES_LAMELARIDADE.map(() => ({ pesoFracao: '', pesoLamelar: '' })),
})

interface LamRow {
  id: string; material_nome: string; origem: string | null; data: string | null
  peso_total: number | null
  granulometria: Record<string, number>
  fracoes: { passando: string; retido: string; pesoFracao: number | null; pesoLamelar: number | null }[]
  ordem: number
}

// Resultado ao vivo do bloco: null enquanto o peso total não está preenchido/válido.
function resultadoDoMaterial(m: MaterialLamForm): ResultadoLamelaridadeFracoes | null {
  const pesoTotal = parseDecimal(m.pesoTotal)
  if (pesoTotal === null || !Number.isFinite(pesoTotal) || pesoTotal <= 0) return null
  const acum = m.granulometria.map(v => parseDecimal(v))
  const fracoes = m.fracoes.map(f => ({ pesoFracao: parseDecimal(f.pesoFracao), pesoLamelar: parseDecimal(f.pesoLamelar) }))
  try {
    return calcularLamelaridade(pesoTotal, acum, fracoes)
  } catch {
    return null
  }
}

export default function ProjetoLamelaridadePage() {
  const nav = useNavigate()
  const { id } = useParams()
  const dosagemId = id!
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [materiais, setMateriais] = useState<MaterialLamForm[]>([materialVazio()])
  const [erro, setErro] = useState('')
  const [carregado, setCarregado] = useState(false)

  const { data: dosagem } = useQuery({
    queryKey: ['dosagem-lamelaridade', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagens').select('id, nome').eq('id', dosagemId).single()
      if (error) throw error
      return data as { id: string; nome: string }
    },
  })

  const { data: existentes } = useQuery({
    queryKey: ['projeto-lamelaridade', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_lamelaridade').select('*').eq('dosagem_id', dosagemId).order('ordem')
      if (error) throw error
      return (data ?? []) as LamRow[]
    },
  })

  // Prefill do formulário a partir dos dados já salvos (modo edição)
  useEffect(() => {
    if (!existentes || carregado) return
    if (existentes.length) {
      setMateriais(existentes.map((r): MaterialLamForm => {
        const fracoesPorFaixa = new Map(
          (r.fracoes ?? []).map(f => [`${f.passando}|${f.retido}`, f]))
        return {
          id: r.id,
          materialNome: r.material_nome ?? '',
          origem: r.origem ?? '',
          data: r.data ?? '',
          pesoTotal: decimalParaTexto(r.peso_total),
          granulometria: PENEIRAS_LAMELARIDADE.map(p => decimalParaTexto(r.granulometria?.[p])),
          fracoes: FRACOES_LAMELARIDADE.map(f => {
            const salvo = fracoesPorFaixa.get(`${f.passando}|${f.retido}`)
            return { pesoFracao: decimalParaTexto(salvo?.pesoFracao), pesoLamelar: decimalParaTexto(salvo?.pesoLamelar) }
          }),
        }
      }))
    }
    setCarregado(true)
  }, [existentes, carregado])

  function alterarCampo(iM: number, campo: 'materialNome' | 'origem' | 'data', valor: string) {
    setMateriais(materiais.map((m, idx) => (idx === iM ? { ...m, [campo]: valor } : m)))
  }
  function alterarPesoTotal(iM: number, valor: string) {
    setMateriais(materiais.map((m, idx) => (idx === iM ? { ...m, pesoTotal: sanitizarDecimal(valor) } : m)))
  }
  function alterarGranulometria(iM: number, iP: number, valor: string) {
    setMateriais(materiais.map((m, idx) => (idx === iM
      ? { ...m, granulometria: m.granulometria.map((g, gi) => (gi === iP ? sanitizarDecimal(valor) : g)) }
      : m)))
  }
  function alterarFracao(iM: number, iF: number, campo: keyof FracaoForm, valor: string) {
    setMateriais(materiais.map((m, idx) => (idx === iM
      ? { ...m, fracoes: m.fracoes.map((f, fi) => (fi === iF ? { ...f, [campo]: sanitizarDecimal(valor) } : f)) }
      : m)))
  }
  function adicionar() { setMateriais([...materiais, materialVazio()]) }
  function remover(iM: number) { setMateriais(materiais.filter((_, idx) => idx !== iM)) }

  const resultados = useMemo(() => materiais.map(resultadoDoMaterial), [materiais])

  const salvar = useMutation({
    mutationFn: async () => {
      const preenchidos = materiais.filter(m =>
        m.materialNome.trim() || m.pesoTotal.trim() !== '' ||
        m.granulometria.some(g => g !== '') || m.fracoes.some(f => f.pesoFracao !== '' || f.pesoLamelar !== ''))
      if (!preenchidos.length) throw new Error('Informe ao menos um material com leituras de lamelaridade.')

      for (const m of preenchidos) {
        if (!m.materialNome.trim()) throw new Error('Informe o nome do material em todos os blocos preenchidos.')
        const pesoTotal = parseDecimal(m.pesoTotal)
        if (pesoTotal === null || !Number.isFinite(pesoTotal) || pesoTotal <= 0) {
          throw new Error(`Informe o peso da amostra total (> 0) para "${m.materialNome.trim()}".`)
        }
        for (const g of m.granulometria) {
          const v = parseDecimal(g)
          if (v !== null && !Number.isFinite(v)) throw new Error(`Peso acumulado retido inválido em "${m.materialNome.trim()}".`)
        }
        for (const f of m.fracoes) {
          const pf = parseDecimal(f.pesoFracao)
          const pl = parseDecimal(f.pesoLamelar)
          if ((pf !== null && !Number.isFinite(pf)) || (pl !== null && !Number.isFinite(pl))) {
            throw new Error(`Peso de fração inválido em "${m.materialNome.trim()}".`)
          }
        }
      }

      type LinhaSalvar = {
        dosagem_id: string; material_nome: string; origem: string | null; data: string | null
        peso_total: number | null; granulometria: Record<string, number>
        fracoes: { passando: string; retido: string; pesoFracao: number | null; pesoLamelar: number | null }[]
        ordem: number
      }
      const linhas: LinhaSalvar[] = preenchidos.map((m, i) => {
        const granulometria: Record<string, number> = {}
        PENEIRAS_LAMELARIDADE.forEach((p, iP) => {
          const v = parseDecimal(m.granulometria[iP])
          if (v !== null) granulometria[p] = v
        })
        return {
          dosagem_id: dosagemId,
          material_nome: m.materialNome.trim(),
          origem: m.origem.trim() === '' ? null : m.origem.trim(),
          data: m.data === '' ? null : m.data,
          peso_total: parseDecimal(m.pesoTotal),
          granulometria,
          fracoes: FRACOES_LAMELARIDADE.map((f, iF) => ({
            passando: f.passando, retido: f.retido,
            pesoFracao: parseDecimal(m.fracoes[iF].pesoFracao),
            pesoLamelar: parseDecimal(m.fracoes[iF].pesoLamelar),
          })),
          ordem: i,
        }
      })

      // A ordem dos blocos é posicional: remover um material do meio reordena os
      // seguintes. Como não há FK apontando para projeto_lamelaridade, o salvamento
      // apaga tudo e regrava (mesma lição do RTD — ids podem ser recriados a cada save).
      const { error: errDel } = await supabase.from('projeto_lamelaridade').delete().eq('dosagem_id', dosagemId)
      if (errDel) throw new Error('Falha ao salvar o Índice de Lamelaridade: ' + errDel.message)

      // O retorno do insert só pode ser ordenado por colunas presentes no próprio
      // retorno — por isso pedimos id + ordem e casamos os ids pela posição.
      const { data: inseridos, error } = await supabase.from('projeto_lamelaridade')
        .insert(linhas).select('id, ordem')
      if (error) throw new Error('Falha ao salvar o Índice de Lamelaridade: ' + error.message)

      const idPorOrdem = new Map((inseridos ?? []).map((r: { id: string; ordem: number }) => [r.ordem, r.id]))
      setMateriais(preenchidos.map((m, idx) => ({ ...m, id: idPorOrdem.get(idx) })))
    },
    onSuccess: () => setErro(''),
    onError: (e: Error) => setErro(e.message),
  })

  const inp = 'border rounded p-2 w-full'
  const inpNum = 'border rounded p-1 w-24'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Índice de Lamelaridade — {dosagem?.nome ?? '…'}</h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/dosagens')}>Voltar aos projetos</button>
      </div>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita o Índice de Lamelaridade. Exibindo em modo leitura.</p>}
      <p className="text-sm text-slate-600">
        Ensaio POR FRAÇÃO (DAER/RS-EL 108/01): informe a granulometria da amostra (peso acumulado retido em
        2" … 1/4") e, para cada fração ensaiada na fenda, o peso da fração e o peso do material que passa.
        IL da fração = peso lamelar / peso da fração × 100; IL final = Σ(% da fração × IL) / Σ(% das frações
        ensaiadas). Não confundir com o "Índice de forma" grão a grão (NBR 7809), que é outro ensaio.
      </p>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Materiais / amostras</h2>
        {podeEditar && <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionar}>+ Adicionar material</button>}
      </div>

      {materiais.map((m, iM) => {
        const res = resultados[iM]
        return (
          <section key={m.id ?? `novo-${iM}`} className="bg-white p-4 rounded-xl shadow space-y-3">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <label className="text-sm flex-1 min-w-48">Material
                <input className={inp} value={m.materialNome} disabled={!podeEditar}
                  onChange={e => alterarCampo(iM, 'materialNome', e.target.value)} /></label>
              <label className="text-sm flex-1 min-w-48">Origem / amostra
                <input className={inp} value={m.origem} disabled={!podeEditar}
                  onChange={e => alterarCampo(iM, 'origem', e.target.value)} /></label>
              <label className="text-sm">Data
                <input className={inp} type="date" value={m.data} disabled={!podeEditar}
                  onChange={e => alterarCampo(iM, 'data', e.target.value)} /></label>
              <label className="text-sm">Peso da amostra total (g)
                <input className={inp} inputMode="decimal" value={m.pesoTotal} disabled={!podeEditar}
                  onChange={e => alterarPesoTotal(iM, e.target.value)} /></label>
              {podeEditar && materiais.length > 1 && (
                <button type="button" className="text-red-600 text-sm whitespace-nowrap" onClick={() => remover(iM)}>Remover material</button>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* ===== Granulometria da amostra ===== */}
              <div className="overflow-x-auto">
                <h3 className="font-semibold text-sm mb-1">Granulometria da amostra</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="p-2">Peneira</th>
                      <th>Peso acum. retido (g)</th>
                      <th>Peso passante (g)</th>
                      <th>% que passa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PENEIRAS_LAMELARIDADE.map((p, iP) => {
                      const g = res?.granulometria[iP]
                      return (
                        <tr key={p} className="border-b">
                          <td className="p-2 font-semibold">{p}</td>
                          <td><input className={inpNum} inputMode="decimal" value={m.granulometria[iP]} disabled={!podeEditar}
                            onChange={e => alterarGranulometria(iM, iP, e.target.value)} /></td>
                          <td>{g?.pesoPassanteRetido != null ? fmt(g.pesoPassanteRetido, 1) : '—'}</td>
                          <td>{g?.pctPassa != null ? fmt(g.pctPassa, 2) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* ===== Frações ensaiadas na fenda ===== */}
              <div className="overflow-x-auto">
                <h3 className="font-semibold text-sm mb-1">Frações (fenda)</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="p-2">Fração (mm)</th>
                      <th>% da fração</th>
                      <th>Peso da fração (g)</th>
                      <th>Peso lamelar (g)</th>
                      <th>IL da fração</th>
                      <th>Ponderado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FRACOES_LAMELARIDADE.map((f, iF) => {
                      const fr = res?.fracoes[iF]
                      return (
                        <tr key={f.faixaMm} className="border-b">
                          <td className="p-2 font-semibold whitespace-nowrap">{f.faixaMm}</td>
                          <td>{fr?.pctFracao != null ? fmt(fr.pctFracao, 2) : '—'}</td>
                          <td><input className={inpNum} inputMode="decimal" value={m.fracoes[iF].pesoFracao} disabled={!podeEditar}
                            onChange={e => alterarFracao(iM, iF, 'pesoFracao', e.target.value)} /></td>
                          <td><input className={inpNum} inputMode="decimal" value={m.fracoes[iF].pesoLamelar} disabled={!podeEditar}
                            onChange={e => alterarFracao(iM, iF, 'pesoLamelar', e.target.value)} /></td>
                          <td>{fr?.ilFracao != null ? fmt(fr.ilFracao, 2) : '—'}</td>
                          <td>{fr?.ponderado != null ? fmt(fr.ponderado, 2) : '—'}</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-slate-50 font-semibold">
                      <td className="p-2">Σ (ensaiadas)</td>
                      <td>{res?.somaPctFracao != null ? fmt(res.somaPctFracao, 2) : '—'}</td>
                      <td></td><td></td><td></td>
                      <td>{res?.somaPonderado != null ? fmt(res.somaPonderado, 2) : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-sm bg-lime-50 border border-lime-200 rounded p-2">
              IL FINAL {m.materialNome.trim() ? `— ${m.materialNome.trim()}` : ''} (Σ2/Σ1):{' '}
              <b className="text-lime-800 text-base">{res?.ilFinal != null ? fmt(res.ilFinal, 2) : '—'}</b>
            </p>
          </section>
        )
      })}

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button className="bg-blue-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50" disabled={salvar.isPending}
            onClick={() => salvar.mutate()}>
            Salvar Índice de Lamelaridade
          </button>
          {salvar.isSuccess && !erro && <span className="text-green-700 text-sm">Salvo.</span>}
        </div>
      )}
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </div>
  )
}
