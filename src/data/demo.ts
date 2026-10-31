import { mulberry32, daysAgoISO } from '@/lib/format'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type StockStatus = 'In Stock' | 'Low Stock' | 'Critical' | 'Out of Stock' | 'Paused'

export interface Product {
  sku: string
  name: string
  category: string
  price: number
  cost: number
  stock: number
  avgDailySales: number
  returnRate: number
  icon: string // lucide icon key
  paused?: boolean
}

export interface SaleRecord {
  date: string // YYYY-MM-DD
  sku: string
  units: number
  revenue: number
}

export interface ReturnRecord {
  pincode: string
  city: string
  sku: string
  orders: number
  returns: number
  returnRate: number
}

export interface Supplier {
  id: string
  name: string
  agentId: string
  location: string
  rating: number
  reviews: number
  catalogue: string[]
  verified: boolean
}

export interface SupplierQuote {
  id: string
  supplierId: string
  sku: string
  unitPrice: number
  deliveryDays: number
  moq: number
  available: number
  validTill: string
}

export interface LogisticsQuote {
  id: string
  courier: string
  service: string
  costPer500g: number
  etaDays: number
  rating: number
  cod: boolean
}

export interface ServiceAgent {
  id: string
  name: string
  type: 'Compute' | 'Data' | 'Service'
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

export interface Recommendation {
  id: string
  priority: 'High' | 'Medium' | 'Low'
  title: string
  reason: string
  impact: string
  action: string
  sku?: string
}

export interface ActivityEvent {
  id: string
  time: string // ISO
  agent: string
  action: string
  product?: string
  amount?: number
  status: 'success' | 'info' | 'warning' | 'pending'
  detail?: string
}

export interface WalletTxn {
  id: string
  time: string
  counterparty: string
  kind: 'service_call' | 'escrow_lock' | 'escrow_release' | 'logistics' | 'topup' | 'refund'
  amount: number // negative = debit
  status: 'Completed' | 'Locked' | 'Released' | 'Refunded'
  signature: string
  memo: string
}

/* ------------------------------------------------------------------ */
/* Products (demo business: UrbanNest Living)                          */
/* ------------------------------------------------------------------ */

export const PRODUCTS: Product[] = [
  { sku: 'EAR-001', name: 'Wireless Earbuds', category: 'Electronics', price: 1499, cost: 780, stock: 100, avgDailySales: 20, returnRate: 0.06, icon: 'headphones' },
  { sku: 'YOG-002', name: 'Yoga Mat', category: 'Fitness', price: 899, cost: 420, stock: 240, avgDailySales: 6, returnRate: 0.04, icon: 'stretch' },
  { sku: 'PHN-003', name: 'Phone Case', category: 'Accessories', price: 349, cost: 95, stock: 180, avgDailySales: 14, returnRate: 0.19, icon: 'smartphone' },
  { sku: 'BOT-004', name: 'Insulated Water Bottle', category: 'Home & Kitchen', price: 649, cost: 310, stock: 75, avgDailySales: 5, returnRate: 0.03, icon: 'bottle' },
  { sku: 'LED-005', name: 'LED Desk Lamp', category: 'Electronics', price: 1199, cost: 640, stock: 12, avgDailySales: 3, returnRate: 0.05, icon: 'lamp' },
]

export function stockCoverage(p: Product): number {
  return p.avgDailySales > 0 ? Math.round((p.stock / p.avgDailySales) * 10) / 10 : Infinity
}

export function stockStatus(p: Product): StockStatus {
  if (p.paused) return 'Paused'
  if (p.stock === 0) return 'Out of Stock'
  const cov = p.stock / p.avgDailySales
  if (cov <= 5) return 'Critical'
  if (cov <= 12) return 'Low Stock'
  return 'In Stock'
}

/* ------------------------------------------------------------------ */
/* 90 days of sales history (deterministic)                            */
/* ------------------------------------------------------------------ */

function buildSalesHistory(): SaleRecord[] {
  const rng = mulberry32(20261031)
  const records: SaleRecord[] = []
  for (const p of PRODUCTS) {
    // slow organic growth + weekly seasonality + noise
    const trend = 0.75 + rng() * 0.15
    for (let d = 89; d >= 0; d--) {
      const date = daysAgoISO(d).slice(0, 10)
      const growth = trend + ((89 - d) / 89) * (1 - trend)
      const dow = new Date(date).getDay()
      const weekly = dow === 0 || dow === 6 ? 1.25 : dow === 5 ? 1.12 : 0.95
      const noise = 0.55 + rng() * 0.9
      const units = Math.max(0, Math.round(p.avgDailySales * growth * weekly * noise))
      records.push({ date, sku: p.sku, units, revenue: units * p.price })
    }
  }
  return records
}

export const SALES_HISTORY: SaleRecord[] = buildSalesHistory()

/* ------------------------------------------------------------------ */
/* Returns by pincode (8 regional records)                             */
/* ------------------------------------------------------------------ */

export const RETURNS_BY_PINCODE: ReturnRecord[] = [
  { pincode: '110001', city: 'New Delhi', sku: 'PHN-003', orders: 142, returns: 44, returnRate: 0.31 },
  { pincode: '400001', city: 'Mumbai', sku: 'EAR-001', orders: 268, returns: 19, returnRate: 0.071 },
  { pincode: '560001', city: 'Bengaluru', sku: 'EAR-001', orders: 231, returns: 12, returnRate: 0.052 },
  { pincode: '700001', city: 'Kolkata', sku: 'YOG-002', orders: 96, returns: 7, returnRate: 0.073 },
  { pincode: '600001', city: 'Chennai', sku: 'BOT-004', orders: 84, returns: 3, returnRate: 0.036 },
  { pincode: '500001', city: 'Hyderabad', sku: 'LED-005', orders: 61, returns: 4, returnRate: 0.066 },
  { pincode: '380001', city: 'Ahmedabad', sku: 'PHN-003', orders: 118, returns: 21, returnRate: 0.178 },
  { pincode: '411001', city: 'Pune', sku: 'YOG-002', orders: 77, returns: 2, returnRate: 0.026 },
]

/* ------------------------------------------------------------------ */
/* Suppliers + quotes                                                  */
/* ------------------------------------------------------------------ */

export const SUPPLIERS: Supplier[] = [
  { id: 'SUP-A', name: 'Supplier A — NovaSource Traders', agentId: 'sup-agent-a7', location: 'Delhi NCR', rating: 4.4, reviews: 312, catalogue: ['EAR-001', 'PHN-003'], verified: true },
  { id: 'SUP-B', name: 'Supplier B — Kedar Electronics', agentId: 'sup-agent-b2', location: 'Mumbai', rating: 4.6, reviews: 489, catalogue: ['EAR-001', 'LED-005', 'BOT-004'], verified: true },
  { id: 'SUP-C', name: 'Supplier C — Sona Wholesale', agentId: 'sup-agent-c9', location: 'Surat', rating: 4.2, reviews: 158, catalogue: ['EAR-001', 'YOG-002'], verified: false },
]

export const SUPPLIER_QUOTES: SupplierQuote[] = [
  { id: 'Q-101', supplierId: 'SUP-A', sku: 'EAR-001', unitPrice: 198, deliveryDays: 5, moq: 100, available: 2000, validTill: daysAgoISO(-6).slice(0, 10) },
  { id: 'Q-102', supplierId: 'SUP-B', sku: 'EAR-001', unitPrice: 195, deliveryDays: 3, moq: 150, available: 1500, validTill: daysAgoISO(-4).slice(0, 10) },
  { id: 'Q-103', supplierId: 'SUP-C', sku: 'EAR-001', unitPrice: 189, deliveryDays: 8, moq: 200, available: 3200, validTill: daysAgoISO(-9).slice(0, 10) },
  { id: 'Q-104', supplierId: 'SUP-B', sku: 'LED-005', unitPrice: 605, deliveryDays: 4, moq: 50, available: 800, validTill: daysAgoISO(-5).slice(0, 10) },
  { id: 'Q-105', supplierId: 'SUP-A', sku: 'PHN-003', unitPrice: 88, deliveryDays: 6, moq: 200, available: 5000, validTill: daysAgoISO(-7).slice(0, 10) },
  { id: 'Q-106', supplierId: 'SUP-C', sku: 'YOG-002', unitPrice: 398, deliveryDays: 7, moq: 100, available: 1200, validTill: daysAgoISO(-3).slice(0, 10) },
]

/* ------------------------------------------------------------------ */
/* Logistics quotes (5)                                                */
/* ------------------------------------------------------------------ */

export const LOGISTICS_QUOTES: LogisticsQuote[] = [
  { id: 'LG-1', courier: 'BlueDart', service: 'Surface Express', costPer500g: 42, etaDays: 2, rating: 4.7, cod: true },
  { id: 'LG-2', courier: 'Delhivery', service: 'Surface', costPer500g: 34, etaDays: 3, rating: 4.4, cod: true },
  { id: 'LG-3', courier: 'Ekart', service: 'Economy', costPer500g: 29, etaDays: 4, rating: 4.2, cod: true },
  { id: 'LG-4', courier: 'XpressBees', service: 'Standard', costPer500g: 31, etaDays: 4, rating: 4.1, cod: false },
  { id: 'LG-5', courier: 'Shiprocket Air', service: 'Air Priority', costPer500g: 58, etaDays: 1, rating: 4.5, cod: true },
]

/* ------------------------------------------------------------------ */
/* Service agents (4)                                                  */
/* ------------------------------------------------------------------ */

export const SERVICE_AGENTS: ServiceAgent[] = [
  {
    id: 'agent-forecast-01', name: 'Demand Forecast Agent', type: 'Compute', pricePerCall: 4, unit: 'per forecast',
    rating: 4.8, callsServed: 12840, availability: 'Online', latency: '~900ms',
    capabilities: ['30-day demand prediction', 'Seasonality detection', 'Reorder quantity'],
    description: 'Predicts SKU-level demand for the next 7 and 30 days using your sales history and seasonal signals.',
    icon: 'trending-up',
  },
  {
    id: 'agent-price-02', name: 'Market Price Agent', type: 'Data', pricePerCall: 2, unit: 'per query',
    rating: 4.6, callsServed: 22110, availability: 'Online', latency: '~600ms',
    capabilities: ['Competitor price tracking', 'Suggested price', 'Margin impact'],
    description: 'Scans Amazon, Flipkart and Meesho for live competitor pricing and suggests an optimal price.',
    icon: 'chart',
  },
  {
    id: 'agent-return-03', name: 'Return Risk Agent', type: 'Data', pricePerCall: 1, unit: 'per score',
    rating: 4.5, callsServed: 40213, availability: 'Online', latency: '~400ms',
    capabilities: ['Pincode RTO risk', 'Product return risk', 'High-risk regions'],
    description: 'Scores return and RTO risk by product and pincode so you can act before returns eat your margin.',
    icon: 'shield-alert',
  },
  {
    id: 'agent-logistics-04', name: 'Logistics Agent', type: 'Service', pricePerCall: 1, unit: 'per quote',
    rating: 4.7, callsServed: 18330, availability: 'Online', latency: '~700ms',
    capabilities: ['Courier cost estimates', 'Delivery time', 'Courier recommendation'],
    description: 'Compares courier options on cost, speed and COD support, then recommends the best fit per order.',
    icon: 'truck',
  },
]

/* ------------------------------------------------------------------ */
/* AI recommendations                                                  */
/* ------------------------------------------------------------------ */

export const RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'REC-1', priority: 'High', title: 'Restock Wireless Earbuds', sku: 'EAR-001',
    reason: 'Only 100 units left with ~20 units/day sales — stock coverage is just 5 days against a 450-unit 30-day forecast.',
    impact: 'Avoids ~₹5.2L in lost sales this month.', action: 'Purchase 300 units from Supplier B at ₹180/unit.',
  },
  {
    id: 'REC-2', priority: 'High', title: 'Review Phone Case return rate', sku: 'PHN-003',
    reason: 'Return rate hit 31% in pincode 110001 (New Delhi) — 3× the category average.',
    impact: 'Cutting Delhi exposure could save ~₹9,400/month in reverse logistics.', action: 'Enable RTO confirmation for high-risk pincodes.',
  },
  {
    id: 'REC-3', priority: 'Medium', title: 'Monitor Yoga Mat inventory', sku: 'YOG-002',
    reason: '240 units in stock with steady 6 units/day demand — 40 days of coverage.',
    impact: 'Healthy now; frees ~₹1.0L working capital if rebalanced later.', action: 'Hold purchasing; re-check in 2 weeks.',
  },
  {
    id: 'REC-4', priority: 'Medium', title: 'Optimize LED Desk Lamp stock', sku: 'LED-005',
    reason: 'Only 12 units remain with 3 units/day sales — coverage of ~4 days.',
    impact: 'A 50-unit top-up protects ~₹1.8L quarterly revenue.', action: 'Request quote from Supplier B (₹605/unit, 4 days).',
  },
]

