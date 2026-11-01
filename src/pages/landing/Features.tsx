import type { PointerEvent, ReactNode } from 'react'
import {
  ArrowRight, Boxes, Bot, CalendarDays, FileSpreadsheet, Handshake, LayoutDashboard, Lightbulb, LineChart, ShieldCheck, Store, Truck, TrendingUp, Undo2, Wallet,
} from 'lucide-react'
import { cx } from '@/lib/format'
import { SectionDecor, type SectionDecorItem } from './BackgroundDecor'
import { Reveal } from './Reveal'
import { ESCROW_STAGES } from './sampleData'

function Feature({ icon: Icon, title, children, visual, className, index }: {
  icon: typeof Boxes
  title: string
  children: ReactNode
  visual?: ReactNode
  className?: string
  index: number
}) {
  return (
    <Reveal index={index % 3} className={cx('min-w-0', className)}>
      <article className="lp-surface lp-feature">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-soft"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
          <h3 className="text-base font-bold tracking-tight">{title}</h3>
        </div>
        <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
        {visual && <div className="lp-feature-visual">{visual}</div>}
      </article>
    </Reveal>
  )
}

const pills = (items: string[]) => (
  <ul className="flex flex-wrap gap-1.5">
    {items.map((item) => <li key={item} className="lp-mini-pill">{item}</li>)}
  </ul>
)

