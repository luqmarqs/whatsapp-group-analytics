import { useEffect, useState, FormEvent } from 'react'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import Badge from '../components/Badge'
import { api, Task, Group } from '../lib/api'

function priorityVariant(p: string): 'red' | 'yellow' | 'blue' | 'gray' {
  if (p === 'high')   return 'red'
  if (p === 'medium') return 'yellow'
  return 'gray'
}

function statusVariant(s: string): 'green' | 'blue' | 'gray' | 'red' {
  if (s === 'done')        return 'green'
  if (s === 'in_progress') return 'blue'
  if (s === 'skipped')     return 'red'
  return 'gray'
}

export default function Tasks() {
  const [tasks, setTasks]   = useState<Task[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', due_date: '', priority: 'medium', group_ids: [] as string[] })

  const loadTasks = () =>
    api.get<Task[]>('/whatsapp/tasks').then(setTasks).finally(() => setLoading(false))

  useEffect(() => {
    loadTasks()
    api.get<Group[]>('/whatsapp/groups').then(setGroups)
  }, [])

  const toggleGroup = (gid: string) => {
    setForm((f) => ({
      ...f,
      group_ids: f.group_ids.includes(gid)
        ? f.group_ids.filter((g) => g !== gid)
        : [...f.group_ids, gid],
    }))
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    await api.post('/whatsapp/tasks', form)
    setShowForm(false)
    setForm({ title: '', description: '', due_date: '', priority: 'medium', group_ids: [] })
    loadTasks()
  }

  const updateStatus = async (taskId: string, groupId: string, status: string) => {
    await api.patch(`/whatsapp/tasks/${taskId}`, { status, group_id: groupId })
    loadTasks()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Tarefas de mobilização</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={14} />
          Nova tarefa
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Nova tarefa</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prioridade</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data limite</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Grupos ({form.group_ids.length} selecionados)</label>
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                  <input type="checkbox" checked={form.group_ids.includes(g.id)} onChange={() => toggleGroup(g.id)} className="rounded" />
                  {g.name ?? g.group_jid}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors">
              Criar
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 text-sm px-4 py-1.5 hover:text-gray-700">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {loading ? (
          <p className="text-gray-500 text-sm">Carregando…</p>
        ) : tasks.map((t) => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === t.id ? null : t.id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Badge variant={priorityVariant(t.priority)}>{t.priority}</Badge>
                <span className="text-sm font-medium text-gray-800">{t.title}</span>
                {t.due_date && (
                  <span className="text-xs text-gray-400">até {new Date(t.due_date).toLocaleDateString('pt-BR')}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{t.group_statuses.filter((s) => s.status === 'done').length}/{t.group_statuses.length} grupos</span>
                {expanded === t.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {expanded === t.id && t.group_statuses.length > 0 && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {t.group_statuses.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-sm text-gray-700">{s.group_name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                      <select
                        value={s.status}
                        onChange={(e) => updateStatus(t.id, s.group_id, e.target.value)}
                        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        <option value="pending">pending</option>
                        <option value="in_progress">in_progress</option>
                        <option value="done">done</option>
                        <option value="skipped">skipped</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
