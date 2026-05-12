import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, MessageSquare, Link2, Download, RefreshCw, ListChecks } from 'lucide-react'
import ActivityChart from '../components/ActivityChart'
import MemberEvolutionChart from '../components/MemberEvolutionChart'
import Badge from '../components/Badge'
import { api, GroupDetail as GD, MemberEvolution, Poll, PollVote } from '../lib/api'
import { downloadPollVotesCsv } from '../lib/pollVotesCsv'

interface Member {
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

function alertSeverityVariant(s: string) {
  if (s === 'critical') return 'red'
  if (s === 'warning')  return 'yellow'
  return 'blue'
}

function downloadCsv(groupName: string, members: Member[]) {
  const headers = ['Nome', 'Telefone', 'Identificador WhatsApp', 'Tipo ID', 'Papel', 'Status', 'Entrou em', 'Saiu em']
  const rows = members.map((m) => [
    m.name ?? '',
    m.phone ? `="${m.phone}"` : '',
    m.raw_jid ? `="${m.raw_jid}"` : '',
    m.jid_server ?? '',
    m.role,
    m.is_active ? 'Ativo' : 'Inativo',
    m.joined_at ? new Date(m.joined_at).toLocaleDateString('pt-BR') : '',
    m.left_at   ? new Date(m.left_at).toLocaleDateString('pt-BR')   : '',
  ])
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `membros-${groupName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const [data, setData]           = useState<GD | null>(null)
  const [evolution, setEvolution] = useState<MemberEvolution[]>([])
  const [polls, setPolls]         = useState<Poll[]>([])
  const [members, setMembers]     = useState<Member[]>([])
  const [loadingCsv, setLoadingCsv] = useState(false)
  const [loadingPollVotesId, setLoadingPollVotesId] = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.get<GD>(`/whatsapp/groups/${id}`),
      api.get<MemberEvolution[]>(`/whatsapp/groups/${id}/member-evolution?days=90`),
      api.get<Poll[]>(`/whatsapp/polls?group_id=${encodeURIComponent(id)}&days=365`),
    ])
      .then(([detail, evo, pollList]) => { setData(detail); setEvolution(evo); setPolls(pollList) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleDownloadCsv() {
    if (!data || loadingCsv) return
    setLoadingCsv(true)
    try {
      const list = await api.get<Member[]>(`/whatsapp/groups/${id}/members`)
      setMembers(list)
      downloadCsv(data.group.name ?? data.group.group_jid, list)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao baixar membros')
    } finally { setLoadingCsv(false) }
  }

  async function handleDownloadPollVotes(poll: Poll) {
    if (loadingPollVotesId) return
    setLoadingPollVotesId(poll.id)
    try {
      const votes = await api.get<PollVote[]>(`/whatsapp/polls/${poll.id}/votes`)
      downloadPollVotesCsv(poll, votes)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao baixar votos da enquete')
    } finally {
      setLoadingPollVotesId(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={20} className="animate-spin text-gray-400" />
    </div>
  )
  if (error)   return <p className="text-red-500">{error}</p>
  if (!data)   return null

  const { group, metrics, top_links, alerts } = data
  const totalMessages = metrics.reduce((s, m) => s + m.message_count, 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link to="/whatsapp/groups" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{group.name ?? group.group_jid}</h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{group.group_jid}</p>
          </div>
        </div>
        <button
          onClick={handleDownloadCsv}
          disabled={loadingCsv}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-600 text-xs font-medium rounded-lg transition-colors shadow-sm"
        >
          {loadingCsv
            ? <RefreshCw size={13} className="animate-spin" />
            : <Download size={13} />}
          {loadingCsv ? 'Baixando…' : 'CSV Membros'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Membros', value: group.member_count.toLocaleString('pt-BR'), icon: Users, color: 'indigo' },
          { label: 'Msgs (histórico)', value: totalMessages.toLocaleString('pt-BR'), icon: MessageSquare, color: 'green' },
          { label: 'Links únicos', value: top_links.length, icon: Link2, color: 'purple' },
        ].map(({ label, value, icon: Icon, color }) => {
          const colors: Record<string, string> = {
            indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200',
            green:  'bg-green-50 text-green-600 border-green-200',
            purple: 'bg-purple-50 text-purple-600 border-purple-200',
          }
          return (
            <div key={label} className={`bg-white rounded-xl border p-4 shadow-sm flex items-center gap-3 ${colors[color]?.split(' ')[2] ?? 'border-gray-200'}`}>
              <div className={`p-2 rounded-lg ${colors[color]?.split(' ').slice(0, 2).join(' ')}`}>
                <Icon size={16} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-lg font-bold text-gray-900">{value}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Evolução de membros */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Evolução de membros (90 dias)</h2>
        <p className="text-xs text-gray-400 mb-4">
          Linha roxa = total de membros · Barras verdes/vermelhas = entradas/saídas por dia
        </p>
        {evolution.length > 0
          ? <MemberEvolutionChart data={evolution} />
          : <p className="text-sm text-gray-400">Sem dados de evolução ainda.</p>}
      </div>

      {/* Atividade diária */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Atividade diária (30 dias)</h2>
        {metrics.length > 0
          ? <ActivityChart data={[...metrics].reverse()} />
          : <p className="text-sm text-gray-400">Sem dados de métricas ainda.</p>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <ListChecks size={14} className="text-indigo-500" /> Enquetes
          </h2>
          <span className="text-xs text-gray-400">{polls.length} capturadas</span>
        </div>
        {polls.length > 0 ? (
          <div className="space-y-4">
            {polls.slice(0, 10).map((poll) => {
              const maxVotes = Math.max(...poll.options.map((o) => o.vote_count), 1)
              return (
                <div key={poll.id} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <p className="text-sm font-semibold text-gray-800">{poll.title}</p>
                    <div className="flex items-start gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-semibold text-gray-700">{poll.total_voters.toLocaleString('pt-BR')} votantes</p>
                        <p className="text-[11px] text-gray-400">{new Date(poll.created_at_whatsapp).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadPollVotes(poll)}
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
                          <span className="text-right text-gray-500">{option.vote_count.toLocaleString('pt-BR')} · {pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Nenhuma enquete capturada neste grupo ainda.</p>
        )}
      </div>

      {/* Links + Alertas */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Links mais compartilhados</h2>
          {top_links.length === 0
            ? <p className="text-sm text-gray-400">Nenhum link registrado.</p>
            : <ul className="space-y-2">
                {top_links.slice(0, 10).map((l) => (
                  <li key={l.url_hash} className="flex justify-between text-sm">
                    <span className="text-gray-700 truncate max-w-[70%]">{l.domain}</span>
                    <Badge variant="blue">{l.count}x</Badge>
                  </li>
                ))}
              </ul>
          }
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Alertas recentes</h2>
          {alerts.length === 0
            ? <p className="text-sm text-gray-400">Nenhum alerta.</p>
            : <ul className="space-y-2">
                {alerts.slice(0, 10).map((a) => (
                  <li key={a.id} className="text-sm">
                    <Badge variant={alertSeverityVariant(a.severity) as 'red' | 'yellow' | 'blue'}>
                      {a.alert_type}
                    </Badge>
                    <span className="ml-2 text-gray-600 text-xs">{a.message}</span>
                  </li>
                ))}
              </ul>
          }
        </div>
      </div>
    </div>
  )
}
