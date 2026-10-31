import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { SEED_NOTIFICATIONS, type ActivityEvent, type AppNotification, type Product } from '@/data/demo'
import { api, ApiError, type ApiBusiness, type ApiEvent, type ApiProduct, type MeResponse } from '@/lib/api'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import { useCommerce, type CommerceState } from '@/store/commerce'

/* ------------------------------------------------------------------ */
/* Session, business, agent status and escrow come from the backend.   */
/* Notifications are still front-end demo state (not yet migrated).    */
/* ------------------------------------------------------------------ */

export type AgentStatus = 'active' | 'idle' | 'paused'

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
  /** Masked GSTIN (full value only on the owner-only profile endpoint). */
  gstin?: string
  state?: string
  businessType?: string
}

interface AppState {
  auth: AuthState
  me: MeResponse | null
  business: ApiBusiness | null
  demoLoaded: boolean
  agentStatus: AgentStatus
  notifications: AppNotification[]
  importedDatasets: string[]
  /** Recent backend activity events in the legacy shape (rupees) used by reports. */
  activity: ActivityEvent[]
  /** The seller's catalogue from the backend (prices in rupees), the single source for prices and stock. */
  catalog: Product[]
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
  markNotificationsRead: () => void
  setAnalysisRun: () => void
  markDatasetImported: (key: string) => void
  resetImported: () => void
  /** Log an event from a browser-side feature into the backend activity log. */
  addActivity: (e: Omit<ActivityEvent, 'id' | 'time'>) => void
}

const AppContext = createContext<(AppState & AppActions & CommerceState) | null>(null)

const SIGNED_OUT: AuthState = { status: 'signed_out', loggedIn: false, onboarded: false, sellerName: '', storeName: '', email: '', plan: 'Growth Plan', emailVerified: false, isDemo: false }

function authFrom(me: MeResponse | null, loading = false): AuthState {
  if (loading) return { ...SIGNED_OUT, status: 'loading' }
  if (!me) return SIGNED_OUT
  return {
    status: 'signed_in', loggedIn: true, onboarded: !!me.business?.onboarded,
    sellerName: me.user.name, storeName: me.business?.name ?? '', email: me.user.email,
    plan: me.business?.plan ?? 'Growth Plan', emailVerified: me.user.emailVerified, isDemo: me.user.isDemo,
    gstin: me.business?.gstinMasked ?? undefined, state: me.business?.location?.state ?? undefined,
    businessType: me.business?.businessType ?? undefined,
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const data = useDataStore()
  const [me, setMeState] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<AppNotification[]>(SEED_NOTIFICATIONS)
  const [importedDatasets, setImportedDatasets] = useState<string[]>([])
  const signedIn = !!me

  // Shared reads for the browser-side commerce features.
  const productsQ = useApiQuery<{ products: ApiProduct[] }>(signedIn && me?.business ? '/api/products' : null, ['products'])
  const eventsQ = useApiQuery<{ items: ApiEvent[] }>(signedIn && me?.business ? '/api/activity/events?pageSize=200' : null, ['activity'])
  const catalog = useMemo<Product[]>(() => {
    return (productsQ.data?.products ?? []).map((p) => ({
      sku: p.sku, name: p.name, category: p.category, price: p.price / 100, cost: p.cost / 100, stock: p.stock,
      avgDailySales: p.avgDailySales, returnRate: p.returnRate, icon: p.icon, paused: p.paused,
    }))
  }, [productsQ.data])
  const activity = useMemo<ActivityEvent[]>(() => (eventsQ.data?.items ?? []).map((e) => ({
    id: String(e.id), time: e.time, agent: e.agent, action: e.action, product: e.product ?? undefined,
    amount: e.amount === null ? undefined : e.amount / 100, status: e.status, detail: e.detail ?? undefined,
  })), [eventsQ.data])

  const addActivity = useCallback((e: Omit<ActivityEvent, 'id' | 'time'>) => {
    api('/api/activity/events', { body: {
      agent: e.agent.slice(0, 80), action: e.action.slice(0, 200), status: e.status,
      product: e.product?.slice(0, 160) ?? null,
      amount: typeof e.amount === 'number' ? Math.round(e.amount * 100) : null,
      detail: e.detail?.slice(0, 2000) ?? null,
    } })
      .then(() => data.invalidate('activity'))
      .catch(() => { /* logging must never break the action that triggered it */ })
  }, [data])

  const pauseAgents = useCallback(async () => {
    try {
      await api('/api/agent/status', { method: 'PUT', body: { status: 'paused' } })
      const m = await api<MeResponse>('/api/auth/me')
      setMeState(m)
      data.invalidate('analytics', 'activity', 'agents')
    } catch (e) {
      toast.error('Couldn’t pause agents on the server', { description: e instanceof ApiError ? e.message : undefined })
    }
  }, [data])

  const commerce = useCommerce({
    auth: { sellerName: me?.user.name ?? '', storeName: me?.business?.name ?? '' },
    catalog, addActivity, pauseAgents, enabled: signedIn && !!me?.business,
  })
  const { seedCommerceDemo, resetCommerce } = commerce

  // Commerce demo data follows the backend's demo flag (e.g. after Demo Login or a reload).
  const demoFlag = !!me?.business?.demoLoaded
  useEffect(() => {
    if (demoFlag && commerce.marketplaceListings.length === 0) seedCommerceDemo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoFlag])

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
    resetCommerce()
  }, [data, resetCommerce])

  const loadDemoBusiness = useCallback(async (silent = false) => {
    try {
      await api('/api/demo/load', { method: 'POST' })
      await refreshMe()
      seedCommerceDemo()
      data.invalidate('products', 'analytics', 'wallet', 'agents', 'activity', 'negotiations', 'mandate', 'escrow')
      if (!silent) toast.success('Demo business loaded', { description: '5 products, 90 days of sales, suppliers and agent activity. This is sample data.' })
    } catch (e) {
      toast.error('Couldn’t load the demo business', { description: e instanceof ApiError ? e.message : undefined })
    }
  }, [refreshMe, data, seedCommerceDemo])

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

  const markNotificationsRead = useCallback(() => setNotifications((n) => n.map((x) => ({ ...x, read: true }))), [])
  const setAnalysisRun = useCallback(() => data.invalidate('analytics'), [data])
  const markDatasetImported = useCallback((key: string) => setImportedDatasets((d) => (d.includes(key) ? d : [...d, key])), [])
  const resetImported = useCallback(() => setImportedDatasets([]), [])

  const business = me?.business ?? null
  const value = useMemo(() => ({
    ...commerce,
    activity, catalog, addActivity,
    auth: authFrom(me, loading), me, business,
    demoLoaded: !!business?.demoLoaded,
    agentStatus: (business?.agentStatus ?? 'active') as AgentStatus,
    notifications, importedDatasets,
    refreshMe, login, demoLogin, register, logout, setMe, loadDemoBusiness, setAgentStatus,
    markNotificationsRead, setAnalysisRun, markDatasetImported, resetImported,
  }), [commerce, activity, catalog, addActivity, me, loading, business, notifications, importedDatasets, refreshMe, login, demoLogin, register,
    logout, setMe, loadDemoBusiness, setAgentStatus, markNotificationsRead, setAnalysisRun, markDatasetImported, resetImported])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
