/** Shared chart constants and analytics response types. */

export const RANGES = [7, 30, 90] as const

/** Follows the light/dark theme through the CSS variables in index.css. */
export const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12,
  fontSize: 12, color: 'hsl(var(--popover-foreground))', boxShadow: 'var(--shadow-pop)', padding: '8px 12px',
}

/** Recharts animates from JavaScript, out of reach of the CSS reduced-motion rule. */
export const CHART_ANIMATE = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const GRID_STROKE = 'hsl(var(--border))'

/** GET /api/analytics/summary — money in paise. */
export interface Summary {
  days: number
  revenue: number; orders: number; units: number; profit: number; avgOrderValue: number; grossMarginPct: number | null
  deltas: { revenue: number | null; orders: number | null; units: number | null; profit: number | null }
  productCount: number; needsAttention: number; inventoryValue: number
  activeAgents: number; agentsDiscovered: number; walletBalance: number
  budget: { daily: number; consumedToday: number }
}

/** One day of GET /api/analytics/daily — revenue in paise. */
export interface DailyPoint { date: string; revenue: number; orders: number; units: number }
