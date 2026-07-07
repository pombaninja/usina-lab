import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setErro('E-mail ou senha inválidos')
  }

  if (user) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={entrar} className="bg-white p-8 rounded-xl shadow w-96 space-y-4">
        <h1 className="text-xl font-bold text-slate-800">Usina & Laboratório — GRP</h1>
        <input className="w-full border rounded p-2" placeholder="E-mail" type="email"
               value={email} onChange={e => setEmail(e.target.value)} required />
        <input className="w-full border rounded p-2" placeholder="Senha" type="password"
               value={senha} onChange={e => setSenha(e.target.value)} required />
        {erro && <p className="text-red-600 text-sm">{erro}</p>}
        <button className="w-full bg-blue-700 text-white rounded p-2 font-semibold">Entrar</button>
      </form>
    </div>
  )
}