/* ------------------------------------------------------------------ */
/* Seed activity + notifications                                       */
/* ------------------------------------------------------------------ */

function todayAt(hh: number, mm: number): string {
  const d = new Date()
  d.setHours(hh, mm, Math.floor(Math.random() * 50) + 5, 0)
  if (d.getTime() > Date.now()) d.setTime(Date.now() - Math.floor(Math.random() * 3600_000))
  return d.toISOString()
}

export const SEED_ACTIVITY: ActivityEvent[] = [
  { id: 'EV-1', time: todayAt(8, 55), agent: 'Demand Forecast Agent', action: '3 demand forecasts purchased', product: 'Wireless Earbuds +2', amount: 12, status: 'success', detail: '7-day and 30-day forecasts for EAR-001, PHN-003, LED-005. Confidence 87%.' },
  { id: 'EV-2', time: todayAt(9, 0), agent: 'EcomMind', action: 'Stockout risk detected', product: 'Wireless Earbuds', status: 'warning', detail: 'Coverage fell to 5 days; forecast demand 450 units over 30 days.' },
  { id: 'EV-3', time: todayAt(9, 0), agent: 'EcomMind', action: 'Supplier quotation requested', product: 'Wireless Earbuds', status: 'info', detail: 'RFQ broadcast to 3 supplier agents for 300 units.' },
  { id: 'EV-4', time: todayAt(9, 2), agent: 'EcomMind', action: 'Counter-offer sent', product: 'Wireless Earbuds', status: 'info', detail: 'Countered Supplier B at ₹175/unit against ₹195 quote.' },
  { id: 'EV-5', time: todayAt(9, 5), agent: 'EcomMind', action: 'Supplier B selected', product: 'Wireless Earbuds', status: 'success', detail: 'Final price ₹180/unit, delivery in 3 days. Savings ₹4,500 vs quote.' },
  { id: 'EV-6', time: todayAt(9, 5), agent: 'EcomMind', action: '₹54,000 escrow initiated', product: 'Wireless Earbuds', amount: 54000, status: 'pending', detail: 'Funds locked in simulated escrow ESC-2026-1042 pending delivery.' },
  { id: 'EV-7', time: todayAt(9, 10), agent: 'Logistics Agent', action: 'Logistics quotation purchased', amount: 3, status: 'success', detail: '3 courier quotes compared; BlueDart Surface recommended.' },
  { id: 'EV-8', time: todayAt(9, 12), agent: 'EcomMind', action: 'Logistics booking advance paid', amount: 500, status: 'success', detail: 'BlueDart Surface Express booked for the inbound consignment (simulated).' },
  { id: 'EV-9', time: todayAt(9, 15), agent: 'Return Risk Agent', action: '40 pincode risk scores purchased', product: 'Phone Case', amount: 40, status: 'success', detail: 'Pincode 110001 flagged at 31% return rate.' },
  { id: 'EV-10', time: todayAt(9, 18), agent: 'Market Price Agent', action: '4 competitor price queries purchased', amount: 8, status: 'success', detail: 'Earbuds competitor range ₹1,399–₹1,549; current price competitive.' },
]

