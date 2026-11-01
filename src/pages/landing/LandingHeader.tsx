import { useState, type RefObject } from 'react'
import { useMotionValueEvent, useScroll } from 'framer-motion'
import markSvg from '@/assets/brand/ecommind-mark.svg?raw'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cx } from '@/lib/format'
import { useIntroCleared } from './heroMotion'

const SHRINK_AT_PX = 24

interface LandingHeaderProps {
  buttonRef: RefObject<HTMLButtonElement | null>
  onSignIn: (from: HTMLElement) => void
}

/**
 * Keeps one fixed height so the page never shifts: the brand shrinks with transforms, and the
 * blurred backing only fades in after scrolling. The mark is the brand SVG file itself, inlined
 * unchanged so its own bars and arrow can animate.
 */
export default function LandingHeader({ buttonRef, onSignIn }: LandingHeaderProps) {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(() => window.scrollY > SHRINK_AT_PX)
  const playing = useIntroCleared()
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > SHRINK_AT_PX))

  return (
    <header className="lp-header" data-scrolled={scrolled}>
      <div className="lp-container lp-header-inner">
        <div className="lp-brand">
          <div className="lp-brand-slot">
            <span className="lp-brand-glow" aria-hidden />
            <span className={cx('lp-mark', playing && 'is-playing')} aria-hidden dangerouslySetInnerHTML={{ __html: markSvg }} />
          </div>
          <div className="lp-brand-text">
            <p className="lp-brand-name font-heading">EcomMind</p>
            <p className="lp-brand-sub">Autonomous Economy</p>
          </div>
        </div>
        <div className="lp-header-actions">
          {/* Keeps the focus ring for keyboard users only; the menu refocuses the button after a mouse pick too. */}
          <div
            onPointerDownCapture={(e) => { e.currentTarget.dataset.pointer = 'true' }}
            onKeyDownCapture={(e) => { delete e.currentTarget.dataset.pointer }}
          >
            <ThemeToggle className="lp-theme-toggle" />
          </div>
          <button ref={buttonRef} type="button" className="lp-header-cta" onClick={(e) => onSignIn(e.currentTarget)}>
            Sign in / Create account
          </button>
        </div>
      </div>
    </header>
  )
}
