import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  FIN, DEFAULT_MANDATE, SEED_ACTIVITY, SEED_NOTIFICATIONS, seedWalletTxns,
  type ActivityEvent, type AppNotification, type Mandate, type Product, type ServiceAgent, type WalletTxn,
} from '@/data/demo'
import { pseudoHash, txnId } from '@/lib/format'

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
  loggedIn: boolean
  onboarded: boolean
  sellerName: string
  storeName: string
  email: string
  plan: string
}

export interface AgentCallReceipt {
  txnId: string
  signature: string
  amount: number
  timestamp: string
  agentName: string
  productName: string
}

interface AppState {
  auth: AuthState
  demoLoaded: boolean
  agentStatus: AgentStatus
  agentsDiscovered: number
  lastExecution: string
  walletBalance: number
  walletTxns: WalletTxn[]
  escrow: EscrowOrder
  releasedTotal: number
  refundedTotal: number
  mandate: Mandate
  activity: ActivityEvent[]
  notifications: AppNotification[]
  negotiationDone: boolean
  analysisRunAt: string | null
  importedDatasets: string[]
  extraProducts: Product[]
}

interface AppActions {
  login: (email: string, sellerName?: string, storeName?: string) => void
  demoLogin: () => void
  register: (name: string, business: string, email: string) => void
  logout: () => void
  completeOnboarding: (storeName: string) => void
  loadDemoBusiness: (silent?: boolean) => void
  setAgentStatus: (s: AgentStatus) => void
  callAgent: (agent: ServiceAgent, sku: string, productName: string) => AgentCallReceipt | { error: string }
  topUpWallet: (amount: number) => void
  saveMandate: (m: Mandate) => void
  setEscrowStep: (step: number) => void
  markNegotiationDone: () => void
  addActivity: (e: Omit<ActivityEvent, 'id' | 'time'>) => void
  markNotificationsRead: () => void
  setAnalysisRun: () => void
  markDatasetImported: (key: string) => void
  resetImported: () => void
  addProduct: (p: Product) => void
}

const AppContext = createContext<(AppState & AppActions) | null>(null)

/* ------------------------------------------------------------------ */

const AUTH_KEY = 'ecommind.auth'
const MANDATE_KEY = 'ecommind.mandate'
const DEMO_KEY = 'ecommind.demo'

function loadAuth(): AuthState {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { loggedIn: false, onboarded: false, sellerName: '', storeName: '', email: '', plan: 'Growth Plan' }
}

