import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Network, Rocket, TrendingUp } from 'lucide-react'
import Autonomy from './Autonomy'
import { SectionDecor, type SectionDecorItem } from './BackgroundDecor'
import Faq from './Faq'
import Features from './Features'
import FinalCta from './FinalCta'
import HowItWorks from './HowItWorks'
import { Reveal } from './Reveal'

const LivePreview = lazy(() => import('./LivePreview'))

/** Loads the charts just before they scroll in, keeping the space they'll need. */
function DeferredLivePreview() {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNear(true); io.disconnect() }
    }, { rootMargin: '900px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className="min-h-[60rem]">
      {near && <Suspense fallback={null}><LivePreview /></Suspense>}
    </div>
  )
}

const AUDIENCES = [
  { icon: TrendingUp, title: 'Growing Sellers', text: 'For sellers who have outgrown spreadsheets and need better visibility into stock, sales and margins.' },
  { icon: Network, title: 'Multi-Channel Brands', text: 'For businesses selling across multiple marketplaces that need a centralised catalogue and shared stock pool.' },
  { icon: Rocket, title: 'Resellers and D2C Founders', text: 'For founders who want better supplier decisions, improved operations and less manual work.' },
]

const AUDIENCE_DECOR: SectionDecorItem[] = [
  { kind: 'profit', style: { top: '4.5rem', right: '7%' } },
  { kind: 'coinSmall', style: { top: '9rem', right: '19%' } },
  { kind: 'plus', style: { top: '5rem', right: '24%' } },
]

/** A slow strip of what EcomMind does, between the hero and the sections. */
const CAPABILITIES = [
  'Demand forecasting', 'Suggests a price within your margin', 'Return-risk scoring', 'Courier comparison',
  'Escrow-style flow with a full ledger', 'One shared stock pool across channels', 'Automated negotiation from your supplier quotes', 'GSTIN format validation',
]

function CapabilityStrip() {
  const row = (hidden: boolean) => (
    <ul className="lp-marquee-row" aria-hidden={hidden} aria-label={hidden ? undefined : 'What EcomMind can do'}>
      {CAPABILITIES.map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
  return (
    <div className="lp-marquee">
      <div className="lp-marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}

function Audience() {
  return (
    <section className="lp-section" aria-labelledby="audience-title">
      <SectionDecor items={AUDIENCE_DECOR} />
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">Who it&apos;s for</p>
          <h2 id="audience-title" className="lp-heading">Built for the people growing India&apos;s <span className="lp-accent">online businesses.</span></h2>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {AUDIENCES.map((a, i) => (
            <Reveal key={a.title} index={i} className="lp-surface p-6 sm:p-7">
              <a.icon className="h-7 w-7 text-brand-soft" strokeWidth={1.5} aria-hidden />
              <h3 className="mt-5 text-lg font-bold tracking-tight">{a.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Everything below the hero, split into its own chunk so the first screen stays light. */
export default function Sections() {
  return (
    <>
      <CapabilityStrip />
      <HowItWorks />
      <DeferredLivePreview />
      <Features />
      <Autonomy />
      <Audience />
      <Faq />
      <FinalCta />
    </>
  )
}
