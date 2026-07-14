import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { FormEnsaioLabProps } from './tipos'
import { ROTULO_TIPO_ENSAIO, SECOES_CBUQ_COMPLETO } from './tipos'
import { useDosagemFaixas } from './useDosagemFaixas'
import { CbuqCompletoLaudo } from './AnaliticoCbuq'
import TeorBetumeLabForm from './TeorBetumeLabForm'
import GranulometriaMisturaLabForm from './GranulometriaMisturaLabForm'
import ResistenciaCompressaoLabForm from './ResistenciaCompressaoLabForm'
import RiceDmtLabForm from './RiceDmtLabForm'

// Ensaio CBUQ COMPLETO (composto): um único ensaios_lab reúne os ensaios de CBUQ
// na ordem definida pelo dono — teor de betume (método Rotarex|Soxhlet),
// granulometria da mistura, resistência à compressão e Rice/DMT por último — e o
// laudo imprime tudo agregado num PDF só. Marshall e RTD NÃO fazem parte do
// composto (Marshall segue como ensaio avulso; RTD é ensaio SÓ do projeto).
// dados jsonb = { dosagem_id?, teor_betume?, granulometria_mistura?,
// resistencia_compressao?, rice_dmt? }, onde cada chave de seção guarda EXATAMENTE
// o sub-shape que o formulário individual já persiste. Ensaios antigos podem trazer
// chaves marshall/rtd: não são renderizadas, mas TODO save preserva (o merge abaixo
// espalha ...dados). dosagem_id (opcional, nível do composto) vincula a dosagem/
// projeto: a especificação do projeto dá as faixas de especificação e de trabalho
// para a curva granulométrica da mistura — mesma semântica do ensaio CAUQ diário.
//
// SEGURANÇA DO MERGE: a mutação da página SUBSTITUI ensaios_lab.dados inteiro pelo
// que recebe (EnsaioLabPage.salvar). Salvar uma seção NUNCA pode apagar as irmãs
// (lição do data-loss entre telas: merge, nunca replace de siblings). Estratégia:
// `salvosLocais` (ref) acumula só as chaves salvas NESTA sessão de tela (seções e
// dosagem_id); cada save envia { ...props.dados, ...salvosLocais.current, [chave]: dadosDaSecao }.
// - props.dados é a verdade do servidor (query ['ensaio-lab', id], reconsultada
//   após cada save) — preserva seções gravadas fora desta montagem;
// - salvosLocais vence sobre props.dados para as chaves tocadas aqui, o que fecha
//   a corrida de dois saves rápidos: se o refetch do 1º save ainda não voltou,
//   props.dados está defasado, mas a ref já carrega a seção recém-salva.
// Não há outro escritor concorrente na mesma tela, então a união é sempre >= servidor.

const FORMULARIOS_SECAO = {
  teor_betume: TeorBetumeLabForm,
  granulometria_mistura: GranulometriaMisturaLabForm,
  resistencia_compressao: ResistenciaCompressaoLabForm,
  rice_dmt: RiceDmtLabForm,
} as const

interface DosagemLinha { id: string; nome: string; revisao: number | null; projeto_pai_id: string | null }

