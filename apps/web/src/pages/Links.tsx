import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2, Search, ExternalLink } from 'lucide-react'
import { api, Link as LinkType } from '../lib/api'
import { useInstanceFilter } from '../contexts/InstanceFilterContext'

function fmt(date: string) {
  return new Date(date).toLocaleDateString('pt-BR')
}

export default function Links() {
  const { selectedInstanceId } = useInstanceFilter()
  const [links, setLinks]   = useState<LinkType[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ]             = useState('')

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('domain', q)
    if (selectedInstanceId) params.set('instance_id', selectedInstanceId)
    const qs = params.toString()
    api.get<LinkType[]>(`/whatsapp/links${qs ? `?${qs}` : ''}`).then(setLinks).finally(() => setLoading(false))
  }, [q, selectedInstanceId])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Links compartilhados</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          URLs detectadas automaticamente nas mensagens dos grupos monitorados —
          agrupadas por domínio para facilitar a análise de conteúdo circulante.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar por domínio…"
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500 text-sm">Carregando…</p>
        ) : links.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Link2 size={32} className="mx-auto text-gray-200" />
            <p className="text-sm font-medium text-gray-500">
              {q ? `Nenhum link com domínio "${q}"` : 'Nenhum link registrado ainda'}
            </p>
            <p className="text-xs text-gray-400">
              Os links são extraídos automaticamente das mensagens dos{' '}
              <Link to="/whatsapp/groups" className="text-indigo-500 hover:underline">grupos monitorados</Link>.
            </p>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Domínio</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Grupo</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Vezes compartilhado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Primeira vez</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Última vez</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {links.map((l) => (
                <tr key={l.id} className="hover:bg-indigo-50/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link2 size={13} className="text-gray-400 shrink-0" />
                      <span className="font-medium text-gray-800">{l.domain}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <Link to={`/whatsapp/groups/${l.group_id}`}
                      className="text-gray-600 hover:text-indigo-600 hover:underline truncate block">
                      {l.group_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 font-semibold text-indigo-600">
                      <ExternalLink size={11} />
                      {l.count}×
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(l.first_seen_at)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(l.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
