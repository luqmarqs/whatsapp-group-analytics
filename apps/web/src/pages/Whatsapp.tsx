import { useEffect, useState, useCallback } from 'react'
import {
  Users, MessageSquare, Link2, UserPlus, UserMinus, Activity, VolumeX, AlertTriangle,
  Smartphone, RefreshCw,
} from 'lucide-react'
import KpiCard from '../components/KpiCard'
import { api, Overview } from '../lib/api'

interface InstanceStatus {
  status: string
  jid: string | null
  connected_at: string | null
  name: string
  qr: string | null
}

export default function Whatsapp() {
  const [instance, setInstance] = useState<InstanceStatus | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [state, setState]       = useState<'loading' | 'no_instance' | 'waiting' | 'connected'>('loading')

  const load = useCallback(async () => {
    try {
      const inst = await api.get<InstanceStatus>('/whatsapp/instance')
      setInstance(inst)
      if (inst.status === 'connected') {
        setState('connected')
        api.get<Overview>('/whatsapp/overview').then(setOverview).catch(() => {})
      } else {
        setState('waiting')
      }
    } catch {
      setState('no_instance')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Poll enquanto aguarda conexão ou QR
  useEffect(() => {
    if (state !== 'waiting') return
    const interval = setInterval(load, 5_000)
    return () => clearInterval(interval)
  }, [state, load])

  if (state === 'loading') return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={20} className="animate-spin text-gray-400" />
    </div>
  )

  if (state === 'no_instance') return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">WhatsApp</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm flex flex-col items-center gap-4 max-w-md mx-auto">
        <div className="p-4 bg-gray-50 rounded-full"><Smartphone size={28} className="text-gray-400" /></div>
        <div className="text-center">
          <h2 className="font-semibold text-gray-700 mb-1">Nenhuma instância configurada</h2>
          <p className="text-sm text-gray-500">O administrador precisa criar uma instância para a sua conta.</p>
        </div>
      </div>
    </div>
  )

  if (state === 'waiting') return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">WhatsApp — Conectar</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm flex flex-col items-center gap-5 max-w-md mx-auto">
        {instance?.qr ? (
          <>
            <img src={instance.qr} alt="QR code WhatsApp" className="w-56 h-56 border border-gray-200 rounded-xl" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-gray-700">Abra o WhatsApp no celular</p>
              <p className="text-xs text-gray-500">
                Dispositivos conectados → Conectar dispositivo → escaneie o código
              </p>
              <p className="text-xs text-gray-400">O QR expira em 2 min e atualiza automaticamente.</p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={24} className="text-indigo-400 animate-spin" />
            <p className="text-sm text-gray-500 text-center">
              Aguardando QR code… pode levar alguns segundos.
            </p>
          </div>
        )}
      </div>
    </div>
  )

  // connected
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Visão Geral — WhatsApp</h1>
        {instance?.jid && (
          <p className="text-xs text-gray-400 mt-0.5">
            Conectado como {instance.jid.replace(/:.*@/, '@')}
            {instance.connected_at && ` · desde ${new Date(instance.connected_at).toLocaleString('pt-BR')}`}
          </p>
        )}
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Total de grupos"   value={overview.total_groups} icon={Users}         color="blue" />
          <KpiCard label="Ativos hoje"        value={overview.active_today} icon={Activity}      color="green" />
          <KpiCard label="Silenciosos 3 dias" value={overview.silent_3d}   icon={VolumeX}       color="yellow" />
          <KpiCard label="Silenciosos 7 dias" value={overview.silent_7d}   icon={AlertTriangle}  color="red" />
          <KpiCard label="Msgs 24h"          value={overview.messages_24h} icon={MessageSquare} color="blue" />
          <KpiCard label="Links 24h"         value={overview.links_24h}    icon={Link2}          color="gray" />
          <KpiCard label="Entradas 7d"       value={overview.joins_7d}     icon={UserPlus}       color="green" />
          <KpiCard label="Saídas 7d"         value={overview.leaves_7d}    icon={UserMinus}      color="red" />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <p className="text-sm text-gray-500">
          Dados capturados automaticamente. Métricas diárias são calculadas às 01h00 UTC.
        </p>
      </div>
    </div>
  )
}
