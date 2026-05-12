import { NavLink } from 'react-router-dom'
import {
  BarChart2, Smartphone, Users, Link2, Bell, CheckSquare,
  Settings, BookOpen, ShieldCheck,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'

const navAll = [
  { to: '/relatorio',       label: 'Relatório',  icon: BarChart2,    desc: 'Visão consolidada' },
  { to: '/whatsapp/groups', label: 'Grupos',     icon: Users,        desc: 'Seus grupos' },
  { to: '/whatsapp/links',  label: 'Links',      icon: Link2,        desc: 'URLs compartilhadas' },
  { to: '/whatsapp/alerts', label: 'Alertas',    icon: Bell,         desc: 'Notificações automáticas' },
  { to: '/whatsapp/tasks',  label: 'Tarefas',    icon: CheckSquare,  desc: 'Coordenação entre grupos' },
  { to: '/whatsapp',        label: 'WhatsApp',   icon: Smartphone,   desc: 'Conexão do celular' },
  { to: '/settings',        label: 'Config',     icon: Settings,     desc: 'Sua conta' },
]

const navAdmin = [
  { to: '/admin', label: 'Admin',    icon: ShieldCheck, desc: 'Usuários e instâncias' },
  { to: '/docs',  label: 'API Docs', icon: BookOpen,    desc: 'Referência da API' },
]

export default function Sidebar() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-950 text-gray-400 flex flex-col">
      <div className="px-5 py-5 border-b border-gray-800">
        <span className="text-white font-bold text-sm tracking-tight leading-tight">
          WA Analytics
        </span>
        {user && (
          <p className="text-xs text-gray-500 mt-1 truncate">{user.name}</p>
        )}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navAll.map(({ to, label, icon: Icon }) => (
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

        {isAdmin && (
          <>
            <div className="mx-3 my-2 border-t border-gray-800" />
            <p className="px-3 py-1 text-xs text-gray-600 uppercase tracking-wider">Administração</p>
            {navAdmin.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
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
          </>
        )}
      </nav>
    </aside>
  )
}
