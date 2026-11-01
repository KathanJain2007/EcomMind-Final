import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowDown } from 'lucide-react'
import { cx } from '@/lib/format'
import { HeroDecor } from './BackgroundDecor'
import HeroChartCard from './HeroChartCard'
import HeroGist from './HeroGist'
import { useCenterOf, useHeroFrame, useHeroLive, useIntroCleared } from './heroMotion'

const EASE = [0.2, 0.7, 0.2, 1] as const
const TITLE = 'EcomMind'
const SCROLL_CUE_DELAY_MS = 3000
const MAGNET_RADIUS_PX = 150
const MAGNET_PULL_PX = 14
const BADGE_REACH_PX = 240
const BADGE_PUSH_PX = 20
const MAX_RIPPLES = 4

const BADGES = ['Amazon', 'Flipkart', 'Meesho', 'Shopify', 'Instagram']

function scrollToHowItWorks() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById('how-it-works')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

/** A plain text label that floats and leans away from the pointer. */
function FloatingBadge({ label, index, enabled }: { label: string; index: number; enabled: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const centerOf = useCenterOf(ref)
  useHeroFrame((frame) => {
    if (!ref.current) return
    const center = centerOf()
    const dx = center.x - frame.x
    const dy = center.y - frame.y
    const distance = Math.hypot(dx, dy) || 1
    const push = Math.max(0, 1 - distance / BADGE_REACH_PX) * BADGE_PUSH_PX
    ref.current.style.transform = `translate3d(${(dx / distance) * push}px, ${(dy / distance) * push}px, 0)`
  }, enabled)
  return (
    <span ref={ref} className={`lp-badge lp-badge-${index}`}>
      <span className="lp-badge-float" style={{ '--i': index } as CSSProperties}>{label}</span>
    </span>
  )
}

/** Soft violet ripples on empty background. Plain DOM, so a click never re-renders the hero. */
function spawnRipple(event: PointerEvent<HTMLElement>, layer: HTMLElement | null) {
  if (!layer || event.button !== 0) return
  if ((event.target as Element).closest('button, a, h1, p, li, svg, video, [data-radix-popper-content-wrapper]')) return
  if (layer.childElementCount >= MAX_RIPPLES) layer.firstElementChild?.remove()
  const rect = layer.getBoundingClientRect()
  const ripple = document.createElement('span')
  ripple.className = 'lp-ripple'
  ripple.style.left = `${event.clientX - rect.left}px`
  ripple.style.top = `${event.clientY - rect.top}px`
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true })
  layer.appendChild(ripple)
}

export default function Hero() {
  const ready = useIntroCleared()
  const reduceMotion = !!useReducedMotion()
  const motionEnabled = !reduceMotion
  const section = useRef<HTMLElement>(null)
  const rippleLayer = useRef<HTMLDivElement>(null)
  const magnet = useRef<HTMLDivElement>(null)
  const magnetAnchor = useRef<HTMLDivElement>(null)
  const anchorCenter = useCenterOf(magnetAnchor)
  const live = useHeroLive(section)
  const [exploreClicked, setExploreClicked] = useState(false)
  const [cueDue, setCueDue] = useState(false)
  const [hasScrolled, setHasScrolled] = useState(() => window.scrollY > 0)

  const { scrollY } = useScroll()
  const drift = useTransform(scrollY, [0, 700], [0, reduceMotion ? 0 : 70])
  const fade = useTransform(scrollY, [0, 600], [1, reduceMotion ? 1 : 0.25])
  useMotionValueEvent(scrollY, 'change', (y) => { if (y > 0) setHasScrolled(true) })

  useEffect(() => {
    if (!ready || hasScrolled) return
    const timer = window.setTimeout(() => setCueDue(true), SCROLL_CUE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [ready, hasScrolled])

  useHeroFrame((frame) => {
    if (!magnet.current || frame.touch) return
    const center = anchorCenter()
    const dx = frame.x - center.x
    const dy = frame.y - center.y
    const distance = Math.hypot(dx, dy) || 1
    const pull = Math.max(0, 1 - distance / MAGNET_RADIUS_PX) * MAGNET_PULL_PX
    magnet.current.style.transform = `translate3d(${(dx / distance) * pull}px, ${(dy / distance) * pull}px, 0)`
  }, motionEnabled)

  const enter = (order: number) => ({
    initial: { opacity: 0, y: 22 },
    animate: ready ? { opacity: 1, y: 0 } : undefined,
    transition: { duration: 0.75, ease: EASE, delay: 0.08 + order * 0.09 },
  })

  return (
    <section ref={section} className="lp-hero" aria-labelledby="hero-title" onPointerDown={(e) => spawnRipple(e, rippleLayer.current)}>
      <div ref={rippleLayer} className="lp-ripples" aria-hidden />
      <HeroDecor ready={ready} enabled={motionEnabled} />
      {motionEnabled && (
        <div className="lp-badges" aria-hidden>
          {BADGES.map((label, i) => <FloatingBadge key={label} label={label} index={i} enabled={motionEnabled} />)}
        </div>
      )}

      <motion.div className="lp-container relative flex flex-col items-center text-center" style={{ y: drift, opacity: fade }}>
        {/* Above the headline, so a bar's tooltip isn't painted behind the letters. */}
        <motion.div {...enter(0)} className="relative z-10">
          <HeroChartCard motionEnabled={motionEnabled} />
        </motion.div>

        <h1 id="hero-title" aria-label={TITLE} className={cx('lp-hero-title lp-word', ready && 'is-ready')}>
          {[...TITLE].map((letter, i) => (
            <span key={i} className="lp-letter-rise" style={{ '--i': i } as CSSProperties} aria-hidden>
              <span className="lp-letter" data-char={letter}>{letter}</span>
            </span>
          ))}
        </h1>

        <HeroGist enter={enter} cycling={motionEnabled && live && ready} heroRef={section} />

        <motion.p {...enter(5.4)} className="mt-5 text-xs text-muted-foreground sm:text-[13px]">
          Built for sellers on Amazon, Flipkart, Meesho, Shopify &amp; Instagram.
        </motion.p>

        <motion.div {...enter(6.2)} className="mt-7 sm:mt-9">
          <div ref={magnetAnchor}>
            <div ref={magnet} className="lp-magnet">
              {!exploreClicked && motionEnabled && <span className="lp-explore-ring" aria-hidden />}
              <button
                type="button"
                className="lp-explore"
                onClick={() => {
                  setExploreClicked(true)
                  scrollToHowItWorks()
                }}
              >
                <span className="relative z-10">Explore</span>
                <span className="lp-explore-arrow" aria-hidden><ArrowDown className="h-4 w-4" /></span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <div className={cx('lp-scroll-cue', cueDue && !hasScrolled && 'is-visible')} aria-hidden>
        <span className="lp-scroll-cue-mouse"><span className="lp-scroll-cue-wheel" /></span>
        scroll
      </div>
    </section>
  )
}
