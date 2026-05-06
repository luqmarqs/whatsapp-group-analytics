import { useEffect, useState } from 'react'
import {
  Users, MessageSquare, Link2, UserPlus, UserMinus, Activity, VolumeX, AlertTriangle,
} from 'lucide-react'
import KpiCard from '../components/KpiCard'
import { api, Overview } from '../lib/api'

export default function Whatsapp() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Overview>('/whatsapp/overview').then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-500">Carregando…</p>
  if (!data)   return null

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Visão Geral — WhatsApp</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total de grupos"    value={data.total_groups} icon={Users}        color="blue" />
        <KpiCard label="Ativos hoje"         value={data.active_today} icon={Activity}     color="green" />
        <KpiCard label="Silenciosos 3 dias"  value={data.silent_3d}    icon={VolumeX}      color="yellow" />
        <KpiCard label="Silenciosos 7 dias"  value={data.silent_7d}    icon={AlertTriangle} color="red" />
        <KpiCard label="Msgs 24h"           value={data.messages_24h} icon={MessageSquare} color="blue" />
        <KpiCard label="Links 24h"          value={data.links_24h}    icon={Link2}         color="gray" />
        <KpiCard label="Entradas 7d"        value={data.joins_7d}     icon={UserPlus}      color="green" />
        <KpiCard label="Saídas 7d"          value={data.leaves_7d}    icon={UserMinus}     color="red" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <p className="text-sm text-gray-500">
          Dados capturados automaticamente pelo worker. Métricas diárias são calculadas às 01h00 UTC.
        </p>
      </div>
    </div>
  )
}
