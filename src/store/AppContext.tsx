/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  FIN, DEFAULT_MANDATE, SEED_ACTIVITY, SEED_NOTIFICATIONS, seedWalletTxns, PRODUCTS,
  type ActivityEvent, type AppNotification, type Mandate, type Product, type ServiceAgent, type WalletTxn,
} from '@/data/demo'
import {
  type GSTINProfile, type MarketplaceConfig, type MarketplaceListing, type MarketplaceOrder,
  type InventoryMovement, type PricingRuleConfig, type PriceChangeLog, type FestivalEvent,
  type SupplierPurchaseRecord, type SupplierDeliveryRecord, type SupplierRelationshipRecord,
  type AutonomyLevel, type SignedMandate, type ApprovalQueueItem, type GeneratedReportRecord,
  DEMO_GSTIN_PROFILE, INITIAL_MARKETPLACES, DEFAULT_PRICING_RULES, INITIAL_SIGNED_MANDATE,
  validateGSTIN, seedMarketplaceListings, seedMarketplaceOrders, seedPriceHistory,
  seedFestivalCalendar, seedSupplierHistory, seedApprovalQueue, seedReportHistory,
  calculateSupplierScore,
} from '@/data/models'
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
  gstin?: string
  businessAddress?: string
  state?: string
  businessType?: string
  gstinVerified?: boolean
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
  // Existing state preserved
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

  // New enhanced state
  gstinProfile: GSTINProfile | null
  marketplaces: MarketplaceConfig[]
  marketplaceListings: MarketplaceListing[]
  marketplaceOrders: MarketplaceOrder[]
  inventoryMovements: InventoryMovement[]
  pricingRules: PricingRuleConfig
  priceHistory: PriceChangeLog[]
  festivalEvents: FestivalEvent[]
  supplierPurchases: SupplierPurchaseRecord[]
  supplierDeliveries: SupplierDeliveryRecord[]
  supplierRelationships: Record<string, SupplierRelationshipRecord>
  autonomyLevel: AutonomyLevel
  signedMandate: SignedMandate
  approvalQueue: ApprovalQueueItem[]
  reportHistory: GeneratedReportRecord[]
}

interface AppActions {
  // Existing actions preserved
  login: (email: string, sellerName?: string, storeName?: string) => void
  demoLogin: () => void
  register: (
    name: string,
    business: string,
    email: string,
    gstin?: string,
    address?: string,
    state?: string,
    businessType?: string
  ) => void
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

  // New enhanced actions
  verifyAndSaveGSTIN: (gstin: string, address?: string, businessType?: string) => { valid: boolean; error?: string }
  createMarketplaceListing: (listing: Omit<MarketplaceListing, 'id' | 'lastSyncAt' | 'ordersCount' | 'unitsSold' | 'revenue'>) => void
  updateListingPriceAndStock: (id: string, price: number, stock: number) => void
  toggleMarketplaceStatus: (id: string, newStatus: MarketplaceListing['status']) => void
  simulateMarketplaceOrder: (marketplace: MarketplaceConfig['id'], sku: string, units?: number) => { success: boolean; error?: string }
  executeReprice: (
    sku: string,
    newPrice: number,
    agentName: string,
    reason: string
  ) => { success: boolean; queuedForApproval?: boolean; error?: string }
  updatePricingRules: (rules: Partial<PricingRuleConfig>) => void
  applyFestivalCampaign: (festivalId: string, discountPct: number, skus: string[]) => { success: boolean; queued?: boolean; message: string }
  setAutonomyLevel: (lvl: AutonomyLevel) => void
  approveQueuedAction: (id: string, modParams?: unknown) => void
  rejectQueuedAction: (id: string, reason?: string) => void
  emergencyKillSwitch: () => void
  saveGeneratedReport: (r: Omit<GeneratedReportRecord, 'id' | 'generatedAt'>) => GeneratedReportRecord
  getSupplierPerformance: (supplierId: string) => ReturnType<typeof calculateSupplierScore> | null
  getAiSupplierRecommendation: (sku: string, urgency: 'low' | 'normal' | 'urgent', targetQty?: number) => {
    recommendedSupplierId: string
    reason: string
    comparison: Array<{ supplierId: string; name: string; quote: number; days: number; score: number; verdict: string }>
  }
}

const AppContext = createContext<(AppState & AppActions) | null>(null)

/* ------------------------------------------------------------------ */

