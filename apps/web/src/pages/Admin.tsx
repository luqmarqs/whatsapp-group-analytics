import { useEffect, useState, useCallback } from 'react'
import {
  Users, Server, Plus, Trash2, Play, Square, RefreshCw, Eye, EyeOff, Shield, Smartphone,
} from 'lucide-react'
import { api, AdminUser, Instance, InstanceQR } from '../lib/api'
import Badge from '../components/Badge'

// ── helpers ──────────────────────────────────────────────────────────────────
function Tab({ label, icon: Icon, active, onClick }: {
  label: string; icon: React.ElementType; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-indigo-600 text-indigo-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      <Icon size={15} />{label}
    </button>
  )
}

// ── Users tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers]       = useState<AdminUser[]>([])
  const [instances, setInstances] = useState<Instance[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ email: '', name: '', password: '', role: 'viewer' as 'admin' | 'viewer' })
  const [showPwd, setShowPwd]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [creating, setCreating] = useState<string | null>(null) // user_id being created instance for

  const load = useCallback(async () => {
    const [u, i] = await Promise.all([
      api.get<AdminUser[]>('/admin/users'),
      api.get<Instance[]>('/admin/instances'),
    ])
    setUsers(u); setInstances(i)
  }, [])
  useEffect(() => { load() }, [load])

  function hasInstance(userId: string) {
    return instances.some((i) => i.user_email && users.find((u) => u.id === userId)?.email === i.user_email)
  }

  async function createInstance(user: AdminUser) {
    if (!confirm(`Criar instância WhatsApp para ${user.name}?`)) return
    setCreating(user.id)
    const slug = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)
    const name = `user-${slug}-${user.id.slice(0, 6)}`
    try {
      await api.post('/admin/instances', { name, user_id: user.id })
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao criar instância')
    } finally { setCreating(null) }
  }

  async function create() {
    setSaving(true); setError('')
    try {
      await api.post('/admin/users', form)
      setShowForm(false)
      setForm({ email: '', name: '', password: '', role: 'viewer' })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally { setSaving(false) }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remover usuário "${name}"?`)) return
    try { await api.delete(`/admin/users/${id}`); load() }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro') }
  }

  async function toggleRole(user: AdminUser) {
    const newRole = user.role === 'admin' ? 'viewer' : 'admin'
    try { await api.patch(`/admin/users/${user.id}`, { role: newRole }); load() }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro') }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg"
        >
          <Plus size={14} /> Novo usuário
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Criar usuário</h3>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Nome"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="E-mail" type="email"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <div className="relative">
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-9"
                placeholder="Senha (mín. 8 chars)"
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'viewer' })}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancelar</button>
            <button onClick={create} disabled={saving}
              className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg">
              {saving ? 'Criando…' : 'Criar'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nome</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">E-mail</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Criado em</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleRole(u)} title="Clique para alternar role">
                    <Badge variant={u.role === 'admin' ? 'red' : 'blue'}>
                      {u.role === 'admin' ? <Shield size={10} className="inline mr-1" /> : null}{u.role}
                    </Badge>
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(u.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                  {!hasInstance(u.id) && (
                    <button
                      onClick={() => createInstance(u)}
                      disabled={creating === u.id}
                      title="Criar instância WhatsApp para este usuário"
                      className="text-xs flex items-center gap-1 text-indigo-500 hover:text-indigo-700 disabled:opacity-40"
                    >
                      {creating === u.id
                        ? <RefreshCw size={12} className="animate-spin" />
                        : <Smartphone size={12} />}
                      Criar instância
                    </button>
                  )}
                  <button onClick={() => remove(u.id, u.name)}
                    className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Instances tab ─────────────────────────────────────────────────────────────
function InstancesTab() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [users, setUsers]         = useState<AdminUser[]>([])
  const [qrMap, setQrMap]         = useState<Record<string, InstanceQR>>({})
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ name: '', user_id: '' })
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    const [list, userList] = await Promise.all([
      api.get<Instance[]>('/admin/instances'),
      api.get<AdminUser[]>('/admin/users'),
    ])
    setInstances(list)
    setUsers(userList)
  }, [])

  useEffect(() => { load() }, [load])

  // Poll status + QR every 5s for non-connected instances
  useEffect(() => {
    const pending = instances.filter((i) => i.status !== 'connected')
    if (pending.length === 0) return
    const interval = setInterval(async () => {
      let changed = false
      for (const inst of pending) {
        try {
          const qr = await api.get<InstanceQR>(`/admin/instances/${inst.id}/qr`)
          setQrMap((prev) => ({ ...prev, [inst.id]: qr }))
          if (qr.status === 'connected') changed = true
        } catch { /* ignore */ }
      }
      if (changed) load() // refresh full list when any instance connects
    }, 5_000)
    return () => clearInterval(interval)
  }, [instances, load])

  async function create() {
    setSaving(true); setError('')
    try {
      await api.post('/admin/instances', {
        name: form.name,
        ...(form.user_id ? { user_id: form.user_id } : {}),
      })
      setShowForm(false); setForm({ name: '', user_id: '' }); load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro') }
    finally { setSaving(false) }
  }

  async function stop(id: string) {
    try { await api.post(`/admin/instances/${id}/stop`, {}); load() }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro') }
  }

  async function start(id: string) {
    try { await api.post(`/admin/instances/${id}/start`, {}); load() }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro') }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remover instância "${name}" e parar o container?`)) return
    try { await api.delete(`/admin/instances/${id}`); load() }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro') }
  }

  const statusColor = (s: Instance['container_status']) =>
    s === 'running' ? 'green' : s === 'stopped' ? 'yellow' : 'red'

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg">
          <Plus size={14} /> Nova instância
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Criar instância</h3>
          <p className="text-xs text-gray-400">Nome: apenas letras minúsculas, números e hífens. Ex: <code>conta-sp</code></p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="nome-da-instancia"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
              value={form.user_id}
              onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}>
              <option value="">— Atribuir ao meu usuário (admin) —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-1.5">Cancelar</button>
            <button onClick={create} disabled={saving || !form.name}
              className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg">
              {saving ? 'Criando…' : 'Criar e iniciar'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {instances.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma instância criada ainda.</p>
        )}
        {instances.map((inst) => {
          const qr = qrMap[inst.id]
          return (
            <div key={inst.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-800">{inst.name}</span>
                    <Badge variant={inst.status === 'connected' ? 'green' : 'yellow'}>
                      {inst.status === 'connected' ? 'conectado' : 'desconectado'}
                    </Badge>
                    <Badge variant={statusColor(inst.container_status) as 'green' | 'yellow' | 'red'}>
                      container: {inst.container_status}
                    </Badge>
                  </div>
                  {inst.jid && <p className="text-xs text-gray-400">JID: {inst.jid}</p>}
                  {inst.user_name && <p className="text-xs text-gray-400">Usuário: {inst.user_name} ({inst.user_email})</p>}
                  {inst.container_name && <p className="text-xs text-gray-400 font-mono">{inst.container_name}</p>}
                </div>
                <div className="flex gap-2">
                  {inst.container_status === 'running' ? (
                    <button onClick={() => stop(inst.id)} title="Parar container"
                      className="p-2 text-yellow-500 hover:bg-yellow-50 rounded-lg transition-colors">
                      <Square size={15} />
                    </button>
                  ) : inst.container_status === 'stopped' ? (
                    <button onClick={() => start(inst.id)} title="Iniciar container"
                      className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-colors">
                      <Play size={15} />
                    </button>
                  ) : null}
                  <button onClick={() => load()} title="Atualizar"
                    className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg transition-colors">
                    <RefreshCw size={15} />
                  </button>
                  <button onClick={() => remove(inst.id, inst.name)} title="Remover instância"
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {inst.status !== 'connected' && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {qr?.qr ? (
                    <div className="flex items-center gap-4">
                      <img src={qr.qr} alt="QR code" className="w-40 h-40 border border-gray-200 rounded-lg" />
                      <p className="text-xs text-gray-500">
                        Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo e escaneie.<br />
                        <span className="text-gray-400">O QR expira em 2 minutos e atualiza automaticamente.</span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">
                      {inst.container_status === 'running'
                        ? 'Aguardando QR code… pode levar alguns segundos.'
                        : 'Inicie o container para gerar o QR code.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState<'users' | 'instances'>('instances')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Administração</h1>
        <p className="text-xs text-gray-400 mt-0.5">Gerenciamento de usuários e instâncias WhatsApp</p>
      </div>

      <div className="border-b border-gray-200 flex gap-0">
        <Tab label="Instâncias" icon={Server}  active={tab === 'instances'} onClick={() => setTab('instances')} />
        <Tab label="Usuários"   icon={Users}   active={tab === 'users'}    onClick={() => setTab('users')} />
      </div>

      {tab === 'instances' ? <InstancesTab /> : <UsersTab />}
    </div>
  )
}
