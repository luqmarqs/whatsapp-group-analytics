import { useEffect, useState, useCallback } from 'react'
import {
  Users, MessageSquare, Link2, UserPlus, UserMinus, Activity, VolumeX, AlertTriangle,
  Smartphone, LogOut, RefreshCw,
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

type PageState = 'loading' | 'no_instance' | 'connecting' | 'waiting_qr' | 'connected'

export default function Whatsapp() {
  const [instance, setInstance] = useState<InstanceStatus | null>(null)
  const [overview, setOverview]   = useState<Overview | null>(null)
  const [pageState, setPageState] = useState<PageState>('loading')
  const [actionMsg, setActionMsg] = useState('')
  const [busy, setBusy]           = useState(false)

  const loadInstance = useCallback(async () => {
    try {
      const inst = await api.get<InstanceStatus>('/whatsapp/instance')
      setInstance(inst)
      if (inst.status === 'connected') {
        setPageState('connected')
        const ov = await api.get<Overview>('/whatsapp/overview')
        setOverview(ov)
      } else if (inst.jid === null && inst.name === 'default') {
        // endpoint retornou o fallback padrão → nenhuma instância
        setPageState('no_instance')
      } else {
        setPageState(inst.qr ? 'waiting_qr' : 'connecting')
      }
    } catch {
      setPageState('no_instance')
    }
  }, [])

  useEffect(() => {
    loadInstance()
  }, [loadInstance])

  // Poll enquanto aguarda QR ou conexão
  useEffect(() => {
    if (pageState !== 'waiting_qr' && pageState !== 'connecting') return
    const interval = setInterval(loadInstance, 5_000)
    return () => clearInterval(interval)
  }, [pageState, loadInstance])

  async function connect() {
    setBusy(true); setActionMsg('')
    try {
      await api.post('/whatsapp/connect', {})
      setPageState('connecting')
      setActionMsg('Container iniciando… aguarde o QR code.')
      setTimeout(loadInstance, 4_000)
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : 'Erro ao conectar')
    } finally { setBusy(false) }
  }

  async function disconnect() {
    if (!confirm('Desconectar e remover esta instância do WhatsApp?')) return
    setBusy(true)
    try {
      await api.delete('/whatsapp/connect')
      setInstance(null); setOverview(null); setPageState('no_instance')
      setActionMsg('')
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : 'Erro ao desconectar')
    } finally { setBusy(false) }
  }

  // ── Telas ────────────────────────────────────────────────────────────────

  if (pageState === 'loading') return <p className="text-gray-500">Carregando…</p>

  if (pageState === 'no_instance') {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-800">WhatsApp — Conectar</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm flex flex-col items-center gap-5 max-w-md mx-auto">
          <div className="p-4 bg-green-50 rounded-full">
            <Smartphone size={32} className="text-green-500" />
          </div>
          <div className="text-center">
            <h2 className="font-semibold text-gray-800 mb-1">Nenhuma conta conectada</h2>
            <p className="text-sm text-gray-500">
              Clique em Conectar para iniciar sua instância WhatsApp.<br />
              Você receberá um QR code para escanear com o celular.
            </p>
          </div>
          {actionMsg && <p className="text-xs text-red-500 text-center">{actionMsg}</p>}
          <button
            onClick={connect}
            disabled={busy}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {busy ? <RefreshCw size={15} className="animate-spin" /> : <Smartphone size={15} />}
            {busy ? 'Iniciando…' : 'Conectar WhatsApp'}
          </button>
        </div>
      </div>
    )
  }

  if (pageState === 'connecting') {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-800">WhatsApp — Aguardando QR</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm flex flex-col items-center gap-4 max-w-md mx-auto">
          <RefreshCw size={28} className="text-indigo-500 animate-spin" />
          <p className="text-sm text-gray-500 text-center">
            Container iniciando… o QR code aparecerá em instantes.<br />
            <span className="text-xs text-gray-400">Esta página atualiza automaticamente.</span>
          </p>
        </div>
      </div>
    )
  }

  if (pageState === 'waiting_qr') {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-800">WhatsApp — Escanear QR</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm flex flex-col items-center gap-5 max-w-md mx-auto">
          {instance?.qr ? (
            <>
              <img src={instance.qr} alt="QR code WhatsApp" className="w-56 h-56 border border-gray-200 rounded-xl" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-gray-700">
                  Abra o WhatsApp no celular
                </p>
                <p className="text-xs text-gray-500">
                  Dispositivos conectados → Conectar dispositivo → escaneie o código
                </p>
                <p className="text-xs text-gray-400 mt-2">O QR expira em 2 minutos e atualiza automaticamente.</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">Aguardando geração do QR…</p>
          )}
          <button
            onClick={disconnect}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            <LogOut size={12} /> Cancelar e remover instância
          </button>
        </div>
      </div>
    )
  }

  // connected
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Visão Geral — WhatsApp</h1>
          {instance?.jid && (
            <p className="text-xs text-gray-400 mt-0.5">
              Conectado como {instance.jid.replace(/:.*@/, '@')}
              {instance.connected_at && ` · desde ${new Date(instance.connected_at).toLocaleString('pt-BR')}`}
            </p>
          )}
        </div>
        <button
          onClick={disconnect}
          disabled={busy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          <LogOut size={12} /> Desconectar
        </button>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Total de grupos"    value={overview.total_groups} icon={Users}        color="blue" />
          <KpiCard label="Ativos hoje"         value={overview.active_today} icon={Activity}     color="green" />
          <KpiCard label="Silenciosos 3 dias"  value={overview.silent_3d}    icon={VolumeX}      color="yellow" />
          <KpiCard label="Silenciosos 7 dias"  value={overview.silent_7d}    icon={AlertTriangle} color="red" />
          <KpiCard label="Msgs 24h"           value={overview.messages_24h} icon={MessageSquare} color="blue" />
          <KpiCard label="Links 24h"          value={overview.links_24h}    icon={Link2}         color="gray" />
          <KpiCard label="Entradas 7d"        value={overview.joins_7d}     icon={UserPlus}      color="green" />
          <KpiCard label="Saídas 7d"          value={overview.leaves_7d}    icon={UserMinus}     color="red" />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <p className="text-sm text-gray-500">
          Dados capturados automaticamente pelo worker. Métricas diárias são calculadas às 01h00 UTC.
        </p>
      </div>
    </div>
  )
}
