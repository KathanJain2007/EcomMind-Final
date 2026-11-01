import { useEffect, useRef, type CSSProperties } from 'react'
import { Bot, Eye, SlidersHorizontal, Upload } from 'lucide-react'
import { SectionDecor, type SectionDecorItem } from './BackgroundDecor'
import { observeReveal, Reveal, STAGGER_MS } from './Reveal'

const STEPS = [
  { icon: Upload, title: 'Add your business', text: 'Upload products, sales, returns and supplier quotations using CSV or Excel. Every row is validated and skipped rows are explained.' },
  { icon: SlidersHorizontal, title: 'Set the rules', text: 'Choose budgets, margin floors and the level of freedom granted to AI.' },
  { icon: Bot, title: 'Let the agents work', text: 'Specialist agents forecast demand, suggest prices, assess return risks and compare couriers.' },
  { icon: Eye, title: 'Stay in charge', text: 'Review recommendations, approve actions and inspect the complete activity log.' },
]

const DECOR: SectionDecorItem[] = [
  { kind: 'bars', style: { top: '4rem', right: '5%' } },
  { kind: 'coin', style: { top: '10rem', right: '17%' } },
  { kind: 'plus', style: { top: '5rem', right: '21%' } },
]

export default function HowItWorks() {
  const timeline = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (timeline.current) return observeReveal(timeline.current)
  }, [])

  return (
    <section id="how-it-works" className="lp-section" aria-labelledby="how-title">
      <SectionDecor items={DECOR} />
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">How it works</p>
          <h2 id="how-title" className="lp-heading">From your data to better decisions in <span className="lp-accent">four steps.</span></h2>
        </Reveal>

        <div ref={timeline} className="lp-timeline">
          <span className="lp-timeline-track" aria-hidden />
          <span className="lp-timeline-fill" aria-hidden />
          <span className="lp-timeline-pulse" aria-hidden><span /></span>
          <ol className="lp-timeline-steps">
            {STEPS.map((step, i) => (
              <li key={step.title} className="lp-step lp-step-in" style={{ '--lp-delay': `${150 + i * STAGGER_MS * 3}ms` } as CSSProperties}>
                <div className="lp-step-node"><step.icon className="h-5 w-5" aria-hidden /></div>
                <div className="lp-step-body">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground">Step {i + 1}</p>
                    <h3 className="mt-1 text-lg font-bold tracking-tight">{step.title}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:mt-0 lg:mt-2">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
