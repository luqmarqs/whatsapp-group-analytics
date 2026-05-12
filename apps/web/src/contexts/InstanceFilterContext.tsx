import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { api, Instance } from '../lib/api'
import { useAuth } from './AuthContext'

interface InstanceFilterContextValue {
  instances: Instance[]
  selectedInstanceId: string
  setSelectedInstanceId: (id: string) => void
  loading: boolean
  instanceQuery: (prefix?: '?' | '&') => string
}

const InstanceFilterContext = createContext<InstanceFilterContextValue | null>(null)

const STORAGE_KEY = 'admin_instance_filter'

export function InstanceFilterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [instances, setInstances] = useState<Instance[]>([])
  const [selectedInstanceId, setSelectedInstanceIdState] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user?.role !== 'admin') {
      setInstances([])
      setSelectedInstanceIdState('')
      setLoading(false)
      return
    }

    setLoading(true)
    api.get<Instance[]>('/admin/instances')
      .then((list) => {
        setInstances(list)
        const saved = localStorage.getItem(STORAGE_KEY) ?? ''
        setSelectedInstanceIdState(saved && list.some((i) => i.id === saved) ? saved : '')
      })
      .catch(() => {
        setInstances([])
        setSelectedInstanceIdState('')
      })
      .finally(() => setLoading(false))
  }, [user?.role])

  const setSelectedInstanceId = (id: string) => {
    setSelectedInstanceIdState(id)
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  }

  const value = useMemo<InstanceFilterContextValue>(() => ({
    instances,
    selectedInstanceId,
    setSelectedInstanceId,
    loading,
    instanceQuery: (prefix = '?') =>
      selectedInstanceId ? `${prefix}instance_id=${encodeURIComponent(selectedInstanceId)}` : '',
  }), [instances, selectedInstanceId, loading])

  return (
    <InstanceFilterContext.Provider value={value}>
      {children}
    </InstanceFilterContext.Provider>
  )
}

export function useInstanceFilter() {
  const ctx = useContext(InstanceFilterContext)
  if (!ctx) throw new Error('useInstanceFilter must be used inside InstanceFilterProvider')
  return ctx
}
