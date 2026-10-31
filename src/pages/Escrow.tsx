import { useState } from 'react'
import { Check, CircleDashed, Landmark, Loader2, Lock, PackageCheck, ShieldCheck, Truck, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { FIN } from '@/data/demo'
import { cx, formatDateTime, formatINR } from '@/lib/format'
import { EmptyState, MetricCard, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const STEPS = [
  { label: 'Agreement signed', desc: 'Terms signed by EcomMind and Supplier B agent' },
  { desc: 'Funds locked in simulated escrow', label: 'Money locked' },
  { label: 'Goods dispatched', desc: 'Supplier ships via BlueDart Surface Express' },
  { label: 'Delivery confirmed', desc: 'You confirm receipt of goods' },
  { label: 'Payment released', desc: 'Escrow releases ₹54,000 to Supplier B' },
]

export default function Escrow() {
  const { demoLoaded, loadDemoBusiness, escrow, releasedTotal, refundedTotal, setEscrowStep } = useApp()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [working, setWorking] = useState(false)

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Escrow" subtitle="Funds are locked until delivery is confirmed — never pay a supplier agent upfront." />
        <EmptyState title="No escrow orders" body="Load the demo business to see a live ₹54,000 simulated escrow for the Wireless Earbuds restock." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  const lockedNow = escrow.status === 'Released' ? 0 : escrow.total
  const activeOrders = escrow.status === 'Released' ? 0 : 1
  const nextAction = escrow.step === 1 ? 'Simulate dispatch' : escrow.step === 2 ? 'Simulate delivery confirmation' : escrow.step === 3 ? 'Release payment to supplier' : null

  const advance = () => {
    setConfirmOpen(false)
    setWorking(true)
    setTimeout(() => {
      setEscrowStep(Math.min(4, escrow.step + 1))
      setWorking(false)
      if (escrow.step + 1 === 2) toast.success('Goods dispatched', { description: 'Supplier B shipped the consignment via BlueDart.' })
      if (escrow.step + 1 === 3) toast.success('Delivery confirmed', { description: 'You can now release the escrowed payment.' })
    }, 900)
  }

  return (
    <div>
      <PageHeader
        title="Escrow"
        subtitle="Funds stay locked until delivery is confirmed. All payments are simulated demo transactions."
        actions={<StatusBadge label="Simulated payments" tone="warning" />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Total in Escrow" value={formatINR(lockedNow)} icon={<Lock className="h-4 w-4" aria-hidden />} hint={lockedNow ? 'locked safely' : 'nothing locked'} />
        <MetricCard label="Active Escrow Orders" value={String(activeOrders)} icon={<Landmark className="h-4 w-4" aria-hidden />} hint="ESC-2026-1042" />
        <MetricCard label="Released Payments" value={formatINR(releasedTotal)} icon={<PackageCheck className="h-4 w-4" aria-hidden />} hint="lifetime" />
        <MetricCard label="Refunded Payments" value={formatINR(refundedTotal)} icon={<Undo2 className="h-4 w-4" aria-hidden />} hint="lifetime" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Order card */}
        <Card className="card-surface xl:col-span-3">
          <CardContent className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand-soft">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Escrow order <span className="font-mono text-xs text-muted-foreground">{escrow.id}</span></h2>
                  <p className="text-xs text-muted-foreground">Created {formatDateTime(escrow.createdAt)}</p>
                </div>
              </div>
              <StatusBadge
                label={escrow.status}
                tone={escrow.status === 'Released' ? 'success' : escrow.status === 'Locked' ? 'warning' : 'info'}
                pulse={escrow.status === 'Locked'}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                { l: 'Product', v: escrow.product },
                { l: 'Supplier', v: 'Supplier B' },
                { l: 'Quantity', v: `${escrow.qty} units` },
                { l: 'Unit price', v: formatINR(escrow.unitPrice) },
                { l: 'Total', v: formatINR(escrow.total) },
                { l: 'Protection', v: 'Delivery-gated' },
              ].map((r) => (
                <div key={r.l} className="rounded-lg border border-border bg-secondary/40 p-3">
                  <p className="text-[10px] text-muted-foreground">{r.l}</p>
                  <p className="tabular mt-0.5 truncate text-sm font-semibold" title={String(r.v)}>{r.v}</p>
                </div>
              ))}
            </div>

            {nextAction && (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button className="btn-glow border-0 text-white" onClick={() => setConfirmOpen(true)} disabled={working}>
                  {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Truck className="h-4 w-4" aria-hidden />}
                  {nextAction}
                </Button>
                <p className="text-xs text-muted-foreground">Demo simulation — no real money moves.</p>
              </div>
            )}
            {escrow.status === 'Released' && (
              <div className="mt-5 rounded-lg border border-success/30 bg-success/8 px-4 py-3 text-sm text-success">
                Payment of {formatINR(escrow.total)} released to Supplier B. This order is complete.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Process stepper */}
        <Card className="card-surface xl:col-span-2">
          <CardContent className="p-5">
            <h2 className="mb-4 text-sm font-semibold">Escrow process</h2>
            <ol className="space-y-0">
              {STEPS.map((s, i) => {
                const state = i <= escrow.step ? 'done' : i === escrow.step + 1 ? 'next' : 'todo'
                return (
                  <li key={s.label} className="relative flex gap-3 pb-6 last:pb-0">
                    {i < STEPS.length - 1 && <span className={cx('absolute left-[13px] top-7 h-full w-px', i < escrow.step ? 'bg-success/50' : 'bg-border')} aria-hidden />}
                    <span className={cx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                      state === 'done' ? 'border-success bg-success/15 text-success' : state === 'next' ? 'border-brand bg-brand/10 text-brand-soft' : 'border-border text-muted-foreground',
                    )}>
                      {state === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <CircleDashed className={cx('h-3.5 w-3.5', state === 'next' && working && 'animate-spin')} aria-hidden />}
                    </span>
                    <div>
                      <p className={cx('text-sm font-medium', state === 'todo' && 'text-muted-foreground')}>{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader><DialogTitle>{nextAction}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {escrow.step === 1 && 'Mark the consignment as dispatched by Supplier B. This simulates the supplier agent updating the escrow contract.'}
            {escrow.step === 2 && 'Confirm that 300 units of Wireless Earbuds arrived in good condition. This is a simulated confirmation.'}
            {escrow.step === 3 && `Release ${formatINR(FIN.escrowLocked)} from escrow to Supplier B. This is a simulated payment — irreversible in the demo.`}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button className="btn-glow border-0 text-white" onClick={advance}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
