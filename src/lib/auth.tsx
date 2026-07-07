import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthCtx {
  user: User | null
  carregando: boolean
  perfis: Record<string, string>   // modulo -> papel
  sair: () => Promise<void>
}
const Ctx = createContext<AuthCtx>({ user: null, carregando: true, perfis: {}, sair: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [perfis, setPerfis] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) { setPerfis({}); setCarregando(false); return }
    let atual = true
    supabase.from('perfis_acesso').select('modulo, papel').then(({ data, error }) => {
      if (!atual) return
      if (error) {
        console.error('Falha ao carregar perfis de acesso:', error.message)
        setPerfis({})
      } else {
        setPerfis(Object.fromEntries((data ?? []).map(p => [p.modulo, p.papel])))
      }
      setCarregando(false)
    })
    return () => { atual = false }
  }, [user])

  return <Ctx.Provider value={{ user, carregando, perfis, sair: () => supabase.auth.signOut().then(() => {}) }}>{children}</Ctx.Provider>
}
export const useAuth = () => useContext(Ctx)

const HIERARQUIA = ['leitura', 'lancador', 'avaliador', 'admin']
export function podeNoModulo(perfis: Record<string, string>, modulo: string, papelMinimo: string): boolean {
  const papel = perfis[modulo]
  return !!papel && HIERARQUIA.indexOf(papel) >= HIERARQUIA.indexOf(papelMinimo)
}
