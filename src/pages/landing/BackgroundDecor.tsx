import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { cx } from '@/lib/format'
import { useHeroFrame } from './heroMotion'
import { observeReveal } from './Reveal'

/** Finance shapes for the page background. Purely decorative, and none of them shows a number. */

function Coin({ small }: { small?: boolean }) {
  return <span className={cx('lp-obj-coin', small && 'lp-obj-coin-small')}><span>₹</span></span>
}

function PercentBadge() {
  return <span className="lp-obj-coin lp-obj-percent"><span>%</span></span>
}

function ArrowTile() {
  return <span className="lp-obj-arrow"><TrendingUp strokeWidth={2.4} /></span>
}

function ProfitPill() {
  return (
    <span className="lp-obj-glass lp-obj-profit">
      <span className="lp-obj-profit-icon"><TrendingUp strokeWidth={2.6} /></span>
      Profit
    </span>
  )
}

function SparkCard() {
  return (
    <span className="lp-obj-glass lp-obj-spark">
      <span className="lp-obj-spark-head">
        <span className="lp-obj-spark-rupee">₹</span>
        <span className="lp-obj-skeleton" />
      </span>
      <svg viewBox="0 0 160 60" preserveAspectRatio="none">
        <path d="M0 50C22 46 30 30 52 32S88 46 106 28 138 10 160 6V60H0Z" fill="url(#lp-decor-fill)" />
        <path d="M0 50C22 46 30 30 52 32S88 46 106 28 138 10 160 6" fill="none" stroke="url(#lp-decor-line)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  )
}

function BarsTile() {
  return (
    <span className="lp-obj-glass lp-obj-bars">
      {[0.42, 0.62, 0.8, 1].map((height, i) => (
        <span key={height} style={{ '--h': height, '--b': i } as CSSProperties} />
      ))}
    </span>
  )
}

function Donut() {
  return (
    <span className="lp-obj-glass lp-obj-donut">
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="24" fill="none" stroke="rgb(123 47 224 / 0.12)" strokeWidth="8" />
        <circle cx="32" cy="32" r="24" fill="none" stroke="url(#lp-decor-line)" strokeWidth="8" strokeLinecap="round" strokeDasharray="96 151" />
        <circle cx="32" cy="32" r="24" fill="none" stroke="#14b8a0" strokeWidth="8" strokeLinecap="round" strokeDasharray="28 151" strokeDashoffset="-108" />
      </svg>
      <span>₹</span>
    </span>
  )
}

const VISUALS: Record<string, () => ReactNode> = {
  coin: () => <Coin />,
  coinSmall: () => <Coin small />,
  percent: () => <PercentBadge />,
  arrow: () => <ArrowTile />,
  profit: () => <ProfitPill />,
  spark: () => <SparkCard />,
  bars: () => <BarsTile />,
  donut: () => <Donut />,
  plus: () => <span className="lp-obj-plus">+</span>,
}

/** Shared gradients, referenced by id from the shapes above. */
export function DecorDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id="lp-decor-line" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7b2fe0" />
          <stop offset="1" stopColor="#1e7bff" />
        </linearGradient>
        <linearGradient id="lp-decor-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7b2fe0" stopOpacity="0.28" />
          <stop offset="1" stopColor="#1e7bff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

interface HeroObject {
  kind: string
  position: string
  /** How far it leans with the pointer; nearer objects move more. */
  depth: number
  near?: boolean
}

const HERO_OBJECTS: HeroObject[] = [
  { kind: 'spark', position: 'lp-at-spark', depth: 10, near: true },
  { kind: 'coin', position: 'lp-at-coin', depth: 14, near: true },
  { kind: 'bars', position: 'lp-at-bars', depth: 8 },
  { kind: 'percent', position: 'lp-at-percent', depth: 6 },
  { kind: 'profit', position: 'lp-at-profit', depth: 10, near: true },
  { kind: 'donut', position: 'lp-at-donut', depth: 8 },
  { kind: 'arrow', position: 'lp-at-arrow', depth: 12, near: true },
  { kind: 'coinSmall', position: 'lp-at-coin-small', depth: 6 },
  { kind: 'plus', position: 'lp-at-plus-a', depth: 5 },
]

export function HeroDecor({ ready, enabled }: { ready: boolean; enabled: boolean }) {
  const objects = useRef<(HTMLSpanElement | null)[]>([])
  const { scrollY } = useScroll()
  const nearShift = useTransform(scrollY, [0, 900], [0, enabled ? -70 : 0])
  const farShift = useTransform(scrollY, [0, 900], [0, enabled ? -30 : 0])

  useHeroFrame((frame) => {
    objects.current.forEach((el, i) => {
      if (!el) return
      const depth = HERO_OBJECTS[i].depth
      el.style.translate = `${-frame.nx * depth}px ${-frame.ny * depth}px`
    })
  }, enabled)

  const render = (near: boolean) => HERO_OBJECTS.map((object, i) => {
    if (!!object.near !== near) return null
    return (
      <span
        key={object.position}
        ref={(el) => { objects.current[i] = el }}
        className={cx('lp-obj', object.position)}
        style={{ '--d': i } as CSSProperties}
      >
        {VISUALS[object.kind]()}
      </span>
    )
  })

  return (
    <div className={cx('lp-decor lp-decor-hero', ready && 'is-ready')} aria-hidden>
      <motion.div className="lp-decor-layer" style={{ y: farShift }}>{render(false)}</motion.div>
      <motion.div className="lp-decor-layer" style={{ y: nearShift }}>{render(true)}</motion.div>
    </div>
  )
}

export interface SectionDecorItem {
  kind: string
  style: CSSProperties
}

/** Fills the empty side of a section. Objects appear as it scrolls in and drift with the scroll. */
export function SectionDecor({ items, onDark }: { items: SectionDecorItem[]; onDark?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: root, offset: ['start end', 'end start'] })
  const shift = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [24, -24])

  useEffect(() => {
    const el = root.current
    if (!el) return
    const stopReveal = observeReveal(el)
    // Floating stops while the section is off screen.
    const io = new IntersectionObserver(([entry]) => el.classList.toggle('is-paused', !entry.isIntersecting))
    io.observe(el)
    return () => {
      stopReveal()
      io.disconnect()
    }
  }, [])

  return (
    <div ref={root} className={cx('lp-decor lp-decor-section', onDark && 'is-on-dark')} aria-hidden>
      <motion.div className="lp-decor-layer" style={{ y: shift }}>
        {items.map((item, i) => (
          <span key={i} className="lp-obj lp-obj-wide-only" style={{ '--d': i, ...item.style } as CSSProperties}>
            {VISUALS[item.kind]()}
          </span>
        ))}
      </motion.div>
    </div>
  )
}
