const BASE = '/api'

function getToken() {
  return localStorage.getItem('token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// ── Typed helpers ─────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string
  user: { id: string; email: string; name: string; role: string }
}

export interface Overview {
  total_groups: number
  active_today: number
  silent_3d: number
  silent_7d: number
  messages_24h: number
  links_24h: number
  joins_7d: number
  leaves_7d: number
  generated_at: string
}

export interface Group {
  id: string
  group_jid: string
  name: string
  member_count: number
  last_message_at: string | null
  messages_24h: number
  silent_3d: boolean
  silent_7d: boolean
  created_at: string
  updated_at: string
}

export interface GroupDetail {
  group: Group
  metrics: DailyMetric[]
  top_links: Link[]
  alerts: Alert[]
}

export interface DailyMetric {
  date: string
  message_count: number
  link_count: number
  media_count: number
  join_count: number
  leave_count: number
  unique_senders_count: number
  net_member_growth: number
}

export interface MemberEvolution {
  date: string
  member_count: number
  join_count: number
  leave_count: number
}

export interface Link {
  id: string
  url_hash: string
  domain: string
  count: number
  first_seen_at: string
  last_seen_at: string
  group_id: string
  group_name: string
}

export interface Alert {
  id: string
  alert_type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  metadata: Record<string, unknown>
  is_read: boolean
  created_at: string
  group_id: string
  group_name: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high'
  created_by: string
  created_by_name: string
  created_at: string
  group_statuses: TaskStatus[]
}

export interface TaskStatus {
  id: string
  task_id: string
  group_id: string
  group_name: string
  status: 'pending' | 'in_progress' | 'done' | 'skipped'
  notes: string | null
  completed_at: string | null
}
