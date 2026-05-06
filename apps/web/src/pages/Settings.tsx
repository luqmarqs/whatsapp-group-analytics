import { FormEvent, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

export default function Settings() {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('')
    setErr('')
    try {
      await api.patch('/auth/me', { name, current_password: currentPwd || undefined, new_password: newPwd || undefined })
      setMsg('Salvo com sucesso!')
      setCurrentPwd('')
      setNewPwd('')
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Configurações</h1>

      <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
        {msg && <p className="text-sm text-green-600 bg-green-50 rounded px-3 py-2">{msg}</p>}
        {err && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{err}</p>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
          <input
            type="email"
            value={user?.email}
            disabled
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <hr className="border-gray-100" />
        <p className="text-xs text-gray-500">Alterar senha (deixe em branco para manter a atual)</p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
          <input
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg py-2 text-sm transition-colors"
        >
          Salvar
        </button>
      </form>
    </div>
  )
}
