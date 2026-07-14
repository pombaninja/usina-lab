import { useRef } from 'react'
import type { FormEnsaioLabProps } from './tipos'
import { ROTULO_TIPO_ENSAIO, SECOES_CBUQ_COMPLETO } from './tipos'
import MarshallLabForm from './MarshallLabForm'
import TeorBetumeLabForm from './TeorBetumeLabForm'
import GranulometriaMisturaLabForm from './GranulometriaMisturaLabForm'
import RtdLabForm from './RtdLabForm'
import RiceDmtLabForm from './RiceDmtLabForm'

// Ensaio CBUQ COMPLETO (composto): um único ensaios_lab reúne TODOS os ensaios de
// CBUQ — Marshall, teor de betume, granulometria da mistura, RTD e Rice/DMT — e o
// laudo imprime tudo agregado num PDF só. dados jsonb = { marshall?, teor_betume?,
// granulometria_mistura?, rtd?, rice_dmt? }, onde cada chave guarda EXATAMENTE o
// sub-shape que o formulário individual já persiste (nenhum filho foi alterado).
//
// SEGURANÇA DO MERGE: a mutação da página SUBSTITUI ensaios_lab.dados inteiro pelo
// que recebe (EnsaioLabPage.salvar). Salvar uma seção NUNCA pode apagar as irmãs
// (lição do data-loss entre telas: merge, nunca replace de siblings). Estratégia:
// `salvosLocais` (ref) acumula só as seções salvas NESTA sessão de tela; cada save
// envia { ...props.dados, ...salvosLocais.current, [chave]: dadosDaSecao }.
// - props.dados é a verdade do servidor (query ['ensaio-lab', id], reconsultada
//   após cada save) — preserva seções gravadas fora desta montagem;
// - salvosLocais vence sobre props.dados para as chaves tocadas aqui, o que fecha
//   a corrida de dois saves rápidos: se o refetch do 1º save ainda não voltou,
//   props.dados está defasado, mas a ref já carrega a seção recém-salva.
// Não há outro escritor concorrente na mesma tela, então a união é sempre >= servidor.

const FORMULARIOS_SECAO = {
  marshall: MarshallLabForm,
  teor_betume: TeorBetumeLabForm,
  granulometria_mistura: GranulometriaMisturaLabForm,
  rtd: RtdLabForm,
  rice_dmt: RiceDmtLabForm,
} as const

export default function CbuqCompletoLabForm({ dados, podeEditar, salvando, salvarDados, erro, salvo }: FormEnsaioLabProps) {
  // Seções salvas nesta montagem da tela (vencem sobre props.dados nas chaves tocadas).
  const salvosLocais = useRef<Record<string, unknown>>({})

  function salvarSecao(chave: string, dadosDaSecao: Record<string, unknown>) {
    salvosLocais.current = { ...salvosLocais.current, [chave]: dadosDaSecao }
    // SEMPRE envia o objeto COMPLETO (a mutação da página substitui o jsonb inteiro).
    salvarDados({ ...dados, ...salvosLocais.current })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded">
        Ensaio CBUQ <b>completo</b>: todas as seções abaixo pertencem a este mesmo ensaio e saem
        agregadas num único laudo/PDF. Cada seção salva de forma independente — salvar uma não
        apaga as demais.
      </p>
      {SECOES_CBUQ_COMPLETO.map(chave => {
        const Formulario = FORMULARIOS_SECAO[chave]
        return (
          <section key={chave} className="space-y-2">
            <h2 className="font-semibold text-lg text-grp-700 border-b border-grp-600 pb-1">
              {ROTULO_TIPO_ENSAIO[chave]}
            </h2>
            <Formulario
              dados={(dados[chave] as Record<string, unknown> | undefined) ?? {}}
              podeEditar={podeEditar}
              salvando={salvando}
              salvarDados={d => salvarSecao(chave, d)}
              erro={erro}
              salvo={salvo}
            />
          </section>
        )
      })}
    </div>
  )
}
