import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, ChevronRight, Volume2, VolumeX, CheckSquare, Square,
  RefreshCw, Eye, EyeOff,
} from 'lucide-react'
import Badge from '../components/Badge'
import { api, Group } from '../lib/api'
import { useInstanceFilter } from '../contexts/InstanceFilterContext'

function fmt(date: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Aba Monitorados ───────────────────────────────────────────────────────────
function MonitoredTab() {
  const { selectedInstanceId } = useInstanceFilter()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading]   = useState(true)
  const [q, setQ]               = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (selectedInstanceId) params.set('instance_id', selectedInstanceId)
    const qs = params.toString()
    api.get<Group[]>(`/whatsapp/groups${qs ? `?${qs}` : ''}`)
      .then(setGroups).finally(() => setLoading(false))
  }, [q, selectedInstanceId])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar grupos monitorados…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <span className="text-xs text-gray-400">{groups.length} grupos</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw size={18} className="animate-spin text-gray-400" />
          </div>
        ) : groups.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">Nenhum grupo monitorado.</p>
            <p className="text-gray-400 text-xs mt-1">Vá em <strong>Gerenciar</strong> para selecionar grupos.</p>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Grupo</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Membros</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Msgs 24h</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Última msg</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {groups.map((g) => (
                <tr key={g.id} className="hover:bg-indigo-50/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-800 max-w-xs truncate">{g.name ?? g.group_jid}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{g.member_count.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{g.messages_24h}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{fmt(g.last_message_at)}</td>
                  <td className="px-4 py-2.5">
                    {g.silent_7d
                      ? <Badge variant="red"><VolumeX size={10} className="mr-1 inline" />7d silencioso</Badge>
                      : g.silent_3d
                        ? <Badge variant="yellow"><VolumeX size={10} className="mr-1 inline" />3d silencioso</Badge>
                        : <Badge variant="green"><Volume2 size={10} className="mr-1 inline" />Ativo</Badge>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link to={`/whatsapp/groups/${g.id}`} className="text-indigo-500 hover:text-indigo-700">
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

// ── Aba Gerenciar ─────────────────────────────────────────────────────────────
function ManageTab() {
  const { selectedInstanceId } = useInstanceFilter()
  const [all, setAll]           = useState<Group[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [q, setQ]               = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [msg, setMsg]           = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ monitored: 'all' })
    if (selectedInstanceId) params.set('instance_id', selectedInstanceId)
    api.get<Group[]>(`/whatsapp/groups?${params.toString()}`)
      .then((list) => {
        setAll(list)
        setSelected(new Set(list.filter((g) => g.is_monitored).map((g) => g.id)))
      })
      .finally(() => setLoading(false))
  }, [selectedInstanceId])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() =>
    q ? all.filter((g) => (g.name ?? g.group_jid).toLowerCase().includes(q.toLowerCase())) : all,
    [all, q],
  )

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev)
      filtered.forEach((g) => next.add(g.id))
      return next
    })
  }

  function deselectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev)
      filtered.forEach((g) => next.delete(g.id))
      return next
    })
  }

  function selectAll()   { setSelected(new Set(all.map((g) => g.id))) }
  function deselectAll() { setSelected(new Set()) }

  async function apply() {
    setSaving(true); setMsg('')
    const currentMonitored = new Set(all.filter((g) => g.is_monitored).map((g) => g.id))
    const toEnable  = all.map((g) => g.id).filter((id) =>  selected.has(id) && !currentMonitored.has(id))
    const toDisable = all.map((g) => g.id).filter((id) => !selected.has(id) &&  currentMonitored.has(id))
    try {
      if (toEnable.length)  await api.post('/whatsapp/groups/bulk-monitor', { group_ids: toEnable,  is_monitored: true })
      if (toDisable.length) await api.post('/whatsapp/groups/bulk-monitor', { group_ids: toDisable, is_monitored: false })
      setMsg(`✓ ${selected.size} grupo(s) monitorados`)
      load()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const filteredSelected   = filtered.filter((g) => selected.has(g.id)).length
  const filteredTotal      = filtered.length
  const allFilteredChecked = filteredTotal > 0 && filteredSelected === filteredTotal
  const someFilteredChecked = filteredSelected > 0 && filteredSelected < filteredTotal

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar em todos os grupos…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button onClick={selectAllFiltered}   className="text-indigo-600 hover:underline">Selecionar filtrados</button>
          <span className="text-gray-300">|</span>
          <button onClick={deselectAllFiltered} className="text-gray-500 hover:underline">Desmarcar filtrados</button>
          <span className="text-gray-300">|</span>
          <button onClick={selectAll}           className="text-indigo-600 hover:underline">Todos</button>
          <span className="text-gray-300">|</span>
          <button onClick={deselectAll}         className="text-gray-500 hover:underline">Nenhum</button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {msg && <p className={`text-xs ${msg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}
          <span className="text-xs text-gray-400">{selected.size}/{all.length} selecionados</span>
          <button onClick={apply} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg shadow-sm">
            {saving ? <RefreshCw size={12} className="animate-spin" /> : null}
            {saving ? 'Salvando…' : 'Aplicar'}
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw size={18} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 w-10">
                  <button onClick={allFilteredChecked ? deselectAllFiltered : selectAllFiltered} className="text-indigo-500">
                    {allFilteredChecked
                      ? <CheckSquare size={15} />
                      : someFilteredChecked
                        ? <CheckSquare size={15} className="opacity-50" />
                        : <Square size={15} />
                    }
                  </button>
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Grupo</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Membros</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Estado atual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((g) => {
                const isChecked = selected.has(g.id)
                const willChange = isChecked !== g.is_monitored
                return (
                  <tr
                    key={g.id}
                    onClick={() => toggleOne(g.id)}
                    className={`cursor-pointer transition-colors ${
                      isChecked ? 'bg-indigo-50/40 hover:bg-indigo-50/70' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      {isChecked
                        ? <CheckSquare size={15} className="text-indigo-500" />
                        : <Square      size={15} className="text-gray-300" />
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium truncate max-w-[280px] ${isChecked ? 'text-gray-900' : 'text-gray-500'}`}>
                          {g.name ?? g.group_jid}
                        </span>
                        {willChange && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            isChecked ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}>
                            {isChecked ? 'será ativado' : 'será desativado'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500 text-xs">{g.member_count.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2.5 text-center">
                      {g.is_monitored
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><Eye size={12} /> monitorado</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-gray-400"><EyeOff size={12} /> ignorado</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Groups() {
  const [tab, setTab] = useState<'monitored' | 'manage'>('monitored')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Grupos</h1>
      </div>

      <div className="border-b border-gray-200 flex gap-0">
        {(['monitored', 'manage'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'monitored' ? 'Monitorados' : 'Gerenciar'}
          </button>
        ))}
      </div>

      {tab === 'monitored' ? <MonitoredTab /> : <ManageTab />}
    </div>
  )
}
