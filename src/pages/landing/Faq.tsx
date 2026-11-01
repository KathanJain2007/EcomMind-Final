import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { SectionDecor, type SectionDecorItem } from './BackgroundDecor'
import { Reveal } from './Reveal'

const QUESTIONS = [
  {
    q: 'Do I need to connect my marketplace accounts?',
    a: "No. You can upload CSV or Excel files. Direct marketplace connections aren't available yet, so orders are recorded inside EcomMind.",
  },
  {
    q: 'Can I try it without my own data?',
    a: 'Yes. Demo Login opens a sample business called UrbanNest Living.',
  },
  {
    q: 'Will the AI spend money without asking me?',
    a: 'Only inside the limits and autonomy level you choose.',
  },
  {
    q: 'Is real money involved?',
    a: 'Not at the moment. Wallet funds are simulated, though the ledger, escrow and limit checks all run within the application.',
  },
  {
    q: 'What do I need to sign up?',
    a: 'A Gmail address and your business details. GSTIN is optional during registration, but onboarding currently asks for it. EcomMind checks its format, not its registration with the GST portal.',
  },
]

const DECOR: SectionDecorItem[] = [
  { kind: 'spark', style: { top: '21rem', left: '9%' } },
  { kind: 'coin', style: { top: '23rem', left: '25%' } },
  { kind: 'plus', style: { top: '20rem', left: '28%' } },
]

export default function Faq() {
  return (
    <section id="faq" className="lp-section" aria-labelledby="faq-title">
      <SectionDecor items={DECOR} />
      <div className="lp-container grid gap-8 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-4">
          <p className="lp-eyebrow">FAQ</p>
          <h2 id="faq-title" className="lp-heading">Frequently asked <span className="lp-accent">questions.</span></h2>
        </Reveal>
        <Reveal index={1} className="lg:col-span-8">
          <Accordion type="single" collapsible className="lp-faq lp-surface px-5 sm:px-7">
            {QUESTIONS.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}
