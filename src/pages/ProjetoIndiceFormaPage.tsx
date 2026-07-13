import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth, podeNoModulo } from '../lib/auth'
import { indiceLamelaridade, type GraoMedicao } from '../lib/calculos/indiceForma'
import { fmt } from '../lib/formato'

interface GraoForm { espessura: string; comprimento: string }

const n = (s: string) => (s === '' ? NaN : Number(s))
const graoVazio = (): GraoForm => ({ espessura: '', comprimento: '' })

// Aceita linhas coladas do Excel (separadas por tab), por ponto-e-vírgula ou por espaço.
// Vírgula dentro de um campo é tratada como separador decimal (padrão BR).
function parseLinhaGrao(linha: string): GraoForm | null {
  let partes = linha.split('\t').map(p => p.trim()).filter(Boolean)
  if (partes.length < 2) partes = linha.split(';').map(p => p.trim()).filter(Boolean)
  if (partes.length < 2) partes = linha.trim().split(/\s+/).filter(Boolean)
  if (partes.length < 2) return null
  const espessura = partes[0].replace(',', '.')
  const comprimento = partes[1].replace(',', '.')
  if (espessura === '' || comprimento === '' || !Number.isFinite(Number(espessura)) || !Number.isFinite(Number(comprimento))) return null
  return { espessura, comprimento }
}

export default function ProjetoIndiceFormaPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const dosagemId = id!
  const { perfis } = useAuth()
  const podeEditar = podeNoModulo(perfis, 'ensaios_usina', 'avaliador')

  const [materialNome, setMaterialNome] = useState('')
  const [graos, setGraos] = useState<GraoForm[]>([graoVazio()])
  const [colarTexto, setColarTexto] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [carregado, setCarregado] = useState(false)

  const { data: dosagem } = useQuery({
    queryKey: ['dosagem-indice-forma', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagens').select('id, nome').eq('id', dosagemId).single()
      if (error) throw error
      return data as { id: string; nome: string }
    },
  })

  const { data: existente } = useQuery({
    queryKey: ['projeto-indice-forma', dosagemId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projeto_indice_forma').select('*').eq('dosagem_id', dosagemId).maybeSingle()
      if (error) throw error
      return data as {
        dosagem_id: string
        material_nome: string | null
        graos: { espessura: number; comprimento: number }[] | null
        media_il: number | null
        pct_lamelar: number | null
      } | null
    },
  })

  // Prefill do formulário a partir dos dados já salvos (modo edição)
  useEffect(() => {
    if (existente === undefined || carregado) return
    if (existente) {
      setMaterialNome(existente.material_nome ?? '')
      const lista = existente.graos ?? []
      setGraos(lista.length
        ? lista.map(g => ({ espessura: String(g.espessura), comprimento: String(g.comprimento) }))
        : [graoVazio()])
    }
    setCarregado(true)
  }, [existente, carregado])

  function alterarGrao(i: number, campo: keyof GraoForm, valor: string) {
    setGraos(graos.map((g, idx) => (idx === i ? { ...g, [campo]: valor } : g)))
  }
  function adicionarGrao() { setGraos([...graos, graoVazio()]) }
  function removerGrao(i: number) { setGraos(graos.filter((_, idx) => idx !== i)) }
  function limparTudo() { setGraos([graoVazio()]); setAviso(''); setErro('') }

  function adicionarEmLote() {
    const linhas = colarTexto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const novos: GraoForm[] = []
    let invalidas = 0
    for (const linha of linhas) {
      const g = parseLinhaGrao(linha)
      if (g) novos.push(g); else invalidas++
    }
    if (!novos.length) {
      setAviso('')
      setErro('Nenhuma linha válida encontrada para colar. Use "espessura  comprimento" por linha (colado do Excel, separado por tab, ponto-e-vírgula ou espaço).')
      return
    }
    setGraos(prev => {
      const semVazios = prev.filter(g => g.espessura !== '' || g.comprimento !== '')
      return [...semVazios, ...novos]
    })
    setColarTexto('')
    setErro('')
    setAviso(invalidas
      ? `${novos.length} grão(s) adicionado(s); ${invalidas} linha(s) ignorada(s) por formato inválido.`
      : `${novos.length} grão(s) adicionado(s).`)
  }

  const graosPreenchidos = useMemo(() => graos.filter(g => g.espessura !== '' && g.comprimento !== ''), [graos])

  const resultado = useMemo((): { ok: true; r: ReturnType<typeof indiceLamelaridade> } | { ok: false; problema: string } | null => {
    if (!graosPreenchidos.length) return null
    try {
      const medicoes: GraoMedicao[] = graosPreenchidos.map(g => ({ espessura: n(g.espessura), comprimento: n(g.comprimento) }))
      return { ok: true, r: indiceLamelaridade(medicoes) }
    } catch (e) {
      return { ok: false, problema: (e as Error).message }
    }
  }, [graosPreenchidos])

  function ilLinha(g: GraoForm): { ok: true; il: number; lamelar: boolean } | { ok: false } | null {
    if (g.espessura === '' || g.comprimento === '') return null
    try {
      const r = indiceLamelaridade([{ espessura: n(g.espessura), comprimento: n(g.comprimento) }])
      return { ok: true, il: r.mediaIL, lamelar: r.lamelares > 0 }
    } catch {
      return { ok: false }
    }
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!graosPreenchidos.length) throw new Error('Informe ao menos um grão (espessura e comprimento) para o índice de forma.')
      if (graos.some(g => (g.espessura !== '' && g.comprimento === '') || (g.espessura === '' && g.comprimento !== ''))) {
        throw new Error('Informe espessura e comprimento de cada grão preenchido.')
      }
      if (!resultado) throw new Error('Informe ao menos um grão válido.')
      if (!resultado.ok) throw new Error(resultado.problema)
      const r = resultado.r

      const payload = {
        dosagem_id: dosagemId,
        material_nome: materialNome.trim() || null,
        graos: graosPreenchidos.map(g => ({ espessura: n(g.espessura), comprimento: n(g.comprimento) })),
        media_il: r.mediaIL,
        pct_lamelar: r.pctLamelar,
      }
      const { error } = await supabase.from('projeto_indice_forma').upsert(payload, { onConflict: 'dosagem_id' })
      if (error) throw new Error('Falha ao salvar índice de forma: ' + error.message)

      // Reflete a média do IL em dosagens.parametros_projeto (chave indice_forma) para que o
      // resumo/semáforo do projeto a enxergue — mesmo padrão seguro do M5a (equivalente_areia):
      // só escreve quando há grãos válidos nesta tela (garantido pelas validações acima),
      // nunca apaga outras chaves (spread do parametros_projeto lido fresco) e nunca reconstrói
      // a lista de grãos a partir de parametros_projeto (fonte de verdade é projeto_indice_forma).
      const { data: dosagemAtual, error: errDosagem } = await supabase.from('dosagens').select('parametros_projeto').eq('id', dosagemId).single()
      if (errDosagem) throw new Error('Índice de forma salvo, mas houve falha ao atualizar as características do projeto — tente salvar novamente.')
      const parametros: Record<string, unknown> = { ...((dosagemAtual as { parametros_projeto: Record<string, unknown> | null }).parametros_projeto ?? {}) }
      parametros.indice_forma = r.mediaIL

      const { error: errUpdate } = await supabase.from('dosagens').update({ parametros_projeto: parametros }).eq('id', dosagemId)
      if (errUpdate) throw new Error('Índice de forma salvo, mas houve falha ao atualizar as características do projeto — tente salvar novamente.')
    },
    onSuccess: () => setErro(''),
    onError: (e: Error) => setErro(e.message),
  })

  const inp = 'border rounded p-2 w-full'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-grp-700">Índice de forma / Lamelaridade — {dosagem?.nome ?? '…'}</h1>
        <button className="text-sm text-blue-700 underline" onClick={() => nav('/dosagens')}>Voltar aos projetos</button>
      </div>
      {!podeEditar && <p className="text-sm text-slate-500">Somente avaliador ou administrador edita o índice de forma. Exibindo em modo leitura.</p>}

      <section className="bg-white p-4 rounded-xl shadow-sm space-y-4">
        <h2 className="font-semibold text-lg text-grp-700">Ensaio de lamelaridade — NBR 7809 / DNIT 425/2020</h2>
        <p className="text-sm text-slate-500">
          Para cada grão medem-se espessura (E) e comprimento (C), em mm. IL = C/E. Um grão é lamelar quando IL ≥ 3.
          O resultado do ensaio é a média dos IL de todos os grãos e o percentual de grãos lamelares.
        </p>

        <label className="text-sm block max-w-sm">Material / amostra
          <input className={inp} value={materialNome} disabled={!podeEditar}
            onChange={e => setMaterialNome(e.target.value)} placeholder="ex.: Pedra 19 mm" /></label>

        {podeEditar && (
          <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
            <label className="text-sm block font-semibold">Colar grãos em lote</label>
            <p className="text-xs text-slate-500">
              Uma linha por grão, no formato "espessura&nbsp;&nbsp;comprimento" — cole direto do Excel (colunas separadas
              por tab) ou digite separando por ponto-e-vírgula ou espaço. Útil para lançar os 100+ grãos de um ensaio de uma vez.
            </p>
            <textarea className="border rounded p-2 w-full font-mono text-xs" rows={4} value={colarTexto}
              placeholder={'1\t1.9\n1\t1.6\n0.6\t1.9\n...'} onChange={e => setColarTexto(e.target.value)} />
            <div className="flex items-center gap-2">
              <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarEmLote} disabled={!colarTexto.trim()}>
                Adicionar em lote
              </button>
              <button type="button" className="text-sm border rounded px-3 py-1" onClick={adicionarGrao}>+ Grão</button>
              {graos.length > 1 && (
                <button type="button" className="text-sm text-red-600 border rounded px-3 py-1" onClick={limparTudo}>Limpar tudo</button>
              )}
            </div>
            {aviso && <p className="text-sm text-emerald-700">{aviso}</p>}
          </div>
        )}

        <div className="overflow-x-auto max-h-[32rem] overflow-y-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left border-b">
                <th className="p-2">Grão</th><th>E (mm)</th><th>C (mm)</th><th>IL = C/E</th><th>Condição</th><th></th>
              </tr>
            </thead>
            <tbody>
              {graos.map((g, i) => {
                const il = ilLinha(g)
                return (
                  <tr key={i} className="border-b">
                    <td className="p-2 font-semibold">{i + 1}</td>
                    <td><input className="border rounded p-1 w-24" type="number" step="any" value={g.espessura} disabled={!podeEditar}
                      onChange={e => alterarGrao(i, 'espessura', e.target.value)} /></td>
                    <td><input className="border rounded p-1 w-24" type="number" step="any" value={g.comprimento} disabled={!podeEditar}
                      onChange={e => alterarGrao(i, 'comprimento', e.target.value)} /></td>
                    <td>{il?.ok ? fmt(il.il, 3) : '—'}</td>
                    <td>{il?.ok ? (il.lamelar
                      ? <span className="text-red-700 font-semibold">Lamelar</span>
                      : <span className="text-slate-600">Não lamelar</span>) : '—'}</td>
                    <td>{podeEditar && graos.length > 1 && (
                      <button type="button" className="text-red-600 text-xs" onClick={() => removerGrao(i)}>×</button>
                    )}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {resultado && !resultado.ok && <p className="text-amber-700 bg-amber-50 p-3 rounded">{resultado.problema}</p>}
        {resultado?.ok && (
          <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><p className="text-xs text-slate-500">Total de grãos</p><p className="text-lg font-semibold">{resultado.r.totalGraos}</p></div>
            <div><p className="text-xs text-slate-500">Grãos lamelares</p><p className="text-lg font-semibold">{resultado.r.lamelares}</p></div>
            <div><p className="text-xs text-slate-500">% lamelar</p><p className="text-lg font-semibold">{fmt(resultado.r.pctLamelar, 2)}%</p></div>
            <div><p className="text-xs text-slate-500">Média do IL</p><p className="text-lg font-semibold">{fmt(resultado.r.mediaIL, 3)}</p></div>
          </div>
        )}
      </section>

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button className="bg-grp-600 hover:bg-grp-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50" disabled={salvar.isPending}
            onClick={() => salvar.mutate()}>
            Salvar índice de forma
          </button>
          {salvar.isSuccess && !erro && <span className="text-green-700 text-sm">Salvo.</span>}
        </div>
      )}
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </div>
  )
}
