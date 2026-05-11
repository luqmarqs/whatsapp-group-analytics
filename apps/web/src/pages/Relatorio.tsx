import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, MessageSquare, UserPlus, UserMinus, Activity,
  TrendingUp, TrendingDown, Play, RefreshCw, AlertTriangle, Link2,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { api, Overview, Activity as ActivityType, TopGroup, Alert, Link as LinkType } from '../lib/api'
import Badge from '../components/Badge'

function fmt(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function KpiMini({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: number | string; sub?: string
  icon: React.ElementType; color: string
}) {
  const colors: Record<string, string> = {
    blue: 'text-blue-500 bg-blue-50',
    green: 'text-green-500 bg-green-50',
    red: 'text-red-500 bg-red-50',
    yellow: 'text-yellow-500 bg-yellow-50',
    purple: 'text-purple-500 bg-purple-50',
    gray: 'text-gray-500 bg-gray-50',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
      <div className={`p-2 rounded-lg ${colors[color]}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

export default function Relatorio() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [activity, setActivity] = useState<ActivityType[]>([])
  const [topGroups, setTopGroups] = useState<TopGroup[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [links, setLinks] = useState<LinkType[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ov, act, top, al, lk] = await Promise.all([
        api.get<Overview>('/whatsapp/overview'),
        api.get<ActivityType[]>('/whatsapp/activity?days=30'),
        api.get<TopGroup[]>('/whatsapp/top-groups?days=30'),
        api.get<Alert[]>('/whatsapp/alerts'),
        api.get<LinkType[]>('/whatsapp/links'),
      ])
      setOverview(ov); setActivity(act); setTopGroups(top)
      setAlerts(al); setLinks(lk)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function runJobs() {
    setRunning(true); setRunMsg('')
    try {
      const res = await api.post<{ message: string }>('/admin/run-jobs', {})
      setRunMsg(res.message)
      setTimeout(() => { load(); setRunMsg('') }, 4_000)
    } catch (e: unknown) {
      setRunMsg(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setRunning(false)
    }
  }

  const actFmt = activity.map((d) => ({
    ...d,
    date: fmt(d.date),
    message_count: Number(d.message_count),
    join_count: Number(d.join_count),
    leave_count: Number(d.leave_count),
  }))

  const byMessages  = [...topGroups].sort((a, b) => b.messages_period - a.messages_period).slice(0, 10)
  const byGrowth    = [...topGroups].sort((a, b) => b.net_growth_period - a.net_growth_period).slice(0, 5)
  const byShrinkage = [...topGroups].sort((a, b) => a.net_growth_period - b.net_growth_period).slice(0, 5)
  const topDomains  = Object.values(
    links.reduce<Record<string, { domain: string; count: number }>>((acc, l) => {
      acc[l.domain] = acc[l.domain]
        ? { ...acc[l.domain], count: acc[l.domain].count + l.count }
        : { domain: l.domain, count: l.count }
      return acc
    }, {}),
  ).sort((a, b) => b.count - a.count).slice(0, 8)

  const totalMessages30d = activity.reduce((s, d) => s + Number(d.message_count), 0)
  const totalJoins30d    = activity.reduce((s, d) => s + Number(d.join_count), 0)
  const totalLeaves30d   = activity.reduce((s, d) => s + Number(d.leave_count), 0)

  if (loading) return <p className="text-gray-500">Carregando relatório…</p>
  if (!overview) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Relatório Geral</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Gerado em {new Date(overview.generated_at).toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {runMsg && <p className="text-xs text-green-600 max-w-xs text-right">{runMsg}</p>}
          <button
            onClick={runJobs}
            disabled={running}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? 'Executando…' : 'Rodar métricas agora'}
          </button>
        </div>
      </div>

      {/* KPIs gerais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiMini label="Total de grupos"    value={overview.total_groups}  icon={Users}        color="blue" />
        <KpiMini label="Ativos hoje"         value={overview.active_today}  icon={Activity}     color="green" />
        <KpiMini label="Silenciosos 3d"      value={overview.silent_3d}     icon={AlertTriangle} color="yellow" />
        <KpiMini label="Silenciosos 7d"      value={overview.silent_7d}     icon={AlertTriangle} color="red" />
        <KpiMini label="Msgs (últimas 24h)"  value={overview.messages_24h}  icon={MessageSquare} color="blue"
          sub={`${totalMessages30d.toLocaleString('pt-BR')} nos últimos 30d`} />
        <KpiMini label="Links (últimas 24h)" value={overview.links_24h}     icon={Link2}         color="gray" />
        <KpiMini label="Entradas 30d"        value={totalJoins30d}           icon={UserPlus}      color="green" />
        <KpiMini label="Saídas 30d"          value={totalLeaves30d}          icon={UserMinus}     color="red" />
      </div>

      {/* Atividade global 30d */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Atividade da rede — últimos 30 dias</h2>
        {actFmt.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={actFmt} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="msgG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Legend
                formatter={(v: string) => {
                  const l: Record<string, string> = { message_count: 'Mensagens', join_count: 'Entradas', leave_count: 'Saídas' }
                  return l[v] ?? v
                }}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Area type="monotone" dataKey="message_count" name="message_count" stroke="#22c55e" strokeWidth={2} fill="url(#msgG)" />
              <Area type="monotone" dataKey="join_count"    name="join_count"    stroke="#3b82f6" strokeWidth={1.5} fill="none" />
              <Area type="monotone" dataKey="leave_count"   name="leave_count"   stroke="#ef4444" strokeWidth={1.5} fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400">Sem dados de atividade ainda.</p>
        )}
      </div>

      {/* Rankings + Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Top grupos por mensagens */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Top grupos por mensagens (30d)</h2>
          {byMessages.length === 0 ? (
            <p className="text-sm text-gray-400">Sem dados.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={byMessages.map((g) => ({ name: (g.name ?? g.group_jid).slice(0, 22), msgs: g.messages_period }))}
                layout="vertical"
                margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="msgs" name="Mensagens" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Alertas recentes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Alertas recentes</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum alerta.</p>
          ) : (
            <ul className="space-y-2.5">
              {alerts.slice(0, 8).map((a) => (
                <li key={a.id} className="text-xs">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Badge variant={a.severity === 'critical' ? 'red' : a.severity === 'warning' ? 'yellow' : 'blue'}>
                      {a.alert_type.replace(/_/g, ' ')}
                    </Badge>
                    {!a.is_read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />}
                  </div>
                  <p className="text-gray-500 truncate">{a.group_name}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Crescimento / Queda + Top links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* Mais crescimento */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-green-500" /> Maior crescimento (30d)
          </h2>
          <ul className="space-y-2">
            {byGrowth.map((g, i) => (
              <li key={g.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                  <Link to={`/whatsapp/groups/${g.id}`} className="text-gray-700 hover:text-indigo-600 truncate max-w-[150px]">
                    {g.name ?? g.group_jid}
                  </Link>
                </span>
                <span className="text-green-600 font-semibold text-xs whitespace-nowrap">
                  +{g.net_growth_period}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Mais queda */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <TrendingDown size={14} className="text-red-500" /> Maior queda (30d)
          </h2>
          <ul className="space-y-2">
            {byShrinkage.map((g, i) => (
              <li key={g.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                  <Link to={`/whatsapp/groups/${g.id}`} className="text-gray-700 hover:text-indigo-600 truncate max-w-[150px]">
                    {g.name ?? g.group_jid}
                  </Link>
                </span>
                <span className="text-red-500 font-semibold text-xs whitespace-nowrap">
                  {g.net_growth_period}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Top domínios */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <Link2 size={14} className="text-purple-500" /> Domínios mais compartilhados
          </h2>
          <ul className="space-y-2">
            {topDomains.map((d, i) => (
              <li key={d.domain} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                  <span className="text-gray-700 truncate max-w-[150px]">{d.domain}</span>
                </span>
                <Badge variant="blue">{d.count}x</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Tabela completa dos grupos */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Todos os grupos — resumo (30d)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Grupo</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Membros</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Msgs 30d</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Ativos 30d</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Entradas</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Saídas</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {byMessages.concat(
                topGroups.filter((g) => !byMessages.find((b) => b.id === g.id))
              ).map((g, i) => (
                <tr key={g.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                  <td className="px-4 py-2.5">
                    <Link to={`/whatsapp/groups/${g.id}`} className="text-indigo-600 hover:underline font-medium truncate block max-w-[200px]">
                      {g.name ?? g.group_jid}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{g.member_count.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{g.messages_period.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{g.active_members_period}</td>
                  <td className="px-4 py-2.5 text-right text-green-600">{g.joins_period > 0 ? `+${g.joins_period}` : '—'}</td>
                  <td className="px-4 py-2.5 text-right text-red-500">{g.leaves_period > 0 ? `-${g.leaves_period}` : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">
                    <span className={g.net_growth_period > 0 ? 'text-green-600' : g.net_growth_period < 0 ? 'text-red-500' : 'text-gray-400'}>
                      {g.net_growth_period > 0 ? `+${g.net_growth_period}` : g.net_growth_period === 0 ? '—' : g.net_growth_period}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
