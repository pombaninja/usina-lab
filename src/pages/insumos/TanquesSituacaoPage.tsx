import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../lib/formato'
import { hojeLocal } from '../../lib/datas'
import TanqueSvg from '../../components/TanqueSvg'
import BaiaSvg from '../../components/BaiaSvg'

interface Tanque {
  id: string; codigo: string; nome: string
  produto: string // slug em insumo_produtos (cadastro livre)
  unidade: string; capacidade: number | null; estoque_minimo: number
  formato: 'vertical' | 'horizontal'; ativa: boolean
}
interface ProdutoInsumo { produto: string; rotulo: string; cor: string }
interface Baia {
  id: string; codigo: string; nome: string; material: string; cor: string
  capacidade: number | null; unidade: string
  estoque_atual: number; estoque_minimo: number; ativa: boolean
}

const unidadeBaia = (u: string) => (u === 'm3' ? 'm³' : u)

export default function TanquesSituacaoPage() {
  const { data: tanques } = useQuery({
    queryKey: ['tanques-ativos'],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('tanques').select('*').eq('ativa', true).order('codigo')
      if (error) throw error
      return (rows ?? []) as Tanque[]
    },
  })

  const { data: produtos } = useQuery({
    queryKey: ['insumo-produtos'],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('insumo_produtos').select('*').order('produto')
      if (error) throw error
      return (rows ?? []) as ProdutoInsumo[]
    },
  })

  // Baias de agregados: o estoque é mantido direto no cadastro (estoque_atual),
  // sem lançamento diário como nos tanques.
  const { data: baias } = useQuery({
    queryKey: ['baias-ativas'],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('baias').select('*').eq('ativa', true).order('codigo')
      if (error) throw error
      return (rows ?? []) as Baia[]
    },
  })

  // ESTOQUE ATUAL: mesma fonte da tela "Insumos do dia" (query leiturasOntem):
  // o lançamento diário mais recente (aqui ≤ hoje, lá < data selecionada) e,
  // dele, o volume_final de cada tanque — o "Saldo (físico)" do dia.
  const { data: estoque } = useQuery({
    queryKey: ['insumos-estoque-atual'],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('insumos_lancamentos')
        .select('data, insumos_leituras(tanque_id, volume_final)')
        .lte('data', hojeLocal())
        .order('data', { ascending: false })
        .limit(1)
      if (error) throw error
      const ultimo = rows?.[0] as { data: string; insumos_leituras: { tanque_id: string; volume_final: number | null }[] } | undefined
      const porTanque: Record<string, number> = {}
      for (const l of ultimo?.insumos_leituras ?? []) {
        if (l.volume_final != null) porTanque[l.tanque_id] = l.volume_final
      }
      return { data: ultimo?.data ?? null, porTanque }
    },
  })

  const porProduto: Record<string, ProdutoInsumo> = {}
  for (const p of produtos ?? []) porProduto[p.produto] = p

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-grp-700">Situação dos tanques</h1>
        <span className="text-sm text-slate-500">
          {estoque?.data
            ? <>Leituras de <b>{estoque.data.split('-').reverse().join('/')}</b></>
            : 'Sem lançamentos registrados'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(tanques ?? []).map(t => {
          const material = porProduto[t.produto]
          const cor = material?.cor ?? '#64748b'
          const atual = estoque?.porTanque[t.id] ?? null
          const temCapacidade = t.capacidade != null && Number(t.capacidade) > 0
          const fracao = atual != null && temCapacidade ? atual / Number(t.capacidade) : null
          const pct = fracao != null ? Math.max(0, Math.min(1, fracao)) * 100 : null
          const abaixoMinimo = atual != null && atual < Number(t.estoque_minimo)
          return (
            <div key={t.id}
                 className={`bg-white rounded-xl shadow-sm p-4 space-y-2 ${abaixoMinimo ? 'border-2 border-red-500' : 'border border-transparent'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-grp-700">{t.codigo} — {t.nome}</p>
                  <p className="text-xs text-grp-ink flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cor }} />
                    {material?.rotulo ?? t.produto}
                  </p>
                </div>
                {abaixoMinimo && (
                  <span className="bg-red-600 text-white rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap">
                    Abaixo do mínimo
                  </span>
                )}
              </div>

              <TanqueSvg formato={t.formato} fracao={fracao} cor={cor} />

              <div className="flex items-end justify-between">
                <p className="text-sm text-slate-600">
                  Estoque atual<br />
                  <span className={`text-lg font-bold ${abaixoMinimo ? 'text-red-600' : 'text-slate-800'}`}>
                    {atual != null ? `${fmt(atual, atual >= 100 ? 0 : 3)} ${t.unidade}` : '—'}
                  </span>
                </p>
                <p className="text-sm text-slate-600 text-right">
                  Ocupação<br />
                  <span className="text-lg font-bold text-slate-800">{pct != null ? `${fmt(pct, 0)}%` : '?'}</span>
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Capacidade: {temCapacidade ? `${fmt(Number(t.capacidade), 0)} ${t.unidade}` : 'não informada'}
                {' · '}Mínimo: {fmt(Number(t.estoque_minimo), 0)} {t.unidade}
              </p>
            </div>
          )
        })}
        {(tanques ?? []).length === 0 && (
          <p className="text-slate-500 col-span-full">Nenhum tanque ativo cadastrado</p>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <h2 className="text-xl font-bold text-grp-700">Baias de agregados</h2>
        <Link to="/insumos/baias" className="text-sm text-grp-600 hover:text-grp-700 font-medium">
          Cadastro de baias →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(baias ?? []).map(b => {
          const atual = Number(b.estoque_atual)
          const temCapacidade = b.capacidade != null && Number(b.capacidade) > 0
          const fracao = temCapacidade ? atual / Number(b.capacidade) : null
          const pct = fracao != null ? Math.max(0, Math.min(1, fracao)) * 100 : null
          const abaixoMinimo = atual < Number(b.estoque_minimo)
          const un = unidadeBaia(b.unidade)
          return (
            <div key={b.id}
                 className={`bg-white rounded-xl shadow-sm p-4 space-y-2 ${abaixoMinimo ? 'border-2 border-red-500' : 'border border-transparent'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-grp-700">{b.codigo} — {b.nome}</p>
                  <p className="text-xs text-grp-ink flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.cor }} />
                    {b.material}
                  </p>
                </div>
                {abaixoMinimo && (
                  <span className="bg-red-600 text-white rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap">
                    Abaixo do mínimo
                  </span>
                )}
              </div>

              <BaiaSvg fracao={fracao} cor={b.cor} />

              <div className="flex items-end justify-between">
                <p className="text-sm text-slate-600">
                  Estoque atual<br />
                  <span className={`text-lg font-bold ${abaixoMinimo ? 'text-red-600' : 'text-slate-800'}`}>
                    {fmt(atual, atual >= 100 ? 0 : 3)} {un}
                  </span>
                </p>
                <p className="text-sm text-slate-600 text-right">
                  Ocupação<br />
                  <span className="text-lg font-bold text-slate-800">{pct != null ? `${fmt(pct, 0)}%` : '?'}</span>
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Capacidade: {temCapacidade ? `${fmt(Number(b.capacidade), 0)} ${un}` : 'não informada'}
                {' · '}Mínimo: {fmt(Number(b.estoque_minimo), 0)} {un}
              </p>
            </div>
          )
        })}
        {(baias ?? []).length === 0 && (
          <p className="text-slate-500 col-span-full">Nenhuma baia ativa cadastrada</p>
        )}
      </div>
    </div>
  )
}