export default function CbuqCompletoLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  // Chaves salvas nesta montagem da tela (vencem sobre props.dados nas chaves tocadas).
  const salvosLocais = useRef<Record<string, unknown>>({})
  const [dosagemId, setDosagemId] = useState(() => (typeof dados.dosagem_id === 'string' ? dados.dosagem_id : ''))

  function salvarSecao(chave: string, dadosDaSecao: Record<string, unknown>) {
    salvosLocais.current = { ...salvosLocais.current, [chave]: dadosDaSecao }
    // SEMPRE envia o objeto COMPLETO (a mutação da página substitui o jsonb inteiro).
    salvarDados({ ...dados, ...salvosLocais.current })
  }

  // Vincular/desvincular salva na hora, pelo MESMO caminho merge-safe das seções
  // (dosagem_id é só mais uma chave de topo do jsonb; null = sem projeto vinculado).
  function vincularDosagem(id: string) {
    setDosagemId(id)
    salvosLocais.current = { ...salvosLocais.current, dosagem_id: id || null }
    salvarDados({ ...dados, ...salvosLocais.current })
  }

  // Lista de dosagens para o vínculo: sempre a revisão mais recente de cada família
  // de projeto (família = coalesce(projeto_pai_id, id)) — mesma regra do CAUQ diário.
  const { data: dosagens } = useQuery({
    queryKey: ['dosagens-vinculo-lab'],
    queryFn: async () => {
      const { data, error } = await supabase.from('dosagens')
        .select('id, nome, revisao, projeto_pai_id').eq('ativa', true)
      if (error) throw error
      const rows = (data ?? []) as DosagemLinha[]
      const porFamilia = new Map<string, DosagemLinha>()
      for (const d of rows) {
        const familia = String(d.projeto_pai_id ?? d.id)
        const atual = porFamilia.get(familia)
        if (!atual || Number(d.revisao ?? 0) > Number(atual.revisao ?? 0)) porFamilia.set(familia, d)
      }
      return [...porFamilia.values()]
    },
  })

  // Dosagem vinculada (nome + faixas da especificação p/ a curva da mistura).
  const { data: vinculada } = useDosagemFaixas(dosagemId || undefined)

  // O ensaio pode apontar para uma revisão de projeto já superada (congelada) —
  // o dropdown precisa incluí-la senão a seleção atual "some" da lista.
  const opcoes = useMemo(() => {
    const base = dosagens ?? []
    if (dosagemId && vinculada && !base.some(d => d.id === dosagemId)) {
      return [...base, { id: vinculada.id, nome: vinculada.nome, revisao: vinculada.revisao, projeto_pai_id: null }]
    }
    return base
  }, [dosagens, dosagemId, vinculada])

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded">
        Ensaio CBUQ <b>completo</b>: todas as seções abaixo pertencem a este mesmo ensaio e saem
        agregadas num único laudo/PDF. Cada seção salva de forma independente — salvar uma não
        apaga as demais.
      </p>

      <section className="bg-white p-4 rounded-xl shadow-sm space-y-2">
        <label className="text-sm block sm:w-1/2">Dosagem / Projeto (opcional)
          <select className="border rounded p-2 w-full" value={dosagemId} disabled={!podeEditar || salvando}
            onChange={e => vincularDosagem(e.target.value)}>
            <option value="">— sem projeto vinculado —</option>
            {opcoes.map(d => (
              <option key={d.id} value={d.id}>{d.nome} — Rev. {d.revisao ?? 0}</option>
            ))}
          </select>
        </label>
        {dosagemId && vinculada && (
          <p className="text-sm text-green-700">
            Projeto vinculado: <b>{vinculada.nome} — Rev. {vinculada.revisao ?? 0}</b>
            {vinculada.especificacao
              ? ' — a curva da mistura mostra as faixas de especificação e de trabalho.'
              : ' — a especificação deste projeto não tem peneiras cadastradas.'}
          </p>
        )}
        {!dosagemId && (
          <p className="text-xs text-slate-500">
            Vincular um projeto traz a especificação: a granulometria da mistura passa a mostrar
            a faixa de especificação e a faixa de trabalho (projeto ± tolerância), como no ensaio diário.
          </p>
        )}
      </section>

      {SECOES_CBUQ_COMPLETO.map(chave => {
        const Formulario = FORMULARIOS_SECAO[chave]
        const dadosSecao = (dados[chave] as Record<string, unknown> | undefined) ?? {}
        return (
          <section key={chave} className="space-y-2">
            <h2 className="font-semibold text-lg text-grp-700 border-b border-grp-600 pb-1">
              {ROTULO_TIPO_ENSAIO[chave]}
            </h2>
            {chave === 'granulometria_mistura' ? (
              // Única seção que consome as faixas do projeto vinculado (prop extra
              // opcional — os demais formulários mantêm a assinatura comum).
              <GranulometriaMisturaLabForm
                dados={dadosSecao}
                podeEditar={podeEditar}
                salvando={salvando}
                salvarDados={d => salvarSecao(chave, d)}
                erro={erro}
                salvo={salvo}
                especificacao={vinculada?.especificacao ?? undefined}
              />
            ) : (
              <Formulario
                dados={dadosSecao}
                podeEditar={podeEditar}
                salvando={salvando}
                salvarDados={d => salvarSecao(chave, d)}
                erro={erro}
                salvo={salvo}
              />
            )}
          </section>
        )
      })}

      {/* Resultados consolidados na TELA (como no laudo impresso): tabelas
          analíticas + gráfico granulométrico, reusando os MESMOS componentes de
          AnaliticoCbuq que o laudo imprime. Fonte: props.dados (verdade do
          servidor, reconsultada após cada save) — caminho simples e honesto:
          a seção atualiza depois de salvar cada bloco ("conforme salvo"), sem
          espelhar digitação ao vivo. salvosLocais é ref (não re-renderiza), por
          isso NÃO entra aqui. Seções ausentes são puladas pelo próprio
          CbuqCompletoLaudo. */}
      <section className="space-y-2">
        <h2 className="font-semibold text-lg text-grp-700 border-b border-grp-600 pb-1">
          Resultados do ensaio (analítico)
        </h2>
        <div className="bg-white p-4 rounded-xl shadow-sm text-sm">
          <p className="text-xs text-slate-500 mb-3">
            Visão consolidada dos resultados <b>conforme salvo</b> — igual ao laudo impresso.
            Salve cada seção acima para atualizar; a granulometria usa as faixas do projeto vinculado.
          </p>
          {SECOES_CBUQ_COMPLETO.some(chave => {
            const s = dados[chave] as Record<string, unknown> | undefined
            return !!s && Object.keys(s).length > 0
          }) ? (
            <CbuqCompletoLaudo dados={dados} especificacao={vinculada?.especificacao ?? undefined} />
          ) : (
            <p className="text-sm text-slate-500">Nenhuma seção salva ainda — os resultados aparecem aqui após o primeiro salvamento.</p>
          )}
        </div>
      </section>
    </div>
  )
}
