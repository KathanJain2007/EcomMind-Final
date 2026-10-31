import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { FIN, SEED_NOTIFICATIONS, type AppNotification } from '@/data/demo'
import { api, ApiError, type ApiBusiness, type MeResponse } from '@/lib/api'
import { useDataStore } from '@/store/DataStore'

/* ------------------------------------------------------------------ */
/* Session, business and agent status come from the backend.           */
/* Escrow and notifications are still front-end demo state (not yet    */
/* migrated) and are labelled as simulated in the UI.                  */
/* ------------------------------------------------------------------ */

export type AgentStatus = 'active' | 'idle' | 'paused'

export interface EscrowOrder {
  id: string
  product: string
  sku: string
  supplier: string
  qty: number
  unitPrice: number
  total: number
  status: 'Locked' | 'In Transit' | 'Delivered' | 'Released'
  createdAt: string
  step: number // 0..4 through the 5-step process
}

export interface AuthState {
  status: 'loading' | 'signed_out' | 'signed_in'
  loggedIn: boolean
  onboarded: boolean
  sellerName: string
  storeName: string
  email: string
  plan: string
  emailVerified: boolean
  isDemo: boolean
}

interface AppState {
  auth: AuthState
  me: MeResponse | null
  business: ApiBusiness | null
  demoLoaded: boolean
  agentStatus: AgentStatus
  escrow: EscrowOrder
  releasedTotal: number
  refundedTotal: number
  notifications: AppNotification[]
  importedDatasets: string[]
}

interface AppActions {
  refreshMe: () => Promise<MeResponse | null>
  login: (email: string, password: string) => Promise<MeResponse>
  demoLogin: () => Promise<MeResponse>
  register: (input: { name: string; business: string; email: string; password: string; category: string }) => Promise<MeResponse>
  logout: () => Promise<void>
  setMe: (me: MeResponse) => void
  loadDemoBusiness: (silent?: boolean) => Promise<void>
  setAgentStatus: (s: 'active' | 'paused') => Promise<void>
  setEscrowStep: (step: number) => void
  markNotificationsRead: () => void
  setAnalysisRun: () => void
  markDatasetImported: (key: string) => void
  resetImported: () => void
}

const AppContext = createContext<(AppState & AppActions) | null>(null)

const SIGNED_OUT: AuthState = { status: 'signed_out', loggedIn: false, onboarded: false, sellerName: '', storeName: '', email: '', plan: 'Growth Plan', emailVerified: false, isDemo: false }

function authFrom(me: MeResponse | null, loading = false): AuthState {
  if (loading) return { ...SIGNED_OUT, status: 'loading' }
  if (!me) return SIGNED_OUT
  return {
    status: 'signed_in', loggedIn: true, onboarded: !!me.business?.onboarded,
    sellerName: me.user.name, storeName: me.business?.name ?? '', email: me.user.email,
    plan: me.business?.plan ?? 'Growth Plan', emailVerified: me.user.emailVerified, isDemo: me.user.isDemo,
  }
}

const SEED_ESCROW: EscrowOrder = {
  id: 'ESC-2026-1042', product: 'Wireless Earbuds', sku: 'EAR-001', supplier: 'Supplier B — Kedar Electronics',
  qty: 300, unitPrice: 180, total: 54000, status: 'Locked', createdAt: new Date().toISOString(), step: 1,
}