/** Number-free chart shapes, so a feature card never reads as a claim about real results. */
function Sparkline() {
  return (
    <svg viewBox="0 0 320 64" className="h-16 w-full" fill="none" aria-hidden preserveAspectRatio="none">
      <path d="M0 52 C 40 46, 60 30, 96 34 S 150 54, 190 36 S 262 8, 320 14 V64 H0 Z" fill="rgb(var(--brand) / 0.1)" />
      <path d="M0 52 C 40 46, 60 30, 96 34 S 150 54, 190 36 S 262 8, 320 14" stroke="rgb(var(--brand-soft))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function FestivalCurve() {
  return (
    <svg viewBox="0 0 320 72" className="h-[4.5rem] w-full" fill="none" aria-hidden preserveAspectRatio="none">
      <path d="M0 62 C 60 60, 84 58, 112 34 C 128 20, 142 12, 156 30 C 170 50, 190 58, 222 42 C 240 32, 252 22, 266 36 C 280 50, 300 58, 320 60" stroke="rgb(var(--brand-soft))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d="M144 0 V72 M254 0 V72" stroke="rgb(var(--brand-soft))" strokeOpacity="0.28" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const AGENT_COSTS = [
  { agent: 'Demand Forecast', cost: '₹4 per forecast' },
  { agent: 'Market Price', cost: '₹2 per query' },
  { agent: 'Return Risk', cost: '₹1 per score' },
  { agent: 'Logistics', cost: '₹1 per quote' },
]

const INSIGHTS = [
  { icon: TrendingUp, text: 'Demand forecasting' },
  { icon: Lightbulb, text: 'Margin-aware price suggestions' },
  { icon: Undo2, text: 'Product and pincode return-risk scoring' },
  { icon: Truck, text: 'Courier comparison' },
]

const DECOR: SectionDecorItem[] = [
  { kind: 'donut', style: { top: '4.5rem', right: '6%' } },
  { kind: 'percent', style: { top: '11rem', right: '19%' } },
  { kind: 'arrow', style: { top: '4rem', right: '22%' } },
]

/** Moves the hovered card's glow to the pointer. Only the transform changes, so it stays cheap. */
function moveCardGlow(event: PointerEvent<HTMLElement>) {
  if (event.pointerType === 'touch') return
  const card = (event.target as Element).closest<HTMLElement>('.lp-feature')
  if (!card) return
  const rect = card.getBoundingClientRect()
  card.style.setProperty('--mx', `${event.clientX - rect.left}px`)
  card.style.setProperty('--my', `${event.clientY - rect.top}px`)
}

export default function Features() {
  return (
    <section id="features" className="lp-section" aria-labelledby="features-title">
      <SectionDecor items={DECOR} />
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">Features</p>
          <h2 id="features-title" className="lp-heading">Everything your online business needs. <span className="lp-accent">One intelligent workspace.</span></h2>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-12" onPointerMove={moveCardGlow}>
          <Feature index={0} icon={LayoutDashboard} title="Business Overview" className="lg:col-span-4" visual={pills(['Revenue', 'Orders', 'Products', 'Inventory value', 'Estimated profit', 'Active agents'])}>
            Revenue, orders, products, inventory value, estimated profit and active agents at a glance.
          </Feature>

          <Feature
            index={1} icon={Boxes} title="Inventory Management" className="lg:col-span-4"
            visual={(
              <div className="space-y-2" aria-hidden>
                {[{ w: '82%' }, { w: '56%' }, { w: '18%', low: true }].map((bar) => (
                  <div key={bar.w} className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className={cx('h-full rounded-full', bar.low ? 'bg-danger' : 'bg-[#7b2fe0]')} style={{ width: bar.w }} />
                  </div>
                ))}
              </div>
            )}
          >
            Product catalogue, stock levels, days of cover, low-stock alerts and reorder signals.
          </Feature>

          <Feature
            index={2} icon={Store} title="Multi-Marketplace Selling" className="md:col-span-2 lg:col-span-4"
            visual={(
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium" aria-hidden>
                {['Amazon', 'Flipkart', 'Meesho', 'Shopify', 'Instagram'].map((m) => (
                  <span key={m} className="rounded-md border border-border bg-card px-2 py-1">{m}</span>
                ))}
              </div>
            )}
          >
            Amazon, Flipkart, Meesho, Shopify and Instagram. <strong className="font-semibold text-foreground">One shared stock pool across channels.</strong>
          </Feature>

          <Feature
            index={3} icon={LineChart} title="Sales Analytics" className="lg:col-span-7"
            visual={(
              <div>
                <div className="mb-2 flex gap-1.5" aria-hidden>
                  {['7 days', '30 days', '90 days'].map((r, i) => (
                    <span key={r} className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', i === 1 ? 'bg-[#7b2fe0] text-white' : 'bg-secondary text-muted-foreground')}>{r}</span>
                  ))}
                </div>
                <Sparkline />
              </div>
            )}
          >
            Revenue, orders, margins, bestsellers, weak performers and category share across 7, 30 and 90 days.
          </Feature>

          <Feature index={4} icon={Lightbulb} title="AI Insights" className="lg:col-span-5">
            <ul className="space-y-2.5">
              {INSIGHTS.map((item) => (
                <li key={item.text} className="flex items-center gap-2.5 text-foreground">
                  <item.icon className="h-4 w-4 shrink-0 text-brand-soft" aria-hidden /> {item.text}
                </li>
              ))}
            </ul>
          </Feature>

          <Feature index={5} icon={CalendarDays} title="Festival Intelligence" className="lg:col-span-4" visual={<FestivalCurve />}>
            Indian festivals and marketplace sale events, including Diwali and Big Billion Days. See expected demand surges, stock suggestions and margin-safe discount campaigns.
          </Feature>

          <Feature index={6} icon={Bot} title="Agent Marketplace" className="lg:col-span-4">
            <p>Four specialist agents, with pay-per-use pricing.</p>
            <table className="mt-3 w-full text-left">
              <thead className="sr-only"><tr><th scope="col">Agent</th><th scope="col">Cost</th></tr></thead>
              <tbody className="divide-y divide-border/70">
                {AGENT_COSTS.map((row) => (
                  <tr key={row.agent}>
                    <td className="py-2 font-medium text-foreground">{row.agent}</td>
                    <td className="tabular py-2 text-right text-xs font-semibold text-brand-soft">{row.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Feature>

          <Feature index={7} icon={Handshake} title="Supplier Marketplace and Negotiation" className="md:col-span-2 lg:col-span-4" visual={pills(['Price', 'Delivery time', 'Minimum order', 'Rating'])}>
            Compare supplier prices, delivery times, minimum orders and ratings. <strong className="font-semibold text-foreground">Automated negotiation from your supplier quotes.</strong>
          </Feature>

          <Feature
            index={8} icon={ShieldCheck} title="Escrow-Protected Payments" className="lg:col-span-7"
            visual={(
              <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs font-medium">
                {ESCROW_STAGES.map((stage, i) => (
                  <li key={stage} className="flex items-center gap-1.5">
                    <span className="rounded-md bg-brand/10 px-2 py-1 text-brand-soft">{stage}</span>
                    {i < ESCROW_STAGES.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />}
                  </li>
                ))}
              </ol>
            )}
          >
            An escrow-style simulated payment flow with a full ledger. Money moves only as each stage completes.
          </Feature>

          <Feature
            index={9} icon={Wallet} title="Wallet and Reports" className="lg:col-span-5"
            visual={(
              <div className="flex items-center gap-2 text-xs font-semibold">
                <FileSpreadsheet className="h-4 w-4 text-brand-soft" aria-hidden />
                {pills(['CSV', 'Excel', 'PDF'])}
              </div>
            )}
          >
            Wallet top-ups, agent usage, payment history, spending by agent and a daily transaction ledger, plus six business reports with CSV, Excel and PDF exports.
          </Feature>
        </div>
      </div>
    </section>
  )
}
