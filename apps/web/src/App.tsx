import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Relatorio from './pages/Relatorio'
import Docs from './pages/Docs'
import Whatsapp from './pages/Whatsapp'
import Groups from './pages/Groups'
import GroupDetail from './pages/GroupDetail'
import Links from './pages/Links'
import Alerts from './pages/Alerts'
import Tasks from './pages/Tasks'
import Settings from './pages/Settings'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Carregando…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/relatorio" replace /> : <Login />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/relatorio" replace />} />
        <Route path="relatorio" element={<Relatorio />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="docs" element={<Docs />} />
        <Route path="whatsapp" element={<Whatsapp />} />
        <Route path="whatsapp/groups" element={<Groups />} />
        <Route path="whatsapp/groups/:id" element={<GroupDetail />} />
        <Route path="whatsapp/links" element={<Links />} />
        <Route path="whatsapp/alerts" element={<Alerts />} />
        <Route path="whatsapp/tasks" element={<Tasks />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/relatorio" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
