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
    const err = (data as { error?: { code?: string; message?: string; field?: string; details?: unknown } } | undefined)?.error
    throw new ApiError(
      res.status,
      err?.code ?? 'http_error',
      err?.message ?? (res.status >= 500 ? 'The server had a problem. Try again in a moment.' : 'Request failed.'),
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
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
