import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { motion } from 'framer-motion'
import { AlertCircle, BrainCircuit, Factory, Handshake, Info, Loader2, Send, User, X } from 'lucide-react'
import { toast } from 'sonner'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import { api, ApiError, type ApiApproval, type ApiNegotiation } from '@/lib/api'
import { cx, formatDateTime, formatPaise, timeAgo } from '@/lib/format'
import { EmptyState, PageHeader, PanelError, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const STATUS_TONE: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'neutral'> = {
  quotation_requested: 'info', awaiting_supplier_response: 'warning', negotiation_in_progress: 'info',
  offer_received: 'warning', agreed: 'success', declined: 'danger', cancelled: 'neutral',
}
const CLOSED = new Set(['agreed', 'declined', 'cancelled'])

export default function Negotiations() {
  const { negotiationId } = useParams()
  const navigate = useNavigate()
  const listQ = useApiQuery<{ negotiations: ApiNegotiation[] }>('/api/negotiations', ['negotiations'])
  const list = useMemo(() => listQ.data?.negotiations ?? [], [listQ.data])

  // No id in the URL: open the most recent negotiation.
  useEffect(() => {
    if (!negotiationId && list.length) navigate(`/negotiations/${list[0].id}`, { replace: true })
  }, [negotiationId, list, navigate])

  return (
    <div>
      <PageHeader
        title="Negotiation Center"
        subtitle="Every quotation request and negotiation, stored with its full offer history."
        actions={<Button size="sm" className="btn-glow border-0 text-white" onClick={() => navigate('/suppliers')}><Send className="h-3.5 w-3.5" aria-hidden /> New quotation request</Button>}
      />
      {listQ.error && <div className="mb-4"><PanelError message={listQ.error.message} onRetry={listQ.reload} /></div>}

      {listQ.data && list.length === 0 ? (
        <EmptyState
          title="No negotiations yet"
          body="Request a quotation from a supplier in the Supplier Marketplace. Each request opens a negotiation here."
          action={<Button className="btn-glow border-0 text-white" onClick={() => navigate('/suppliers')}>Open Supplier Marketplace</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <Card className="card-surface h-fit">
            <CardContent className="p-2">
              <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sessions</p>
              {listQ.loading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="mb-1.5 h-14" />)}
              <ul className="max-h-[520px] space-y-1 overflow-y-auto">
                {list.map((n) => (
                  <li key={n.id}>
                    <Link to={`/negotiations/${n.id}`} className={cx('block rounded-lg px-3 py-2.5 transition-colors', n.id === negotiationId ? 'bg-brand/12' : 'hover:bg-secondary/60')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{n.supplierName.split('—')[0].trim()}</span>
                        <StatusBadge label={n.statusLabel} tone={STATUS_TONE[n.status] ?? 'neutral'} />
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{n.productName} · {n.quantity} units · {timeAgo(n.updatedAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {negotiationId ? <NegotiationDetail key={negotiationId} id={negotiationId} /> : <Skeleton className="h-96 rounded-xl" />}
        </div>
      )}
    </div>
  )
}

function NegotiationDetail({ id }: { id: string }) {
  const store = useDataStore()
  const navigate = useNavigate()
  const q = useApiQuery<ApiNegotiation>(`/api/negotiations/${id}`, ['negotiations'])
  const [counter, setCounter] = useState('')
  const [busy, setBusy] = useState<null | 'counter' | 'accept' | 'cancel'>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const n = q.data

  const messageCount = n?.messages?.length ?? 0
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messageCount])

  if (q.error && !n) {
    return <Card className="card-surface"><CardContent className="p-5"><PanelError message={q.error.status === 404 ? 'This negotiation doesn’t exist or belongs to another account.' : q.error.message} onRetry={q.reload} /></CardContent></Card>
  }
  if (!n) return <Skeleton className="h-96 rounded-xl" />

  const act = async (kind: 'counter' | 'accept' | 'cancel') => {
    if (busy) return
    setBusy(kind)
    setActionError(null)
    try {
      const body = kind === 'counter' ? { unitPrice: Math.round(Number(counter) * 100) } : undefined
      const res = await api<ApiNegotiation & { approval?: ApiApproval }>(`/api/negotiations/${n.id}/${kind}`, { method: 'POST', body })
      store.setData(`/api/negotiations/${n.id}`, res)
      store.invalidate('negotiations', 'activity', 'analytics', 'escrow', 'wallet', 'approvals')
      if (kind === 'counter') setCounter('')
      if (kind === 'accept' && res.approval) {
        toast.warning('Above your mandate · sent for approval', {
          description: `${res.approval.title}. Nothing is bought until you approve it.`,
          action: { label: 'Review', onClick: () => navigate('/activity?tab=approvals') },
        })
      }
      if (kind === 'accept' && res.escrow) {
        const locked = res.escrow.status === 'locked'
        toast[locked ? 'success' : 'warning'](locked ? 'Deal confirmed · funds locked in escrow' : 'Deal confirmed · escrow awaiting funds', {
          description: locked ? `${formatPaise(res.escrow.amount)} is held in ${res.escrow.id} until you confirm delivery.` : res.escrow.statusNote ?? undefined,
          action: { label: 'View escrow', onClick: () => navigate(`/escrow?id=${res.escrow!.id}`) },
        })
      }
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'That action didn’t go through. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const closed = CLOSED.has(n.status)
  const total = n.latestSupplierPrice ? n.latestSupplierPrice * n.quantity : null
  const counterValid = Number(counter) > 0

  return (
    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="card-surface">
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold">{n.supplierName}</h2>
              <p className="text-xs text-muted-foreground"><span className="font-mono">{n.id}</span> · RFQ <span className="font-mono">{n.rfqId}</span> · opened {formatDateTime(n.createdAt)}</p>
            </div>
            <StatusBadge label={n.statusLabel} tone={STATUS_TONE[n.status] ?? 'neutral'} pulse={n.status === 'awaiting_supplier_response'} />
          </div>
          <div ref={scrollRef} className="panel-grid h-[400px] space-y-3.5 overflow-y-auto rounded-xl border border-border bg-background/50 p-4" aria-live="polite">
            {(n.messages ?? []).map((m) => {
              const mine = m.sender === 'ecommind' || m.sender === 'seller'
              if (m.sender === 'system') {
                return <p key={m.id} className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground"><Info className="h-3 w-3" aria-hidden />{m.text}</p>
              }
              return (
                <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={cx('flex gap-2.5', mine && 'flex-row-reverse')}>
                  <div className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', m.sender === 'ecommind' ? 'btn-glow' : 'border border-border bg-secondary')}>
                    {m.sender === 'ecommind' ? <BrainCircuit className="h-4 w-4 text-white" aria-hidden /> : m.sender === 'seller' ? <User className="h-4 w-4 text-brand-soft" aria-hidden /> : <Factory className="h-4 w-4 text-brand-soft" aria-hidden />}
                  </div>
                  <div className={cx('max-w-[78%] rounded-xl border px-3.5 py-2.5', mine ? 'border-brand/35 bg-brand/12' : 'border-border bg-card')}>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {m.sender === 'ecommind' ? 'EcomMind' : m.sender === 'seller' ? 'You' : n.supplierName.split('—')[0].trim()} · {new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-[13px] leading-relaxed">{m.text}</p>
                    {m.unitPrice != null && (
                      <p className={cx('tabular mt-1 text-xs font-semibold', m.kind === 'accept' ? 'text-success' : 'text-brand-soft')}>
                        {formatPaise(m.unitPrice)}/unit · {m.kind === 'counter' ? 'counter-offer' : m.kind === 'accept' ? 'accepted' : 'offer'}
                      </p>
                    )}
                  </div>
                </motion.div>
              )
            })}
            {n.status === 'awaiting_supplier_response' && (
              <p className="text-center text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />Awaiting the supplier’s response. Nothing is sent on their behalf.</p>
            )}
          </div>

          {!closed && (
            <div className="mt-4 space-y-3">
              {actionError && <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{actionError}</p>}
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <label htmlFor="counter-price" className="mb-1 block text-xs text-muted-foreground">Counter-offer (₹ per unit)</label>
                  <Input id="counter-price" type="number" min={0} step="0.01" value={counter} onChange={(e) => setCounter(e.target.value)} placeholder={n.latestSupplierPrice ? String(Math.round(n.latestSupplierPrice / 100 * 0.95)) : ''} disabled={n.status === 'awaiting_supplier_response'} />
                </div>
                <Button variant="outline" onClick={() => act('counter')} disabled={!counterValid || !!busy || n.status === 'awaiting_supplier_response'}>
                  {busy === 'counter' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />} Send counter
                </Button>
                <Button className="btn-glow border-0 text-white" onClick={() => act('accept')} disabled={n.status !== 'offer_received' || !!busy}>
                  {busy === 'accept' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Handshake className="h-4 w-4" aria-hidden />}
                  Accept {n.latestSupplierPrice ? formatPaise(n.latestSupplierPrice) : ''}
                </Button>
                <Button variant="ghost" className="text-muted-foreground" onClick={() => act('cancel')} disabled={!!busy}>
                  <X className="h-4 w-4" aria-hidden /> Cancel
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Accepting is checked against your mandate’s per-order and daily limits (deals above them go to your approval queue), opens an escrow and locks the money from your wallet. The supplier is paid only after you confirm delivery.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-surface h-fit">
        <CardContent className="p-5">
          <h2 className="mb-4 text-sm font-bold">Deal summary</h2>
          <dl className="space-y-3 text-sm">
            {[
              { l: 'Product', v: `${n.productName} (${n.sku})` },
              { l: 'Quantity', v: `${n.quantity.toLocaleString('en-IN')} units` },
              { l: 'Target price', v: n.rfq.targetUnitPrice ? `${formatPaise(n.rfq.targetUnitPrice)}/unit` : '—' },
              { l: 'Supplier’s latest offer', v: n.latestSupplierPrice ? `${formatPaise(n.latestSupplierPrice)}/unit` : '—' },
              { l: 'Your latest counter', v: n.latestBuyerPrice ? `${formatPaise(n.latestBuyerPrice)}/unit` : '—' },
              { l: 'Agreed price', v: n.agreedUnitPrice ? `${formatPaise(n.agreedUnitPrice)}/unit` : '—', accent: !!n.agreedUnitPrice },
              { l: 'Order value', v: total ? formatPaise((n.agreedUnitPrice ?? n.latestSupplierPrice ?? 0) * n.quantity) : '—', accent: !!n.agreedUnitPrice },
              { l: 'Delivery', v: n.supplierDeliveryDays ? `${n.supplierDeliveryDays} days (requested ${n.rfq.deliveryDays})` : `Requested within ${n.rfq.deliveryDays} days` },
              { l: 'Deliver to', v: n.rfq.deliveryLocation },
              { l: 'Counter-offers', v: String(n.rounds) },
            ].map((r) => (
              <div key={r.l} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                <dt className="text-muted-foreground">{r.l}</dt>
                <dd className={cx('text-right font-medium', r.accent && 'text-success')}>{r.v}</dd>
              </div>
            ))}
          </dl>
          {n.escrow && (
            <Link to={`/escrow?id=${n.escrow.id}`} className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm transition-colors hover:bg-secondary/70">
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">Escrow <span className="font-mono">{n.escrow.id}</span></span>
                <span className="tabular font-medium">{formatPaise(n.escrow.amount)}</span>
              </span>
              <StatusBadge label={n.escrow.statusLabel} tone={n.escrow.status === 'released' ? 'success' : n.escrow.status === 'pending' ? 'warning' : n.escrow.status === 'refunded' || n.escrow.status === 'cancelled' ? 'neutral' : 'info'} />
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