export interface AppNotification {
  id: string
  title: string
  body: string
  time: string
  read: boolean
  route: string
  tone: 'info' | 'warning' | 'success'
}

export const SEED_NOTIFICATIONS: AppNotification[] = [
  { id: 'N-1', title: 'Stockout risk: Wireless Earbuds', body: 'Coverage is 5 days. EcomMind has negotiated a 300-unit restock.', time: todayAt(9, 0), read: false, route: '/inventory', tone: 'warning' },
  { id: 'N-2', title: '₹54,000 locked in escrow', body: 'Order for 300 × Wireless Earbuds from Supplier B awaiting dispatch.', time: todayAt(9, 5), read: false, route: '/escrow', tone: 'info' },
  { id: 'N-3', title: 'Negotiation won — saved ₹4,500', body: 'Supplier B accepted ₹180/unit against a ₹195 quote.', time: todayAt(9, 5), read: false, route: '/negotiations', tone: 'success' },
  { id: 'N-4', title: 'High return risk detected', body: 'Phone Case returns at 31% in pincode 110001.', time: todayAt(9, 15), read: true, route: '/insights', tone: 'warning' },
]

/* ------------------------------------------------------------------ */
/* Market price intelligence                                           */
/* ------------------------------------------------------------------ */

export const COMPETITOR_PRICES: Record<string, { channel: string; price: number }[]> = {
  'EAR-001': [
    { channel: 'Amazon.in', price: 1549 },
    { channel: 'Flipkart', price: 1479 },
    { channel: 'Meesho', price: 1399 },
  ],
  'YOG-002': [
    { channel: 'Amazon.in', price: 949 },
    { channel: 'Flipkart', price: 899 },
    { channel: 'Meesho', price: 829 },
  ],
  'PHN-003': [
    { channel: 'Amazon.in', price: 399 },
    { channel: 'Flipkart', price: 349 },
    { channel: 'Meesho', price: 299 },
  ],
  'BOT-004': [
    { channel: 'Amazon.in', price: 699 },
    { channel: 'Flipkart', price: 649 },
    { channel: 'Meesho', price: 599 },
  ],
  'LED-005': [
    { channel: 'Amazon.in', price: 1249 },
    { channel: 'Flipkart', price: 1199 },
    { channel: 'Meesho', price: 1099 },
  ],
}

