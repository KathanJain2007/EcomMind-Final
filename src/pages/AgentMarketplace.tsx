import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Bot, Check, Loader2, Network, Phone, Receipt, RotateCcw, Star, X } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import { api, ApiError, newIdempotencyKey, type AgentCallResponse, type ApiProduct, type ApiServiceAgent } from '@/lib/api'
import { cx, formatPaise, formatTime } from '@/lib/format'
import { DynIcon, EmptyState, PageHeader, PanelError, StatusBadge } from '@/components/common'
import { CountUp } from '@/components/CountUp'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type CallPhase = 'configure' | 'processing' | 'done' | 'failed'
const money = (p: number) => formatPaise(p, { decimals: p % 100 ? 2 : 0 })

export default function AgentMarketplace() {
  const { demoLoaded, loadDemoBusiness } = useApp()
  const store = useDataStore()
  const agentsQ = useApiQuery<{ agents: ApiServiceAgent[] }>('/api/service-agents', ['agents'])
  const wallet = useApiQuery<{ balance: number }>('/api/wallet', ['wallet'])
  const suppliers = useApiQuery<{ suppliers: { id: string }[] }>('/api/suppliers', ['suppliers'])
  const products = useApiQuery<{ products: ApiProduct[] }>('/api/products', ['products'])
  const [calling, setCalling] = useState<ApiServiceAgent | null>(null)
  const [detail, setDetail] = useState<ApiServiceAgent | null>(null)

  if (!demoLoaded && products.data && products.data.products.length === 0) {
    return (
      <>
        <PageHeader title="Agent Marketplace" subtitle="Discover specialized agents and purchase intelligence on demand." />
        <EmptyState title="Add products first" body="Service agents work on your catalogue. Load the demo business or add a product to start calling agents." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  const agents = agentsQ.data?.agents ?? []
  const online = agents.filter((a) => a.availability === 'Online').length
  const discovered = online + (suppliers.data?.suppliers.length ?? 0)

  /** Apply the authoritative counter from a successful call straight away. */
  const onSuccess = (res: AgentCallResponse) => {
    store.setData('/api/service-agents', { agents: agents.map((a) => (a.id === res.agent.id ? res.agent : a)) })
    store.setData('/api/wallet', { ...(wallet.data ?? {}), balance: res.wallet.balance })
    store.invalidate('wallet', 'activity', 'analytics', 'agents')
  }

  return (
    <div>
      <PageHeader title="Agent Marketplace" subtitle="Discover specialized agents and purchase intelligence on demand." />

      <Card className="card-surface mb-6 overflow-hidden">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand-soft">
            <Network className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{discovered} agents discovered on the network</p>
            <p className="text-xs text-muted-foreground">{online} service agents online · {suppliers.data?.suppliers.length ?? 0} supplier agents · calls are checked against your mandate</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Wallet balance <span className="tabular font-semibold text-foreground">{wallet.data ? <CountUp value={wallet.data.balance / 100} format="inr" /> : '—'}</span></span>
          </div>
        </CardContent>
      </Card>

      {agentsQ.error && <div className="mb-4"><PanelError message={agentsQ.error.message} onRetry={agentsQ.reload} /></div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {agentsQ.loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        {agents.map((a) => (
          <Card key={a.id} className="card-surface card-hover flex flex-col">
            <CardContent className="flex flex-1 flex-col p-5">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/12 text-brand-soft">
                  <DynIcon name={a.icon} className="h-5 w-5" />
                </div>
                <StatusBadge label={a.availability} tone={a.availability === 'Online' ? 'success' : 'warning'} pulse={a.availability === 'Online'} />
              </div>
              <h3 className="text-[15px] font-semibold">{a.name}</h3>
              <p className="font-mono text-[10px] text-muted-foreground">{a.id}</p>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">{a.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.capabilities.map((c) => <span key={c} className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{c}</span>)}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span className="rounded-md bg-brand/10 px-1.5 py-0.5 font-medium text-brand-soft">{a.type}</span>
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-warning text-warning" aria-hidden /> {a.rating} ·{' '}
                  <span className="tabular font-medium text-foreground" aria-live="polite"><CountUp value={a.callsServed} durationMs={1200} /></span> calls
                </span>
                <span className="tabular font-semibold text-foreground">{money(a.pricePerCall)} <span className="font-normal text-muted-foreground">{a.unit}</span></span>
              </div>
              <div className="mt-3.5 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setDetail(a)}>View details</Button>
                <Button size="sm" className="btn-glow flex-1 border-0 text-white" onClick={() => setCalling(a)} disabled={a.availability !== 'Online'}>
                  <Phone className="h-3.5 w-3.5" aria-hidden /> Call Agent
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CallAgentModal agent={calling} products={products.data?.products ?? []} balance={wallet.data?.balance} onClose={() => setCalling(null)} onSuccess={onSuccess} />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent aria-describedby={undefined}>
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/12 text-brand-soft"><DynIcon name={detail.icon} className="h-4.5 w-4.5" /></span>
                  {detail.name}
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{detail.description}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border p-3"><p className="text-[10px] text-muted-foreground">Agent ID</p><p className="font-mono text-xs">{detail.id}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-[10px] text-muted-foreground">Calls served</p><p className="tabular font-medium">{detail.callsServed.toLocaleString('en-IN')}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-[10px] text-muted-foreground">Cost per call</p><p className="font-medium">{money(detail.pricePerCall)} {detail.unit}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-[10px] text-muted-foreground">Latency</p><p className="font-medium">{detail.latency}</p></div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Capabilities</p>
                <div className="flex flex-wrap gap-1.5">{detail.capabilities.map((c) => <span key={c} className="rounded-md bg-secondary px-2 py-1 text-xs">{c}</span>)}</div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>
                <Button className="btn-glow border-0 text-white" onClick={() => { setCalling(detail); setDetail(null) }}>
                  <Phone className="h-3.5 w-3.5" aria-hidden /> Call Agent
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function CallAgentModal({ agent, products, balance, onClose, onSuccess }: {
  agent: ApiServiceAgent | null
  products: ApiProduct[]
  balance: number | undefined
  onClose: () => void
  onSuccess: (r: AgentCallResponse) => void
}) {
  const [sku, setSku] = useState<string>('')
  const [phase, setPhase] = useState<CallPhase>('configure')
  const [res, setRes] = useState<AgentCallResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  // One key per logical call. A retry after a network error reuses it, so the
  // server can't charge or count twice; "Call again" starts a new one.
  const key = useRef<string>(newIdempotencyKey('call'))
  const inFlight = useRef(false)

  useEffect(() => {
    if (agent) { setPhase('configure'); setRes(null); setError(null); key.current = newIdempotencyKey('call') }
  }, [agent])
  useEffect(() => { if (!sku && products[0]) setSku(products[0].sku) }, [products, sku])

  if (!agent) return <Dialog open={false} onOpenChange={onClose} />
  const product = products.find((p) => p.sku === sku)

  const close = () => { if (!inFlight.current) onClose() }

  const confirm = async () => {
    if (inFlight.current || !sku) return
    inFlight.current = true
    setPhase('processing')
    setError(null)
    try {
      const r = await api<AgentCallResponse>(`/api/service-agents/${agent.id}/calls`, { body: { sku }, idempotencyKey: key.current })
      setRes(r)
      setPhase('done')
      onSuccess(r)
      toast.success(`${agent.name} responded`, { description: r.replayed ? 'Already completed. You weren’t charged again.' : `${money(r.call.cost)} debited from wallet · ${r.agent.callsServed.toLocaleString('en-IN')} calls served.` })
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'unknown', 'Something went wrong.')
      setError(err)
      setPhase('failed')
      // Only a network failure keeps the key (the request may have landed); a
      // definite failure means the next attempt is a new logical call.
      if (!err.isNetwork) key.current = newIdempotencyKey('call')
      toast.error('Agent call not completed', { description: err.message })
    } finally {
      inFlight.current = false
    }
  }

  const callAgain = () => { key.current = newIdempotencyKey('call'); setRes(null); setPhase('configure') }

  return (
    <Dialog open={!!agent} onOpenChange={(o) => !o && close()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg" onInteractOutside={(e) => phase === 'processing' && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/12 text-brand-soft"><Bot className="h-4.5 w-4.5" aria-hidden /></span>
            Call {agent.name}
          </DialogTitle>
        </DialogHeader>

        {(phase === 'configure' || phase === 'failed') && (
          <>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="call-product">Product</label>
                <Select value={sku} onValueChange={setSku}>
                  <SelectTrigger id="call-product"><SelectValue placeholder="Select a product" /></SelectTrigger>
                  <SelectContent>{products.map((p) => <SelectItem key={p.sku} value={p.sku}>{p.name} · {p.sku}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3.5 py-3 text-sm">
                <span className="text-muted-foreground">Service price</span>
                <span className="tabular font-semibold">{money(agent.pricePerCall)} <span className="text-xs font-normal text-muted-foreground">{agent.unit}</span></span>
              </div>
              {balance !== undefined && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Wallet balance after call</span>
                  <span className={cx('tabular font-medium', balance - agent.pricePerCall < 0 ? 'text-danger' : 'text-foreground')}>{money(balance - agent.pricePerCall)}</span>
                </div>
              )}
              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{error.message}{error.isNetwork ? ' Retrying is safe: you won’t be charged twice.' : ''}</span>
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={close}><X className="h-4 w-4" aria-hidden /> Cancel</Button>
              <Button className="btn-glow border-0 text-white" onClick={confirm} disabled={!sku}>
                {phase === 'failed' ? <><RotateCcw className="h-4 w-4" aria-hidden /> Try again</> : <>Confirm & pay {money(agent.pricePerCall)}</>}
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === 'processing' && (
          <div className="flex flex-col items-center py-10 text-center" role="status">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-brand-soft" aria-hidden />
            <p className="text-sm font-medium">Contacting {agent.name}…</p>
            <p className="mt-1 text-xs text-muted-foreground">{product?.name} · agent {agent.id} · {agent.latency} avg</p>
          </div>
        )}

        {phase === 'done' && res && (
          <>
            <AgentResponse res={res} />
            {res.receipt && (
              <div className="mt-4 rounded-xl border border-success/30 bg-success/8 p-3.5">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-success">
                  <Receipt className="h-3.5 w-3.5" aria-hidden /> Transaction receipt (simulated payment, signed)
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">Call</dt><dd className="text-right font-mono">{res.call.id}</dd>
                  <dt className="text-muted-foreground">Transaction</dt><dd className="text-right font-mono">{res.receipt.txnId}</dd>
                  <dt className="text-muted-foreground">Amount</dt><dd className="tabular text-right font-medium">−{money(res.receipt.amount)}</dd>
                  <dt className="text-muted-foreground">Signature</dt><dd className="truncate text-right font-mono" title={res.receipt.signature}>{res.receipt.signature.slice(0, 26)}…</dd>
                  <dt className="text-muted-foreground">Time</dt><dd className="tabular text-right">{formatTime(res.receipt.timestamp)}</dd>
                  <dt className="text-muted-foreground">Calls served</dt><dd className="tabular text-right">{res.agent.callsServed.toLocaleString('en-IN')}</dd>
                </dl>
              </div>
            )}
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={callAgain}>Call again</Button>
              <Button className="btn-glow border-0 text-white" onClick={close}><Check className="h-4 w-4" aria-hidden /> Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AgentResponse({ res }: { res: AgentCallResponse }) {
  const r = (res.result ?? {}) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const box = 'rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5 text-sm flex items-center justify-between'
  const title = (t: string) => <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent response — {t}</p>

  if (r.kind === 'demand_forecast') {
    return (
      <div className="space-y-2">
        {title('demand forecast')}
        <div className={box}><span className="text-muted-foreground">Next 7 days</span><span className="tabular font-semibold">{r.demand7} units</span></div>
        <div className={box}><span className="text-muted-foreground">Next 30 days</span><span className="tabular font-semibold">{r.demand30} units</span></div>
        <div className={box}><span className="text-muted-foreground">Recommended reorder</span><span className="tabular font-semibold text-success">{r.reorderQty} units</span></div>
        <div className={box}><span className="text-muted-foreground">Backtest accuracy</span><span className="font-semibold text-brand-soft">{r.confidencePct != null ? `${r.confidencePct}%` : 'n/a'}</span></div>
      </div>
    )
  }
  if (r.kind === 'market_price') {
    const comps = (r.competitors ?? []) as { channel: string; price: number }[]
    return (
      <div className="space-y-2">
        {title('market prices')}
        {comps.map((c) => (
          <div key={c.channel} className={box}><span className="text-muted-foreground">{c.channel}</span><span className={cx('tabular font-medium', c.price < r.currentPrice && 'text-success')}>{money(c.price)}</span></div>
        ))}
        {r.suggestedPrice != null
          ? <div className={box}><span className="text-muted-foreground">Suggested price (within your mandate)</span><span className="tabular font-semibold text-success">{money(r.suggestedPrice)}</span></div>
          : <p className="text-xs text-muted-foreground">{r.reason}</p>}
      </div>
    )
  }
  if (r.kind === 'return_risk') {
    const rows = (r.pincodes ?? []) as { pincode: string; city: string; returnRate: number }[]
    return (
      <div className="space-y-2">
        {title('return risk')}
        <div className={box}><span className="text-muted-foreground">Product return rate</span><span className={cx('tabular font-semibold', r.productReturnRate >= r.threshold ? 'text-danger' : 'text-success')}>{(r.productReturnRate * 100).toFixed(0)}%</span></div>
        {rows.map((p) => (
          <div key={p.pincode} className={box}>
            <span className="text-muted-foreground">{p.city} · {p.pincode}</span>
            <span className={cx('tabular font-medium', p.returnRate >= r.threshold ? 'text-danger' : 'text-foreground')}>{(p.returnRate * 100).toFixed(0)}% RTO</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-muted-foreground">No regional return data for this product.</p>}
      </div>
    )
  }
  const quotes = (r.quotes ?? []) as { id: string; courier: string; etaDays: number; costPer500g: number }[]
  return (
    <div className="space-y-2">
      {title('courier quotes')}
      {quotes.map((q) => (
        <div key={q.id} className={box}>
          <span className="text-muted-foreground">{q.courier} · {q.etaDays}d</span>
          <span className={cx('tabular font-medium', q.id === r.recommended && 'text-success')}>{money(q.costPer500g)}/500g{q.id === r.recommended ? ' · best' : ''}</span>
        </div>
      ))}
    </div>
  )
}
