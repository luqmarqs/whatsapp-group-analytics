import { useEffect, useState } from 'react'
import { Link2, Search } from 'lucide-react'
import { api, Link as LinkType } from '../lib/api'

function fmt(date: string) {
  return new Date(date).toLocaleDateString('pt-BR')
}

export default function Links() {
  const [links, setLinks] = useState<LinkType[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    const params = q ? `?domain=${encodeURIComponent(q)}` : ''
    api.get<LinkType[]>(`/whatsapp/links${params}`).then(setLinks).finally(() => setLoading(false))
  }, [q])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Links compartilhados</h1>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar por domínio…"
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500 text-sm">Carregando…</p>
        ) : links.length === 0 ? (
          <p className="p-6 text-gray-400 text-sm">Nenhum link encontrado.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Domínio</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Grupo</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Compartilhamentos</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Primeira vez</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Última vez</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {links.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link2 size={13} className="text-gray-400" />
                      <span className="text-gray-800 font-medium">{l.domain}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{l.group_name}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded">
                      {l.count}x
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmt(l.first_seen_at)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmt(l.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
