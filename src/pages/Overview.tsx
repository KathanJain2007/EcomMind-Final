import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  IndianRupee, ShoppingCart, Package, Boxes, PiggyBank, Bot, Play, Pause, Activity as ActivityIcon,
  ArrowRight, BrainCircuit, Clock,
} from 'lucide-react'
import { motion } from 'framer-motion'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useApp } from '@/store/AppContext'
import { FIN, PRODUCTS, RECOMMENDATIONS, dailySeries, productSales, stockCoverage, stockStatus } from '@/data/demo'
import { cx, formatINR, formatNum, greeting, timeAgo } from '@/lib/format'
import { BudgetProgress, ChartCard, EmptyState, MetricCard, StatusBadge } from '@/components/common'
import { ActivityTimeline } from '@/components/ActivityTimeline'
import { usePageLoading } from '@/hooks/usePageLoading'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const RANGES = [7, 30, 90] as const

const tooltipStyle = {
  backgroundColor: '#10172A', border: '1px solid #27334D', borderRadius: 10,
  fontSize: 12, color: '#F8FAFC',
}

export default function Overview() {
  const { auth, demoLoaded, loadDemoBusiness, agentStatus, setAgentStatus, agentsDiscovered, lastExecution, activity, mandate } = useApp()
  const loading = usePageLoading()
  const [range, setRange] = useState<(typeof RANGES)[number]>(30)
  const navigate = useNavigate()

  const metrics = useMemo(() => {
    const cur = dailySeries(30)
    const revenue30 = cur.reduce((s, d) => s + d.revenue, 0)
    const orders30 = cur.reduce((s, d) => s + d.orders, 0)
    const prev = dailySeries(60).filter((d) => !cur.some((c) => c.date === d.date))
    const prevRevenue = prev.reduce((s, d) => s + d.revenue, 0)
    const prevOrders = prev.reduce((s, d) => s + d.orders, 0)
    const inventoryValue = PRODUCTS.reduce((s, p) => s + p.stock * p.cost, 0)
    const profit30 = productSales(30).reduce((s, p) => s + p.units * (p.product.price - p.product.cost), 0)
    return {
      revenue30, orders30, inventoryValue, profit30,
      revDelta: prevRevenue ? ((revenue30 - prevRevenue) / prevRevenue) * 100 : 0,
      ordDelta: prevOrders ? ((orders30 - prevOrders) / prevOrders) * 100 : 0,
    }
  }, [])

  const chartData = useMemo(() => dailySeries(range).map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) })), [range])

  const stockData = useMemo(
    () => PRODUCTS.map((p) => ({ name: p.name.replace('Insulated ', '').replace('Wireless ', ''), full: p.name, stock: p.stock, coverage: stockCoverage(p), status: stockStatus(p) })),
    [],
  )

  if (!demoLoaded) {
    return (
      <EmptyState
        title="Your autonomous economy awaits"
        body="Load the demo business to explore EcomMind with 5 products, 90 days of sales history, supplier quotes and live agent activity — or import your own data."
        action={
          <div className="flex gap-2">
            <Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>
              <Play className="h-4 w-4" aria-hidden /> Load Demo Business
            </Button>
            <Button variant="outline" onClick={() => navigate('/import')}>Import my data</Button>
          </div>
        }
      />
    )
  }

  const recentActivity = [...activity].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 6)

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{greeting()}, {auth.sellerName.split(' ')[0] || 'Seller'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here is what EcomMind has been working on today.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/activity')}>
          <ActivityIcon className="h-3.5 w-3.5" aria-hidden /> View all activity
        </Button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard loading={loading} label="Total Revenue" value={formatINR(metrics.revenue30)} delta={`${metrics.revDelta >= 0 ? '+' : ''}${metrics.revDelta.toFixed(1)}%`} up={metrics.revDelta >= 0} hint="vs prev 30d" icon={<IndianRupee className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={loading} label="Total Orders" value={formatNum(metrics.orders30)} delta={`${metrics.ordDelta >= 0 ? '+' : ''}${metrics.ordDelta.toFixed(1)}%`} up={metrics.ordDelta >= 0} hint="vs prev 30d" icon={<ShoppingCart className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={loading} label="Total Products" value={String(PRODUCTS.length)} hint="2 need attention" icon={<Package className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={loading} label="Inventory Value" value={formatINR(metrics.inventoryValue)} hint="at unit cost" icon={<Boxes className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={loading} label="Estimated Profit" value={formatINR(metrics.profit30)} delta="+9.8%" up hint="30d gross" icon={<PiggyBank className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={loading} label="Active AI Agents" value={agentStatus === 'paused' ? '0' : '5'} hint={`of ${agentsDiscovered} discovered`} icon={<Bot className="h-4 w-4" aria-hidden />} />
      </div>

      {/* AI agent panel */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <Card className="card-surface overflow-hidden">
          <div className="h-0.5 w-full bg-gradient-to-r from-brand-soft via-brand to-[#5f8bff]" aria-hidden />
          <CardContent className="p-5 md:p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <div className="btn-glow flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                  <BrainCircuit className="h-6 w-6 text-white" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight">EcomMind Agent</h2>
                    <StatusBadge
                      label={agentStatus === 'active' ? 'Active' : agentStatus === 'paused' ? 'Paused' : 'Idle'}
                      tone={agentStatus === 'active' ? 'success' : agentStatus === 'paused' ? 'danger' : 'warning'}
                      pulse={agentStatus === 'active'}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Agent ID <span className="font-mono text-foreground/80">ecommind-01</span> · {agentsDiscovered} agents discovered ·
                    <Clock className="mx-1 inline h-3 w-3" aria-hidden />last execution {timeAgo(lastExecution)}
                  </p>
                  <div className="mt-4 grid max-w-xl grid-cols-3 gap-4">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Daily mandate</p>
                      <p className="tabular text-sm font-semibold">{formatINR(mandate.dailyBudget)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Consumed today</p>
                      <p className="tabular text-sm font-semibold text-warning">{formatINR(FIN.budgetConsumed)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Remaining</p>
                      <p className="tabular text-sm font-semibold text-success">{formatINR(mandate.dailyBudget - FIN.budgetConsumed)}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full max-w-sm space-y-3">
                <BudgetProgress label="Mandate budget utilisation" value={FIN.budgetConsumed} max={mandate.dailyBudget} />
                <div className="flex flex-wrap gap-2">
                  {agentStatus === 'active' ? (
                    <Button size="sm" variant="outline" className="border-warning/40 text-warning hover:bg-warning/10" onClick={() => setAgentStatus('paused')}>
                      <Pause className="h-3.5 w-3.5" aria-hidden /> Pause Agent
                    </Button>
                  ) : (
                    <Button size="sm" className="btn-glow border-0 text-white" onClick={() => setAgentStatus('active')}>
                      <Play className="h-3.5 w-3.5" aria-hidden /> Start EcomMind
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => navigate('/activity')}>View Activity</Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => navigate('/settings')}>Edit mandate</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <ChartCard
          title="Sales analytics"
          subtitle="Daily revenue and orders"
          className="xl:col-span-3"
          action={
            <div className="flex gap-1 rounded-lg border border-border bg-secondary/60 p-0.5" role="tablist" aria-label="Date range">
              {RANGES.map((r) => (
                <button
                  key={r}
                  role="tab"
                  aria-selected={range === r}
                  onClick={() => setRange(r)}
                  className={cx('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', range === r ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground')}
                >
                  {r}d
                </button>
              ))}
            </div>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7965F2" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#7965F2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27334D" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis yAxisId="rev" tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${Math.round(v / 1000)}k`} width={52} />
                <YAxis yAxisId="ord" orientation="right" tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => (name === 'Revenue' ? [formatINR(v), name] : [formatNum(v), name])} />
                <Area yAxisId="rev" type="monotone" dataKey="revenue" name="Revenue" stroke="#9A8BFF" strokeWidth={2} fill="url(#rev)" />
                <Area yAxisId="ord" type="monotone" dataKey="orders" name="Orders" stroke="#22C55E" strokeWidth={1.5} fill="transparent" strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Inventory overview" subtitle="Stock on hand by product" className="xl:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockData} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27334D" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={92} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _n, item) => [`${v} units · ${item.payload.coverage}d cover`, item.payload.full]} labelFormatter={() => ''} />
                <Bar dataKey="stock" radius={[0, 6, 6, 0]} barSize={16}>
                  {stockData.map((d) => (
                    <Cell key={d.full} fill={d.status === 'Critical' ? '#EF4444' : d.status === 'Low Stock' ? '#F59E0B' : '#7965F2'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Recommendations + activity */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="space-y-3 xl:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">AI recommendations</h2>
            <Link to="/insights" className="flex items-center gap-1 text-xs font-medium text-brand-soft hover:underline">
              Open EcomMind Intelligence <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {RECOMMENDATIONS.map((r) => (
              <Card key={r.id} className="card-surface card-hover">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <StatusBadge label={`${r.priority} priority`} tone={r.priority === 'High' ? 'danger' : r.priority === 'Medium' ? 'warning' : 'neutral'} />
                    {r.sku && <span className="font-mono text-[10px] text-muted-foreground">{r.sku}</span>}
                  </div>
                  <h3 className="text-sm font-semibold">{r.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.reason}</p>
                  <p className="mt-2 text-xs font-medium text-success">{r.impact}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground line-clamp-1">{r.action}</span>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => navigate(r.sku ? `/inventory?q=${encodeURIComponent(r.title.replace(/^(Restock|Review|Monitor|Optimize)\s*/, '').replace(/ (inventory|stock|return rate)$/, ''))}` : '/insights')}>
                      View details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="card-surface xl:col-span-2">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent agent activity</h2>
              <StatusBadge label={agentStatus === 'active' ? 'Live' : 'Paused'} tone={agentStatus === 'active' ? 'success' : 'danger'} pulse={agentStatus === 'active'} />
            </div>
            <ActivityTimeline events={recentActivity} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
