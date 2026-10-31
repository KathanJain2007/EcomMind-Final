import { useState } from 'react'
import { BrainCircuit, Loader2, RefreshCw, TrendingUp, BarChart3, ShieldAlert, Truck, MapPin, AlertTriangle } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '@/store/AppContext'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import type { ApiProduct } from '@/lib/api'
import { cx, formatPaise, shortDate } from '@/lib/format'
import { ChartCard, ChartEmpty, ChartSkeleton, EmptyState, PageHeader, PanelError, StatusBadge } from '@/components/common'
import { tooltipStyle } from '@/lib/chartTheme'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Forecast {
  series: { date: string; actual?: number; predicted?: number }[]
  demand7: number; demand30: number; recommendedStock: number; reorderQty: number; confidencePct: number | null; method: string
}
interface Pricing {
  competitors: { channel: string; price: number }[]; suggestedPrice: number | null; lowestCompetitor?: number
  marginNowPct?: number | null; marginAtSuggestedPct?: number | null; marginFloor: number; limitedBy?: string | null; reason?: string
}
interface Returns {
  overallReturnRate: number | null
  byProduct: { sku: string; name: string; returnRate: number }[]
  highRisk: { pincode: string; city: string; sku: string; productName?: string; orders: number; returns: number; returnRate: number }[]
}
interface Logistics { quotes: { id: string; courier: string; service: string; costPer500g: number; etaDays: number; rating: number; cod: boolean }[]; recommended: string | null; method: string }

