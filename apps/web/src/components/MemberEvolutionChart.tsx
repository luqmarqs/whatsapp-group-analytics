import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { MemberEvolution } from '../lib/api'

interface Props {
  data: MemberEvolution[]
}

export default function MemberEvolutionChart({ data }: Props) {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))

  const formatted = sorted.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    member_count: Number(d.member_count),
  }))

  const memberMin = Math.max(0, Math.min(...formatted.map((d) => d.member_count)) - 5)
  const memberMax = Math.max(...formatted.map((d) => d.member_count)) + 5

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />

        {/* Left axis: total de membros */}
        <YAxis
          yAxisId="members"
          domain={[memberMin, memberMax]}
          tick={{ fontSize: 11 }}
          width={45}
        />
        {/* Right axis: entradas / saídas (escala menor) */}
        <YAxis
          yAxisId="events"
          orientation="right"
          tick={{ fontSize: 11 }}
          width={35}
          allowDecimals={false}
        />

        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          formatter={(value: number, name: string) => {
            const labels: Record<string, string> = {
              member_count: 'Total membros',
              join_count:   'Entradas',
              leave_count:  'Saídas',
            }
            return [value, labels[name] ?? name]
          }}
        />
        <Legend
          formatter={(value) => {
            const labels: Record<string, string> = {
              member_count: 'Total membros',
              join_count:   'Entradas',
              leave_count:  'Saídas',
            }
            return <span style={{ fontSize: 12 }}>{labels[value] ?? value}</span>
          }}
        />

        {/* Barras de entradas e saídas (eixo direito) */}
        <Bar yAxisId="events" dataKey="join_count"  name="join_count"  fill="#86efac" radius={[3,3,0,0]} maxBarSize={18} />
        <Bar yAxisId="events" dataKey="leave_count" name="leave_count" fill="#fca5a5" radius={[3,3,0,0]} maxBarSize={18} />

        {/* Linha do total de membros (eixo esquerdo) */}
        <Line
          yAxisId="members"
          type="monotone"
          dataKey="member_count"
          name="member_count"
          stroke="#6366f1"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
