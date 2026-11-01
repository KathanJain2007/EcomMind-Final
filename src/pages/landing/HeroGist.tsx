import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { motion } from 'framer-motion'
import { Handshake, ShieldCheck, Sparkles } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cx } from '@/lib/format'

const KEYWORD_INTERVAL_MS = 2400

const CHIPS = [
  { id: 'forecast', icon: Sparkles, label: 'Forecasts Demand', detail: 'Estimates upcoming demand for each product from your sales history, so you can plan restocks before stock runs low.' },
  { id: 'negotiate', icon: Handshake, label: 'Negotiates with Supplier Agents', detail: 'Runs automated negotiation from your supplier quotes, within the budget and margin limits you set.' },
  { id: 'escrow', icon: ShieldCheck, label: 'Pays Through Escrow', detail: 'Uses an escrow-style simulated flow with a full ledger, releasing payment once delivery is confirmed.' },
]

/** Each keyword in the gist, and the chip that lights up with it. "marketplaces" lights the floating badges. */
const KEYWORDS = [
  { word: 'inventory', chip: 'forecast' },
  { word: 'marketplaces', chip: null },
  { word: 'suppliers', chip: 'negotiate' },
  { word: 'escrow', chip: 'escrow' },
]

type EnterProps = (order: number) => Record<string, unknown>

interface HeroGistProps {
  enter: EnterProps
  /** Runs the keyword loop; off when reduced motion is on or the hero isn't showing. */
  cycling: boolean
  heroRef: RefObject<HTMLElement | null>
}

export default function HeroGist({ enter, cycling, heroRef }: HeroGistProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [openChip, setOpenChip] = useState<string | null>(null)
  const active = cycling ? KEYWORDS[activeIndex] : null

  useEffect(() => {
    if (!cycling) return
    const id = window.setInterval(() => setActiveIndex((i) => (i + 1) % KEYWORDS.length), KEYWORD_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [cycling])

  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    hero.toggleAttribute('data-keyword-marketplaces', active?.word === 'marketplaces')
  }, [active, heroRef])

  const keyword = (word: string, children: ReactNode = word) => (
    <span className={cx('lp-keyword', active?.word === word && 'is-active')} data-word={word}>{children}</span>
  )

  return (
    <>
      <motion.p {...enter(2)} className="mt-4 max-w-[38rem] text-[15px] leading-relaxed text-muted-foreground sm:mt-5 sm:text-lg">
        EcomMind is an AI operating system for Indian e-commerce sellers. Manage {keyword('inventory')}, sell across {keyword('marketplaces')}, negotiate with {keyword('suppliers')} and pay safely through {keyword('escrow')}, all in one workspace, within limits you set.
      </motion.p>

      <ul className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:mt-7" aria-label="What EcomMind does">
        {CHIPS.map((chip, i) => (
          <motion.li key={chip.id} {...enter(3 + i * 0.7)}>
            <Popover open={openChip === chip.id} onOpenChange={(next) => setOpenChip(next ? chip.id : null)}>
              <PopoverTrigger asChild>
                <button type="button" className={cx('lp-chip', active?.chip === chip.id && 'is-glowing')}>
                  <chip.icon className="h-3.5 w-3.5 text-brand-soft" aria-hidden />
                  {chip.label}
                </button>
              </PopoverTrigger>
              <PopoverContent sideOffset={8} onOpenAutoFocus={(e) => e.preventDefault()} className="w-64 text-sm leading-relaxed">
                {chip.detail}
              </PopoverContent>
            </Popover>
          </motion.li>
        ))}
      </ul>
    </>
  )
}
