import { NavLink } from 'react-router-dom'
import {
  BarChart2,
  Smartphone,
  Users,
  Link2,
  Bell,
  CheckSquare,
  Settings,
  BookOpen,
  ShieldCheck,
} from 'lucide-react'
import clsx from 'clsx'

const nav = [
  { to: '/relatorio',         label: 'Relatório',   icon: BarChart2 },
  { to: '/whatsapp/groups',   label: 'Grupos',      icon: Users },
  { to: '/whatsapp/links',    label: 'Links',       icon: Link2 },
  { to: '/whatsapp/alerts',   label: 'Alertas',     icon: Bell },
  { to: '/whatsapp/tasks',    label: 'Tarefas',     icon: CheckSquare },
  { to: '/whatsapp',          label: 'WhatsApp',    icon: Smartphone },
  { to: '/admin',             label: 'Admin',       icon: ShieldCheck },
  { to: '/docs',              label: 'API Docs',    icon: BookOpen },
  { to: '/settings',          label: 'Config',      icon: Settings },
]

export default function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 bg-gray-950 text-gray-400 flex flex-col">
      <div className="px-5 py-5 border-b border-gray-800">
        <span className="text-white font-bold text-sm tracking-tight leading-tight">
          WA Analytics
        </span>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/relatorio' || to === '/whatsapp'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'hover:bg-gray-800 hover:text-white text-gray-400',
              )
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