export default function Insights() {
  const { demoLoaded, loadDemoBusiness } = useApp()
  const store = useDataStore()
  const products = useApiQuery<{ products: ApiProduct[] }>('/api/products', ['products'])
  const list = products.data?.products ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const sku = picked ?? list[0]?.sku ?? null
  const product = list.find((p) => p.sku === sku)

  const intel = useApiQuery<{ forecast: Forecast; pricing: Pricing }>(sku ? `/api/products/${encodeURIComponent(sku)}/intelligence` : null, ['analytics', 'products', 'mandate'])
  const returns = useApiQuery<Returns>('/api/analytics/returns', ['analytics', 'products'])
  const logistics = useApiQuery<Logistics>('/api/analytics/logistics', ['analytics'])
  const refreshing = intel.fetching || returns.fetching || logistics.fetching

  if (!demoLoaded && products.data && list.length === 0) {
    return (
      <>
        <PageHeader title="EcomMind Intelligence" subtitle="Demand, pricing, return-risk and logistics intelligence." />
        <EmptyState title="No business data to analyse" body="Load the demo business or add products, and EcomMind will forecast demand, check market prices, score return risk and rank couriers." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  const f = intel.data?.forecast
  const pr = intel.data?.pricing
  const fc = (f?.series ?? []).map((d) => ({ ...d, label: shortDate(d.date) }))
  const risk = (returns.data?.byProduct ?? []).map((r) => ({ name: r.name, rate: r.returnRate * 100 }))
  const recommended = logistics.data?.quotes.find((q) => q.id === logistics.data?.recommended)

  return (
    <div>
      <PageHeader
        title="EcomMind Intelligence"
        subtitle="Demand, pricing, return-risk and logistics analysis computed from your stored data."
        actions={
          <Select value={sku ?? ''} onValueChange={setPicked}>
            <SelectTrigger className="w-52" aria-label="Select product for analysis"><SelectValue placeholder="Select a product" /></SelectTrigger>
            <SelectContent>{list.map((p) => <SelectItem key={p.sku} value={p.sku}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        }
      />

      <Card className="card-surface mb-6 overflow-hidden">
        <div className="h-0.5 w-full bg-gradient-to-r from-brand-soft via-brand to-[#5f8bff]" aria-hidden />
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
          <div className="flex flex-1 items-center gap-4">
            <div className="btn-glow flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
              <BrainCircuit className="h-5.5 w-5.5 text-white" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold">Business analysis</h2>
              <p className="text-xs text-muted-foreground">{f?.method ?? 'Forecasts, pricing and risk recalculate from your latest sales, stock and mandate.'}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => store.invalidate('analytics')} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {refreshing ? 'Refreshing…' : 'Refresh analysis'}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ChartCard title="Demand forecasting" subtitle={`Last 14 days vs next 7 days · ${product?.name ?? ''}`} className="xl:col-span-2"
            action={f?.confidencePct != null ? <StatusBadge label={`${f.confidencePct}% backtest accuracy`} tone="info" /> : undefined}>
            <div className="h-60">
              {intel.loading ? <ChartSkeleton /> : intel.error ? <PanelError message={intel.error.message} onRetry={intel.reload} />
                : fc.length === 0 ? <ChartEmpty text="No sales history for this product yet." /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fc} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ins-fc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7965F2" stopOpacity={0.3} /><stop offset="100%" stopColor="#7965F2" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27334D" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={26} />
                    <YAxis tickLine={false} axisLine={false} label={{ value: 'Units / day', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11, dx: 14 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="actual" name="Actual units" stroke="#9A8BFF" strokeWidth={2} fill="url(#ins-fc)" />
                    <Area type="monotone" dataKey="predicted" name="Forecast units" stroke="#22C55E" strokeWidth={2} strokeDasharray="5 4" fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>

          <Card className="card-surface">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-brand-soft" aria-hidden /> Forecast summary</div>
              {[
                { l: 'Predicted 7-day demand', v: f ? `${f.demand7} units` : '—' },
                { l: 'Predicted 30-day demand', v: f ? `${f.demand30} units` : '—' },
                { l: 'Backtest accuracy', v: f?.confidencePct != null ? `${f.confidencePct}%` : 'Not enough history' },
                { l: 'Recommended stock', v: f ? `${f.recommendedStock} units` : '—', accent: true },
              ].map((r) => (
                <div key={r.l} className="flex items-center justify-between border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                  <span className="text-muted-foreground">{r.l}</span>
                  <span className={cx('tabular font-semibold', r.accent && 'text-success')}>{r.v}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Market price intelligence" subtitle={`${product?.name ?? ''} vs competitor channels`} action={<BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />}>
            {intel.loading ? <div className="h-40"><ChartSkeleton /></div> : !pr ? null : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between rounded-lg border border-brand/35 bg-brand/10 px-3.5 py-2.5">
                  <span className="text-sm font-medium text-brand-soft">Your price</span>
                  <span className="tabular text-sm font-bold">{product ? formatPaise(product.price) : '—'}</span>
                </div>
                {pr.competitors.map((c) => (
                  <div key={c.channel} className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5">
                    <span className="text-sm text-muted-foreground">{c.channel}</span>
                    <span className={cx('tabular text-sm font-medium', product && c.price < product.price && 'text-success')}>{formatPaise(c.price)}</span>
                  </div>
                ))}
                {pr.suggestedPrice != null ? (
                  <div className="mt-3 rounded-lg border border-success/30 bg-success/8 p-3.5">
                    <p className="text-sm font-semibold text-success">Suggested price: {formatPaise(pr.suggestedPrice)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      About 2% above the cheapest channel, kept above your {formatPaise(pr.marginFloor)} minimum-margin floor and within your repricing limit
                      {pr.limitedBy ? ` (set by your ${pr.limitedBy})` : ''}. Gross margin {pr.marginNowPct ?? '—'}% → {pr.marginAtSuggestedPct ?? '—'}%.
                    </p>
                  </div>
                ) : <p className="text-xs text-muted-foreground">{pr.reason}</p>}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Return risk intelligence" subtitle={returns.data?.overallReturnRate != null ? `Overall return rate ${(returns.data.overallReturnRate * 100).toFixed(1)}%` : 'Return rate by product'} action={<ShieldAlert className="h-4 w-4 text-warning" aria-hidden />}>
            <div className="h-36">
              {returns.loading ? <ChartSkeleton /> : returns.error ? <PanelError message={returns.error.message} onRetry={returns.reload} />
                : risk.length === 0 ? <ChartEmpty text="No return data yet." /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={risk} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27334D" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={104} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}%`, 'Return rate']} labelFormatter={() => ''} />
                    <Bar dataKey="rate" radius={[0, 6, 6, 0]} barSize={13}>
                      {risk.map((d) => <Cell key={d.name} fill={d.rate >= 15 ? '#EF4444' : d.rate >= 8 ? '#F59E0B' : '#22C55E'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {(returns.data?.highRisk ?? []).map((r) => (
                <div key={r.pincode + r.sku} className="flex items-center gap-2.5 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />
                  <p className="text-xs">
                    <span className="font-semibold text-danger">{r.city} {r.pincode}</span>
                    <span className="text-muted-foreground"> — {r.productName} returns at {(r.returnRate * 100).toFixed(0)}% ({r.returns}/{r.orders} orders)</span>
                  </p>
                </div>
              ))}
              {returns.data && returns.data.highRisk.length > 0 && (
                <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Recommendation:</span> require prepaid or confirmation calls for orders to these pincodes.</p>
              )}
            </div>
          </ChartCard>
        </div>

        <ChartCard title="Logistics intelligence" subtitle="Courier comparison for a 0.5 kg shipment" action={<Truck className="h-4 w-4 text-muted-foreground" aria-hidden />}>
          {logistics.loading ? <div className="h-32"><ChartSkeleton /></div> : logistics.error ? <PanelError message={logistics.error.message} onRetry={logistics.reload} /> : (
            <>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
                {(logistics.data?.quotes ?? []).map((q) => {
                  const isRec = q.id === logistics.data?.recommended
                  return (
                    <div key={q.id} className={cx('rounded-xl border p-3.5', isRec ? 'border-success/40 bg-success/8' : 'border-border bg-secondary/40')}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{q.courier}</p>
                        {isRec && <StatusBadge label="Recommended" tone="success" />}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{q.service}</p>
                      <div className="mt-3 space-y-1 text-xs">
                        <p className="flex justify-between"><span className="text-muted-foreground">Cost / 500g</span><span className="tabular font-medium">{formatPaise(q.costPer500g)}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span className="font-medium">{q.etaDays} day{q.etaDays > 1 ? 's' : ''}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Rating</span><span className="font-medium">★ {q.rating}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">COD</span><span className="font-medium">{q.cod ? 'Yes' : 'No'}</span></p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {recommended && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-brand-soft" aria-hidden />
                  {recommended.courier} {recommended.service} ranks best on cost and speed — {formatPaise(recommended.costPer500g)} per 0.5 kg, {recommended.etaDays}-day delivery. {logistics.data?.method}
                </p>
              )}
            </>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
