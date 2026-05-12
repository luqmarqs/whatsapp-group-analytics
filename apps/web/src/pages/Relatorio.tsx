import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, MessageSquare, UserPlus, UserMinus, TrendingUp, TrendingDown,
  Play, RefreshCw, AlertTriangle, Link2, Smartphone, Clock, Radio,
  Download, ListChecks,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import {
  api, Overview, Activity as ActivityType, TopGroup, Alert, Link as LinkType, PeakHour, Poll, PollVote,
} from '../lib/api'
import Badge from '../components/Badge'
import { useInstanceFilter } from '../contexts/InstanceFilterContext'
import { downloadPollVotesCsv } from '../lib/pollVotesCsv'

interface InstanceStatus { status: string; qr: string | null }
interface MonitoredMember {
  group_id: string
  group_name: string | null
  group_jid: string
  id: string
  role: string
  is_active: boolean
  joined_at: string | null
  left_at: string | null
  phone: string | null
  name: string | null
  raw_jid: string | null
  jid_server: string | null
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
function num(n: number) { return n.toLocaleString('pt-BR') }
function trend(cur: number, prev: number) {
  if (prev === 0) return null
  const pct = Math.round(((cur - prev) / prev) * 100)
  return pct
}

function csvText(value: string | number | null | undefined) {
  if (value == null) return ''
  const text = String(value)
  return /^[\d+@.-]+$/.test(text) ? `="${text}"` : text
}

function downloadGroupsReportCsv(topGroups: TopGroup[]) {
  const headers = [
    'Grupo',
    'JID do grupo',
    'Membros atuais',
    'Mensagens 30d',
    'Mensagens 7d',
    'Mensagens 7d anteriores',
    'Variação mensagens 7d (%)',
    'Entradas 30d',
    'Saídas 30d',
    'Saldo membros 30d',
    'Membros ativos no período',
    'Taxa de engajamento (%)',
    'Status',
  ]

  const rows = topGroups.map((g) => {
    const variation = trend(g.messages_7d, g.messages_prev7d)
    const status = g.messages_prev7d > 5 && g.messages_7d < g.messages_prev7d * 0.5
      ? 'Em risco'
      : g.messages_7d === 0
        ? 'Sem atividade 7d'
        : 'OK'

    return [
      g.name ?? '',
      csvText(g.group_jid),
      g.member_count,
      g.messages_period,
      g.messages_7d,
      g.messages_prev7d,
      variation ?? '',
      g.joins_period,
      g.leaves_period,
      g.net_growth_period,
      g.active_members_period,
      g.engagement_rate,
      status,
    ]
  })

  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')

  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `relatorio-grupos-monitorados-${stamp}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function downloadMonitoredMembersCsv(members: MonitoredMember[]) {
  const headers = [
    'Grupo',
    'JID do grupo',
    'Nome',
    'Telefone',
    'Identificador WhatsApp',
    'Tipo ID',
    'Papel',
    'Status',
    'Entrou em',
    'Saiu em',
  ]

  const rows = members.map((m) => [
    m.group_name ?? m.group_jid,
    csvText(m.group_jid),
    m.name ?? '',
    m.phone ? `="${m.phone}"` : '',
    m.raw_jid ? `="${m.raw_jid}"` : '',
    m.jid_server ?? '',
    m.role,
    m.is_active ? 'Ativo' : 'Inativo',
    m.joined_at ? new Date(m.joined_at).toLocaleDateString('pt-BR') : '',
    m.left_at ? new Date(m.left_at).toLocaleDateString('pt-BR') : '',
  ])

  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')

  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `contatos-grupos-monitorados-${stamp}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function KpiCard({
  label, value, sub, icon: Icon, accent, trend: trendPct,
}: {
  label: string; value: number | string; sub?: string
  icon: React.ElementType; accent: string; trend?: number | null
}) {
  const accents: Record<string, { bg: string; text: string; border: string }> = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-200' },
    green:  { bg: 'bg-green-50',  text: 'text-green-600',  border: 'border-green-200' },
    red:    { bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-200' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200' },
    gray:   { bg: 'bg-gray-50',   text: 'text-gray-600',   border: 'border-gray-200' },
  }
  const a = accents[accent] ?? accents.gray
  return (
    <div className={`bg-white rounded-xl border ${a.border} p-4 shadow-sm flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <div className={`p-1.5 rounded-lg ${a.bg}`}>
          <Icon size={14} className={a.text} />
        </div>
        {trendPct != null && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 ${trendPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {trendPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(trendPct)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{typeof value === 'number' ? num(value) : value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

export default function Relatorio() {
  const { selectedInstanceId } = useInstanceFilter()
  const [overview, setOverview]     = useState<Overview | null>(null)
  const [activity, setActivity]     = useState<ActivityType[]>([])
  const [topGroups, setTopGroups]   = useState<TopGroup[]>([])
  const [alerts, setAlerts]         = useState<Alert[]>([])
  const [links, setLinks]           = useState<LinkType[]>([])
  const [peakHours, setPeakHours]   = useState<PeakHour[]>([])
  const [polls, setPolls]           = useState<Poll[]>([])
  const [instance, setInstance]     = useState<InstanceStatus | null>(null)
  const [loading, setLoading]       = useState(true)
  const [running, setRunning]       = useState(false)
  const [downloadingMembers, setDownloadingMembers] = useState(false)
  const [loadingPollVotesId, setLoadingPollVotesId] = useState<string | null>(null)
  const [runMsg, setRunMsg]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const withInstance = (path: string, params: Record<string, string> = {}) => {
      const search = new URLSearchParams(params)
      if (selectedInstanceId) search.set('instance_id', selectedInstanceId)
      const qs = search.toString()
      return qs ? `${path}?${qs}` : path
    }
    try {
      const [ov, act, top, al, lk, ph, pollList, inst] = await Promise.allSettled([
        api.get<Overview>(withInstance('/whatsapp/overview')),
        api.get<ActivityType[]>(withInstance('/whatsapp/activity', { days: '30' })),
        api.get<TopGroup[]>(withInstance('/whatsapp/top-groups', { days: '30' })),
        api.get<Alert[]>(withInstance('/whatsapp/alerts')),
        api.get<LinkType[]>(withInstance('/whatsapp/links')),
        api.get<PeakHour[]>(withInstance('/whatsapp/peak-hours', { days: '7' })),
        api.get<Poll[]>(withInstance('/whatsapp/polls', { days: '30' })),
        api.get<InstanceStatus>(withInstance('/whatsapp/instance')),
      ])
      if (ov.status === 'fulfilled')       setOverview(ov.value)
      if (act.status === 'fulfilled')      setActivity(act.value)
      if (top.status === 'fulfilled')      setTopGroups(top.value)
      if (al.status === 'fulfilled')       setAlerts(al.value)
      if (lk.status === 'fulfilled')       setLinks(lk.value)
      if (ph.status === 'fulfilled')       setPeakHours(ph.value)
      if (pollList.status === 'fulfilled') setPolls(pollList.value)
      if (inst.status === 'fulfilled')     setInstance(inst.value)
    } finally { setLoading(false) }
  }, [selectedInstanceId])

  useEffect(() => { load() }, [load])

  async function runJobs() {
    setRunning(true); setRunMsg('')
    try {
      const res = await api.post<{ message: string }>(
        selectedInstanceId ? `/admin/run-jobs?instance_id=${encodeURIComponent(selectedInstanceId)}` : '/admin/run-jobs',
        {},
      )
      setRunMsg(res.message)
      setTimeout(() => { load(); setRunMsg('') }, 4_000)
    } catch (e: unknown) {
      setRunMsg(e instanceof Error ? e.message : 'Erro')
    } finally { setRunning(false) }
  }

  async function downloadAllMonitoredMembers() {
    if (downloadingMembers) return
    setDownloadingMembers(true)
    try {
      const qs = selectedInstanceId ? `?instance_id=${encodeURIComponent(selectedInstanceId)}` : ''
      const members = await api.get<MonitoredMember[]>(`/whatsapp/monitored-members${qs}`)
      downloadMonitoredMembersCsv(members)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao baixar contatos')
    } finally {
      setDownloadingMembers(false)
    }
  }

  async function downloadPollVotes(poll: Poll) {
    if (loadingPollVotesId) return
    setLoadingPollVotesId(poll.id)
    try {
      const qs = selectedInstanceId ? `?instance_id=${encodeURIComponent(selectedInstanceId)}` : ''
      const votes = await api.get<PollVote[]>(`/whatsapp/polls/${poll.id}/votes${qs}`)
      downloadPollVotesCsv(poll, votes)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao baixar votos da enquete')
    } finally {
      setLoadingPollVotesId(null)
    }
  }

  // ── derived ──────────────────────────────────────────────────────────────
  const actFmt = activity.map((d) => ({
    ...d, date: fmt(d.date),
    message_count: Number(d.message_count),
    join_count: Number(d.join_count),
    leave_count: Number(d.leave_count),
  }))

  const byMessages  = [...topGroups].sort((a, b) => b.messages_period - a.messages_period).slice(0, 10)
  const atRisk      = topGroups.filter((g) => g.messages_7d < g.messages_prev7d * 0.5 && g.messages_prev7d > 5)
                                .sort((a, b) => (a.messages_7d / Math.max(a.messages_prev7d, 1)) - (b.messages_7d / Math.max(b.messages_prev7d, 1)))
                                .slice(0, 5)
  const topGrowth   = [...topGroups].sort((a, b) => b.net_growth_period - a.net_growth_period).slice(0, 5)
  const topShrink   = [...topGroups].sort((a, b) => a.net_growth_period - b.net_growth_period).slice(0, 5)
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

  const peakHour = peakHours.length
    ? peakHours.reduce((max, h) => h.message_count > max.message_count ? h : max)
    : null
  const maxPeakCount = peakHours.length ? Math.max(...peakHours.map(h => h.message_count)) : 1

  const hasMonitoredGroups = topGroups.length > 0

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={20} className="animate-spin text-gray-400" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Relatório Geral</h1>
          {overview && (
            <p className="text-xs text-gray-400 mt-0.5">
              Atualizado em {new Date(overview.generated_at).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {runMsg && <p className="text-xs text-green-600 max-w-xs text-right">{runMsg}</p>}
          <button
            onClick={() => downloadGroupsReportCsv(topGroups)}
            disabled={topGroups.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-600 text-xs font-medium rounded-lg transition-colors shadow-sm"
          >
            <Download size={13} />
            Exportar resumo dos grupos
          </button>
          <button
            onClick={downloadAllMonitoredMembers}
            disabled={topGroups.length === 0 || downloadingMembers}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-600 text-xs font-medium rounded-lg transition-colors shadow-sm"
          >
            {downloadingMembers ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
            Exportar membros dos grupos
          </button>
          <button onClick={runJobs} disabled={running}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors shadow-sm">
            {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? 'Executando…' : 'Rodar métricas'}
          </button>
        </div>
      </div>

      {/* Banner: sem grupos monitorados */}
      {!hasMonitoredGroups && overview && (
        <Link to="/whatsapp/groups"
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
          <Users size={16} className="text-amber-500 shrink-0" />
          <span>
            <strong>Nenhum grupo monitorado.</strong> Vá em{' '}
            <span className="underline">Grupos → Gerenciar</span> para selecionar quais grupos deseja acompanhar.
            Os dados abaixo estarão zerados até que grupos sejam selecionados.
          </span>
        </Link>
      )}

      {/* Banner de conexão */}
      {instance && instance.status !== 'connected' && (
        <Link to="/whatsapp"
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
          <Smartphone size={16} className="text-amber-500 shrink-0" />
          <span>Sua instância WhatsApp está desconectada — clique aqui para reconectar.</span>
        </Link>
      )}

      {/* KPIs — linha 1: alcance */}
      {overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Total de grupos"     value={overview.total_groups}   icon={Users}        accent="indigo" />
            <KpiCard label="Membros únicos"      value={overview.unique_members} icon={Radio}        accent="purple"
              sub="alcance total monitorado" />
            <KpiCard label="Ativos hoje"          value={overview.active_today}   icon={MessageSquare} accent="green" />
            <KpiCard label="Silenciosos 7d"       value={overview.silent_7d}      icon={AlertTriangle} accent="red" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Msgs últimas 24h"    value={overview.messages_24h}   icon={MessageSquare} accent="blue"
              sub={`${num(totalMessages30d)} nos últimos 30d`} />
            <KpiCard label="Links últimas 24h"   value={overview.links_24h}      icon={Link2}         accent="gray" />
            <KpiCard label="Entradas 30d"         value={totalJoins30d}           icon={UserPlus}      accent="green" />
            <KpiCard label="Saídas 30d"           value={totalLeaves30d}          icon={UserMinus}     accent="red" />
          </div>
        </>
      )}

      {/* Atividade da rede + Peak hours */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Atividade da rede — 30 dias</h2>
          {actFmt.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={actFmt} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="msgG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Area type="monotone" dataKey="message_count" name="Mensagens" stroke="#6366f1" strokeWidth={2} fill="url(#msgG)" />
                <Area type="monotone" dataKey="join_count"    name="Entradas"  stroke="#22c55e" strokeWidth={1.5} fill="none" />
                <Area type="monotone" dataKey="leave_count"   name="Saídas"    stroke="#ef4444" strokeWidth={1.5} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400">Sem dados ainda.</p>}
        </div>

        {/* Horário de pico */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
            <Clock size={14} className="text-indigo-500" /> Horário de pico (7d)
          </h2>
          {peakHour && (
            <p className="text-xs text-gray-400 mb-3">
              Pico às <strong className="text-gray-700">{String(peakHour.hour).padStart(2, '0')}h</strong> — {num(peakHour.message_count)} msgs
            </p>
          )}
          {peakHours.length > 0 ? (
            <div className="flex items-end gap-0.5 h-28">
              {peakHours.map((h) => {
                const pct = (h.message_count / maxPeakCount) * 100
                const isTop = h.message_count === maxPeakCount
                return (
                  <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5" title={`${h.hour}h: ${h.message_count} msgs`}>
                    <div
                      className={`w-full rounded-t transition-all ${isTop ? 'bg-indigo-500' : 'bg-indigo-200'}`}
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                    {h.hour % 6 === 0 && (
                      <span className="text-[9px] text-gray-400">{h.hour}h</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : <p className="text-sm text-gray-400">Sem dados.</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <ListChecks size={14} className="text-indigo-500" /> Enquetes recentes
          </h2>
          <span className="text-xs text-gray-400">{polls.length} nos últimos 30d</span>
        </div>
        {polls.length > 0 ? (
          <div className="space-y-4">
            {polls.slice(0, 8).map((poll) => {
              const maxVotes = Math.max(...poll.options.map((o) => o.vote_count), 1)
              return (
                <div key={poll.id} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{poll.title}</p>
                      <Link to={`/whatsapp/groups/${poll.group_id}`} className="text-xs text-indigo-500 hover:underline truncate block">
                        {poll.group_name ?? poll.group_jid}
                      </Link>
                    </div>
                    <div className="flex items-start gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-700">{num(poll.total_voters)} votantes</p>
                        <p className="text-[11px] text-gray-400">{new Date(poll.created_at_whatsapp).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadPollVotes(poll)}
                        disabled={poll.total_votes === 0 || loadingPollVotesId === poll.id}
                        title="Baixar lista completa de votos"
                        className="p-1.5 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-500 rounded-lg transition-colors"
                      >
                        {loadingPollVotesId === poll.id
                          ? <RefreshCw size={13} className="animate-spin" />
                          : <Download size={13} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {poll.options.map((option) => {
                      const pct = poll.total_voters > 0 ? Math.round((option.vote_count / poll.total_voters) * 100) : 0
                      return (
                        <div key={option.id} className="grid grid-cols-[minmax(90px,180px)_1fr_70px] items-center gap-3 text-xs">
                          <span className="text-gray-600 truncate">{option.option_text || 'Opção sem texto'}</span>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${Math.max((option.vote_count / maxVotes) * 100, option.vote_count > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                          <span className="text-right text-gray-500">{num(option.vote_count)} · {pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Nenhuma enquete capturada nos grupos monitorados ainda.</p>
        )}
      </div>

      {/* Top grupos por mensagens + Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Top grupos por mensagens (30d)</h2>
          {byMessages.length > 0 ? (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={byMessages.map((g) => ({ name: (g.name ?? g.group_jid).slice(0, 24), msgs: g.messages_period }))}
                layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={140} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="msgs" name="Mensagens" radius={[0, 4, 4, 0]}>
                  {byMessages.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#6366f1' : i < 3 ? '#818cf8' : '#c7d2fe'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400">Sem dados.</p>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Alertas recentes</h2>
          {alerts.length === 0
            ? <p className="text-sm text-gray-400">Nenhum alerta.</p>
            : <ul className="space-y-2.5">
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
          }
        </div>
      </div>

      {/* Grupos em risco + Crescimento + Queda + Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {atRisk.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <h2 className="text-xs font-semibold text-red-700 mb-3 flex items-center gap-1.5 uppercase tracking-wide">
              <AlertTriangle size={13} /> Em risco (queda &gt;50%)
            </h2>
            <ul className="space-y-2">
              {atRisk.map((g) => {
                const pct = g.messages_prev7d > 0 ? Math.round((g.messages_7d / g.messages_prev7d) * 100 - 100) : -100
                return (
                  <li key={g.id} className="flex items-center justify-between text-xs">
                    <Link to={`/whatsapp/groups/${g.id}`} className="text-red-800 hover:underline truncate max-w-[130px] font-medium">
                      {g.name ?? g.group_jid}
                    </Link>
                    <span className="text-red-600 font-bold shrink-0">{pct}%</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className={`bg-white border border-gray-200 rounded-xl p-4 shadow-sm ${atRisk.length === 0 ? 'md:col-span-1' : ''}`}>
          <h2 className="text-xs font-semibold text-green-700 mb-3 flex items-center gap-1.5 uppercase tracking-wide">
            <TrendingUp size={13} /> Maior crescimento
          </h2>
          <ul className="space-y-2">
            {topGrowth.map((g, i) => (
              <li key={g.id} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-gray-400 w-3">{i + 1}</span>
                  <Link to={`/whatsapp/groups/${g.id}`} className="text-gray-700 hover:text-indigo-600 truncate max-w-[110px]">
                    {g.name ?? g.group_jid}
                  </Link>
                </span>
                <span className="text-green-600 font-semibold shrink-0">+{g.net_growth_period}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-xs font-semibold text-red-600 mb-3 flex items-center gap-1.5 uppercase tracking-wide">
            <TrendingDown size={13} /> Maior queda
          </h2>
          <ul className="space-y-2">
            {topShrink.map((g, i) => (
              <li key={g.id} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-gray-400 w-3">{i + 1}</span>
                  <Link to={`/whatsapp/groups/${g.id}`} className="text-gray-700 hover:text-indigo-600 truncate max-w-[110px]">
                    {g.name ?? g.group_jid}
                  </Link>
                </span>
                <span className="text-red-500 font-semibold shrink-0">{g.net_growth_period}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-xs font-semibold text-purple-700 mb-3 flex items-center gap-1.5 uppercase tracking-wide">
            <Link2 size={13} /> Top domínios
          </h2>
          <ul className="space-y-2">
            {topDomains.map((d, i) => (
              <li key={d.domain} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-gray-400 w-3">{i + 1}</span>
                  <span className="text-gray-700 truncate max-w-[110px]">{d.domain}</span>
                </span>
                <Badge variant="blue">{d.count}x</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Tabela completa */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Todos os grupos — resumo 30d</h2>
          <span className="text-xs text-gray-400">{topGroups.length} grupos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Grupo</th>
                <th className="text-right px-3 py-3 font-medium">Membros</th>
                <th className="text-right px-3 py-3 font-medium">Msgs 30d</th>
                <th className="text-right px-3 py-3 font-medium">Eng. %</th>
                <th className="text-right px-3 py-3 font-medium">Tendência 7d</th>
                <th className="text-right px-3 py-3 font-medium">Entradas</th>
                <th className="text-right px-3 py-3 font-medium">Saídas</th>
                <th className="text-right px-4 py-3 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {topGroups.map((g, i) => {
                const trendPct = trend(g.messages_7d, g.messages_prev7d)
                return (
                  <tr key={g.id} className={`border-b border-gray-50 hover:bg-indigo-50/30 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-4 py-2.5">
                      <Link to={`/whatsapp/groups/${g.id}`} className="text-indigo-600 hover:underline font-medium truncate block max-w-[200px]">
                        {g.name ?? g.group_jid}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{num(g.member_count)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{num(g.messages_period)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-medium ${Number(g.engagement_rate) >= 30 ? 'text-green-600' : Number(g.engagement_rate) >= 10 ? 'text-yellow-600' : 'text-gray-400'}`}>
                        {g.engagement_rate}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {trendPct != null ? (
                        <span className={`font-semibold flex items-center justify-end gap-0.5 ${trendPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {trendPct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {Math.abs(trendPct)}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-green-600">{g.joins_period > 0 ? `+${g.joins_period}` : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-red-500">{g.leaves_period > 0 ? `-${g.leaves_period}` : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold">
                      <span className={g.net_growth_period > 0 ? 'text-green-600' : g.net_growth_period < 0 ? 'text-red-500' : 'text-gray-300'}>
                        {g.net_growth_period > 0 ? `+${g.net_growth_period}` : g.net_growth_period === 0 ? '—' : g.net_growth_period}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
