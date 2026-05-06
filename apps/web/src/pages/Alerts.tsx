import { useEffect, useState } from 'react'
import { Bell, CheckCircle } from 'lucide-react'
import Badge from '../components/Badge'
import { api, Alert } from '../lib/api'

function severityVariant(s: string): 'red' | 'yellow' | 'blue' | 'gray' {
  if (s === 'critical') return 'red'
  if (s === 'warning')  return 'yellow'
  if (s === 'info')     return 'blue'
  return 'gray'
}

function fmt(date: string) {
  return new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = () => {
    setLoading(true)
    const q = unreadOnly ? '?unread=true' : ''
    api.get<Alert[]>(`/whatsapp/alerts${q}`).then(setAlerts).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [unreadOnly]) // eslint-disable-line

  const markRead = async (id: string) => {
    await api.patch(`/whatsapp/alerts/${id}/read`, {})
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Alertas</h1>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded"
          />
          Apenas não lidos
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500 text-sm">Carregando…</p>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Bell size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum alerta encontrado</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={`flex items-start gap-3 px-5 py-4 ${a.is_read ? 'opacity-60' : ''}`}
              >
                <div className="mt-0.5">
                  <Badge variant={severityVariant(a.severity)}>{a.alert_type}</Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{a.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {a.group_name} · {fmt(a.created_at)}
                  </p>
                </div>
                {!a.is_read && (
                  <button
                    onClick={() => markRead(a.id)}
                    className="text-gray-400 hover:text-green-600 transition-colors mt-0.5 flex-shrink-0"
                    title="Marcar como lido"
                  >
                    <CheckCircle size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