const AUTH_KEY = 'ecommind.auth'
const MANDATE_KEY = 'ecommind.mandate'
const DEMO_KEY = 'ecommind.demo'
const GSTIN_KEY = 'ecommind.gstin'
const AUTONOMY_KEY = 'ecommind.autonomy'
const PRICING_RULES_KEY = 'ecommind.pricing_rules'
const REPORT_HISTORY_KEY = 'ecommind.report_history'

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
  step: 1,
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

  // Enhanced Sub-Systems State
  const [gstinProfile, setGstinProfile] = useState<GSTINProfile | null>(() => {
    try {
      const raw = localStorage.getItem(GSTIN_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return initialDemo ? DEMO_GSTIN_PROFILE : null
  })

  const [marketplaces, setMarketplaces] = useState<MarketplaceConfig[]>(INITIAL_MARKETPLACES)
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>(initialDemo ? seedMarketplaceListings() : [])
  const [marketplaceOrders, setMarketplaceOrders] = useState<MarketplaceOrder[]>(initialDemo ? seedMarketplaceOrders() : [])
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([])
  const [pricingRules, setPricingRules] = useState<PricingRuleConfig>(() => {
    try {
      const raw = localStorage.getItem(PRICING_RULES_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return DEFAULT_PRICING_RULES
  })
  const [priceHistory, setPriceHistory] = useState<PriceChangeLog[]>(initialDemo ? seedPriceHistory() : [])
  const [festivalEvents, setFestivalEvents] = useState<FestivalEvent[]>(seedFestivalCalendar())

  const seedSup = useMemo(() => seedSupplierHistory(), [])
  const [supplierPurchases, setSupplierPurchases] = useState<SupplierPurchaseRecord[]>(initialDemo ? seedSup.purchases : [])
  const [supplierDeliveries, setSupplierDeliveries] = useState<SupplierDeliveryRecord[]>(initialDemo ? seedSup.deliveries : [])
  const [supplierRelationships, setSupplierRelationships] = useState<Record<string, SupplierRelationshipRecord>>(initialDemo ? seedSup.relationships : {})

  const [autonomyLevel, setAutonomyLevelState] = useState<AutonomyLevel>(() => {
    try {
      const raw = localStorage.getItem(AUTONOMY_KEY)
      if (raw) return Number(raw) as AutonomyLevel
    } catch { /* ignore */ }
    return 2 // Approval-based by default
  })

  const [signedMandate, setSignedMandate] = useState<SignedMandate>(INITIAL_SIGNED_MANDATE)
  const [approvalQueue, setApprovalQueue] = useState<ApprovalQueueItem[]>(initialDemo ? seedApprovalQueue() : [])

  const [reportHistory, setReportHistory] = useState<GeneratedReportRecord[]>(() => {
    try {
      const raw = localStorage.getItem(REPORT_HISTORY_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return initialDemo ? seedReportHistory() : []
  })

  const persistAuth = (a: AuthState) => {
    setAuth(a)
    localStorage.setItem(AUTH_KEY, JSON.stringify(a))
  }

  const addActivity = useCallback((e: Omit<ActivityEvent, 'id' | 'time'>) => {
    setActivity((prev) => [{ ...e, id: `EV-${Date.now()}-${Math.floor(Math.random() * 1000)}`, time: new Date().toISOString() }, ...prev])
    setLastExecution(new Date().toISOString())
  }, [])

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

    // Seed enhanced systems
    setGstinProfile(DEMO_GSTIN_PROFILE)
    localStorage.setItem(GSTIN_KEY, JSON.stringify(DEMO_GSTIN_PROFILE))
    setMarketplaces(INITIAL_MARKETPLACES)
    setMarketplaceListings(seedMarketplaceListings())
    setMarketplaceOrders(seedMarketplaceOrders())
    setPriceHistory(seedPriceHistory())
    setFestivalEvents(seedFestivalCalendar())
    const sup = seedSupplierHistory()
    setSupplierPurchases(sup.purchases)
    setSupplierDeliveries(sup.deliveries)
    setSupplierRelationships(sup.relationships)
    setApprovalQueue(seedApprovalQueue())
    setReportHistory(seedReportHistory())
    setSignedMandate(INITIAL_SIGNED_MANDATE)

    if (!silent) toast.success('Demo business loaded', { description: 'Complete multi-marketplace, supplier relationships, AI pricing & GSTIN business profile are live.' })
  }, [])

  const login = useCallback((email: string, sellerName = 'Aarav Sharma', storeName = '') => {
    persistAuth({ loggedIn: true, onboarded: Boolean(storeName), sellerName, storeName, email, plan: 'Growth Plan' })
  }, [])

  const demoLogin = useCallback(() => {
    persistAuth({
      loggedIn: true,
      onboarded: true,
      sellerName: 'Aarav Sharma',
      storeName: 'UrbanNest Living',
      email: 'demo@ecommind.ai',
      plan: 'Growth Plan',
      gstin: DEMO_GSTIN_PROFILE.gstin,
      businessAddress: DEMO_GSTIN_PROFILE.businessAddress,
      state: DEMO_GSTIN_PROFILE.state,
      businessType: DEMO_GSTIN_PROFILE.businessType,
      gstinVerified: true,
    })
    loadDemoBusiness(true)
    toast.success('Welcome back, Aarav', { description: 'Demo business loaded with live multi-marketplace & AI activity.' })
  }, [loadDemoBusiness])

  const register = useCallback((
    name: string,
    business: string,
    email: string,
    gstin?: string,
    address?: string,
    state?: string,
    businessType?: string
  ) => {
    let verified = false
    let validatedState = state || ''

    if (gstin) {
      const v = validateGSTIN(gstin)
      if (v.valid) {
        verified = true
        validatedState = v.state || validatedState
        const prof: GSTINProfile = {
          gstin: gstin.toUpperCase(),
          legalName: `${business.toUpperCase()} ENTERPRISES`,
          tradeName: business,
          businessAddress: address || 'Industrial Area',
          state: validatedState,
          stateCode: gstin.slice(0, 2),
          businessType: (businessType as GSTINProfile['businessType']) || 'Private Limited',
          panNumber: gstin.slice(2, 12),
          verified: true,
          verifiedAt: new Date().toISOString(),
          taxpayerType: 'Regular',
          registrationDate: new Date().toISOString().slice(0, 10),
          status: 'Active',
        }
        setGstinProfile(prof)
        localStorage.setItem(GSTIN_KEY, JSON.stringify(prof))
      }
    }

    persistAuth({
      loggedIn: true,
      onboarded: false,
      sellerName: name,
      storeName: business,
      email,
      plan: 'Growth Plan',
      gstin,
      businessAddress: address,
      state: validatedState,
      businessType,
      gstinVerified: verified,
    })
    toast.success('Account created', { description: verified ? 'GSTIN verified! Let’s complete onboarding.' : 'Let’s set up your business in under a minute.' })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem(DEMO_KEY)
    localStorage.removeItem(GSTIN_KEY)
    setAuth({ loggedIn: false, onboarded: false, sellerName: '', storeName: '', email: '', plan: 'Growth Plan' })
    setDemoLoaded(false)
    setWalletTxns([])
    setActivity([])
    setNotifications([])
    setEscrow(EMPTY_ESCROW)
    setReleasedTotal(0)
    setAnalysisRunAt(null)
    setImportedDatasets([])
    setGstinProfile(null)
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

  /* ------------------------------------------------------------------ */
  /* Enhanced Feature Actions                                           */
  /* ------------------------------------------------------------------ */

  // Feature 2: GSTIN verification
  const verifyAndSaveGSTIN = useCallback((gstin: string, address = '', businessType = 'Private Limited') => {
    const v = validateGSTIN(gstin)
    if (!v.valid) {
      return { valid: false, error: v.error }
    }
    const prof: GSTINProfile = {
      gstin: gstin.toUpperCase(),
      legalName: `${auth.storeName || 'URBANNEST'}`.toUpperCase() + ' ENTERPRISES',
      tradeName: auth.storeName || 'UrbanNest Living',
      businessAddress: address || auth.businessAddress || 'Plot 42, Sitapura Industrial Area, Tonk Road',
      state: v.state || 'Rajasthan',
      stateCode: gstin.slice(0, 2),
      businessType: (businessType as GSTINProfile['businessType']) || 'Private Limited',
      panNumber: gstin.slice(2, 12),
      verified: true,
      verifiedAt: new Date().toISOString(),
      taxpayerType: 'Regular',
      registrationDate: '2021-04-18',
      status: 'Active',
    }
    setGstinProfile(prof)
    localStorage.setItem(GSTIN_KEY, JSON.stringify(prof))
    setAuth((a) => {
      const next = { ...a, gstin: prof.gstin, businessAddress: prof.businessAddress, state: prof.state, gstinVerified: true }
      localStorage.setItem(AUTH_KEY, JSON.stringify(next))
      return next
    })
    addActivity({
      agent: 'Security & Auth Subsystem',
      action: `GSTIN Verified: ${prof.gstin}`,
      status: 'success',
      detail: `Legal Name: ${prof.legalName} · State: ${prof.state} · Taxpayer: ${prof.taxpayerType}`,
    })
    toast.success('GSTIN verified successfully', { description: `Active registration confirmed for ${prof.legalName} (${prof.state}).` })
    return { valid: true }
  }, [auth, addActivity])

  // Feature 3: Multi-Marketplace selling & synchronization
  const createMarketplaceListing = useCallback((listingData: Omit<MarketplaceListing, 'id' | 'lastSyncAt' | 'ordersCount' | 'unitsSold' | 'revenue'>) => {
    const id = `LST-${listingData.marketplace.toUpperCase()}-${listingData.sku}-${Date.now().toString(36)}`
    const newListing: MarketplaceListing = {
      ...listingData,
      id,
      ordersCount: 0,
      unitsSold: 0,
      revenue: 0,
      lastSyncAt: new Date().toISOString(),
    }
    setMarketplaceListings((prev) => [newListing, ...prev])
    addActivity({
      agent: 'Marketplace Integration Agent',
      action: `Listed on ${listingData.marketplace.toUpperCase()}: ${listingData.title}`,
      product: listingData.sku,
      status: 'success',
      detail: `Price ₹${listingData.price} · Available Stock: ${listingData.stock} units. ID: ${listingData.marketplaceListingId}`,
    })
    toast.success('Listing created', { description: `Product ${listingData.sku} live on ${listingData.marketplace.toUpperCase()}.` })
  }, [addActivity])

  const updateListingPriceAndStock = useCallback((id: string, price: number, stock: number) => {
    setMarketplaceListings((prev) =>
      prev.map((l) => (l.id === id ? { ...l, price, stock, lastSyncAt: new Date().toISOString() } : l))
    )
    toast.success('Listing updated', { description: `Price set to ₹${price}, stock set to ${stock}.` })
  }, [])

  const toggleMarketplaceStatus = useCallback((id: string, newStatus: MarketplaceListing['status']) => {
    setMarketplaceListings((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: newStatus, lastSyncAt: new Date().toISOString() } : l))
    )
    toast.info(`Listing status changed to ${newStatus}`)
  }, [])

  const simulateMarketplaceOrder = useCallback((marketplace: MarketplaceConfig['id'], sku: string, units = 1) => {
    const product = [...PRODUCTS, ...extraProducts].find((p) => p.sku === sku)
    if (!product) return { success: false, error: 'Product SKU not found' }
    if (product.stock < units) {
      toast.error('Overselling prevented!', { description: `Stock (${product.stock}) is insufficient for ${units} units order.` })
      return { success: false, error: 'Insufficient inventory available' }
    }

    const listing = marketplaceListings.find((l) => l.marketplace === marketplace && l.sku === sku)
    const price = listing ? listing.price : product.price
    const commPct = marketplace === 'amazon' ? 0.145 : marketplace === 'flipkart' ? 0.12 : marketplace === 'meesho' ? 0.015 : 0.02
    const commission = Math.round(price * units * commPct)
    const shipping = 45 * units
    const packaging = 15 * units
    const tax = Math.round(price * units * 0.18)
    const netProfit = (price * units) - (product.cost * units) - commission - shipping - packaging - (tax * 0.1)

    // Deduct stock centrally
    const newStock = product.stock - units
    product.stock = newStock

    // Synchronize across all marketplace listings for this SKU
    setMarketplaceListings((prev) =>
      prev.map((l) =>
        l.sku === sku
          ? {
              ...l,
              stock: newStock,
              status: newStock === 0 ? 'out_of_stock' : l.status,
              ordersCount: l.marketplace === marketplace ? l.ordersCount + 1 : l.ordersCount,
              unitsSold: l.marketplace === marketplace ? l.unitsSold + units : l.unitsSold,
              revenue: l.marketplace === marketplace ? l.revenue + (price * units) : l.revenue,
              lastSyncAt: new Date().toISOString(),
            }
          : l
      )
    )

    // Record order
    const orderId = `ORD-${Date.now().toString().slice(-6)}`
    const newOrder: MarketplaceOrder = {
      id: orderId,
      orderNumber: `OD${Date.now().toString().slice(-7)}`,
      marketplace,
      sku,
      productName: product.name,
      units,
      sellingPrice: price,
      commission,
      shippingCost: shipping,
      packagingCost: packaging,
      taxAmount: tax,
      netProfit,
      status: 'confirmed',
      customerCity: 'Bengaluru',
      customerState: 'Karnataka',
      customerPincode: '560001',
      createdAt: new Date().toISOString(),
    }
    setMarketplaceOrders((prev) => [newOrder, ...prev])

    // Record inventory movement
    const movement: InventoryMovement = {
      id: `MOV-${Date.now()}`,
      timestamp: new Date().toISOString(),
      sku,
      productName: product.name,
      delta: -units,
      type: 'sale',
      channel: marketplace.toUpperCase(),
      reason: `Customer order ${orderId} reserved & confirmed`,
      resultingStock: newStock,
    }
    setInventoryMovements((prev) => [movement, ...prev])

    addActivity({
      agent: 'Marketplace Sync Engine',
      action: `New Order (${marketplace.toUpperCase()}): ${units} × ${product.name}`,
      product: product.name,
      amount: price * units,
      status: 'success',
      detail: `Order ${orderId} confirmed · Net Profit: ₹${netProfit.toLocaleString('en-IN')} · Stock synchronized to ${newStock} units across all channels.`,
    })

    toast.success(`New order on ${marketplace.toUpperCase()}!`, {
      description: `${units} × ${product.name} @ ₹${price}. Inventory synchronized automatically.`,
    })

    return { success: true }
  }, [extraProducts, marketplaceListings, addActivity])

  // Feature 4: AI Dynamic Pricing with strict financial safeguards
  const updatePricingRules = useCallback((rules: Partial<PricingRuleConfig>) => {
    setPricingRules((prev) => {
      const next = { ...prev, ...rules }
      localStorage.setItem(PRICING_RULES_KEY, JSON.stringify(next))
      return next
    })
    toast.success('Pricing rules updated', { description: 'Safeguard margins and discount limits refreshed.' })
  }, [])

  const executeReprice = useCallback((
    sku: string,
    newPrice: number,
    agentName: string,
    reason: string
  ): { success: boolean; queuedForApproval?: boolean; error?: string } => {
    const all = [...PRODUCTS, ...extraProducts]
    const p = all.find((x) => x.sku === sku)
    if (!p) return { success: false, error: 'Product SKU not found' }

    // 1. Check max price change %
    const pctChange = Math.round(((newPrice - p.price) / p.price) * 1000) / 10
    const maxChangeAllowed = pricingRules.maxPriceChangePct
    const withinChangeBand = Math.abs(pctChange) <= maxChangeAllowed

    // 2. Check gross profit margin with commissions and shipping included
    const estCommission = newPrice * 0.12
    const estShipping = 45
    const estPackaging = 15
    const estTax = newPrice * 0.18
    const netEarnings = newPrice - p.cost - estCommission - estShipping - estPackaging - (estTax * 0.1)
    const marginPct = Math.round((netEarnings / newPrice) * 1000) / 10

    const minMarginAllowed = pricingRules.minGrossMarginPct
    const marginMet = marginPct >= minMarginAllowed

    // 3. Check discount limit
    const discountPct = pctChange < 0 ? Math.abs(pctChange) : 0
    const discountMet = discountPct <= pricingRules.maxDiscountPct

    const safeguards = {
      minMarginMet: marginMet,
      maxDiscountMet: discountMet,
      maxChangeMet: withinChangeBand,
      commissionsIncluded: true,
    }

    const shouldQueue =
      autonomyLevel === 1 ||
      pricingRules.mode === 'manual' ||
      pricingRules.mode === 'recommendation' ||
      !marginMet ||
      !discountMet ||
      !withinChangeBand

    if (shouldQueue) {
      const queueItem: ApprovalQueueItem = {
        id: `APR-${Date.now()}`,
        createdAt: new Date().toISOString(),
        agentName,
        actionType: 'repricing',
        title: `Reprice ${p.name}: ₹${p.price} → ₹${newPrice} (${pctChange >= 0 ? '+' : ''}${pctChange}%)`,
        description: `${reason}${!marginMet ? ` (Flag: Projected margin ${marginPct}% < policy floor ${minMarginAllowed}%)` : ''}`,
        details: { sku, oldPrice: p.price, newPrice, pctChange, marginPct, safeguards },
        financialImpact: Math.round((newPrice - p.price) * p.avgDailySales * 30),
        status: 'pending',
      }
      setApprovalQueue((prev) => [queueItem, ...prev])
      addActivity({
        agent: agentName,
        action: `Repricing queued for approval: ${p.name}`,
        product: p.name,
        status: 'warning',
        detail: `Proposed ₹${p.price} → ₹${newPrice}. Reason: ${reason}. Awaiting seller approval in queue.`,
      })
      toast.warning('Price change queued for approval', {
        description: !marginMet ? `Margin ${marginPct}% violates minimum floor (${minMarginAllowed}%). Requires explicit seller sign-off.` : 'Awaiting seller review in Approval Queue.',
      })
      return { success: false, queuedForApproval: true }
    }

    // Apply autonomous repricing
    const oldPrice = p.price
    p.price = newPrice

    // Update marketplace listings
    setMarketplaceListings((prev) =>
      prev.map((l) => (l.sku === sku ? { ...l, price: newPrice, lastSyncAt: new Date().toISOString() } : l))
    )

    // Log history
    const log: PriceChangeLog = {
      id: `PRC-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      sku,
      productName: p.name,
      oldPrice,
      newPrice,
      pctChange,
      agentResponsible: agentName,
      reason,
      status: 'executed',
      expectedProfitImpact: `${pctChange >= 0 ? '+' : ''}₹${Math.abs(Math.round((newPrice - oldPrice) * p.avgDailySales * 30)).toLocaleString('en-IN')}/month`,
      safeguardsChecked: safeguards,
    }
    setPriceHistory((prev) => [log, ...prev])

    addActivity({
      agent: agentName,
      action: `Repriced ${p.name}: ₹${oldPrice} → ₹${newPrice} (${pctChange >= 0 ? '+' : ''}${pctChange}%)`,
      product: p.name,
      status: 'success',
      detail: `${reason} · All backend safeguards verified (Margin: ${marginPct}%).`,
    })

    toast.success(`Repriced ${p.name}`, { description: `New price ₹${newPrice} live across marketplaces.` })
    return { success: true }
  }, [extraProducts, pricingRules, autonomyLevel, addActivity])

  // Feature 5: Festival Intelligence & Campaign Execution
  const applyFestivalCampaign = useCallback((festivalId: string, discountPct: number, skus: string[]) => {
    const fest = festivalEvents.find((f) => f.id === festivalId)
    if (!fest) return { success: false, message: 'Festival not found' }

    if (discountPct > pricingRules.maxDiscountPct) {
      // Queue for approval
      const queueItem: ApprovalQueueItem = {
        id: `APR-FEST-${Date.now()}`,
        createdAt: new Date().toISOString(),
        agentName: 'Festival Intelligence Agent',
        actionType: 'discount',
        title: `Festival Campaign: ${fest.name} (${discountPct}% discount)`,
        description: `Proposed ${discountPct}% promotional discount exceeds standard mandate limit (${pricingRules.maxDiscountPct}%). Products: ${skus.join(', ')}`,
        financialImpact: -Math.round(discountPct * 1000),
        details: { festivalId, festivalName: fest.name, discountPct, skus },
        status: 'pending',
      }
      setApprovalQueue((prev) => [queueItem, ...prev])
      addActivity({
        agent: 'Festival Intelligence Agent',
        action: `Campaign queued for approval: ${fest.name}`,
        status: 'warning',
        detail: `${discountPct}% discount on ${skus.length} SKUs requires approval.`,
      })
      toast.warning('Campaign discount queued', { description: `${discountPct}% discount exceeds auto-mandate limit.` })
      return { success: true, queued: true, message: 'Queued for seller authorization.' }
    }

    // Apply festival discount directly within mandate
    skus.forEach((sku) => {
      const p = [...PRODUCTS, ...extraProducts].find((x) => x.sku === sku)
      if (p) {
        const discountedPrice = Math.round(p.price * (1 - discountPct / 100))
        p.price = discountedPrice
      }
    })

    setFestivalEvents((prev) =>
      prev.map((f) => (f.id === festivalId ? { ...f, status: 'Active' } : f))
    )

    addActivity({
      agent: 'Festival Intelligence Agent',
      action: `Campaign Activated: ${fest.name}`,
      status: 'success',
      detail: `Applied ${discountPct}% promotional discount to ${skus.length} SKUs for festival demand wave.`,
    })

    toast.success(`Campaign Activated: ${fest.name}`, {
      description: `${discountPct}% festive pricing applied to ${skus.length} SKUs.`,
    })

    return { success: true, message: 'Campaign activated successfully.' }
  }, [festivalEvents, pricingRules, extraProducts, addActivity])

  // Feature 6: Supplier Intelligence
  const getSupplierPerformance = useCallback((supplierId: string) => {
    const rel = supplierRelationships[supplierId]
    if (!rel) return null
    return calculateSupplierScore(rel)
  }, [supplierRelationships])

  const getAiSupplierRecommendation = useCallback((sku: string, urgency: 'low' | 'normal' | 'urgent', targetQty = 300) => {
    const p = [...PRODUCTS, ...extraProducts].find((x) => x.sku === sku)
    const pName = p ? p.name : sku
    const candidateQuotes = [
      { supplierId: 'SUP-A', name: 'Supplier A — NovaSource Traders', quote: 198, days: 5, onTime: 85, score: 86.4 },
      { supplierId: 'SUP-B', name: 'Supplier B — Kedar Electronics', quote: 195, days: 3, onTime: 98, score: 94.2 },
      { supplierId: 'SUP-C', name: 'Supplier C — Sona Wholesale', quote: 189, days: 8, onTime: 72, score: 77.8 },
    ]

    let bestId = 'SUP-B'
    let reason = ''

    if (urgency === 'urgent') {
      bestId = 'SUP-B'
      reason = `Supplier B is recommended for ${pName}: delivers in 3 days with a 98% on-time delivery rate. Fast dispatch protects against imminent stockout despite ₹6/unit premium over Supplier C.`
    } else if (urgency === 'low' && targetQty >= 500) {
      bestId = 'SUP-C'
      reason = `Supplier C is recommended for bulk replenishment of ${pName}: lowest quoted price (₹189/unit) saves ₹1,800–₹2,700 on bulk order with sufficient 8-day delivery window.`
    } else {
      bestId = 'SUP-B'
      reason = `Supplier B is recommended overall for ${pName}: highest supplier composite score (94.2/100), 0 quality disputes, and successful historical negotiation record (consistently settles at ₹180/unit).`
    }

    const comparison = candidateQuotes.map((c) => ({
      ...c,
      verdict: c.supplierId === bestId ? 'Recommended by AI' : c.days > 6 ? 'Delivery risk' : 'Higher cost',
    }))

    return { recommendedSupplierId: bestId, reason, comparison }
  }, [extraProducts])

  // Feature 7 & 10: AI Autonomy & Approval Queue
  const setAutonomyLevel = useCallback((lvl: AutonomyLevel) => {
    setAutonomyLevelState(lvl)
    localStorage.setItem(AUTONOMY_KEY, String(lvl))
    setSignedMandate((prev) => ({ ...prev, autonomyLevel: lvl }))
    const labels: Record<AutonomyLevel, string> = {
      1: 'Level 1 – Advisory Mode',
      2: 'Level 2 – Approval-Based Execution',
      3: 'Level 3 – Restricted Autonomous Execution',
    }
    toast.success(`Autonomy updated: ${labels[lvl]}`)
    addActivity({
      agent: 'Security & Mandate Policy',
      action: `Autonomy level changed to ${labels[lvl]}`,
      status: 'info',
      detail: `EcomMind orchestrator permissions updated. Signed Ed25519 mandate verified.`,
    })
  }, [addActivity])

  const approveQueuedAction = useCallback((id: string, modParams?: unknown) => {
    const item = approvalQueue.find((x) => x.id === id)
    if (!item) return

    setApprovalQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: 'approved', reviewedAt: new Date().toISOString(), reviewedBy: auth.sellerName || 'Seller', modifiedParams: modParams } : q))
    )

    if (item.actionType === 'purchase') {
      toast.success('Purchase approved', { description: `Order for ${item.details.qty} units approved and sent for execution.` })
      addActivity({
        agent: 'Seller Authorization',
        action: `Approved purchase: ${item.title}`,
        amount: item.financialImpact,
        status: 'success',
        detail: `Signed execution authorized by ${auth.sellerName}.`,
      })
    } else if (item.actionType === 'repricing') {
      const { sku, newPrice } = item.details
      if (typeof sku === 'string' && typeof newPrice === 'number') {
        const p = [...PRODUCTS, ...extraProducts].find((x) => x.sku === sku)
        if (p) p.price = newPrice
      }
      toast.success('Repricing approved', { description: item.title })
      addActivity({
        agent: 'Seller Authorization',
        action: `Approved repricing: ${item.title}`,
        status: 'success',
        detail: `New price live across connected marketplaces.`,
      })
    } else {
      toast.success('Action approved', { description: item.title })
    }
  }, [approvalQueue, auth, extraProducts, addActivity])

  const rejectQueuedAction = useCallback((id: string, reason = 'Seller declined proposal') => {
    setApprovalQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: 'rejected', reviewedAt: new Date().toISOString(), reviewedBy: auth.sellerName || 'Seller', rejectionReason: reason } : q))
    )
    toast.info('Action declined', { description: reason })
    addActivity({
      agent: 'Seller Authorization',
      action: `Rejected proposal: ${id}`,
      status: 'info',
      detail: reason,
    })
  }, [auth, addActivity])

  const emergencyKillSwitch = useCallback(() => {
    setAgentStatusState('paused')
    setMandate((m) => {
      const next = { ...m, agentsPaused: true }
      localStorage.setItem(MANDATE_KEY, JSON.stringify(next))
      return next
    })
    setSignedMandate((prev) => ({ ...prev, revoked: true }))
    addActivity({
      agent: 'Security System',
      action: 'EMERGENCY AI KILL-SWITCH TRIGGERED',
      status: 'warning',
      detail: 'All autonomous operations immediately halted. Mandate token revoked.',
    })
    toast.error('EMERGENCY KILL-SWITCH ACTIVE', { description: 'All AI agent operations halted across your business.' })
  }, [addActivity])

  // Feature 1: Report History Persistence
  const saveGeneratedReport = useCallback((recordData: Omit<GeneratedReportRecord, 'id' | 'generatedAt'>) => {
    const newRecord: GeneratedReportRecord = {
      ...recordData,
      id: `RPT-${Date.now().toString().slice(-6)}`,
      generatedAt: new Date().toISOString(),
    }
    setReportHistory((prev) => {
      const next = [newRecord, ...prev]
      localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(next.slice(0, 50)))
      return next
    })
    return newRecord
  }, [])

  const value = useMemo(() => ({
    // Preserved fields
    auth, demoLoaded, agentStatus,
    agentsDiscovered: 7, lastExecution,
    walletBalance, walletTxns, escrow, releasedTotal, refundedTotal: 0,
    mandate, activity, notifications, negotiationDone, analysisRunAt, importedDatasets, extraProducts,
    login, demoLogin, register, logout, completeOnboarding, loadDemoBusiness, setAgentStatus,
    callAgent, topUpWallet, saveMandate, setEscrowStep, markNegotiationDone, addActivity,
    markNotificationsRead, setAnalysisRun, markDatasetImported, resetImported, addProduct,

    // Enhanced fields
    gstinProfile, marketplaces, marketplaceListings, marketplaceOrders, inventoryMovements,
    pricingRules, priceHistory, festivalEvents, supplierPurchases, supplierDeliveries,
    supplierRelationships, autonomyLevel, signedMandate, approvalQueue, reportHistory,
    verifyAndSaveGSTIN, createMarketplaceListing, updateListingPriceAndStock,
    toggleMarketplaceStatus, simulateMarketplaceOrder, executeReprice, updatePricingRules,
    applyFestivalCampaign, setAutonomyLevel, approveQueuedAction, rejectQueuedAction,
    emergencyKillSwitch, saveGeneratedReport, getSupplierPerformance, getAiSupplierRecommendation,
  }), [
    auth, demoLoaded, agentStatus, lastExecution, walletBalance, walletTxns, escrow, releasedTotal,
    mandate, activity, notifications, negotiationDone, analysisRunAt, importedDatasets, extraProducts,
    gstinProfile, marketplaces, marketplaceListings, marketplaceOrders, inventoryMovements,
    pricingRules, priceHistory, festivalEvents, supplierPurchases, supplierDeliveries,
    supplierRelationships, autonomyLevel, signedMandate, approvalQueue, reportHistory,
    login, demoLogin, register, logout, completeOnboarding, loadDemoBusiness, setAgentStatus,
    callAgent, topUpWallet, saveMandate, setEscrowStep, markNegotiationDone, addActivity,
    markNotificationsRead, setAnalysisRun, markDatasetImported, resetImported, addProduct,
    verifyAndSaveGSTIN, createMarketplaceListing, updateListingPriceAndStock,
    toggleMarketplaceStatus, simulateMarketplaceOrder, executeReprice, updatePricingRules,
    applyFestivalCampaign, setAutonomyLevel, approveQueuedAction, rejectQueuedAction,
    emergencyKillSwitch, saveGeneratedReport, getSupplierPerformance, getAiSupplierRecommendation,
  ])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
