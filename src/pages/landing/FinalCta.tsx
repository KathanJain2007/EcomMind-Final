import { Play } from 'lucide-react'
import BrandMark from '@/components/BrandMark'
import { useAuthCta } from './authCta'
import { SectionDecor, type SectionDecorItem } from './BackgroundDecor'
import { Reveal } from './Reveal'

const DECOR: SectionDecorItem[] = [
  { kind: 'coin', style: { top: '17rem', left: '7%' } },
  { kind: 'plus', style: { top: '19rem', left: '19%' } },
  { kind: 'arrow', style: { top: '19rem', right: '8%' } },
  { kind: 'profit', style: { top: '28rem', right: '5%' } },
  { kind: 'plus', style: { top: '27rem', right: '21%' } },
]

export default function FinalCta() {
  const openAuth = useAuthCta()
  return (
    <section className="lp-final" aria-labelledby="final-title">
      <SectionDecor items={DECOR} onDark />
      <div className="lp-container relative">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 id="final-title" className="text-[clamp(2rem,5.4vw,3.75rem)] leading-[1.08] font-extrabold tracking-[-0.035em] text-white">
            See what your business looks like with an AI agent on your team.
          </h2>
          <p className="mt-5 text-base text-white/85 sm:text-lg">Explore the full product with sample data. No setup needed.</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button type="button" className="lp-final-btn lp-final-btn-primary w-full sm:w-auto" onClick={(e) => openAuth('demo', e.currentTarget)}>
              <Play className="h-4 w-4" aria-hidden /> Try the Live Demo
            </button>
            <button type="button" className="lp-final-btn lp-final-btn-secondary w-full sm:w-auto" onClick={(e) => openAuth('register', e.currentTarget)}>
              Create Free Account
            </button>
          </div>
        </Reveal>

        <footer className="mt-24 flex flex-col items-center justify-between gap-4 border-t border-white/15 py-7 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8" />
            <div>
              <p className="font-heading text-sm font-bold">EcomMind</p>
              <p className="text-[9px] font-medium tracking-widest text-white/70 uppercase">Autonomous Economy</p>
            </div>
          </div>
          <p className="max-w-md text-xs text-white/70">Figures on this page are generated samples. Wallet and escrow funds in EcomMind are simulated.</p>
        </footer>
      </div>
    </section>
  )
}