/* ------------------------------------------------------------------ */
/* Finance constants — consistent across every page                    */
/* ------------------------------------------------------------------ */

export const FIN = {
  mandateDailyBudget: 75000,
  escrowLocked: 54000, // 300 × ₹180
  serviceCallSpend: 63, // 12 + 8 + 40 + 3
  logisticsAdvance: 500,
  get budgetConsumed() { return this.escrowLocked + this.serviceCallSpend + this.logisticsAdvance },
  get budgetRemaining() { return this.mandateDailyBudget - this.budgetConsumed }, // ₹20,437
  walletOpeningBalance: 5000,
  negotiationSavings: 4500, // (195-180) × 300
  orderQty: 300,
  negotiatedUnitPrice: 180,
}

export const AGENT_SPEND_BREAKDOWN = [
  { agent: 'Demand Forecast Agent', amount: 12, calls: 3 },
  { agent: 'Market Price Agent', amount: 8, calls: 4 },
  { agent: 'Return Risk Agent', amount: 40, calls: 40 },
  { agent: 'Logistics Agent', amount: 3, calls: 3 },
]

export function seedWalletTxns(): WalletTxn[] {
  const t = (h: number, m: number) => todayAt(h, m)
  return [
    { id: 'TXN-9K2LM4', time: t(9, 18), counterparty: 'Market Price Agent', kind: 'service_call', amount: -8, status: 'Completed', signature: 'sig:9f2ac41e', memo: '4 competitor price queries' },
    { id: 'TXN-9K2JX1', time: t(9, 15), counterparty: 'Return Risk Agent', kind: 'service_call', amount: -40, status: 'Completed', signature: 'sig:77b0d2aa', memo: '40 pincode risk scores' },
    { id: 'TXN-9K2HF8', time: t(9, 12), counterparty: 'BlueDart (booking)', kind: 'logistics', amount: -500, status: 'Completed', signature: 'sig:bd88412c', memo: 'Logistics booking advance — inbound consignment' },
    { id: 'TXN-9K2GB3', time: t(9, 10), counterparty: 'Logistics Agent', kind: 'service_call', amount: -3, status: 'Completed', signature: 'sig:31cf9e07', memo: '3 courier quotes' },
    { id: 'TXN-9K2ESC', time: t(9, 5), counterparty: 'Escrow — Supplier B', kind: 'escrow_lock', amount: -54000, status: 'Locked', signature: 'sig:esc00a42', memo: '300 × Wireless Earbuds @ ₹180 (simulated escrow)' },
    { id: 'TXN-9K2DQ7', time: t(8, 55), counterparty: 'Demand Forecast Agent', kind: 'service_call', amount: -12, status: 'Completed', signature: 'sig:a0d55193', memo: '3 demand forecasts' },
  ]
}