export function AppProvider({ children }: { children: ReactNode }) {
  const data = useDataStore()
  const [me, setMeState] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [escrow, setEscrow] = useState<EscrowOrder>(SEED_ESCROW)
  const [releasedTotal, setReleasedTotal] = useState(0)
  const [notifications, setNotifications] = useState<AppNotification[]>(SEED_NOTIFICATIONS)
  const [importedDatasets, setImportedDatasets] = useState<string[]>([])

  const setMe = useCallback((m: MeResponse) => setMeState(m), [])

  const refreshMe = useCallback(async () => {
    try {
      const m = await api<MeResponse>('/api/auth/me')
      setMeState(m)
      return m
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setMeState(null); return null }
      throw e
    }
  }, [])

  useEffect(() => {
    const onUnauthorized = () => { data.clear(); setMeState(null) }
    window.addEventListener('ecommind:unauthorized', onUnauthorized)
    return () => window.removeEventListener('ecommind:unauthorized', onUnauthorized)
  }, [data])

  useEffect(() => {
    let alive = true
    api<{ authenticated: boolean } & Partial<MeResponse>>('/api/auth/session')
      .then((s) => { if (alive) setMeState(s.authenticated ? (s as MeResponse) : null) })
      .catch(() => {
        toast.error('Can’t reach the EcomMind server', { description: 'Start the backend (see backend/README.md) and reload.' })
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const afterSignIn = useCallback((m: MeResponse) => {
    data.clear()
    setMeState(m)
    return m
  }, [data])

  const login = useCallback(async (email: string, password: string) => {
    const m = await api<MeResponse>('/api/auth/login', { body: { email, password } })
    return afterSignIn(m)
  }, [afterSignIn])

  const demoLogin = useCallback(async () => {
    const m = await api<MeResponse>('/api/auth/demo', { method: 'POST' })
    toast.success(`Welcome back, ${m.user.name.split(' ')[0]}`, { description: 'Demo business loaded.' })
    return afterSignIn(m)
  }, [afterSignIn])

  const register = useCallback(async (input: { name: string; business: string; email: string; password: string; category: string }) => {
    const m = await api<MeResponse>('/api/auth/register', { body: input })
    toast.success('Account created', { description: 'Let’s set up your business in under a minute.' })
    return afterSignIn(m)
  }, [afterSignIn])

  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* session may already be gone */ }
    data.clear()
    setMeState(null)
    setImportedDatasets([])
  }, [data])

  const loadDemoBusiness = useCallback(async (silent = false) => {
    try {
      await api('/api/demo/load', { method: 'POST' })
      await refreshMe()
      setEscrow({ ...SEED_ESCROW, createdAt: new Date().toISOString() })
      setReleasedTotal(0)
      data.invalidate('products', 'analytics', 'wallet', 'agents', 'activity', 'negotiations', 'mandate')
      if (!silent) toast.success('Demo business loaded', { description: '5 products, 90 days of sales, suppliers and agent activity. This is sample data.' })
    } catch (e) {
      toast.error('Couldn’t load the demo business', { description: e instanceof ApiError ? e.message : undefined })
    }
  }, [refreshMe, data])

  const setAgentStatus = useCallback(async (s: 'active' | 'paused') => {
    try {
      await api('/api/agent/status', { method: 'PUT', body: { status: s } })
      await refreshMe()
      data.invalidate('analytics', 'activity')
      if (s === 'paused') toast.warning('EcomMind paused', { description: 'All autonomous actions are on hold.' })
      else toast.success('EcomMind started', { description: 'Agent ecommind-01 is working within your mandate.' })
    } catch (e) {
      toast.error('Couldn’t change agent status', { description: e instanceof ApiError ? e.message : undefined })
    }
  }, [refreshMe, data])

  const setEscrowStep = useCallback((step: number) => {
    setEscrow((e) => {
      const status: EscrowOrder['status'] = step >= 4 ? 'Released' : step === 3 ? 'Delivered' : step === 2 ? 'In Transit' : 'Locked'
      return { ...e, step, status }
    })
    if (step === 4) {
      setReleasedTotal((r) => r + FIN.escrowLocked)
      toast.success('Escrow released', { description: '₹54,000 paid to Supplier B (simulated transaction).' })
    }
  }, [])

  const markNotificationsRead = useCallback(() => setNotifications((n) => n.map((x) => ({ ...x, read: true }))), [])
  const setAnalysisRun = useCallback(() => data.invalidate('analytics'), [data])
  const markDatasetImported = useCallback((key: string) => setImportedDatasets((d) => (d.includes(key) ? d : [...d, key])), [])
  const resetImported = useCallback(() => setImportedDatasets([]), [])

  const business = me?.business ?? null
  const value = useMemo(() => ({
    auth: authFrom(me, loading), me, business,
    demoLoaded: !!business?.demoLoaded,
    agentStatus: (business?.agentStatus ?? 'active') as AgentStatus,
    escrow, releasedTotal, refundedTotal: 0, notifications, importedDatasets,
    refreshMe, login, demoLogin, register, logout, setMe, loadDemoBusiness, setAgentStatus,
    setEscrowStep, markNotificationsRead, setAnalysisRun, markDatasetImported, resetImported,
  }), [me, loading, business, escrow, releasedTotal, notifications, importedDatasets, refreshMe, login, demoLogin, register,
    logout, setMe, loadDemoBusiness, setAgentStatus, setEscrowStep, markNotificationsRead, setAnalysisRun, markDatasetImported, resetImported])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
