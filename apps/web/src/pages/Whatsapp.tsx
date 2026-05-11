import { useEffect, useState } from 'react'
import {
  Users, MessageSquare, Link2, UserPlus, UserMinus, Activity, VolumeX, AlertTriangle,
} from 'lucide-react'
import KpiCard from '../components/KpiCard'
import { api, Overview } from '../lib/api'

interface InstanceStatus {
  status: string
  jid: string | null
  connected_at: string | null
  qr: string | null
}

export default function Whatsapp() {
  const [instance, setInstance] = useState<InstanceStatus | null>(null)
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    async function load() {
      try {
        const inst = await api.get<InstanceStatus>('/whatsapp/instance')
        setInstance(inst)

        if (inst.status === 'connected') {
          const overview = await api.get<Overview>('/whatsapp/overview')
          setData(overview)
          clearInterval(interval)
        }
      } finally {
        setLoading(false)
      }
    }

    load()
    // Poll every 5 s while waiting for QR scan / connection
    interval = setInterval(load, 5_000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <p className="text-gray-500">Carregando…</p>

  if (instance?.status !== 'connected') {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-800">WhatsApp — Conectar</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col items-center gap-4">
          {instance?.qr ? (
            <>
              <p className="text-sm text-gray-600">
                Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo e escaneie:
              </p>
              <img src={instance.qr} alt="QR code WhatsApp" className="w-64 h-64" />
              <p className="text-xs text-gray-400">O QR expira em 2 minutos. A página atualiza automaticamente.</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              Aguardando QR code… verifique se o worker está rodando.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (!data) return null

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
