import clsx from 'clsx'
import { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: number | string
  icon: LucideIcon
  color?: 'green' | 'yellow' | 'red' | 'blue' | 'gray'
  subtitle?: string
}

const colorMap = {
  green:  'bg-green-50  text-green-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  red:    'bg-red-50    text-red-600',
  blue:   'bg-blue-50   text-blue-600',
  gray:   'bg-gray-100  text-gray-600',
}

export default function KpiCard({ label, value, icon: Icon, color = 'gray', subtitle }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4 shadow-sm">
      <div className={clsx('p-2.5 rounded-lg', colorMap[color])}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-800 leading-tight">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}
