import { useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { IndianRupee, ShoppingCart, Receipt, TrendingUp, Percent, Wallet } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { useApiQuery } from '@/store/DataStore'
import type { ApiProduct } from '@/lib/api'
import { formatNum, formatPaise, shortDate, signedDelta } from '@/lib/format'
import { ChartCard, ChartEmpty, ChartSkeleton, EmptyState, MetricCard, PageHeader, PanelError, ProductIcon } from '@/components/common'
import { CountUp } from '@/components/CountUp'
import { RangeTabs } from '@/components/charts'
import { CHART_ANIMATE, tooltipStyle, type DailyPoint, type Summary } from '@/lib/chartTheme'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PIE_COLORS = ['var(--chart-purple)', 'var(--chart-teal)', 'var(--chart-orange)', 'var(--chart-purple)', 'var(--chart-blue)', 'var(--chart-red)']

interface ProductSales { sku: string; name: string; category: string; icon: string; units: number; orders: number; revenue: number; profit: number; marginPct: number | null }

export default function Analytics() {
  const { demoLoaded, loadDemoBusiness } = useApp()
  const [range, setRange] = useState<7 | 30 | 90>(30)
  const [category, setCategory] = useState('All')
  const cat = category === 'All' ? '' : `&category=${encodeURIComponent(category)}`

  const products = useApiQuery<{ products: ApiProduct[] }>('/api/products', ['products'])
  const summary = useApiQuery<Summary>(`/api/analytics/summary?days=${range}${cat}`, ['analytics', 'products'])
  const daily = useApiQuery<{ series: DailyPoint[] }>(`/api/analytics/daily?days=${range}${cat}`, ['analytics', 'products'])
  const byProduct = useApiQuery<{ products: ProductSales[]; categories: { name: string; revenue: number }[] }>(`/api/analytics/products?days=${range}${cat}`, ['analytics', 'products'])

  const categories = ['All', ...new Set((products.data?.products ?? []).map((p) => p.category))]

  if (!demoLoaded && products.data && products.data.products.length === 0) {
    return (
      <>
        <PageHeader title="Sales Analytics" subtitle="Revenue, orders, margin and product performance." />
        <EmptyState title="No sales data yet" body="Load the demo business to explore 90 days of sample sales analytics, or import your sales history." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  const s = summary.data
  const series = (daily.data?.series ?? []).map((d) => ({ ...d, label: shortDate(d.date), revenueRs: d.revenue / 100 }))
  const ps = byProduct.data?.products ?? []
  const cats = (byProduct.data?.categories ?? []).filter((c) => c.revenue > 0)
  const totalRevenue = cats.reduce((a, c) => a + c.revenue, 0)
  const best = ps.slice(0, 3)
  const worst = ps.length > 3 ? [...ps].slice(-2).reverse() : []
  const rev = signedDelta(s?.deltas.revenue), ord = signedDelta(s?.deltas.orders), units = signedDelta(s?.deltas.units), prof = signedDelta(s?.deltas.profit)

  const chartBody = (q: { loading: boolean; error?: { message: string }; reload: () => void }, empty: boolean, node: React.ReactNode, emptyText = 'No sales in this period.') =>
    q.loading ? <ChartSkeleton /> : q.error ? <PanelError message={q.error.message} onRetry={q.reload} /> : empty ? <ChartEmpty text={emptyText} /> : node

  return (
    <div>
      <PageHeader
        title="Sales Analytics"
        subtitle="Revenue, orders, margin and product performance."
        actions={
          <>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-44" aria-label="Filter by category"><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <RangeTabs value={range} onChange={setRange} />
          </>
        }
      />

      {summary.error && <div className="mb-4"><PanelError message={summary.error.message} onRetry={summary.reload} /></div>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard loading={summary.loading} label="Gross Revenue" value={<CountUp value={(s?.revenue ?? 0) / 100} format="inr" />} delta={rev?.text} up={rev?.up} hint={`vs prev ${range}d`} icon={<IndianRupee className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={summary.loading} label="Units Sold" value={<CountUp value={s?.units ?? 0} />} delta={units?.text} up={units?.up} icon={<TrendingUp className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={summary.loading} label="Total Orders" value={<CountUp value={s?.orders ?? 0} />} delta={ord?.text} up={ord?.up} icon={<ShoppingCart className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={summary.loading} label="Avg Order Value" value={<CountUp value={(s?.avgOrderValue ?? 0) / 100} format="inr" />} hint="revenue ÷ orders" icon={<Receipt className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={summary.loading} label="Est. Gross Profit" value={<CountUp value={(s?.profit ?? 0) / 100} format="inr" />} delta={prof?.text} up={prof?.up} icon={<Wallet className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={summary.loading} label="Gross Margin" value={<CountUp value={s?.grossMarginPct ?? 0} format="percent" decimals={1} />} icon={<Percent className="h-4 w-4" aria-hidden />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Revenue over time" subtitle={`Last ${range} days${category !== 'All' ? ` · ${category}` : ''}`}>
          <div className="h-60">
            {chartBody(daily, series.length === 0, (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="an-rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-purple)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--chart-purple)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${Math.round(v / 1000)}k`} width={52} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatPaise(v * 100), 'Revenue']} />
                  <Area isAnimationActive={CHART_ANIMATE} type="monotone" dataKey="revenueRs" name="Revenue" stroke="var(--chart-purple)" strokeWidth={2} fill="url(#an-rev)" />
                </AreaChart>
              </ResponsiveContainer>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Orders over time" subtitle={`Last ${range} days · orders, not units`}>
          <div className="h-60">
            {chartBody(daily, series.length === 0, (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [formatNum(v), name]} />
                  <Line isAnimationActive={CHART_ANIMATE} type="monotone" dataKey="orders" name="Orders" stroke="var(--chart-teal)" strokeWidth={2} dot={false} />
                  <Line isAnimationActive={CHART_ANIMATE} type="monotone" dataKey="units" name="Units" stroke="var(--chart-purple)" strokeWidth={1.25} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Sales by product" subtitle="Units sold in the selected period">
          <div className="h-60">
            {chartBody(byProduct, ps.every((p) => p.units === 0), (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ps} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickFormatter={(v: string) => v.split(' ')[0]} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${formatNum(v)} units`, 'Sold']} />
                  <Bar isAnimationActive={CHART_ANIMATE} dataKey="units" radius={[6, 6, 0, 0]} barSize={36}>
                    {ps.map((p, i) => <Cell key={p.sku} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Category performance" subtitle="Revenue share by category">
          <div className="flex h-60 items-center">
            {chartBody(byProduct, cats.length === 0, (
              <>
                <ResponsiveContainer width="55%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={CHART_ANIMATE} data={cats} dataKey="revenue" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={3} strokeWidth={0}>
                      {cats.map((c, i) => <Cell key={c.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatPaise(v), 'Revenue']} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-2.5 pr-2">
                  {cats.map((c, i) => (
                    <li key={c.name} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} aria-hidden />
                      <span className="flex-1 truncate text-muted-foreground">{c.name}</span>
                      <span className="tabular text-xs font-medium">{totalRevenue ? Math.round((c.revenue / totalRevenue) * 100) : 0}%</span>
                    </li>
                  ))}
                </ul>
              </>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Bestselling products" subtitle="Top revenue in the selected period">
          <ul className="space-y-2.5">
            {best.map((p, i) => (
              <li key={p.sku} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/15 text-xs font-bold text-brand-soft">{i + 1}</span>
                <ProductIcon icon={p.icon} className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatNum(p.units)} units · {formatNum(p.orders)} orders</p>
                </div>
                <span className="tabular text-sm font-semibold">{formatPaise(p.revenue)}</span>
              </li>
            ))}
            {best.length === 0 && <li className="text-xs text-muted-foreground">No products in this category.</li>}
          </ul>
        </ChartCard>

        <ChartCard title="Low-performing products" subtitle="Weakest revenue — candidates for repricing">
          <ul className="space-y-2.5">
            {worst.map((p) => (
              <li key={p.sku} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
                <ProductIcon icon={p.icon} className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatNum(p.units)} units · margin {p.marginPct ?? '—'}%</p>
                </div>
                <span className="tabular text-sm font-semibold text-warning">{formatPaise(p.revenue)}</span>
              </li>
            ))}
            {worst.length === 0 && <li className="text-xs text-muted-foreground">Needs more than three products to compare.</li>}
          </ul>
        </ChartCard>
      </div>
    </div>
  )
}
