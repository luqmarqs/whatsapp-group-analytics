import { LogOut, Server, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useInstanceFilter } from '../contexts/InstanceFilterContext'

export default function Topbar() {
  const { user, logout } = useAuth()
  const { instances, selectedInstanceId, setSelectedInstanceId, loading } = useInstanceFilter()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2">
        {user?.role === 'admin' && (
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <Server size={14} />
            <select
              value={selectedInstanceId}
              disabled={loading}
              onChange={(e) => setSelectedInstanceId(e.target.value)}
              className="h-8 min-w-[220px] rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Todas as instâncias</option>
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}{inst.user_name ? ` - ${inst.user_name}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <User size={15} />
          <span>{user?.name}</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-500 transition-colors"
        >
          <LogOut size={15} />
          Sair
        </button>
      </div>
    </header>
  )
}
