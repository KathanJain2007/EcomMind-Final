import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  IndianRupee, ShoppingCart, Package, Boxes, PiggyBank, Bot, Play, Pause, Activity as ActivityIcon,
  ArrowRight, BrainCircuit, Wallet, ShoppingBag, Flame,
} from 'lucide-react'
import { motion } from 'framer-motion'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useApp } from '@/store/AppContext'
import { useApiQuery } from '@/store/DataStore'
import type { ApiEvent, ApiMandate } from '@/lib/api'
import { formatNum, formatPaise, greeting, shortDate, signedDelta } from '@/lib/format'
import { RangeTabs } from '@/components/charts'
import { tooltipStyle, type DailyPoint, type Summary } from '@/lib/chartTheme'
import { BudgetProgress, ChartCard, ChartEmpty, ChartSkeleton, EmptyState, MetricCard, PanelError, StatusBadge } from '@/components/common'
import { CountUp } from '@/components/CountUp'
import { ActivityTimeline } from '@/components/ActivityTimeline'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface InventoryRow { sku: string; name: string; stock: number; coverageDays: number | null; status: string }
interface Recommendation { id: string; priority: 'High' | 'Medium' | 'Low'; sku: string; title: string; reason: string; impact: string; impactValue: number | null; action: string }

export default function Overview() {
  const { auth, demoLoaded, loadDemoBusiness, agentStatus, setAgentStatus, business, festivalEvents } = useApp()
  const [range, setRange] = useState<7 | 30 | 90>(30)
  const navigate = useNavigate()

  const summary = useApiQuery<Summary>(`/api/analytics/summary?days=${range}`, ['analytics', 'products', 'wallet', 'agents'])
  const daily = useApiQuery<{ series: DailyPoint[] }>(`/api/analytics/daily?days=${range}`, ['analytics', 'products'])
  const inventory = useApiQuery<{ products: InventoryRow[] }>('/api/analytics/inventory', ['products'])
  const recs = useApiQuery<{ recommendations: Recommendation[] }>('/api/analytics/recommendations', ['products', 'analytics'])
  const events = useApiQuery<{ items: ApiEvent[] }>('/api/activity/events?pageSize=6', ['activity'])
  const mandate = useApiQuery<{ mandate: ApiMandate }>('/api/mandate', ['mandate'])

  const channelsQ = useApiQuery<{ marketplaces: { id: string; listings: number }[] }>('/api/marketplaces', ['orders', 'products'])
  const listedChannels = (channelsQ.data?.marketplaces ?? []).filter((m) => m.listings > 0).length
  const nextFestival = festivalEvents.find((f) => f.status !== 'Completed')
  const hasData = (summary.data?.productCount ?? 0) > 0
  if (!demoLoaded && summary.data && !hasData) {
    return (
      <EmptyState
        title="Your autonomous economy awaits"
        body="Load the demo business to explore EcomMind with 5 products, 90 days of sample sales history, supplier quotes and agent activity — or import your own data."
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

  const s = summary.data
  const loading = summary.loading
  const rev = signedDelta(s?.deltas.revenue)
  const ord = signedDelta(s?.deltas.orders)
  const prof = signedDelta(s?.deltas.profit)
  const chartData = (daily.data?.series ?? []).map((d) => ({ ...d, label: shortDate(d.date), revenueRs: d.revenue / 100 }))
  const stockData = (inventory.data?.products ?? []).map((p) => ({ ...p, short: p.name.replace('Insulated ', '').replace('Wireless ', '') }))
  const daily_ = mandate.data?.mandate.dailyBudget ?? s?.budget.daily ?? 0
  const consumed = s?.budget.consumedToday ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{greeting()}, {auth.sellerName.split(' ')[0] || 'Seller'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here is what EcomMind has been working on{business?.demoLoaded ? ' · showing the UrbanNest Living demo dataset' : ''}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RangeTabs value={range} onChange={setRange} />
          <Button variant="outline" size="sm" onClick={() => navigate('/activity')}>
            <ActivityIcon className="h-3.5 w-3.5" aria-hidden /> View all activity
          </Button>
        </div>
      </div>

      {summary.error && <PanelError message={summary.error.message} onRetry={summary.reload} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard loading={loading} label="Total Revenue" value={<CountUp value={(s?.revenue ?? 0) / 100} format="inr" />} delta={rev?.text} up={rev?.up} hint={`vs prev ${range}d`} icon={<IndianRupee className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={loading} label="Total Orders" value={<CountUp value={s?.orders ?? 0} />} delta={ord?.text} up={ord?.up} hint={`vs prev ${range}d`} icon={<ShoppingCart className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={loading} label="Total Products" value={<CountUp value={s?.productCount ?? 0} />} hint={s?.needsAttention ? `${s.needsAttention} need attention` : 'all healthy'} icon={<Package className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={loading} label="Inventory Value" value={<CountUp value={(s?.inventoryValue ?? 0) / 100} format="inr" />} hint="at unit cost" icon={<Boxes className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={loading} label="Estimated Profit" value={<CountUp value={(s?.profit ?? 0) / 100} format="inr" />} delta={prof?.text} up={prof?.up} hint={`${range}d gross`} icon={<PiggyBank className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={loading} label="Active AI Agents" value={<CountUp value={s?.activeAgents ?? 0} durationMs={900} />} hint={`of ${s?.agentsDiscovered ?? 0} discovered`} icon={<Bot className="h-4 w-4" aria-hidden />} />
      </div>

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
                    <StatusBadge label={agentStatus === 'active' ? 'Active' : 'Paused'} tone={agentStatus === 'active' ? 'success' : 'danger'} pulse={agentStatus === 'active'} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Agent ID <span className="font-mono text-foreground/80">ecommind-01</span> · {s?.agentsDiscovered ?? 0} agents discovered
                  </p>
                  <div className="mt-4 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Daily mandate</p>
                      <p className="tabular text-sm font-semibold"><CountUp value={daily_ / 100} format="inr" /></p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Consumed today</p>
                      <p className="tabular text-sm font-semibold text-warning"><CountUp value={consumed / 100} format="inr" /></p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Remaining</p>
                      <p className="tabular text-sm font-semibold text-success"><CountUp value={Math.max(0, daily_ - consumed) / 100} format="inr" /></p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Wallet balance</p>
                      <p className="tabular flex items-center gap-1 text-sm font-semibold"><Wallet className="h-3 w-3 text-muted-foreground" aria-hidden /><CountUp value={(s?.walletBalance ?? 0) / 100} format="inr" /></p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full max-w-sm space-y-3">
                <BudgetProgress label="Mandate budget utilisation (today)" value={consumed / 100} max={Math.max(1, daily_ / 100)} />
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

      {/* Autonomous Commerce Quick Links */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="card-surface card-hover cursor-pointer" onClick={() => navigate('/selling')}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-soft">
                <ShoppingBag className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Multi-Marketplace Selling</h3>
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                    {listedChannels} channels with listings
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Amazon, Flipkart, Meesho & Shopify listings selling from one shared, oversell-protected stock pool.
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardContent>
        </Card>

        <Card className="card-surface card-hover cursor-pointer" onClick={() => navigate('/festivals')}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <Flame className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Festival Intelligence & Discounts</h3>
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                    {nextFestival ? `${nextFestival.name} upcoming` : 'Festival calendar'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Demand surge forecasts and backend margin-verified festive campaign markdowns.
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <ChartCard title="Sales analytics" subtitle={`Daily revenue and orders · last ${range} days`} className="xl:col-span-3">
          <div className="h-64">
            {daily.loading ? <ChartSkeleton /> : daily.error ? <PanelError message={daily.error.message} onRetry={daily.reload} />
              : chartData.length === 0 ? <ChartEmpty text="No sales recorded in this period." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7965F2" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#7965F2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis yAxisId="rev" tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${Math.round(v / 1000)}k`} width={52} label={{ value: 'Revenue', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, dx: 6 }} />
                  <YAxis yAxisId="ord" orientation="right" tickLine={false} axisLine={false} width={40} label={{ value: 'Orders', angle: 90, position: 'insideRight', fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => (name === 'Revenue' ? [formatPaise(v * 100), name] : [formatNum(v), name])} />
                  <Legend verticalAlign="top" height={24} iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="rev" type="monotone" dataKey="revenueRs" name="Revenue" stroke="#9A8BFF" strokeWidth={2} fill="url(#rev)" isAnimationActive />
                  <Area yAxisId="ord" type="monotone" dataKey="orders" name="Orders" stroke="#22C55E" strokeWidth={1.5} fill="transparent" strokeDasharray="4 3" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Inventory overview" subtitle="Stock on hand · colour shows days of cover" className="xl:col-span-2">
          <div className="h-64">
            {inventory.loading ? <ChartSkeleton /> : inventory.error ? <PanelError message={inventory.error.message} onRetry={inventory.reload} />
              : stockData.length === 0 ? <ChartEmpty text="No products yet." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stockData} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} label={{ value: 'Units in stock', position: 'insideBottom', offset: -2, fill: '#94a3b8', fontSize: 11 }} height={32} />
                  <YAxis type="category" dataKey="short" tickLine={false} axisLine={false} width={92} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _n, item) => [`${formatNum(v)} units · ${item.payload.coverageDays ?? '—'}d cover · ${item.payload.status}`, item.payload.name]} labelFormatter={() => ''} />
                  <Bar dataKey="stock" radius={[0, 6, 6, 0]} barSize={16}>
                    {stockData.map((d) => (
                      <Cell key={d.sku} fill={d.status === 'Critical' || d.status === 'Out of Stock' ? '#EF4444' : d.status === 'Low Stock' ? '#F59E0B' : '#7965F2'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="space-y-3 xl:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">AI recommendations</h2>
            <Link to="/insights" className="flex items-center gap-1 text-xs font-medium text-brand-soft hover:underline">
              Open EcomMind Intelligence <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
          {recs.error && <PanelError message={recs.error.message} onRetry={recs.reload} />}
          {recs.data && recs.data.recommendations.length === 0 && <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">No action needed right now: stock and returns are within healthy ranges.</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(recs.data?.recommendations ?? []).map((r) => (
              <Card key={r.id} className="card-surface card-hover">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <StatusBadge label={`${r.priority} priority`} tone={r.priority === 'High' ? 'danger' : r.priority === 'Medium' ? 'warning' : 'neutral'} />
                    <span className="font-mono text-[10px] text-muted-foreground">{r.sku}</span>
                  </div>
                  <h3 className="text-sm font-semibold">{r.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.reason}</p>
                  <p className="mt-2 text-xs font-medium text-success">{r.impactValue ? `Protects ~${formatPaise(r.impactValue)} of sales. ` : ''}{r.impact}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="line-clamp-1 text-[11px] text-muted-foreground">{r.action}</span>
                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => navigate(`/inventory?q=${encodeURIComponent(r.sku)}`)}>
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
              <StatusBadge label={agentStatus === 'active' ? 'Active' : 'Paused'} tone={agentStatus === 'active' ? 'success' : 'danger'} pulse={agentStatus === 'active'} />
            </div>
            {events.error ? <PanelError message={events.error.message} onRetry={events.reload} /> : <ActivityTimeline events={events.data?.items ?? []} />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