/* ------------------------------------------------------------------ */
/* Negotiation script                                                  */
/* ------------------------------------------------------------------ */

export interface NegoMessage {
  from: 'ecommind' | 'SUP-A' | 'SUP-B' | 'SUP-C'
  text: string
  kind?: 'offer' | 'counter' | 'accept' | 'info'
  price?: number
  delay: number // ms after previous
}

export const NEGOTIATION_SCRIPT: NegoMessage[] = [
  { from: 'ecommind', text: 'Requesting 300 units of Wireless Earbuds (EAR-001). Delivery required within 5 days. Please quote.', kind: 'info', delay: 600 },
  { from: 'SUP-A', text: 'Offer: ₹198 per unit, delivery in 5 days. MOQ 100 units.', kind: 'offer', price: 198, delay: 1400 },
  { from: 'SUP-B', text: 'Offer: ₹195 per unit, delivery in 3 days. MOQ 150 units.', kind: 'offer', price: 195, delay: 1400 },
  { from: 'SUP-C', text: 'Offer: ₹189 per unit, delivery in 8 days. MOQ 200 units.', kind: 'offer', price: 189, delay: 1400 },
  { from: 'ecommind', text: 'Evaluating offers… Supplier C exceeds the 5-day delivery constraint. Counter-offer to Supplier B: ₹175 per unit.', kind: 'counter', price: 175, delay: 1600 },
  { from: 'SUP-B', text: 'Final offer: ₹180 per unit, delivery in 3 days. This is our floor for 300 units.', kind: 'offer', price: 180, delay: 1600 },
  { from: 'ecommind', text: 'Offer accepted. Total order value ₹54,000. Locking funds in escrow and booking logistics.', kind: 'accept', price: 180, delay: 1500 },
]

