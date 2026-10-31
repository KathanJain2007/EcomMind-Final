import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AlertCircle, Ban, Check, CircleDashed, Landmark, Loader2, Lock, PackageCheck, ShieldCheck, Truck, Undo2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import { api, ApiError, newIdempotencyKey, type ApiEscrow, type ApiEscrowSummary, type EscrowStatus } from '@/lib/api'
import { cx, formatDateTime, formatPaise, timeAgo } from '@/lib/format'
import { EmptyState, MetricCard, PageHeader, PanelError, StatusBadge } from '@/components/common'
import { CountUp } from '@/components/CountUp'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const money = (p: number) => formatPaise(p, { decimals: p % 100 ? 2 : 0 })

const TONE: Record<EscrowStatus, 'success' | 'warning' | 'info' | 'danger' | 'neutral'> = {
  pending: 'warning', locked: 'warning', dispatched: 'info', delivered: 'info', released: 'success', refunded: 'neutral', cancelled: 'neutral',
}
const ORDER: EscrowStatus[] = ['pending', 'locked', 'dispatched', 'delivered', 'released']

type Action = 'lock' | 'topup-lock' | 'dispatch' | 'confirm-delivery' | 'release' | 'refund' | 'cancel'

const ACTION_COPY: Record<Action, { title: string; button: string; done: string }> = {
  lock: { title: 'Lock funds in escrow', button: 'Lock funds', done: 'Funds locked in escrow' },
  'topup-lock': { title: 'Top up and lock funds', button: 'Top up & lock', done: 'Wallet topped up and funds locked' },
  dispatch: { title: 'Record dispatch', button: 'Record dispatch', done: 'Dispatch recorded' },
  'confirm-delivery': { title: 'Confirm delivery', button: 'Confirm delivery', done: 'Delivery confirmed' },
  release: { title: 'Release payment to supplier', button: 'Release payment', done: 'Payment released' },
  refund: { title: 'Refund escrow', button: 'Refund to wallet', done: 'Escrow refunded' },
  cancel: { title: 'Cancel escrow', button: 'Cancel escrow', done: 'Escrow cancelled' },
}