function loadMandate(): Mandate {
  try {
    const raw = localStorage.getItem(MANDATE_KEY)
    if (raw) return { ...DEFAULT_MANDATE, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_MANDATE }
}

const SEED_ESCROW: EscrowOrder = {
  id: 'ESC-2026-1042',
  product: 'Wireless Earbuds',
  sku: 'EAR-001',
  supplier: 'Supplier B — Kedar Electronics',
  qty: 300,
  unitPrice: 180,
  total: 54000,
  status: 'Locked',
  createdAt: new Date().toISOString(),
  step: 1, // agreement signed + money locked
}

const EMPTY_ESCROW: EscrowOrder = { ...SEED_ESCROW, total: 0, qty: 0, status: 'Locked', step: 0 }

export function AppProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(loadAuth)
  const initialDemo = typeof window !== 'undefined' && localStorage.getItem(DEMO_KEY) === '1'
  const [demoLoaded, setDemoLoaded] = useState(initialDemo)
  const [agentStatus, setAgentStatusState] = useState<AgentStatus>('active')
  const [walletBalance, setWalletBalance] = useState(initialDemo ? FIN.walletOpeningBalance - FIN.serviceCallSpend - FIN.logisticsAdvance : FIN.walletOpeningBalance)
  const [walletTxns, setWalletTxns] = useState<WalletTxn[]>(initialDemo ? seedWalletTxns() : [])
  const [escrow, setEscrow] = useState<EscrowOrder>(initialDemo ? { ...SEED_ESCROW, createdAt: new Date().toISOString() } : EMPTY_ESCROW)
  const [releasedTotal, setReleasedTotal] = useState(0)
  const [mandate, setMandate] = useState<Mandate>(loadMandate)
  const [activity, setActivity] = useState<ActivityEvent[]>(initialDemo ? SEED_ACTIVITY : [])
  const [notifications, setNotifications] = useState<AppNotification[]>(initialDemo ? SEED_NOTIFICATIONS : [])
  const [negotiationDone, setNegotiationDone] = useState(initialDemo)
  const [analysisRunAt, setAnalysisRunAt] = useState<string | null>(null)
  const [importedDatasets, setImportedDatasets] = useState<string[]>([])
  const [extraProducts, setExtraProducts] = useState<Product[]>([])
  const [lastExecution, setLastExecution] = useState(new Date().toISOString())

  const persistAuth = (a: AuthState) => {
    setAuth(a)
    localStorage.setItem(AUTH_KEY, JSON.stringify(a))
  }

  const loadDemoBusiness = useCallback((silent = false) => {
    setDemoLoaded(true)
    localStorage.setItem(DEMO_KEY, '1')
    setWalletTxns(seedWalletTxns())
    setWalletBalance(FIN.walletOpeningBalance - FIN.serviceCallSpend - FIN.logisticsAdvance)
    setEscrow({ ...SEED_ESCROW, createdAt: new Date().toISOString() })
    setReleasedTotal(0)
    setActivity(SEED_ACTIVITY)
    setNotifications(SEED_NOTIFICATIONS)
    setNegotiationDone(true)
    setLastExecution(new Date().toISOString())
    setAgentStatusState('active')
    if (!silent) toast.success('Demo business loaded', { description: '5 products, 90 days of sales, suppliers, quotes and agent activity are live.' })
  }, [])

  const login = useCallback((email: string, sellerName = 'Aarav Sharma', storeName = '') => {
    persistAuth({ loggedIn: true, onboarded: Boolean(storeName), sellerName, storeName, email, plan: 'Growth Plan' })
  }, [])

  const demoLogin = useCallback(() => {
    persistAuth({ loggedIn: true, onboarded: true, sellerName: 'Aarav Sharma', storeName: 'UrbanNest Living', email: 'demo@ecommind.ai', plan: 'Growth Plan' })
    loadDemoBusiness(true)
    toast.success('Welcome back, Aarav', { description: 'Demo business loaded with live agent activity.' })
  }, [loadDemoBusiness])

  const register = useCallback((name: string, business: string, email: string) => {
    persistAuth({ loggedIn: true, onboarded: false, sellerName: name, storeName: business, email, plan: 'Growth Plan' })
    toast.success('Account created', { description: 'Let’s set up your business in under a minute.' })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem(DEMO_KEY)
    setAuth({ loggedIn: false, onboarded: false, sellerName: '', storeName: '', email: '', plan: 'Growth Plan' })
    setDemoLoaded(false)
    setWalletTxns([])
    setActivity([])
    setNotifications([])
    setEscrow(EMPTY_ESCROW)
    setReleasedTotal(0)
    setAnalysisRunAt(null)
    setImportedDatasets([])
  }, [])

  const completeOnboarding = useCallback((storeName: string) => {
    setAuth((a) => {
      const next = { ...a, onboarded: true, storeName: storeName || a.storeName }
      localStorage.setItem(AUTH_KEY, JSON.stringify(next))
      return next
    })
    toast.success('Setup complete', { description: 'Your autonomous economy is ready. Load the demo business to explore.' })
  }, [])

  const setAgentStatus = useCallback((s: AgentStatus) => {
    setAgentStatusState(s)
    if (s === 'paused') toast.warning('EcomMind paused', { description: 'All autonomous actions are on hold.' })
    if (s === 'active') toast.success('EcomMind started', { description: 'Agent ecommind-01 is discovering and working.' })
  }, [])

  const addActivity = useCallback((e: Omit<ActivityEvent, 'id' | 'time'>) => {
    setActivity((prev) => [{ ...e, id: `EV-${Date.now()}`, time: new Date().toISOString() }, ...prev])
    setLastExecution(new Date().toISOString())
  }, [])

  const callAgent = useCallback((agent: ServiceAgent, sku: string, productName: string): AgentCallReceipt | { error: string } => {
    if (mandate.agentsPaused || agentStatus === 'paused') return { error: 'All agents are paused. Resume EcomMind to place calls.' }
    if (agent.pricePerCall > mandate.maxPerCallCost)
      return { error: `Blocked by mandate: ₹${agent.pricePerCall}/call exceeds your ₹${mandate.maxPerCallCost} per-call limit.` }
    if (walletBalance < agent.pricePerCall) return { error: 'Insufficient wallet balance. Top up your micro-payment wallet.' }
    const id = txnId('TXN')
    const receipt: AgentCallReceipt = {
      txnId: id,
      signature: `sig:${pseudoHash(id + agent.id)}`,
      amount: agent.pricePerCall,
      timestamp: new Date().toISOString(),
      agentName: agent.name,
      productName,
    }
    setWalletBalance((b) => b - agent.pricePerCall)
    setWalletTxns((tx) => [
      { id, time: receipt.timestamp, counterparty: agent.name, kind: 'service_call', amount: -agent.pricePerCall, status: 'Completed', signature: receipt.signature, memo: `1 call · ${productName} (${sku})` },
      ...tx,
    ])
    addActivity({ agent: agent.name, action: `Purchased 1 ${agent.unit.replace('per ', '')}`, product: productName, amount: agent.pricePerCall, status: 'success', detail: `Receipt ${id} · signed ${receipt.signature}` })
    return receipt
  }, [mandate, agentStatus, walletBalance, addActivity])

  const topUpWallet = useCallback((amount: number) => {
    setWalletBalance((b) => b + amount)
    setWalletTxns((tx) => [
      { id: txnId('TXN'), time: new Date().toISOString(), counterparty: 'Wallet top-up (simulated)', kind: 'topup', amount, status: 'Completed', signature: `sig:${pseudoHash('topup' + Date.now())}`, memo: 'UPI top-up · demo funds' },
      ...tx,
    ])
    toast.success('Wallet topped up', { description: `₹${amount.toLocaleString('en-IN')} added (simulated).` })
  }, [])

  const saveMandate = useCallback((m: Mandate) => {
    setMandate(m)
    localStorage.setItem(MANDATE_KEY, JSON.stringify(m))
    if (m.agentsPaused) setAgentStatusState('paused')
    toast.success('Mandate saved', { description: 'EcomMind will operate within your updated limits.' })
  }, [])

  const setEscrowStep = useCallback((step: number) => {
    setEscrow((e) => {
      const status: EscrowOrder['status'] = step >= 4 ? 'Released' : step === 3 ? 'Delivered' : step === 2 ? 'In Transit' : 'Locked'
      return { ...e, step, status }
    })
    if (step === 2) addActivity({ agent: 'EcomMind', action: 'Supplier marked goods dispatched', product: 'Wireless Earbuds', status: 'info', detail: 'BlueDart AWB 8841-2091-CT · ETA 3 days.' })
    if (step === 4) {
      setReleasedTotal((r) => r + SEED_ESCROW.total)
      setWalletTxns((tx) => [
        { id: txnId('TXN'), time: new Date().toISOString(), counterparty: 'Supplier B — Kedar Electronics', kind: 'escrow_release', amount: SEED_ESCROW.total, status: 'Released', signature: `sig:${pseudoHash('release' + Date.now())}`, memo: 'Escrow released after delivery confirmation (simulated)' },
        ...tx,
      ])
      addActivity({ agent: 'EcomMind', action: '₹54,000 escrow released to Supplier B', product: 'Wireless Earbuds', amount: 54000, status: 'success', detail: 'Delivery confirmed; simulated payment released.' })
      toast.success('Escrow released', { description: '₹54,000 paid to Supplier B (simulated transaction).' })
    }
  }, [addActivity])

  const markNegotiationDone = useCallback(() => setNegotiationDone(true), [])
  const markNotificationsRead = useCallback(() => setNotifications((n) => n.map((x) => ({ ...x, read: true }))), [])
  const setAnalysisRun = useCallback(() => {
    setAnalysisRunAt(new Date().toISOString())
    addActivity({ agent: 'EcomMind', action: 'Full business analysis completed', status: 'success', detail: 'Forecast, pricing, return-risk and logistics intelligence refreshed.' })
  }, [addActivity])
  const markDatasetImported = useCallback((key: string) => setImportedDatasets((d) => (d.includes(key) ? d : [...d, key])), [])
  const resetImported = useCallback(() => setImportedDatasets([]), [])
  const addProduct = useCallback((p: Product) => {
    setExtraProducts((prev) => [...prev, p])
    addActivity({ agent: 'Seller', action: `Product added manually: ${p.name}`, product: p.name, status: 'success', detail: `SKU ${p.sku} · ${p.stock} units @ ₹${p.price}` })
  }, [addActivity])

  const value = useMemo(() => ({
    auth, demoLoaded, agentStatus,
    agentsDiscovered: 7, lastExecution,
    walletBalance, walletTxns, escrow, releasedTotal, refundedTotal: 0,
    mandate, activity, notifications, negotiationDone, analysisRunAt, importedDatasets, extraProducts,
    login, demoLogin, register, logout, completeOnboarding, loadDemoBusiness, setAgentStatus,
    callAgent, topUpWallet, saveMandate, setEscrowStep, markNegotiationDone, addActivity,
    markNotificationsRead, setAnalysisRun, markDatasetImported, resetImported, addProduct,
  }), [auth, demoLoaded, agentStatus, lastExecution, walletBalance, walletTxns, escrow, releasedTotal, mandate, activity, notifications, negotiationDone, analysisRunAt, importedDatasets, extraProducts, login, demoLogin, register, logout, completeOnboarding, loadDemoBusiness, setAgentStatus, callAgent, topUpWallet, saveMandate, setEscrowStep, markNegotiationDone, addActivity, markNotificationsRead, setAnalysisRun, markDatasetImported, resetImported, addProduct])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
