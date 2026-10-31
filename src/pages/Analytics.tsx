import { useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useApp } from '@/store/AppContext'
import { PRODUCTS, dailySeries, productSales } from '@/data/demo'
import { cx, formatINR, formatNum } from '@/lib/format'
import { ChartCard, EmptyState, MetricCard, PageHeader, ProductIcon } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IndianRupee, ShoppingCart, Receipt, TrendingUp, Percent, Wallet } from 'lucide-react'

const tooltipStyle = { backgroundColor: '#10172A', border: '1px solid #27334D', borderRadius: 10, fontSize: 12, color: '#F8FAFC' }
const PIE_COLORS = ['#7965F2', '#22C55E', '#F59E0B', '#9A8BFF', '#5f8bff']
const RANGES = [7, 30, 90] as const

export default function Analytics() {
  const { demoLoaded, loadDemoBusiness } = useApp()
  const [range, setRange] = useState<(typeof RANGES)[number]>(30)
  const [category, setCategory] = useState('All')

  const categories = useMemo(() => ['All', ...new Set(PRODUCTS.map((p) => p.category))], [])

  const data = useMemo(() => {
    const series = dailySeries(range).map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }))
    let ps = productSales(range)
    if (category !== 'All') ps = ps.filter((p) => p.product.category === category)
    const grossRevenue = ps.reduce((s, p) => s + p.revenue, 0)
    const totalUnits = ps.reduce((s, p) => s + p.units, 0)
    const profit = ps.reduce((s, p) => s + p.units * (p.product.price - p.product.cost), 0)
    const byCategory = [...ps.reduce((m, p) => m.set(p.product.category, (m.get(p.product.category) ?? 0) + p.revenue), new Map<string, number>()).entries()]
      .map(([name, value]) => ({ name, value }))
    const ranked = [...ps].sort((a, b) => b.revenue - a.revenue)
    return { series, ps, grossRevenue, totalUnits, profit, byCategory, best: ranked.slice(0, 3), worst: ranked.slice(-2).reverse() }
  }, [range, category])

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Sales Analytics" subtitle="Revenue, orders, margin and product performance." />
        <EmptyState title="No sales data yet" body="Load the demo business to explore 90 days of sales analytics, or import your sales history." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  const aov = data.totalUnits ? data.grossRevenue / data.totalUnits : 0
  const margin = data.grossRevenue ? (data.profit / data.grossRevenue) * 100 : 0

  return (
    <div>
      <PageHeader
        title="Sales Analytics"
        subtitle="Revenue, orders, margin and product performance across channels."
        actions={
          <>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-44" aria-label="Filter by category"><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex gap-1 rounded-lg border border-border bg-secondary/60 p-0.5" role="tablist" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)}
                  className={cx('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', range === r ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground')}>
                  {r}d
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Gross Revenue" value={formatINR(data.grossRevenue)} icon={<IndianRupee className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Total Sales" value={`${formatNum(data.totalUnits)} units`} icon={<TrendingUp className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Total Orders" value={formatNum(data.totalUnits)} icon={<ShoppingCart className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Avg Order Value" value={formatINR(Math.round(aov))} icon={<Receipt className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Est. Gross Profit" value={formatINR(data.profit)} icon={<Wallet className="h-4 w-4" aria-hidden />} />
        <MetricCard label="Gross Margin" value={`${margin.toFixed(1)}%`} icon={<Percent className="h-4 w-4" aria-hidden />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Revenue over time" subtitle={`Last ${range} days`}>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="an-rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7965F2" stopOpacity={0.35} /><stop offset="100%" stopColor="#7965F2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27334D" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${Math.round(v / 1000)}k`} width={52} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatINR(v), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#9A8BFF" strokeWidth={2} fill="url(#an-rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Orders over time" subtitle={`Last ${range} days`}>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27334D" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatNum(v), 'Orders']} />
                <Line type="monotone" dataKey="orders" stroke="#22C55E" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Sales by product" subtitle="Units sold in selected period">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.ps.map((p) => ({ name: p.product.name, units: p.units }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27334D" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickFormatter={(v: string) => v.split(' ')[0]} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${formatNum(v)} units`, 'Sales']} />
                <Bar dataKey="units" radius={[6, 6, 0, 0]} barSize={36}>
                  {data.ps.map((p, i) => <Cell key={p.sku} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Category performance" subtitle="Revenue share by category">
          <div className="flex h-60 items-center">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie data={data.byCategory} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={3} strokeWidth={0}>
                  {data.byCategory.map((c, i) => <Cell key={c.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatINR(v), 'Revenue']} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex-1 space-y-2.5 pr-2">
              {data.byCategory.map((c, i) => (
                <li key={c.name} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} aria-hidden />
                  <span className="flex-1 truncate text-muted-foreground">{c.name}</span>
                  <span className="tabular text-xs font-medium">{Math.round((c.value / data.grossRevenue) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Bestselling products" subtitle="Top revenue in selected period">
          <ul className="space-y-2.5">
            {data.best.map((p, i) => (
              <li key={p.sku} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/15 text-xs font-bold text-brand-soft">{i + 1}</span>
                <ProductIcon icon={p.product.icon} className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.product.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatNum(p.units)} units sold</p>
                </div>
                <span className="tabular text-sm font-semibold">{formatINR(p.revenue)}</span>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title="Low-performing products" subtitle="Weakest revenue — candidates for repricing">
          <ul className="space-y-2.5">
            {data.worst.map((p) => (
              <li key={p.sku} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
                <ProductIcon icon={p.product.icon} className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.product.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatNum(p.units)} units · margin {Math.round(((p.product.price - p.product.cost) / p.product.price) * 100)}%</p>
                </div>
                <span className="tabular text-sm font-semibold text-warning">{formatINR(p.revenue)}</span>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>
    </div>
  )
}
