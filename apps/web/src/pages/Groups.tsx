import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ChevronRight, Volume2, VolumeX } from 'lucide-react'
import Badge from '../components/Badge'
import { api, Group } from '../lib/api'

function fmt(date: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    const params = q ? `?q=${encodeURIComponent(q)}` : ''
    api.get<Group[]>(`/whatsapp/groups${params}`).then(setGroups).finally(() => setLoading(false))
  }, [q])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Grupos</h1>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar grupos…"
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500 text-sm">Carregando…</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Grupo</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Membros</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Msgs 24h</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Última msg</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groups.map((g) => (
                <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{g.name ?? g.group_jid}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{g.member_count}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{g.messages_24h}</td>
                  <td className="px-4 py-3 text-gray-500">{fmt(g.last_message_at)}</td>
                  <td className="px-4 py-3">
                    {g.silent_7d ? (
                      <Badge variant="red"><VolumeX size={10} className="mr-1 inline" />7d silencioso</Badge>
                    ) : g.silent_3d ? (
                      <Badge variant="yellow"><VolumeX size={10} className="mr-1 inline" />3d silencioso</Badge>
                    ) : (
                      <Badge variant="green"><Volume2 size={10} className="mr-1 inline" />Ativo</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/whatsapp/groups/${g.id}`} className="text-brand-600 hover:text-brand-700">
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
