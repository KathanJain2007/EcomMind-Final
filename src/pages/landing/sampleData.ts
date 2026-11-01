/**
 * Generated numbers for the landing page's "Live preview with sample data".
 * Nothing here touches the API or describes a real seller: every value comes from a seeded
 * random stream, so the same seed always replays the same preview (and can be tested).
 */

export const SAMPLE_SEED = 20261101

/** Below this many days of cover a product's bar turns red. */
export const LOW_STOCK_DAYS = 7

/** Points on screen in the streaming chart, and how often a new one arrives. */
export const VISIBLE_POINTS = 12
export const STREAM_INTERVAL_MS = 2500

export const REVENUE_RANGE = { min: 26000, max: 50000 }
export const ORDERS_RANGE = { min: 18, max: 52 }

export interface TrafficPoint {
  id: number
  revenue: number
  orders: number
}

export interface StockItem {
  product: string
  days: number
}

export interface SampleKpis {
  revenue: number
  orders: number
  inventoryValue: number
  estimatedProfit: number
  activeAgents: number
}

export interface ActivityEvent {
  id: number
  source: string
  message: string
}

export const ESCROW_STAGES = ['Deal Agreed', 'Money Locked', 'Goods Dispatched', 'Delivery Confirmed', 'Payment Released'] as const

const SAMPLE_PRODUCTS: StockItem[] = [
  { product: 'Bamboo Desk Organiser', days: 26 },
  { product: 'Ceramic Mug Set', days: 14 },
  { product: 'Linen Cushion Cover', days: 9 },
  { product: 'Brass Table Lamp', days: 5 },
  { product: 'Cotton Throw Blanket', days: 18 },
]

const ACTIVITY_TEMPLATES = [
  { source: 'Demand Forecast Agent', message: 'Forecast ready' },
  { source: 'Market Price Agent', message: 'Suggested price updated' },
  { source: 'Return Risk Agent', message: 'Risk assessment completed' },
  { source: 'Escrow', message: 'Deal locked' },
  { source: 'Supplier', message: 'Counter-offer received' },
  { source: 'Logistics Agent', message: 'Courier quote compared' },
]

/** Small seeded generator (mulberry32): returns numbers in [0, 1). */
export function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Endless revenue/orders stream that wanders inside its ranges. */
export function createTrafficStream(seed = SAMPLE_SEED) {
  const random = createRandom(seed)
  let id = 0
  let revenue = (REVENUE_RANGE.min + REVENUE_RANGE.max) / 2
  let orders = (ORDERS_RANGE.min + ORDERS_RANGE.max) / 2
  return (): TrafficPoint => {
    revenue = clamp(revenue + (random() - 0.5) * 9000, REVENUE_RANGE.min, REVENUE_RANGE.max)
    orders = clamp(orders + (random() - 0.5) * 11, ORDERS_RANGE.min, ORDERS_RANGE.max)
    id += 1
    return { id, revenue: Math.round(revenue), orders: Math.round(orders) }
  }
}

export function initialTraffic(next: () => TrafficPoint, count: number): TrafficPoint[] {
  return Array.from({ length: count }, () => next())
}

/** Days of cover that drift gently around each product's starting level. */
export function createStockStream(seed = SAMPLE_SEED + 1) {
  const random = createRandom(seed)
  let items = SAMPLE_PRODUCTS.map((item) => ({ ...item }))
  return (): StockItem[] => {
    items = items.map((item, index) => {
      const base = SAMPLE_PRODUCTS[index].days
      const days = clamp(item.days + (random() - 0.5) * 2, Math.max(2, base - 4), base + 4)
      return { ...item, days: Math.round(days * 10) / 10 }
    })
    return items
  }
}

export function initialStock(): StockItem[] {
  return SAMPLE_PRODUCTS.map((item) => ({ ...item }))
}

export const isLowStock = (days: number) => days < LOW_STOCK_DAYS

/** Whole-number KPI targets for the count-up cards. */
export function sampleKpis(seed = SAMPLE_SEED + 2): SampleKpis {
  const random = createRandom(seed)
  const revenue = Math.round(620000 + random() * 180000)
  const orders = Math.round(1100 + random() * 500)
  return {
    revenue,
    orders,
    inventoryValue: Math.round(340000 + random() * 120000),
    estimatedProfit: Math.round(revenue * (0.18 + random() * 0.06)),
    activeAgents: 4,
  }
}

/** Weekly values for the hero chart card, in proportion to its bars. */
export function sampleChartBars(heights: number[], seed = SAMPLE_SEED + 4) {
  const random = createRandom(seed)
  const rupeesPerUnit = 900 + random() * 300
  return heights.map((height, i) => ({ label: `Week ${i + 1}`, value: Math.round((height * rupeesPerUnit) / 100) * 100 }))
}

/** Endless agent activity, picked so the same source never appears twice in a row. */
export function createActivityStream(seed = SAMPLE_SEED + 3) {
  const random = createRandom(seed)
  let id = 0
  let last = -1
  return (): ActivityEvent => {
    let pick = Math.floor(random() * ACTIVITY_TEMPLATES.length)
    if (pick === last) pick = (pick + 1) % ACTIVITY_TEMPLATES.length
    last = pick
    id += 1
    return { id, ...ACTIVITY_TEMPLATES[pick] }
  }
}
