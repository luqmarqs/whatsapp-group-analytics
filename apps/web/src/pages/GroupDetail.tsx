import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, MessageSquare, Link2 } from 'lucide-react'
import ActivityChart from '../components/ActivityChart'
import MemberEvolutionChart from '../components/MemberEvolutionChart'
import Badge from '../components/Badge'
import { api, GroupDetail as GD, MemberEvolution } from '../lib/api'

function alertSeverityVariant(s: string) {
  if (s === 'critical') return 'red'
  if (s === 'warning')  return 'yellow'
  return 'blue'
}

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<GD | null>(null)
  const [evolution, setEvolution] = useState<MemberEvolution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.get<GD>(`/whatsapp/groups/${id}`),
      api.get<MemberEvolution[]>(`/whatsapp/groups/${id}/member-evolution?days=90`),
    ])
      .then(([detail, evo]) => { setData(detail); setEvolution(evo) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-gray-500">Carregando…</p>
  if (error)   return <p className="text-red-500">{error}</p>
  if (!data)   return null

  const { group, metrics, top_links, alerts } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/whatsapp/groups" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-800">{group.name ?? group.group_jid}</h1>
          <p className="text-xs text-gray-400">{group.group_jid}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
          <Users size={18} className="text-blue-500" />
          <div>
            <p className="text-xs text-gray-500">Membros</p>
            <p className="text-lg font-bold text-gray-800">{group.member_count}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
          <MessageSquare size={18} className="text-green-500" />
          <div>
            <p className="text-xs text-gray-500">Msgs totais (histórico)</p>
            <p className="text-lg font-bold text-gray-800">
              {metrics.reduce((s, m) => s + m.message_count, 0)}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
          <Link2 size={18} className="text-purple-500" />
          <div>
            <p className="text-xs text-gray-500">Links únicos</p>
            <p className="text-lg font-bold text-gray-800">{top_links.length}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Atividade diária (30 dias)</h2>
        {metrics.length > 0 ? (
          <ActivityChart data={metrics} />
        ) : (
          <p className="text-sm text-gray-400">Sem dados de métricas ainda.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Evolução de membros (90 dias)</h2>
        <p className="text-xs text-gray-400 mb-4">
          Linha roxa = total de membros · Barras verdes/vermelhas = entradas/saídas por dia
        </p>
        {evolution.length > 0 ? (
          <MemberEvolutionChart data={evolution} />
        ) : (
          <p className="text-sm text-gray-400">Sem dados de evolução ainda.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Links mais compartilhados</h2>
          {top_links.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum link registrado.</p>
          ) : (
            <ul className="space-y-2">
              {top_links.slice(0, 10).map((l) => (
                <li key={l.url_hash} className="flex justify-between text-sm">
                  <span className="text-gray-700 truncate max-w-[70%]">{l.domain}</span>
                  <Badge variant="blue">{l.count}x</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Alertas recentes</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum alerta.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 10).map((a) => (
                <li key={a.id} className="text-sm">
                  <Badge variant={alertSeverityVariant(a.severity) as 'red' | 'yellow' | 'blue'}>
                    {a.alert_type}
                  </Badge>
                  <span className="ml-2 text-gray-600">{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
