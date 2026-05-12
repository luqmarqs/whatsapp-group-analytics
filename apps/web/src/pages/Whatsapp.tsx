import { useEffect, useState, useCallback } from 'react'
import {
  Users, MessageSquare, Link2, UserPlus, UserMinus, Activity, VolumeX, AlertTriangle,
  Smartphone, RefreshCw, Wifi, WifiOff, LogOut, CheckCircle,
} from 'lucide-react'
import KpiCard from '../components/KpiCard'
import { api, Overview } from '../lib/api'
import { useInstanceFilter } from '../contexts/InstanceFilterContext'

interface InstanceStatus {
  status: string
  jid: string | null
  connected_at: string | null
  name: string
  qr: string | null
}

export default function Whatsapp() {
  const { selectedInstanceId } = useInstanceFilter()
  const [instance, setInstance]   = useState<InstanceStatus | null>(null)
  const [overview, setOverview]   = useState<Overview | null>(null)
  const [state, setState]         = useState<'loading' | 'no_instance' | 'waiting' | 'connected'>('loading')
  const [disconnecting, setDisconnecting] = useState(false)

  const load = useCallback(async () => {
    const instanceParam = selectedInstanceId ? `?instance_id=${encodeURIComponent(selectedInstanceId)}` : ''
    try {
      const inst = await api.get<InstanceStatus>(`/whatsapp/instance${instanceParam}`)
      setInstance(inst)
      if (inst.status === 'connected') {
        setState('connected')
        api.get<Overview>(`/whatsapp/overview${instanceParam}`).then(setOverview).catch(() => {})
      } else {
        setState('waiting')
      }
    } catch {
      setState('no_instance')
    }
  }, [selectedInstanceId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (state !== 'waiting') return
    const interval = setInterval(load, 5_000)
    return () => clearInterval(interval)
  }, [state, load])

  async function disconnect() {
    if (!confirm('Desconectar o WhatsApp? Você precisará escanear um novo QR code para reconectar.')) return
    setDisconnecting(true)
    try {
      await api.post(`/whatsapp/disconnect${selectedInstanceId ? `?instance_id=${encodeURIComponent(selectedInstanceId)}` : ''}`, {})
      setState('waiting')
      setInstance((prev) => prev ? { ...prev, status: 'disconnected', qr: null } : null)
      setTimeout(load, 3_000)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao desconectar')
    } finally {
      setDisconnecting(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state === 'loading') return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={20} className="animate-spin text-gray-400" />
    </div>
  )

  // ── Sem instância ──────────────────────────────────────────────────────────
  if (state === 'no_instance') return (
    <div className="max-w-md mx-auto mt-12 text-center space-y-4">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-2xl">
        <Smartphone size={28} className="text-gray-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-700">Conta não configurada</h2>
      <p className="text-sm text-gray-500">
        O administrador precisa criar uma instância WhatsApp para a sua conta.<br />
        Entre em contato para prosseguir.
      </p>
    </div>
  )

  // ── Aguardando QR / conexão ────────────────────────────────────────────────
  if (state === 'waiting') return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">WhatsApp</h1>
        <div className="flex items-center gap-1.5 mt-1">
          <WifiOff size={13} className="text-orange-400" />
          <span className="text-xs text-orange-500 font-medium">Desconectado — aguardando QR code</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {instance?.qr ? (
          <div className="flex flex-col md:flex-row">
            {/* QR */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center p-8 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-100">
              <img src={instance.qr} alt="QR code WhatsApp"
                className="w-52 h-52 rounded-xl border-2 border-white shadow-md" />
              <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                <RefreshCw size={11} className="animate-spin" />
                Atualiza automaticamente a cada 2 min
              </p>
            </div>

            {/* Instruções */}
            <div className="flex-1 p-8 flex flex-col justify-center space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-800 mb-1">
                  Como conectar
                </h2>
                <p className="text-xs text-gray-500">Siga os passos no celular:</p>
              </div>

              <ol className="space-y-3">
                {[
                  { step: 1, text: 'Abra o WhatsApp no celular' },
                  { step: 2, text: 'Toque em ⋮ (Android) ou Configurações (iPhone)' },
                  { step: 3, text: 'Selecione Dispositivos Conectados' },
                  { step: 4, text: 'Toque em Conectar dispositivo' },
                  { step: 5, text: 'Aponte o celular para o QR ao lado' },
                ].map(({ step, text }) => (
                  <li key={step} className="flex items-start gap-3 text-sm">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">
                      {step}
                    </span>
                    <span className="text-gray-600 leading-tight pt-0.5">{text}</span>
                  </li>
                ))}
              </ol>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                <strong>Dica:</strong> o celular não precisa ficar com o app aberto após conectar.
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <RefreshCw size={28} className="text-indigo-400 animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Gerando QR code…</p>
              <p className="text-xs text-gray-400 mt-1">O container está iniciando, aguarde alguns segundos.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ── Conectado ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header com status e botão desconectar */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">WhatsApp</h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-green-600 font-medium">Conectado</span>
            </div>
            {instance?.jid && (
              <span className="text-xs text-gray-400">
                · {instance.jid.replace(/:.*@/, '@').replace('@s.whatsapp.net', '')}
              </span>
            )}
            {instance?.connected_at && (
              <span className="text-xs text-gray-400">
                · desde {new Date(instance.connected_at).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={disconnect}
          disabled={disconnecting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-red-500 hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-lg transition-all"
        >
          {disconnecting
            ? <RefreshCw size={12} className="animate-spin" />
            : <LogOut size={12} />}
          {disconnecting ? 'Desconectando…' : 'Desconectar'}
        </button>
      </div>

      {/* Banner de conexão */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle size={18} className="text-green-500 shrink-0" />
        <div className="text-sm text-green-800">
          <strong>WhatsApp ativo</strong> — seus grupos estão sendo monitorados automaticamente.
          Vá em <strong>Grupos → Gerenciar</strong> para selecionar quais deseja acompanhar.
        </div>
      </div>

      {/* KPIs */}
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
    </div>
  )
}
