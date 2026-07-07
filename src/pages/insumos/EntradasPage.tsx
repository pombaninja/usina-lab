import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../lib/formato'
import { hojeLocal, limitesDoMes, mesAtualLocal } from '../../lib/datas'

interface Tanque { id: string; codigo: string; nome: string; unidade: string }
interface Entrada {
  id: string; data: string; tanque_id: string; quantidade: number
  fornecedor: string | null; nf_numero: string | null; nf_anexo_path: string | null
  tanques: Tanque | null
}

const MAX_BYTES = 10 * 1024 * 1024

export default function EntradasPage() {
  const qc = useQueryClient()
  const [data, setData] = useState(hojeLocal())
  const [tanqueId, setTanqueId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [nfNumero, setNfNumero] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [observacoes, setObservacoes] = useState('')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [mes, setMes] = useState(mesAtualLocal())
  const [erroDownload, setErroDownload] = useState('')

  const { data: tanques } = useQuery({
    queryKey: ['tanques-ativos'],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('tanques').select('id, codigo, nome, unidade').eq('ativa', true).order('codigo')
      if (error) throw error
      return (rows ?? []) as Tanque[]
    },
  })

  const { data: entradas } = useQuery({
    queryKey: ['insumos-entradas-mes', mes],
    queryFn: async () => {
      const { inicio, fimExclusivo } = limitesDoMes(mes)
      const { data: rows, error } = await supabase.from('insumos_entradas')
        .select('*, tanques(id, codigo, nome, unidade)')
        .gte('data', inicio).lt('data', fimExclusivo)
        .order('data', { ascending: false })
      if (error) throw error
      return (rows ?? []) as Entrada[]
    },
  })

  const tanqueSelecionado = (tanques ?? []).find(t => t.id === tanqueId)

  const limpar = () => {
    setQuantidade(''); setFornecedor(''); setNfNumero(''); setArquivo(null); setObservacoes('')
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const qtd = Number(quantidade)
      if (!tanqueId) throw new Error('Selecione o tanque')
      if (!quantidade || !Number.isFinite(qtd) || qtd <= 0) throw new Error('Quantidade deve ser maior que zero')
      if (arquivo && arquivo.size > MAX_BYTES) throw new Error('Arquivo maior que 10 MB — reduza a foto ou o PDF')

      let nfAnexoPath: string | null = null
      if (arquivo) {
        const agora = new Date()
        const ano = agora.getFullYear()
        const mesUpload = String(agora.getMonth() + 1).padStart(2, '0')
        const nomeLimpo = arquivo.name.replace(/[^\w.\-]+/g, '_')
        const caminho = `${ano}/${mesUpload}/${crypto.randomUUID()}-${nomeLimpo}`
        const { error: errUpload } = await supabase.storage.from('notas-fiscais').upload(caminho, arquivo)
        if (errUpload) throw new Error('Falha ao enviar o anexo da NF: ' + errUpload.message)
        nfAnexoPath = caminho
      }

      const { error: errInsert } = await supabase.from('insumos_entradas').insert({
        data,
        tanque_id: tanqueId,
        quantidade: qtd,
        fornecedor: fornecedor || null,
        nf_numero: nfNumero || null,
        nf_anexo_path: nfAnexoPath,
        observacoes: observacoes || null,
      })
      if (errInsert) {
        if (nfAnexoPath) await supabase.storage.from('notas-fiscais').remove([nfAnexoPath])
        throw new Error('Falha ao salvar a entrada: ' + errInsert.message)
      }
    },
    onSuccess: () => {
      setSucesso(true); setErro('')
      limpar()
      qc.invalidateQueries({ queryKey: ['insumos-entradas-mes'] })
      qc.invalidateQueries({ queryKey: ['insumos-entradas-dia'] })
    },
    onError: (e: Error) => { setErro(e.message); setSucesso(false) },
  })

  const baixarNf = async (path: string) => {
    setErroDownload('')
    const aba = window.open('', '_blank')
    const { data: assinada, error } = await supabase.storage.from('notas-fiscais').createSignedUrl(path, 3600)
    if (error || !assinada) {
      aba?.close()
      setErroDownload('Não foi possível gerar o link da NF — tente novamente')
      return
    }
    if (aba) aba.location.href = assinada.signedUrl
    else window.location.href = assinada.signedUrl
  }

  const inp = 'border rounded p-2 w-full'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Entradas de insumos</h1>

      <form onSubmit={e => { e.preventDefault(); salvar.mutate() }}
            className="bg-white p-4 rounded-xl shadow grid grid-cols-3 gap-3">
        <label className="text-sm">Data
          <input className={inp} type="date" value={data} onChange={e => setData(e.target.value)} /></label>
        <label className="text-sm">Tanque *
          <select className={inp} required value={tanqueId} onChange={e => setTanqueId(e.target.value)}>
            <option value="">—</option>
            {(tanques ?? []).map(t => <option key={t.id} value={t.id}>{t.codigo} — {t.nome}</option>)}
          </select>
        </label>
        <label className="text-sm">Quantidade * {tanqueSelecionado && <span className="text-slate-500">({tanqueSelecionado.unidade})</span>}
          <input className={inp} type="number" step="any" min="0" required value={quantidade}
                 onChange={e => setQuantidade(e.target.value)} /></label>
        <label className="text-sm">Fornecedor
          <input className={inp} value={fornecedor} onChange={e => setFornecedor(e.target.value)} /></label>
        <label className="text-sm">Nº da NF
          <input className={inp} value={nfNumero} onChange={e => setNfNumero(e.target.value)} /></label>
        <label className="text-sm">Arquivo (foto ou PDF da NF)
          <input className={inp} type="file" accept="image/*,application/pdf"
                 onChange={e => setArquivo(e.target.files?.[0] ?? null)} /></label>
        <label className="text-sm col-span-3">Observações
          <textarea className={inp} value={observacoes} onChange={e => setObservacoes(e.target.value)} /></label>

        {erro && <p className="text-red-600 text-sm col-span-3">{erro}</p>}
        {sucesso && <p className="text-green-700 font-semibold text-sm col-span-3">Entrada salva</p>}

        <button className="bg-blue-700 text-white rounded px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={salvar.isPending} type="submit">
          {salvar.isPending ? 'Salvando…' : 'Registrar entrada'}
        </button>
      </form>

      <section className="bg-white p-4 rounded-xl shadow overflow-x-auto">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h2 className="font-semibold">Entradas do mês</h2>
          <label className="text-sm">Mês
            <input className="border rounded p-2 ml-2" type="month" value={mes} onChange={e => setMes(e.target.value)} /></label>
        </div>
        {erroDownload && <p className="text-red-600 text-sm mb-2">{erroDownload}</p>}
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b">
            <th className="p-2">Data</th><th>Tanque</th><th>Quantidade</th><th>Fornecedor</th><th>NF</th><th />
          </tr></thead>
          <tbody>{(entradas ?? []).map(e => (
            <tr key={e.id} className="border-b">
              <td className="p-2">{e.data.split('-').reverse().join('/')}</td>
              <td>{e.tanques ? `${e.tanques.codigo} — ${e.tanques.nome}` : '—'}</td>
              <td>{fmt(e.quantidade, 3)} {e.tanques?.unidade}</td>
              <td>{e.fornecedor ?? ''}</td>
              <td>{e.nf_numero ?? ''}</td>
              <td className="p-2">
                {e.nf_anexo_path && (
                  <button type="button" className="text-blue-700 underline" onClick={() => baixarNf(e.nf_anexo_path!)}>
                    Baixar NF
                  </button>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table>
        {(entradas ?? []).length === 0 && <p className="text-slate-500 text-sm mt-2">Nenhuma entrada no mês</p>}
      </section>
    </div>
  )
}