export default function Escrow() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const listQ = useApiQuery<{ escrows: ApiEscrow[] }>('/api/escrows', ['escrow'])
  const sumQ = useApiQuery<ApiEscrowSummary>('/api/escrows/summary', ['escrow'])
  const list = useMemo(() => listQ.data?.escrows ?? [], [listQ.data])
  const selectedId = params.get('id') ?? list[0]?.id ?? null

  useEffect(() => {
    if (!params.get('id') && list.length) setParams({ id: list[0].id }, { replace: true })
  }, [params, list, setParams])

  const s = sumQ.data
  return (
    <div>
      <PageHeader
        title="Escrow"
        subtitle="Money for an agreed deal is locked from your wallet and paid to the supplier only after you confirm delivery."
        actions={<StatusBadge label="Simulated wallet funds" tone="warning" />}
      />
      {(listQ.error || sumQ.error) && <div className="mb-4"><PanelError message={(listQ.error ?? sumQ.error)!.message} onRetry={() => { listQ.reload(); sumQ.reload() }} /></div>}

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard loading={sumQ.loading} label="Total in Escrow" value={<CountUp value={(s?.held ?? 0) / 100} format="inr" />} icon={<Lock className="h-4 w-4" aria-hidden />} hint={s?.held ? 'locked until delivery' : 'nothing locked'} />
        <MetricCard loading={sumQ.loading} label="Active Escrow Orders" value={<CountUp value={s?.heldCount ?? 0} />} icon={<Landmark className="h-4 w-4" aria-hidden />}
          hint={s?.byStatus.pending.count ? `${s.byStatus.pending.count} awaiting funds` : 'locked, in transit or delivered'} />
        <MetricCard loading={sumQ.loading} label="Released Payments" value={<CountUp value={(s?.released ?? 0) / 100} format="inr" />} icon={<PackageCheck className="h-4 w-4" aria-hidden />} hint={`${s?.byStatus.released.count ?? 0} orders · lifetime`} />
        <MetricCard loading={sumQ.loading} label="Refunded Payments" value={<CountUp value={(s?.refunded ?? 0) / 100} format="inr" />} icon={<Undo2 className="h-4 w-4" aria-hidden />} hint={`${s?.byStatus.refunded.count ?? 0} orders · lifetime`} />
      </div>

      {listQ.data && list.length === 0 ? (
        <EmptyState
          title="No escrow orders yet"
          body="Accept a supplier’s offer in the Negotiation Center. EcomMind opens an escrow for the deal and locks the money from your wallet."
          action={<Button className="btn-glow border-0 text-white" onClick={() => navigate('/negotiations')}>Open Negotiation Center</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <Card className="card-surface h-fit">
            <CardContent className="p-2">
              <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Escrow orders</p>
              {listQ.loading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="mb-1.5 h-14" />)}
              <ul className="max-h-[560px] space-y-1 overflow-y-auto">
                {list.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => setParams({ id: e.id })}
                      className={cx('block w-full rounded-lg px-3 py-2.5 text-left transition-colors', e.id === selectedId ? 'bg-brand/12' : 'hover:bg-secondary/60')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="tabular truncate text-sm font-medium">{money(e.amount)}</span>
                        <StatusBadge label={e.statusLabel} tone={TONE[e.status]} />
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{e.productName} · {e.supplierName.split('—')[0].trim()} · {timeAgo(e.createdAt)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {selectedId ? <EscrowDetail key={selectedId} id={selectedId} /> : <Skeleton className="h-96 rounded-xl" />}
        </div>
      )}
    </div>
  )
}

function EscrowDetail({ id }: { id: string }) {
  const store = useDataStore()
  const q = useApiQuery<ApiEscrow>(`/api/escrows/${id}`, ['escrow'])
  const wallet = useApiQuery<{ balance: number }>('/api/wallet', ['wallet'])
  const reloadWallet = wallet.reload
  // The balance decides between "Lock" and "Top up & lock": refresh it when an escrow opens.
  useEffect(() => { reloadWallet() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [dialog, setDialog] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [courier, setCourier] = useState('')
  const [tracking, setTracking] = useState('')
  const [reason, setReason] = useState('')
  const e = q.data

  if (q.error && !e) {
    return <Card className="card-surface"><CardContent className="p-5"><PanelError message={q.error.status === 404 ? 'This escrow doesn’t exist or belongs to another account.' : q.error.message} onRetry={q.reload} /></CardContent></Card>
  }
  if (!e) return <Skeleton className="h-96 rounded-xl" />

  const balance = wallet.data?.balance ?? 0
  const shortfall = e.status === 'pending' ? Math.max(0, e.amount - balance) : 0
  const supplier = e.supplierName.split('—')[0].trim()

  const run = async (action: Action) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (action === 'topup-lock') {
        // Re-read the balance so a top-up made elsewhere isn't added twice.
        const fresh = await api<{ balance: number }>('/api/wallet')
        const needed = Math.max(0, e.amount - fresh.balance)
        if (needed > 0) await api('/api/wallet/topups', { body: { amount: needed }, idempotencyKey: newIdempotencyKey('topup') })
        store.invalidate('wallet')
      }
      const path = action === 'topup-lock' ? 'lock' : action
      const body = action === 'dispatch' ? { courier: courier.trim() || null, trackingId: tracking.trim() || null }
        : action === 'refund' ? { reason: reason.trim() } : undefined
      const res = await api<ApiEscrow>(`/api/escrows/${e.id}/${path}`, { method: 'POST', body })
      store.setData(`/api/escrows/${e.id}`, res)
      store.invalidate('escrow', 'wallet', 'activity', 'analytics', 'negotiations', 'products')
      toast.success(ACTION_COPY[action].done, { description: `${e.id} · ${res.statusLabel}` })
      setDialog(null)
      setReason('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t go through. Try again.')
      store.invalidate('escrow', 'wallet')
    } finally {
      setBusy(false)
    }
  }

  const closed = e.status === 'refunded' || e.status === 'cancelled'
  const reached = ORDER.indexOf(e.status)
  const steps = [
    { label: 'Deal agreed', desc: <>Negotiation <Link className="font-mono underline-offset-2 hover:underline" to={`/negotiations/${e.negotiationId}`}>{e.negotiationId}</Link></>, at: e.createdAt },
    { label: 'Money locked', desc: `${money(e.amount)} moved from your wallet into escrow`, at: e.lockedAt },
    { label: 'Goods dispatched', desc: e.courier || e.trackingId ? [e.courier, e.trackingId && `tracking ${e.trackingId}`].filter(Boolean).join(' · ') : `${supplier} ships the consignment`, at: e.dispatchedAt },
    { label: 'Delivery confirmed', desc: `You confirm receipt; ${e.quantity} units are added to stock`, at: e.deliveredAt },
    { label: 'Payment released', desc: `Escrow pays ${money(e.amount)} to ${supplier}`, at: e.releasedAt },
  ]

  const primary: Action | null = e.status === 'pending' ? (shortfall > 0 ? 'topup-lock' : 'lock')
    : e.status === 'locked' ? 'dispatch' : e.status === 'dispatched' ? 'confirm-delivery' : e.status === 'delivered' ? 'release' : null
  const PrimaryIcon = primary === 'dispatch' ? Truck : primary === 'confirm-delivery' ? PackageCheck : primary === 'release' ? ShieldCheck : primary === 'topup-lock' ? Wallet : Lock

  return (
    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="card-surface">
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand-soft">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Escrow order <span className="font-mono text-xs text-muted-foreground">{e.id}</span></h2>
                <p className="text-xs text-muted-foreground">Opened {formatDateTime(e.createdAt)}</p>
              </div>
            </div>
            <StatusBadge label={e.statusLabel} tone={TONE[e.status]} pulse={e.status === 'locked' || e.status === 'dispatched'} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              { l: 'Product', v: `${e.productName} (${e.sku})` },
              { l: 'Supplier', v: e.supplierName },
              { l: 'Quantity', v: `${e.quantity.toLocaleString('en-IN')} units` },
              { l: 'Unit price', v: money(e.unitPrice) },
              { l: 'Total', v: money(e.amount) },
              { l: 'Protection', v: 'Delivery-gated' },
            ].map((r) => (
              <div key={r.l} className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="text-[10px] text-muted-foreground">{r.l}</p>
                <p className="tabular mt-0.5 truncate text-sm font-semibold" title={r.v}>{r.v}</p>
              </div>
            ))}
          </div>

          {e.status === 'pending' && e.statusNote && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />No money has moved yet. {e.statusNote}
            </p>
          )}
          {error && !dialog && <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{error}</p>}

          {primary && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button className="btn-glow border-0 text-white" onClick={() => { setError(null); setDialog(primary) }} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PrimaryIcon className="h-4 w-4" aria-hidden />}
                {primary === 'topup-lock' ? `Top up ${money(shortfall)} & lock` : ACTION_COPY[primary].button}
              </Button>
              {(e.status === 'locked' || e.status === 'dispatched') && (
                <Button variant="outline" onClick={() => { setError(null); setDialog('refund') }} disabled={busy}><Undo2 className="h-4 w-4" aria-hidden /> Refund</Button>
              )}
              {e.status === 'pending' && (
                <Button variant="ghost" className="text-muted-foreground" onClick={() => { setError(null); setDialog('cancel') }} disabled={busy}><Ban className="h-4 w-4" aria-hidden /> Cancel</Button>
              )}
            </div>
          )}
          {e.status === 'released' && (
            <div className="mt-5 rounded-lg border border-success/30 bg-success/8 px-4 py-3 text-sm text-success">
              {money(e.amount)} released to {supplier} on {formatDateTime(e.releasedAt!)}. This order is complete.
            </div>
          )}
          {e.status === 'refunded' && (
            <div className="mt-5 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm">
              {money(e.amount)} returned to your wallet on {formatDateTime(e.refundedAt!)}{e.refundReason ? ` · ${e.refundReason}` : ''}.
            </div>
          )}
          {e.status === 'cancelled' && (
            <div className="mt-5 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
              Cancelled before any money was locked.
            </div>
          )}

          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ledger entries</h3>
          {(e.ledger ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No money has moved for this escrow.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {(e.ledger ?? []).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium">{t.kind === 'escrow_lock' ? 'Locked from wallet' : t.kind === 'escrow_release' ? 'Paid to supplier from escrow' : 'Refunded to wallet'}</p>
                    <p className="truncate text-muted-foreground"><span className="font-mono">{t.id}</span> · {formatDateTime(t.time)}</p>
                  </div>
                  <span className={cx('tabular font-semibold', t.amount < 0 ? 'text-danger' : t.amount > 0 ? 'text-success' : 'text-foreground')}>
                    {t.amount < 0 ? '−' : t.amount > 0 ? '+' : ''}{money(Math.abs(t.amount || t.grossAmount || 0))}
                    {t.amount === 0 && <span className="ml-1 font-normal text-muted-foreground">(wallet unchanged)</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="card-surface h-fit">
        <CardContent className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Escrow process</h2>
          <ol>
            {steps.map((s, i) => {
              const state = closed ? (s.at ? 'done' : 'todo') : i <= reached ? 'done' : i === reached + 1 ? 'next' : 'todo'
              return (
                <li key={s.label} className="relative flex gap-3 pb-6 last:pb-0">
                  {i < steps.length - 1 && <span className={cx('absolute left-[13px] top-7 h-full w-px', state === 'done' && (closed ? steps[i + 1].at : i < reached) ? 'bg-success/50' : 'bg-border')} aria-hidden />}
                  <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                    state === 'done' ? 'border-success bg-success/15 text-success' : state === 'next' ? 'border-brand bg-brand/10 text-brand-soft' : 'border-border text-muted-foreground')}>
                    {state === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <CircleDashed className={cx('h-3.5 w-3.5', state === 'next' && busy && 'animate-spin')} aria-hidden />}
                  </span>
                  <div className="min-w-0">
                    <p className={cx('text-sm font-medium', state === 'todo' && 'text-muted-foreground')}>{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                    {s.at && <p className="tabular mt-0.5 text-[11px] text-muted-foreground">{formatDateTime(s.at)}</p>}
                  </div>
                </li>
              )
            })}
            {closed && (
              <li className="mt-4 flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">{e.status === 'refunded' ? <Undo2 className="h-3.5 w-3.5" aria-hidden /> : <Ban className="h-3.5 w-3.5" aria-hidden />}</span>
                <div>
                  <p className="text-sm font-medium">{e.statusLabel}</p>
                  <p className="tabular text-[11px] text-muted-foreground">{formatDateTime((e.refundedAt ?? e.cancelledAt)!)}</p>
                </div>
              </li>
            )}
          </ol>
        </CardContent>
      </Card>

      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o && !busy) setDialog(null) }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader><DialogTitle>{dialog ? ACTION_COPY[dialog].title : ''}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            {dialog === 'lock' && <p>Move {money(e.amount)} from your wallet into escrow for {e.quantity} × {e.productName}. Your mandate’s per-order and daily limits are checked first.</p>}
            {dialog === 'topup-lock' && <p>Your wallet is {money(shortfall)} short. Add {money(shortfall)} of simulated demo funds, then lock {money(e.amount)} in escrow.</p>}
            {dialog === 'dispatch' && (
              <>
                <p>Record that {supplier} has shipped the consignment. Add the courier and tracking number if the supplier shared them.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label htmlFor="esc-courier" className="mb-1 block text-xs">Courier</label><Input id="esc-courier" value={courier} maxLength={80} onChange={(ev) => setCourier(ev.target.value)} placeholder="e.g. BlueDart" /></div>
                  <div><label htmlFor="esc-tracking" className="mb-1 block text-xs">Tracking number</label><Input id="esc-tracking" value={tracking} maxLength={80} onChange={(ev) => setTracking(ev.target.value)} /></div>
                </div>
              </>
            )}
            {dialog === 'confirm-delivery' && <p>Confirm {e.quantity} units of {e.productName} arrived in good condition. They’re added to your stock, and you can then release the payment.</p>}
            {dialog === 'release' && <p>Pay {money(e.amount)} from escrow to {supplier}. This can’t be undone.</p>}
            {dialog === 'refund' && (
              <>
                <p>Return {money(e.amount)} from escrow to your wallet and close this order. Use this if the supplier cancelled or the goods didn’t arrive.</p>
                <div><label htmlFor="esc-reason" className="mb-1 block text-xs">Reason</label><Input id="esc-reason" value={reason} maxLength={300} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Supplier cancelled the order" /></div>
              </>
            )}
            {dialog === 'cancel' && <p>Close this escrow without locking any money. The agreed deal stays in the Negotiation Center.</p>}
            {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>Back</Button>
            <Button className={cx(dialog === 'refund' || dialog === 'cancel' ? '' : 'btn-glow border-0 text-white')} variant={dialog === 'refund' || dialog === 'cancel' ? 'destructive' : 'default'}
              onClick={() => dialog && run(dialog)} disabled={busy || (dialog === 'refund' && reason.trim().length < 3)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {dialog ? (dialog === 'topup-lock' ? `Top up & lock ${money(e.amount)}` : ACTION_COPY[dialog].button) : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
