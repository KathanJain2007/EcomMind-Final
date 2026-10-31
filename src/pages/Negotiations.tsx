import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BrainCircuit, Check, CircleDashed, Factory, Handshake, Play, RotateCcw } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { FIN, NEGOTIATION_SCRIPT, SUPPLIERS, type NegoMessage } from '@/data/demo'
import { cx, formatINR } from '@/lib/format'
import { EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const TIMELINE_STEPS = ['RFQ broadcast', 'Offers received', 'Counter-offer', 'Final offer', 'Deal accepted', 'Escrow locked']

export default function Negotiations() {
  const { demoLoaded, loadDemoBusiness, markNegotiationDone, addActivity } = useApp()
  const [messages, setMessages] = useState<NegoMessage[]>([])
  const [running, setRunning] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const done = messages.length === NEGOTIATION_SCRIPT.length && !running

  const stepIndex = done ? 6 : messages.length === 0 ? 0 : messages.length <= 1 ? 1 : messages.length <= 4 ? 2 : messages.length <= 5 ? 3 : messages.length <= 6 ? 4 : 5

  const start = () => {
    timers.current.forEach(clearTimeout)
    setMessages([])
    setRunning(true)
    let t = 300
    NEGOTIATION_SCRIPT.forEach((_, i) => {
      t += NEGOTIATION_SCRIPT[i].delay
      timers.current.push(setTimeout(() => {
        setMessages((prev) => [...prev, NEGOTIATION_SCRIPT[i]])
        if (i === NEGOTIATION_SCRIPT.length - 1) {
          setRunning(false)
          markNegotiationDone()
          addActivity({ agent: 'EcomMind', action: 'Negotiation replayed — Supplier B at ₹180/unit', product: 'Wireless Earbuds', amount: 54000, status: 'success', detail: '300 units · savings ₹4,500 vs initial quote · escrow ESC-2026-1042.' })
        }
      }, t))
    })
  }

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Negotiation Center" subtitle="Live agent-to-agent price negotiation." />
        <EmptyState title="No active negotiations" body="Load the demo business to watch EcomMind negotiate a 300-unit restock with three supplier agents." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="Negotiation Center"
        subtitle="EcomMind negotiates with supplier agents in real time — within your mandate."
        actions={
          <div className="flex gap-2">
            {messages.length > 0 && !running && (
              <Button variant="outline" size="sm" onClick={start}><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Replay</Button>
            )}
            <Button size="sm" className="btn-glow border-0 text-white" onClick={start} disabled={running}>
              <Play className="h-3.5 w-3.5" aria-hidden /> {running ? 'Negotiating…' : 'Start Demo Negotiation'}
            </Button>
          </div>
        }
      />

      {/* Progress */}
      <div className="card-surface mb-5 px-5 py-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Negotiation progress</span>
          <span className="text-muted-foreground">{Math.min(stepIndex, 6)} of 6 stages</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={(stepIndex / 6) * 100} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-brand-soft to-brand transition-all duration-500" style={{ width: `${(stepIndex / 6) * 100}%` }} />
        </div>
        <ol className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6">
          {TIMELINE_STEPS.map((s, i) => (
            <li key={s} className={cx('flex items-center gap-1.5 text-[11px]', i < stepIndex ? 'text-success' : i === stepIndex && running ? 'text-brand-soft' : 'text-muted-foreground')}>
              {i < stepIndex ? <Check className="h-3 w-3 shrink-0" aria-hidden /> : <CircleDashed className={cx('h-3 w-3 shrink-0', i === stepIndex && running && 'animate-spin')} aria-hidden />}
              {s}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Conversation */}
        <Card className="card-surface xl:col-span-2">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Agent conversation</h2>
              {running && <StatusBadge label="Live" tone="success" pulse />}
            </div>
            <div ref={scrollRef} className="panel-grid h-[430px] space-y-3.5 overflow-y-auto rounded-xl border border-border bg-background/50 p-4" aria-live="polite">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Handshake className="mb-3 h-8 w-8 text-muted-foreground/50" aria-hidden />
                  <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground/70">Start the demo negotiation to watch EcomMind and three supplier agents trade offers.</p>
                </div>
              )}
              {messages.map((m, i) => {
                const isMind = m.from === 'ecommind'
                const supplier = !isMind ? SUPPLIERS.find((s) => s.id === m.from) : null
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.25 }}
                    className={cx('flex gap-2.5', isMind && 'flex-row-reverse')}
                  >
                    <div className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', isMind ? 'btn-glow' : 'border border-border bg-secondary')}>
                      {isMind ? <BrainCircuit className="h-4 w-4 text-white" aria-hidden /> : <Factory className="h-4 w-4 text-brand-soft" aria-hidden />}
                    </div>
                    <div className={cx('max-w-[75%] rounded-xl border px-3.5 py-2.5', isMind ? 'border-brand/35 bg-brand/12' : 'border-border bg-card')}>
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {isMind ? 'EcomMind' : supplier?.name.split('—')[0].trim()}
                      </p>
                      <p className="text-[13px] leading-relaxed">{m.text}</p>
                      {m.price && (
                        <p className={cx('tabular mt-1 text-xs font-semibold', m.kind === 'accept' ? 'text-success' : 'text-brand-soft')}>
                          {formatINR(m.price)}/unit · {m.kind === 'counter' ? 'counter-offer' : m.kind === 'accept' ? 'accepted' : 'offer'}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )
              })}
              {running && (
                <div className="flex items-center gap-2 pl-11 text-xs text-muted-foreground">
                  <span className="flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-soft" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-soft [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-soft [animation-delay:240ms]" /></span>
                  agents typing…
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="card-surface">
          <CardContent className="p-5">
            <h2 className="mb-4 text-sm font-semibold">Deal summary</h2>
            {messages.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">Summary appears once the negotiation begins.</p>
            ) : (
              <dl className="space-y-3 text-sm">
                {[
                  { l: 'Product', v: 'Wireless Earbuds (EAR-001)' },
                  { l: 'Quantity', v: `${FIN.orderQty} units` },
                  { l: 'Original best quote', v: `${formatINR(195)}/unit — Supplier B` },
                  { l: 'Counter-offer', v: `${formatINR(175)}/unit` },
                  { l: 'Final price', v: `${formatINR(FIN.negotiatedUnitPrice)}/unit`, accent: done },
                  { l: 'Total order value', v: formatINR(FIN.escrowLocked), accent: done },
                  { l: 'Savings vs quote', v: formatINR(FIN.negotiationSavings), accent: done },
                  { l: 'Supplier selected', v: 'Supplier B — Kedar Electronics' },
                  { l: 'Delivery', v: '3 days from dispatch' },
                  { l: 'Payment', v: 'Escrow ESC-2026-1042 (simulated)' },
                ].map((r) => (
                  <div key={r.l} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                    <dt className="text-muted-foreground">{r.l}</dt>
                    <dd className={cx('text-right font-medium', r.accent && 'text-success')}>{r.v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
