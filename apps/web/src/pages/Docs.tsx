import { useState } from 'react'
import { ChevronDown, ChevronRight, Lock, Unlock } from 'lucide-react'

interface Param { name: string; type: string; required?: boolean; description: string }
interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  auth: boolean
  adminOnly?: boolean
  description: string
  queryParams?: Param[]
  bodyParams?: Param[]
  responseExample: string
}
interface Section { title: string; endpoints: Endpoint[] }

const METHOD_COLOR: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-green-100 text-green-700',
  PATCH: 'bg-yellow-100 text-yellow-700',
  DELETE: 'bg-red-100 text-red-700',
}

const sections: Section[] = [
  {
    title: 'Autenticação',
    endpoints: [
      {
        method: 'POST', path: '/auth/login', auth: false,
        description: 'Autentica um usuário e retorna um JWT válido por 7 dias.',
        bodyParams: [
          { name: 'email', type: 'string', required: true, description: 'E-mail do usuário' },
          { name: 'password', type: 'string', required: true, description: 'Senha' },
        ],
        responseExample: `{
  "token": "eyJhbGci...",
  "user": { "id": "uuid", "email": "...", "name": "...", "role": "admin" }
}`,
      },
      {
        method: 'GET', path: '/auth/me', auth: true,
        description: 'Retorna os dados do usuário autenticado.',
        responseExample: `{
  "id": "uuid", "email": "...", "name": "...", "role": "admin", "created_at": "..."
}`,
      },
      {
        method: 'PATCH', path: '/auth/me', auth: true,
        description: 'Atualiza nome e/ou senha do usuário autenticado.',
        bodyParams: [
          { name: 'name', type: 'string', description: 'Novo nome (mín. 2 chars)' },
          { name: 'current_password', type: 'string', description: 'Senha atual (obrigatória para trocar senha)' },
          { name: 'new_password', type: 'string', description: 'Nova senha (mín. 8 chars)' },
        ],
        responseExample: `{ "ok": true }`,
      },
    ],
  },
  {
    title: 'Instância WhatsApp',
    endpoints: [
      {
        method: 'GET', path: '/whatsapp/instance', auth: true,
        description: 'Retorna o status da instância WhatsApp e, se desconectada, o QR code como data URL PNG (expira em 2 min). A página de WhatsApp faz polling neste endpoint.',
        responseExample: `{
  "status": "disconnected",
  "jid": null,
  "connected_at": null,
  "qr": "data:image/png;base64,..."
}`,
      },
    ],
  },
  {
    title: 'Visão Geral',
    endpoints: [
      {
        method: 'GET', path: '/whatsapp/overview', auth: true,
        description: 'KPIs globais calculados em tempo real: total de grupos, ativos hoje, silenciosos, mensagens e links nas últimas 24h, entradas/saídas nos últimos 7 dias.',
        responseExample: `{
  "total_groups": 42,
  "active_today": 30,
  "silent_3d": 5,
  "silent_7d": 8,
  "messages_24h": 1204,
  "links_24h": 37,
  "joins_7d": 89,
  "leaves_7d": 21,
  "generated_at": "2026-05-11T18:00:00.000Z"
}`,
      },
      {
        method: 'GET', path: '/whatsapp/activity', auth: true,
        description: 'Atividade diária agregada de todos os grupos combinados. Útil para gráficos de tendência da rede.',
        queryParams: [
          { name: 'days', type: 'number', description: 'Janela em dias (padrão: 30, máx: 180)' },
        ],
        responseExample: `[
  {
    "date": "2026-05-10",
    "message_count": 3421,
    "join_count": 12,
    "leave_count": 4,
    "net_member_growth": 8,
    "unique_senders_count": 287
  }
]`,
      },
    ],
  },
  {
    title: 'Grupos',
    endpoints: [
      {
        method: 'GET', path: '/whatsapp/groups', auth: true,
        description: 'Lista todos os grupos monitorados com métricas de atividade. Suporta busca por nome.',
        queryParams: [
          { name: 'q', type: 'string', description: 'Filtro por nome do grupo (ILIKE)' },
        ],
        responseExample: `[
  {
    "id": "uuid",
    "group_jid": "120363...@g.us",
    "name": "Grupo Mobilização SP",
    "member_count": 385,
    "last_message_at": "2026-05-11T17:42:00Z",
    "messages_24h": 47,
    "silent_3d": false,
    "silent_7d": false
  }
]`,
      },
      {
        method: 'GET', path: '/whatsapp/top-groups', auth: true,
        description: 'Retorna grupos rankeados por mensagens no período, com métricas de crescimento de membros. Ideal para relatórios.',
        queryParams: [
          { name: 'days', type: 'number', description: 'Período em dias (padrão: 30, máx: 180)' },
        ],
        responseExample: `[
  {
    "id": "uuid", "name": "Grupo A", "member_count": 385,
    "messages_period": 1204, "joins_period": 12, "leaves_period": 3,
    "net_growth_period": 9, "active_members_period": 87
  }
]`,
      },
      {
        method: 'GET', path: '/whatsapp/groups/:id', auth: true,
        description: 'Detalhe de um grupo: metadados, métricas diárias dos últimos 30 dias, top links e alertas.',
        responseExample: `{
  "group": { "id": "uuid", "name": "...", "member_count": 385, ... },
  "metrics": [{ "date": "2026-05-10", "message_count": 47, ... }],
  "top_links": [{ "domain": "youtube.com", "count": 12, ... }],
  "alerts": [{ "alert_type": "activity_spike", "severity": "warning", ... }]
}`,
      },
      {
        method: 'GET', path: '/whatsapp/groups/:id/members', auth: true,
        description: 'Lista membros do grupo com telefone e nome (quando disponíveis). O nome é o pushName capturado das mensagens.',
        queryParams: [
          { name: 'active', type: 'boolean', description: 'true = apenas membros ativos, false = apenas ex-membros' },
        ],
        responseExample: `[
  {
    "id": "uuid",
    "role": "admin",
    "is_active": true,
    "joined_at": "2025-01-10T12:00:00Z",
    "left_at": null,
    "phone": "5511999999999",
    "name": "João Silva"
  }
]`,
      },
      {
        method: 'GET', path: '/whatsapp/groups/:id/member-evolution', auth: true,
        description: 'Evolução diária do total de membros e de entradas/saídas. Onde não há snapshot salvo, o total é reconstruído via soma cumulativa reversa de net_member_growth.',
        queryParams: [
          { name: 'days', type: 'number', description: 'Janela em dias (padrão: 90, máx: 365)' },
        ],
        responseExample: `[
  { "date": "2026-05-11", "member_count": 385, "join_count": 2, "leave_count": 0 }
]`,
      },
    ],
  },
  {
    title: 'Links',
    endpoints: [
      {
        method: 'GET', path: '/whatsapp/links', auth: true,
        description: 'Links detectados nas mensagens, agrupados por domínio + grupo. Retorna os 200 mais recentes.',
        queryParams: [
          { name: 'domain', type: 'string', description: 'Filtro por domínio (ILIKE)' },
          { name: 'group_id', type: 'uuid', description: 'Filtro por grupo' },
        ],
        responseExample: `[
  {
    "id": "uuid", "domain": "youtube.com", "url_hash": "abc123",
    "count": 12, "first_seen_at": "...", "last_seen_at": "...",
    "group_id": "uuid", "group_name": "Grupo A"
  }
]`,
      },
    ],
  },
  {
    title: 'Alertas',
    endpoints: [
      {
        method: 'GET', path: '/whatsapp/alerts', auth: true,
        description: 'Alertas gerados pelo cron diário. Tipos: silent_3d, silent_7d, activity_spike, activity_drop, viral_link.',
        queryParams: [
          { name: 'unread', type: 'boolean', description: 'true = apenas não lidos' },
        ],
        responseExample: `[
  {
    "id": "uuid", "alert_type": "silent_7d", "severity": "warning",
    "message": "Grupo silencioso há 7+ dias",
    "is_read": false, "created_at": "...",
    "group_id": "uuid", "group_name": "Grupo B"
  }
]`,
      },
      {
        method: 'PATCH', path: '/whatsapp/alerts/:id/read', auth: true,
        description: 'Marca um alerta como lido.',
        responseExample: `{ "ok": true }`,
      },
    ],
  },
  {
    title: 'Tarefas',
    endpoints: [
      {
        method: 'POST', path: '/whatsapp/tasks', auth: true,
        description: 'Cria uma tarefa de mobilização associada a um ou mais grupos.',
        bodyParams: [
          { name: 'title', type: 'string', required: true, description: 'Título da tarefa' },
          { name: 'description', type: 'string', description: 'Descrição detalhada' },
          { name: 'due_date', type: 'date', description: 'Data limite (YYYY-MM-DD)' },
          { name: 'priority', type: 'low|medium|high', description: 'Prioridade (padrão: medium)' },
          { name: 'group_ids', type: 'uuid[]', required: true, description: 'IDs dos grupos associados' },
        ],
        responseExample: `{ "id": "uuid", "title": "...", "priority": "high", ... }`,
      },
      {
        method: 'GET', path: '/whatsapp/tasks', auth: true,
        description: 'Lista todas as tarefas com status por grupo.',
        responseExample: `[
  {
    "id": "uuid", "title": "Mobilização maio", "priority": "high",
    "due_date": "2026-05-31",
    "group_statuses": [
      { "group_id": "uuid", "group_name": "...", "status": "in_progress", "notes": "..." }
    ]
  }
]`,
      },
      {
        method: 'PATCH', path: '/whatsapp/tasks/:id', auth: true,
        description: 'Atualiza status de uma tarefa em um grupo específico.',
        bodyParams: [
          { name: 'group_id', type: 'uuid', required: true, description: 'Grupo a atualizar' },
          { name: 'status', type: 'pending|in_progress|done|skipped', description: 'Novo status' },
          { name: 'notes', type: 'string', description: 'Observações' },
        ],
        responseExample: `{ "ok": true }`,
      },
    ],
  },
  {
    title: 'Admin',
    endpoints: [
      {
        method: 'POST', path: '/admin/create-first-user', auth: false, adminOnly: true,
        description: 'Cria o primeiro usuário admin. Requer o header X-Admin-Token com o valor de FIRST_ADMIN_TOKEN definido no .env. Funciona apenas uma vez — retorna 409 se já existir um usuário.',
        bodyParams: [
          { name: 'email', type: 'string', required: true, description: 'E-mail do admin' },
          { name: 'name', type: 'string', required: true, description: 'Nome' },
          { name: 'password', type: 'string', required: true, description: 'Senha (mín. 8 chars)' },
        ],
        responseExample: `{ "id": "uuid", "email": "...", "name": "...", "role": "admin" }`,
      },
      {
        method: 'POST', path: '/admin/run-jobs', auth: true, adminOnly: true,
        description: 'Dispara os cron jobs de métricas e alertas imediatamente (sem aguardar às 01h00 UTC). Requer role admin. Retorna instantaneamente; o processamento ocorre em background no worker via Redis pub/sub.',
        responseExample: `{ "ok": true, "message": "Jobs triggered..." }`,
      },
    ],
  },
  {
    title: 'Health',
    endpoints: [
      {
        method: 'GET', path: '/health', auth: false,
        description: 'Verifica a saúde da API, do banco de dados e do Redis. Útil para monitoramento externo (UptimeRobot, etc.).',
        responseExample: `{ "status": "ok", "db": "ok", "redis": "ok" }`,
      },
    ],
  },
]

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono w-14 text-center ${METHOD_COLOR[ep.method]}`}>
          {ep.method}
        </span>
        <code className="text-sm text-gray-800 font-mono flex-1">{ep.path}</code>
        <div className="flex items-center gap-2 shrink-0">
          {ep.adminOnly && <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">admin</span>}
          {ep.auth
            ? <Lock size={13} className="text-gray-400" />
            : <Unlock size={13} className="text-gray-300" />
          }
          {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
          <p className="text-sm text-gray-600">{ep.description}</p>

          {ep.auth && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Lock size={11} /> Requer header <code className="bg-gray-200 px-1 rounded">Authorization: Bearer &lt;token&gt;</code>
            </p>
          )}

          {ep.queryParams && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Query params</p>
              <table className="text-xs w-full">
                <tbody>
                  {ep.queryParams.map((p) => (
                    <tr key={p.name} className="border-b border-gray-100 last:border-0">
                      <td className="py-1 pr-3 font-mono text-indigo-600 w-32">{p.name}</td>
                      <td className="py-1 pr-3 text-gray-400 w-20">{p.type}</td>
                      <td className="py-1 text-gray-600">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {ep.bodyParams && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Body (JSON)</p>
              <table className="text-xs w-full">
                <tbody>
                  {ep.bodyParams.map((p) => (
                    <tr key={p.name} className="border-b border-gray-100 last:border-0">
                      <td className="py-1 pr-3 font-mono text-indigo-600 w-36">
                        {p.name}{p.required && <span className="text-red-400 ml-0.5">*</span>}
                      </td>
                      <td className="py-1 pr-3 text-gray-400 w-24">{p.type}</td>
                      <td className="py-1 text-gray-600">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Exemplo de resposta</p>
            <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto leading-relaxed">
              {ep.responseExample}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Docs() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Documentação da API</h1>
        <p className="text-sm text-gray-500 mt-1">
          Base URL: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/api</code> &nbsp;·&nbsp;
          Todos os endpoints retornam JSON &nbsp;·&nbsp;
          <Lock size={11} className="inline mb-0.5" /> = requer JWT no header Authorization
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Autenticação:</strong> faça <code className="bg-amber-100 px-1 rounded">POST /auth/login</code> para obter o token, depois inclua{' '}
        <code className="bg-amber-100 px-1 rounded">Authorization: Bearer &lt;token&gt;</code> em todos os requests protegidos.
      </div>

      {sections.map((s) => (
        <div key={s.title}>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{s.title}</h2>
          <div className="space-y-2">
            {s.endpoints.map((ep) => (
              <EndpointCard key={`${ep.method}${ep.path}`} ep={ep} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
