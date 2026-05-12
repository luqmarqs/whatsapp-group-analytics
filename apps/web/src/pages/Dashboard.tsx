import { useEffect, useState } from 'react'
import {
  Users,
  MessageSquare,
  Link2,
  UserPlus,
  UserMinus,
  AlertTriangle,
  Activity,
  VolumeX,
} from 'lucide-react'
import KpiCard from '../components/KpiCard'
import { api, Overview } from '../lib/api'
import { useInstanceFilter } from '../contexts/InstanceFilterContext'

export default function Dashboard() {
  const { instanceQuery } = useInstanceFilter()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<Overview>(`/whatsapp/overview${instanceQuery()}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [instanceQuery])

  if (loading) return <p className="text-gray-500">Carregando…</p>
  if (error)   return <p className="text-red-500">{error}</p>
  if (!data)   return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Atualizado em {new Date(data.generated_at).toLocaleString('pt-BR')}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total de grupos"     value={data.total_groups}  icon={Users}        color="blue" />
        <KpiCard label="Ativos hoje"          value={data.active_today}  icon={Activity}     color="green" />
        <KpiCard label="Silenciosos 3 dias"   value={data.silent_3d}     icon={VolumeX}      color="yellow" />
        <KpiCard label="Silenciosos 7 dias"   value={data.silent_7d}     icon={AlertTriangle} color="red" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Msgs últimas 24h"   value={data.messages_24h} icon={MessageSquare} color="blue" />
        <KpiCard label="Links últimas 24h"  value={data.links_24h}    icon={Link2}         color="gray" />
        <KpiCard label="Entradas (7d)"      value={data.joins_7d}     icon={UserPlus}      color="green" />
        <KpiCard label="Saídas (7d)"        value={data.leaves_7d}    icon={UserMinus}     color="red" />
      </div>
    </div>
  )
}
