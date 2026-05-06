import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { DailyMetric } from '../lib/api'

interface Props {
  data: DailyMetric[]
}

export default function ActivityChart({ data }: Props) {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))

  const formatted = sorted.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
        />
        <Area
          type="monotone"
          dataKey="message_count"
          name="Mensagens"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#msgGrad)"
        />
        <Area
          type="monotone"
          dataKey="join_count"
          name="Entradas"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="none"
        />
        <Area
          type="monotone"
          dataKey="leave_count"
          name="Saídas"
          stroke="#ef4444"
          strokeWidth={2}
          fill="none"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