/* ------------------------------------------------------------------ */
/* Mandate defaults                                                    */
/* ------------------------------------------------------------------ */

export const DEFAULT_MANDATE = {
  dailyBudget: 75000,
  maxOrderValue: 60000,
  maxPerCallCost: 10,
  maxPriceChangePct: 10,
  minGrossMarginPct: 15,
  autoPauseReturnPct: 25,
  autoPurchasing: true,
  autoNegotiation: true,
  autoRepricing: false,
  approvalAboveLimit: true,
  agentsPaused: false,
}

export type Mandate = typeof DEFAULT_MANDATE

/* ------------------------------------------------------------------ */
/* Analytics helpers                                                   */
/* ------------------------------------------------------------------ */

export function salesInRange(days: number): SaleRecord[] {
  const cutoff = daysAgoISO(days - 1).slice(0, 10)
  return SALES_HISTORY.filter((r) => r.date >= cutoff)
}

export function dailySeries(days: number) {
  const map = new Map<string, { date: string; revenue: number; orders: number }>()
  for (const r of salesInRange(days)) {
    const cur = map.get(r.date) ?? { date: r.date, revenue: 0, orders: 0 }
    cur.revenue += r.revenue
    cur.orders += r.units
    map.set(r.date, cur)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function productSales(days: number) {
  const map = new Map<string, { sku: string; units: number; revenue: number }>()
  for (const r of salesInRange(days)) {
    const cur = map.get(r.sku) ?? { sku: r.sku, units: 0, revenue: 0 }
    cur.units += r.units
    cur.revenue += r.revenue
    map.set(r.sku, cur)
  }
  return [...map.values()].map((v) => ({ ...v, product: PRODUCTS.find((p) => p.sku === v.sku)! }))
}

export function forecastSeries(sku: string, days = 14) {
  // historical 14d + predicted 7d for the insights chart
  const hist = salesInRange(days).filter((r) => r.sku === sku)
  const byDate = new Map<string, number>()
  hist.forEach((r) => byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.units))
  const out: { date: string; actual?: number; predicted?: number }[] = []
  ;[...byDate.entries()].sort().forEach(([date, units]) => out.push({ date, actual: units }))
  const p = PRODUCTS.find((x) => x.sku === sku)!
  const lastActual = out[out.length - 1]
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const date = d.toISOString().slice(0, 10)
    const predicted = Math.round(p.avgDailySales * 0.75 * (0.85 + 0.3 * Math.sin(i / 2)))
    if (i === 0 && lastActual) {
      out.push({ date, actual: lastActual.actual, predicted })
    } else {
      out.push({ date, predicted })
    }
  }
  return out
}
