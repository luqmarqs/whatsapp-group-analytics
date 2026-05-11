import { NavLink } from 'react-router-dom'
import {
  BarChart2,
  MessageSquare,
  Users,
  Link2,
  Bell,
  CheckSquare,
  Settings,
  FileText,
  BookOpen,
} from 'lucide-react'
import clsx from 'clsx'

const nav = [
  { to: '/relatorio',         label: 'Relatório',   icon: BarChart2 },
  { to: '/whatsapp',          label: 'Visão Geral', icon: MessageSquare },
  { to: '/whatsapp/groups',   label: 'Grupos',      icon: Users },
  { to: '/whatsapp/links',    label: 'Links',       icon: Link2 },
  { to: '/whatsapp/alerts',   label: 'Alertas',     icon: Bell },
  { to: '/whatsapp/tasks',    label: 'Tarefas',     icon: CheckSquare },
  { to: '/docs',              label: 'API Docs',    icon: BookOpen },
  { to: '/settings',          label: 'Config',      icon: Settings },
]

export default function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 text-gray-300 flex flex-col">
      <div className="px-5 py-5 border-b border-gray-700">
        <span className="text-white font-semibold text-sm leading-tight">
          WhatsApp<br />
          <span className="text-brand-500">Analytics</span>
        </span>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard' || to === '/whatsapp'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'hover:bg-gray-800 hover:text-white',
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
