/**
 * Typed client for the EcomMind FastAPI backend.
 *
 * Requests go to /api/* on the same origin (Vite proxies them to the backend in
 * development), so the httpOnly session cookie travels automatically.
 * Errors come back as {error: {code, message, field?}} and are thrown as ApiError.
 */

export class ApiError extends Error {
  status: number
  code: string
  field?: string
  details?: unknown

  constructor(status: number, code: string, message: string, field?: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.field = field
    this.details = details
  }

  /** True when the request never got a response (backend down, offline). */
  get isNetwork() {
    return this.status === 0
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

function withQuery(path: string, query?: Query) {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

interface RequestOpts {
  method?: string
  body?: unknown
  query?: Query
  idempotencyKey?: string
  signal?: AbortSignal
}

export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

  let res: Response
  try {
    res = await fetch(withQuery(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'network_error', 'Can’t reach the EcomMind server. Check that the backend is running and try again.')
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = undefined
  try { data = text ? JSON.parse(text) : undefined } catch { /* non-JSON body */ }

  if (!res.ok) {
    // Session ended elsewhere (expired, logged out in another tab): tell the app.
    if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('ecommind:unauthorized'))
    const d = data as { error?: { code?: string; message?: string; field?: string; details?: unknown }; detail?: string } | undefined
    const err = d?.error
    const fallbackMsg = typeof d?.detail === 'string' ? d.detail : (res.status >= 500 ? 'The server had a problem. Try again in a moment.' : 'Request failed.')
    throw new ApiError(
      res.status,
      err?.code ?? 'http_error',
      err?.message ?? fallbackMsg,
      err?.field,
      err?.details,
    )
  }
  return data as T
}

/** A fresh key per logical request; reuse it when retrying that same request. */
export function newIdempotencyKey(prefix = 'req'): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return `${prefix}-${rand}`
}

/** Download a CSV (or any file) served by the API, keeping the session cookie. */
export async function downloadFile(path: string, query: Query | undefined, fallbackName: string): Promise<void> {
  const res = await fetch(withQuery(path, query), { credentials: 'same-origin' })
  if (!res.ok) throw new ApiError(res.status, 'download_failed', 'Couldn’t generate that export. Try again.')
  const blob = await res.blob()
  const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = match?.[1] ?? fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ */
/* Response types (money is integer paise: ₹1 = 100)                   */
/* ------------------------------------------------------------------ */

export interface ApiBusiness {
  id: number
  name: string
  category: string | null
  currency: string
  channel: string | null
  businessType?: string | null
  onboarded: boolean
  demoLoaded: boolean
  agentStatus: 'active' | 'paused'
  plan: string
  location: { text: string; city: string | null; state: string | null; country: string | null; verified: boolean } | null
  gstinMasked: string | null
  gstinStatus: string | null
}

export interface MeResponse {
  user: { id: number; name: string; email: string; emailVerified: boolean; isDemo: boolean }
  business: ApiBusiness | null
  verification: { mode: 'off' | 'optional' | 'required'; providerConfigured: boolean }
}

export interface ApiProduct {
  sku: string
  name: string
  category: string
  price: number
  cost: number
  stock: number
  avgDailySales: number
  returnRate: number
  icon: string
  paused: boolean
  coverageDays: number | null
  status: 'In Stock' | 'Low Stock' | 'Critical' | 'Out of Stock' | 'Paused'
  marginPct: number | null
}

export interface ApiMandate {
  dailyBudget: number
  maxOrderValue: number
  maxPerCallCost: number
  walletDailyLimit: number
  maxPriceChangePct: number
  minGrossMarginPct: number
  autoPauseReturnPct: number
  autoPurchasing: boolean
  autoNegotiation: boolean
  autoRepricing: boolean
  approvalAboveLimit: boolean
  agentsPaused: boolean
  maxDiscountPct: number
  pricingMode: 'manual' | 'recommendation' | 'autonomous'
  autonomyLevel: 1 | 2 | 3
}

export interface ApiPriceChange {
  id: string
  sku: string
  productName: string
  oldPrice: number
  newPrice: number
  pctChange: number
  marginPct: number
  reason: string
  source: 'seller' | 'agent' | 'festival' | 'approval'
  actor: string
  sellerOverride: boolean
  safeguards: { minMarginMet: boolean; maxChangeMet: boolean; maxDiscountMet: boolean; modeAllows: boolean; marginPct: number; pctChange: number }
  ref: string | null
  createdAt: string
}

/** details of a 409 needs_approval price change */
export interface ApiPriceApprovalNeeded {
  sku: string
  productName: string
  oldPrice: number
  newPrice: number
  violations: string[]
  safeguards: ApiPriceChange['safeguards']
  monthlyImpact: number
}

export interface ApiApproval {
  id: string
  actionType: 'price_change' | 'bulk_price_change' | 'purchase' | 'restock' | 'escrow_lock'
  title: string
  description: string
  agentName: string
  payload: Record<string, unknown>
  reasons: string[]
  financialImpact: number
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
  rejectionReason: string | null
  executedAt: string | null
  result: Record<string, unknown> | null
  lastError: string | null
}

export interface ApiServiceAgent {
  id: string
  name: string
  type: 'Compute' | 'Data' | 'Service'
  operation: string
  pricePerCall: number
  unit: string
  rating: number
  callsServed: number
  availability: 'Online' | 'Busy' | 'Offline'
  latency: string
  capabilities: string[]
  description: string
  icon: string
}

export interface ApiAgentCall {
  id: string
  agentId: string
  agentName: string | null
  operation: string
  sku: string | null
  productName: string | null
  status: 'pending' | 'success' | 'failed' | 'rejected' | 'timed_out'
  cost: number
  chargedAmount?: number
  charged?: number
  errorMessage: string | null
  txnId: string | null
  createdAt: string | null
  completedAt: string | null
}

export interface AgentCallResponse {
  call: ApiAgentCall
  agent: ApiServiceAgent
  result: Record<string, unknown> | null
  receipt: { txnId: string; amount: number; signature: string; timestamp: string } | null
  wallet: { balance: number }
  replayed: boolean
}

export interface ApiTxn {
  id: string
  time: string
  counterparty: string
  kind: string
  amount: number
  /** Money moved when it differs from the wallet effect (an escrow release moves 0 from the wallet). */
  grossAmount?: number | null
  status: string
  signature: string
  memo: string
  ref: string | null
}

export interface ApiEvent {
  id: number
  time: string
  agent: string
  action: string
  product: string | null
  amount: number | null
  status: 'success' | 'info' | 'warning' | 'pending'
  detail: string | null
  ref: string | null
}

export interface ApiSupplierQuote {
  id: string
  supplierId: string
  sku: string
  unitPrice: number
  deliveryDays: number
  moq: number
  available: number
  validTill: string
}

export interface ApiSupplier {
  id: string
  name: string
  agentId: string
  location: string
  rating: number
  reviews: number
  verified: boolean
  autoRespond: boolean
  catalogue: string[]
  quotes: ApiSupplierQuote[]
}

export interface ApiRFQ {
  id: string
  supplierId: string
  supplierName: string
  sku: string
  productName: string
  quantity: number
  targetUnitPrice: number | null
  deliveryLocation: string
  deliveryDays: number
  status: string
  statusLabel: string
  createdAt: string
}

export interface ApiNegotiationMessage {
  id: number
  sender: 'ecommind' | 'seller' | 'supplier' | 'system'
  kind: 'rfq' | 'offer' | 'counter' | 'accept' | 'decline' | 'info'
  unitPrice: number | null
  text: string
  createdAt: string
}

export interface ApiNegotiation {
  id: string
  rfqId: string
  supplierId: string
  supplierName: string
  sku: string
  productName: string
  quantity: number
  status: string
  statusLabel: string
  latestSupplierPrice: number | null
  latestBuyerPrice: number | null
  agreedUnitPrice: number | null
  supplierDeliveryDays: number | null
  rounds: number
  createdAt: string
  updatedAt: string
  rfq: ApiRFQ
  messages?: ApiNegotiationMessage[]
  escrow: { id: string; status: EscrowStatus; statusLabel: string; amount: number; statusNote: string | null } | null
}

export type EscrowStatus = 'pending' | 'locked' | 'dispatched' | 'delivered' | 'released' | 'refunded' | 'cancelled'

export interface ApiEscrowLedgerEntry {
  id: string
  time: string
  kind: string
  amount: number
  grossAmount: number | null
  status: string
  memo: string | null
  signature: string
}

export interface ApiEscrow {
  id: string
  negotiationId: string
  rfqId: string
  buyerUserId: number
  supplierId: string
  supplierName: string
  sku: string
  productName: string
  quantity: number
  unitPrice: number
  amount: number
  status: EscrowStatus
  statusLabel: string
  statusNote: string | null
  courier: string | null
  trackingId: string | null
  refundReason: string | null
  createdAt: string
  lockedAt: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  releasedAt: string | null
  refundedAt: string | null
  cancelledAt: string | null
  ledger?: ApiEscrowLedgerEntry[]
}

export interface ApiEscrowSummary {
  byStatus: Record<EscrowStatus, { count: number; amount: number }>
  held: number
  heldCount: number
  awaitingFunds: number
  released: number
  refunded: number
  total: number
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
