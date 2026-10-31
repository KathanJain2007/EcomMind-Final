import { useMemo, useRef, useState } from 'react'
import {
  BrainCircuit, Check, Loader2, Play, TrendingUp, BarChart3, ShieldAlert, Truck, MapPin, AlertTriangle,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '@/store/AppContext'
import { COMPETITOR_PRICES, LOGISTICS_QUOTES, PRODUCTS, RETURNS_BY_PINCODE, forecastSeries } from '@/data/demo'
import { cx, formatINR, timeAgo } from '@/lib/format'
import { ChartCard, EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const tooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12, color: 'hsl(var(--popover-foreground))' }

const ANALYSIS_STEPS = [
  'Validating business data',
  'Discovering service agents on the network',
  'Running demand forecasting models',
  'Checking competitor market prices',
  'Scoring return & RTO risk by pincode',
  'Comparing logistics options',
  'Finalising recommendations',
]

export default function Insights() {
  const { demoLoaded, loadDemoBusiness, analysisRunAt, setAnalysisRun } = useApp()
  const [sku, setSku] = useState('EAR-001')
  const [running, setRunning] = useState(false)
  const [stepIdx, setStepIdx] = useState(-1)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const product = PRODUCTS.find((p) => p.sku === sku)!
  const done = !!analysisRunAt && !running

  const runAnalysis = () => {
    setRunning(true)
    setStepIdx(0)
    ANALYSIS_STEPS.forEach((_, i) => {
      timers.current.push(setTimeout(() => setStepIdx(i), i * 650))
    })
    timers.current.push(setTimeout(() => {
      setRunning(false)
      setAnalysisRun()
    }, ANALYSIS_STEPS.length * 650 + 400))
  }

  const fc = useMemo(() => forecastSeries(sku, 14).map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) })), [sku])
  const forecast7 = Math.round(product.avgDailySales * 0.75 * 7)
  const forecast30 = Math.round(product.avgDailySales * 0.75 * 30)
  const recommendedStock = forecast30 + Math.ceil(product.avgDailySales * 5)
  const competitors = COMPETITOR_PRICES[sku] ?? []
  const minCompetitor = competitors.length ? Math.min(...competitors.map((c) => c.price)) : product.price
  const suggestedPrice = Math.max(product.cost * 1.15, Math.round(minCompetitor * 1.02) - 1)
  const marginNow = ((product.price - product.cost) / product.price) * 100
  const marginNew = ((suggestedPrice - product.cost) / suggestedPrice) * 100

  const overallReturn = useMemo(() => {
    const orders = RETURNS_BY_PINCODE.reduce((s, r) => s + r.orders, 0)
    const returns = RETURNS_BY_PINCODE.reduce((s, r) => s + r.returns, 0)
    return orders ? (returns / orders) * 100 : 0
  }, [])

  const productRisk = useMemo(() => PRODUCTS.map((p) => ({ name: p.name, rate: p.returnRate * 100 })), [])
  const highRisk = RETURNS_BY_PINCODE.filter((r) => r.returnRate >= 0.15)

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="EcomMind Intelligence" subtitle="Demand, pricing, return-risk and logistics intelligence." />
        <EmptyState title="No business data to analyse" body="Load the demo business and EcomMind will forecast demand, check market prices, score return risk and pick couriers." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="EcomMind Intelligence"
        subtitle="AI-powered analysis of demand, pricing, returns and logistics."
        actions={
          <Select value={sku} onValueChange={setSku}>
            <SelectTrigger className="w-52" aria-label="Select product for analysis"><SelectValue /></SelectTrigger>
            <SelectContent>{PRODUCTS.map((p) => <SelectItem key={p.sku} value={p.sku}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        }
      />

      {/* Run analysis */}
      <Card className="card-surface mb-6 overflow-hidden">
        <div className="h-0.5 w-full bg-gradient-to-r from-brand-soft via-brand to-[#5f8bff]" aria-hidden />
        <CardContent className="p-5">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-4">
              <div className="btn-glow flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
                <BrainCircuit className="h-5.5 w-5.5 text-white" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-semibold">Full business analysis</h2>
                <p className="text-xs text-muted-foreground">
                  {done ? <>Last run {timeAgo(analysisRunAt)} · 7 agents coordinated</> : 'EcomMind coordinates 4 specialist agents across your data.'}
                </p>
              </div>
            </div>
            <Button className="btn-glow border-0 text-white" onClick={runAnalysis} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              {running ? 'Analysing…' : done ? 'Run again' : 'Run AI Business Analysis'}
            </Button>
          </div>

          {running && (
            <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ANALYSIS_STEPS.map((s, i) => (
                <li key={s} className={cx(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
                  i < stepIdx ? 'border-success/30 bg-success/8 text-success' : i === stepIdx ? 'border-brand/40 bg-brand/10 text-brand-soft' : 'border-border text-muted-foreground',
                )}>
                  {i < stepIdx ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : i === stepIdx ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" aria-hidden />}
                  {s}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {!done && !running && (
        <EmptyState
          title="Analysis not run yet"
          body="Run the AI business analysis to see demand forecasts, price intelligence, return-risk scoring and logistics recommendations for your catalogue."
        />
      )}

      {done && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
          {/* Demand forecasting */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <ChartCard title="Demand forecasting" subtitle={`Historical vs predicted · ${product.name}`} className="xl:col-span-2"
              action={<StatusBadge label="87% confidence" tone="info" />}>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fc} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ins-fc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7965F2" stopOpacity={0.3} /><stop offset="100%" stopColor="#7965F2" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27334D" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={26} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="actual" name="Actual units" stroke="#9A8BFF" strokeWidth={2} fill="url(#ins-fc)" />
                    <Area type="monotone" dataKey="predicted" name="Predicted" stroke="#22C55E" strokeWidth={2} strokeDasharray="5 4" fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <Card className="card-surface">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-brand-soft" aria-hidden /> Forecast summary</div>
                {[
                  { l: 'Predicted 7-day demand', v: `${forecast7} units` },
                  { l: 'Predicted 30-day demand', v: `${forecast30} units` },
                  { l: 'Forecast confidence', v: '87%' },
                  { l: 'Recommended stock', v: `${recommendedStock} units`, accent: true },
                ].map((r) => (
                  <div key={r.l} className="flex items-center justify-between border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                    <span className="text-muted-foreground">{r.l}</span>
                    <span className={cx('tabular font-semibold', r.accent && 'text-success')}>{r.v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Price + returns */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Market price intelligence" subtitle={`${product.name} vs competitor channels`} action={<BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />}>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between rounded-lg border border-brand/35 bg-brand/10 px-3.5 py-2.5">
                  <span className="text-sm font-medium text-brand-soft">Your price</span>
                  <span className="tabular text-sm font-bold">{formatINR(product.price)}</span>
                </div>
                {competitors.map((c) => (
                  <div key={c.channel} className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5">
                    <span className="text-sm text-muted-foreground">{c.channel}</span>
                    <span className={cx('tabular text-sm font-medium', c.price < product.price && 'text-success')}>{formatINR(c.price)}</span>
                  </div>
                ))}
                <div className="mt-3 rounded-lg border border-success/30 bg-success/8 p-3.5">
                  <p className="text-sm font-semibold text-success">Suggested price: {formatINR(suggestedPrice)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Stay ~2% above the cheapest channel while protecting margin — {marginNow.toFixed(1)}% → {marginNew.toFixed(1)}% gross margin.
                  </p>
                </div>
              </div>
            </ChartCard>

            <ChartCard title="Return risk intelligence" subtitle={`Overall return rate ${overallReturn.toFixed(1)}%`} action={<ShieldAlert className="h-4 w-4 text-warning" aria-hidden />}>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productRisk} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27334D" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={104} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}%`, 'Return rate']} labelFormatter={() => ''} />
                    <Bar dataKey="rate" radius={[0, 6, 6, 0]} barSize={13}>
                      {productRisk.map((d) => <Cell key={d.name} fill={d.rate >= 15 ? '#EF4444' : d.rate >= 8 ? '#F59E0B' : '#22C55E'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-2">
                {highRisk.map((r) => (
                  <div key={r.pincode + r.sku} className="flex items-center gap-2.5 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />
                    <p className="text-xs">
                      <span className="font-semibold text-danger">{r.city} {r.pincode}</span>
                      <span className="text-muted-foreground"> — {PRODUCTS.find((p) => p.sku === r.sku)?.name} returns at {(r.returnRate * 100).toFixed(0)}% ({r.returns}/{r.orders} orders)</span>
                    </p>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">AI recommendation:</span> require prepaid or confirmation calls for Phone Case orders to 110001, and tighten packaging QC for Delhi NCR.
                </p>
              </div>
            </ChartCard>
          </div>

          {/* Logistics */}
          <ChartCard title="Logistics intelligence" subtitle="Courier comparison for your average 0.5 kg shipment" action={<Truck className="h-4 w-4 text-muted-foreground" aria-hidden />}>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
              {LOGISTICS_QUOTES.map((q) => {
                const recommended = q.courier === 'BlueDart'
                return (
                  <div key={q.id} className={cx('rounded-xl border p-3.5', recommended ? 'border-success/40 bg-success/8' : 'border-border bg-secondary/40')}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{q.courier}</p>
                      {recommended && <StatusBadge label="Recommended" tone="success" />}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{q.service}</p>
                    <div className="mt-3 space-y-1 text-xs">
                      <p className="flex justify-between"><span className="text-muted-foreground">Cost / 500g</span><span className="tabular font-medium">{formatINR(q.costPer500g)}</span></p>
                      <p className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span className="font-medium">{q.etaDays} day{q.etaDays > 1 ? 's' : ''}</span></p>
                      <p className="flex justify-between"><span className="text-muted-foreground">Rating</span><span className="font-medium">★ {q.rating}</span></p>
                      <p className="flex justify-between"><span className="text-muted-foreground">COD</span><span className="font-medium">{q.cod ? 'Yes' : 'No'}</span></p>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-brand-soft" aria-hidden />
              BlueDart Surface Express balances cost and speed for your metro-heavy order mix — est. {formatINR(42)} per shipment, 2-day delivery.
            </p>
          </ChartCard>
        </motion.div>
      )}
    </div>
  )
}
