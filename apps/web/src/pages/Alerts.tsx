import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCircle, AlertTriangle, Info, Zap, VolumeX, TrendingDown, TrendingUp } from 'lucide-react'
import Badge from '../components/Badge'
import { api, Alert } from '../lib/api'
import { useInstanceFilter } from '../contexts/InstanceFilterContext'

const ALERT_INFO: Record<string, { label: string; desc: string; icon: React.ElementType }> = {
  silent_3d:       { label: 'Silêncio 3 dias',    desc: 'Sem mensagens por 3 dias',               icon: VolumeX },
  silent_7d:       { label: 'Silêncio 7 dias',    desc: 'Sem mensagens por 7 dias',               icon: VolumeX },
  activity_spike:  { label: 'Pico de atividade',  desc: 'Volume muito acima do normal',            icon: Zap },
  activity_drop:   { label: 'Queda de atividade', desc: 'Volume muito abaixo do normal',           icon: TrendingDown },
  viral_link:      { label: 'Link viral',          desc: 'Link compartilhado muitas vezes',         icon: TrendingUp },
}

function severityVariant(s: string): 'red' | 'yellow' | 'blue' {
  if (s === 'critical') return 'red'
  if (s === 'warning')  return 'yellow'
  return 'blue'
}

function fmt(date: string) {
  return new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Alerts() {
  const { selectedInstanceId } = useInstanceFilter()
  const [alerts, setAlerts]         = useState<Alert[]>([])
  const [loading, setLoading]       = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (unreadOnly) params.set('unread', 'true')
    if (selectedInstanceId) params.set('instance_id', selectedInstanceId)
    const qs = params.toString()
    api.get<Alert[]>(`/whatsapp/alerts${qs ? `?${qs}` : ''}`).then(setAlerts).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [unreadOnly, selectedInstanceId]) // eslint-disable-line

  const markRead = async (id: string) => {
    await api.patch(`/whatsapp/alerts/${id}/read`, {})
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)))
  }

  const unreadCount = alerts.filter((a) => !a.is_read).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Alertas</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Notificações automáticas geradas diariamente para grupos monitorados —
          silêncio prolongado, picos de atividade, links virais e quedas bruscas.
        </p>
      </div>

      {/* Legenda dos tipos */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {Object.entries(ALERT_INFO).map(([key, { label, desc, icon: Icon }]) => (
          <div key={key} className="bg-white border border-gray-100 rounded-lg p-2.5 flex items-start gap-2">
            <Icon size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-gray-700">{label}</p>
              <p className="text-[10px] text-gray-400 leading-tight">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          {unreadCount > 0 && (
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
              {unreadCount} não {unreadCount === 1 ? 'lido' : 'lidos'}
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)} className="rounded" />
          Apenas não lidos
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500 text-sm">Carregando…</p>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Bell size={32} className="mx-auto text-gray-200" />
            <p className="text-sm font-medium text-gray-500">Nenhum alerta encontrado</p>
            <p className="text-xs text-gray-400">
              {unreadOnly
                ? 'Tente desmarcar o filtro de não lidos.'
                : <>Alertas são gerados às 01h15 UTC. Verifique se há{' '}
                    <Link to="/whatsapp/groups" className="text-indigo-500 hover:underline">grupos monitorados</Link>.</>
              }
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {alerts.map((a) => {
              const info = ALERT_INFO[a.alert_type]
              const Icon = info?.icon ?? AlertTriangle
              return (
                <li key={a.id}
                  className={`flex items-start gap-3 px-5 py-4 hover:bg-gray-50 transition-colors ${a.is_read ? 'opacity-60' : ''}`}>
                  <Icon size={15} className={
                    a.severity === 'critical' ? 'text-red-400 mt-0.5 shrink-0' :
                    a.severity === 'warning'  ? 'text-yellow-400 mt-0.5 shrink-0' :
                    'text-blue-400 mt-0.5 shrink-0'
                  } />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant={severityVariant(a.severity)}>
                        {info?.label ?? a.alert_type.replace(/_/g, ' ')}
                      </Badge>
                      {!a.is_read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                    </div>
                    <p className="text-sm text-gray-800">{a.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <Link to={`/whatsapp/groups/${a.group_id}`}
                        className="hover:text-indigo-500 hover:underline">{a.group_name}</Link>
                      {' · '}{fmt(a.created_at)}
                    </p>
                  </div>
                  {!a.is_read && (
                    <button onClick={() => markRead(a.id)}
                      className="text-gray-300 hover:text-green-500 transition-colors mt-0.5 shrink-0"
                      title="Marcar como lido">
                      <CheckCircle size={16} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
