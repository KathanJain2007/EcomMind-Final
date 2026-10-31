import { useMemo, useState } from 'react'
import { Bot, Check, Loader2, Network, Phone, Receipt, Star, X } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { COMPETITOR_PRICES, LOGISTICS_QUOTES, PRODUCTS, RETURNS_BY_PINCODE, SERVICE_AGENTS, type ServiceAgent } from '@/data/demo'
import { cx, formatINR, formatNum, formatTime } from '@/lib/format'
import { DynIcon, EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AgentCallReceipt } from '@/store/AppContext'

type CallPhase = 'configure' | 'processing' | 'done'

export default function AgentMarketplace() {
  const { demoLoaded, loadDemoBusiness, agentsDiscovered, walletBalance } = useApp()
  const [calling, setCalling] = useState<ServiceAgent | null>(null)
  const [detail, setDetail] = useState<ServiceAgent | null>(null)

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Agent Marketplace" subtitle="Discover specialized agents and purchase intelligence on demand." />
        <EmptyState title="Marketplace is warming up" body="Load the demo business to discover 4 service agents and 3 supplier agents on the network." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  return (
    <div>
      <PageHeader title="Agent Marketplace" subtitle="Discover specialized agents and purchase intelligence on demand." />

      {/* Discovery banner */}
      <Card className="card-surface mb-6 overflow-hidden">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand-soft">
            <Network className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{agentsDiscovered} agents discovered on the network</p>
            <p className="text-xs text-muted-foreground">4 service agents · 3 supplier agents · all verified within your mandate limits</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Wallet balance <span className="tabular font-semibold text-foreground">{formatINR(walletBalance)}</span></span>
            <StatusBadge label="Discovery: live" tone="success" pulse />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AgentGrid onCall={setCalling} onDetail={setDetail} />
      </div>

      <CallAgentModal agent={calling} onClose={() => setCalling(null)} />

      {/* Details dialog */}
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
                <div className="rounded-lg border border-border p-3"><p className="text-[10px] text-muted-foreground">Type</p><p className="font-medium">{detail.type}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-[10px] text-muted-foreground">Cost per call</p><p className="font-medium">{formatINR(detail.pricePerCall)} {detail.unit}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-[10px] text-muted-foreground">Latency</p><p className="font-medium">{detail.latency}</p></div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Capabilities</p>
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

function AgentGrid({ onCall, onDetail }: { onCall: (a: ServiceAgent) => void; onDetail: (a: ServiceAgent) => void }) {
  return (
    <>
      {SERVICE_AGENTS.map((a) => (
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
              <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-warning text-warning" aria-hidden /> {a.rating} · {formatNum(a.callsServed)} calls</span>
              <span className="tabular font-semibold text-foreground">{formatINR(a.pricePerCall)} <span className="font-normal text-muted-foreground">{a.unit}</span></span>
            </div>
            <div className="mt-3.5 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => onDetail(a)}>View details</Button>
              <Button size="sm" className="btn-glow flex-1 border-0 text-white" onClick={() => onCall(a)}>
                <Phone className="h-3.5 w-3.5" aria-hidden /> Call Agent
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ */

function CallAgentModal({ agent, onClose }: { agent: ServiceAgent | null; onClose: () => void }) {
  const { callAgent, walletBalance } = useApp()
  const [sku, setSku] = useState('EAR-001')
  const [phase, setPhase] = useState<CallPhase>('configure')
  const [receipt, setReceipt] = useState<AgentCallReceipt | null>(null)
  const [error, setError] = useState<string | null>(null)

  const product = useMemo(() => PRODUCTS.find((p) => p.sku === sku)!, [sku])

  const close = () => {
    setPhase('configure')
    setReceipt(null)
    setError(null)
    onClose()
  }

  if (!agent) return <Dialog open={false} onOpenChange={onClose} />

  const confirm = () => {
    setPhase('processing')
    setError(null)
    setTimeout(() => {
      const res = callAgent(agent, sku, product.name)
      if ('error' in res) {
        setError(res.error)
        setPhase('configure')
        toast.error('Agent call blocked', { description: res.error })
      } else {
        setReceipt(res)
        setPhase('done')
        toast.success(`${agent.name} responded`, { description: `${formatINR(res.amount)} debited from wallet.` })
      }
    }, 1600)
  }

  return (
    <Dialog open={!!agent} onOpenChange={(o) => !o && close()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/12 text-brand-soft"><Bot className="h-4.5 w-4.5" aria-hidden /></span>
            Call {agent.name}
          </DialogTitle>
        </DialogHeader>

        {phase === 'configure' && (
          <>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="call-product">Product</label>
                <Select value={sku} onValueChange={setSku}>
                  <SelectTrigger id="call-product"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRODUCTS.map((p) => <SelectItem key={p.sku} value={p.sku}>{p.name} · {p.sku}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3.5 py-3 text-sm">
                <span className="text-muted-foreground">Service price</span>
                <span className="tabular font-semibold">{formatINR(agent.pricePerCall)} <span className="text-xs font-normal text-muted-foreground">{agent.unit}</span></span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Wallet balance after call</span>
                <span className={cx('tabular font-medium', walletBalance - agent.pricePerCall < 0 ? 'text-danger' : 'text-foreground')}>{formatINR(walletBalance - agent.pricePerCall)}</span>
              </div>
              {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={close}><X className="h-4 w-4" aria-hidden /> Cancel</Button>
              <Button className="btn-glow border-0 text-white" onClick={confirm}>Confirm & pay {formatINR(agent.pricePerCall)}</Button>
            </DialogFooter>
          </>
        )}

        {phase === 'processing' && (
          <div className="flex flex-col items-center py-10 text-center">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-brand-soft" aria-hidden />
            <p className="text-sm font-medium">Contacting {agent.name}…</p>
            <p className="mt-1 text-xs text-muted-foreground">Signed request · agent {agent.id} · {agent.latency} avg</p>
          </div>
        )}

        {phase === 'done' && receipt && (
          <>
            <AgentResponse agent={agent} sku={sku} />
            <div className="mt-4 rounded-xl border border-success/30 bg-success/8 p-3.5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-success">
                <Receipt className="h-3.5 w-3.5" aria-hidden /> Transaction receipt (simulated)
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Transaction</dt><dd className="text-right font-mono">{receipt.txnId}</dd>
                <dt className="text-muted-foreground">Amount</dt><dd className="tabular text-right font-medium">−{formatINR(receipt.amount)}</dd>
                <dt className="text-muted-foreground">Signature</dt><dd className="text-right font-mono">{receipt.signature}</dd>
                <dt className="text-muted-foreground">Time</dt><dd className="tabular text-right">{formatTime(receipt.timestamp)}</dd>
              </dl>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setPhase('configure')}>Call again</Button>
              <Button className="btn-glow border-0 text-white" onClick={close}><Check className="h-4 w-4" aria-hidden /> Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AgentResponse({ agent, sku }: { agent: ServiceAgent; sku: string }) {
  const product = PRODUCTS.find((p) => p.sku === sku)!
  const box = 'rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5 text-sm flex items-center justify-between'

  if (agent.id === 'agent-forecast-01') {
    const f7 = Math.round(product.avgDailySales * 0.75 * 7)
    const f30 = Math.round(product.avgDailySales * 0.75 * 30)
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent response — demand forecast</p>
        <div className={box}><span className="text-muted-foreground">Next 7 days</span><span className="tabular font-semibold">{f7} units</span></div>
        <div className={box}><span className="text-muted-foreground">Next 30 days</span><span className="tabular font-semibold">{f30} units</span></div>
        <div className={box}><span className="text-muted-foreground">Recommended reorder</span><span className="tabular font-semibold text-success">{Math.max(0, f30 - product.stock + product.avgDailySales * 5)} units</span></div>
        <div className={box}><span className="text-muted-foreground">Confidence</span><span className="font-semibold text-brand-soft">87%</span></div>
      </div>
    )
  }
  if (agent.id === 'agent-price-02') {
    const comps = COMPETITOR_PRICES[sku] ?? []
    const min = Math.min(...comps.map((c) => c.price))
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent response — market prices</p>
        {comps.map((c) => (
          <div key={c.channel} className={box}><span className="text-muted-foreground">{c.channel}</span><span className={cx('tabular font-medium', c.price < product.price && 'text-success')}>{formatINR(c.price)}</span></div>
        ))}
        <div className={box}><span className="text-muted-foreground">Suggested price</span><span className="tabular font-semibold text-success">{formatINR(Math.round(min * 1.02) - 1)}</span></div>
      </div>
    )
  }
  if (agent.id === 'agent-return-03') {
    const rows = RETURNS_BY_PINCODE.filter((r) => r.sku === sku)
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent response — return risk</p>
        <div className={box}><span className="text-muted-foreground">Product return rate</span><span className={cx('tabular font-semibold', product.returnRate >= 0.15 ? 'text-danger' : 'text-success')}>{(product.returnRate * 100).toFixed(0)}%</span></div>
        {rows.map((r) => (
          <div key={r.pincode} className={box}>
            <span className="text-muted-foreground">{r.city} · {r.pincode}</span>
            <span className={cx('tabular font-medium', r.returnRate >= 0.15 ? 'text-danger' : 'text-foreground')}>{(r.returnRate * 100).toFixed(0)}% RTO</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-muted-foreground">No regional anomalies — risk is evenly distributed.</p>}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent response — courier quotes</p>
      {LOGISTICS_QUOTES.slice(0, 3).map((q, i) => (
        <div key={q.id} className={box}>
          <span className="text-muted-foreground">{q.courier} · {q.etaDays}d</span>
          <span className={cx('tabular font-medium', i === 0 && 'text-success')}>{formatINR(q.costPer500g)}/500g{i === 0 ? ' · best' : ''}</span>
        </div>
      ))}
    </div>
  )
}
