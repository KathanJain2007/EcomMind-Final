import { useEffect, useRef, useState } from 'react'
import { formatCount, type CountFormat } from '@/lib/countFormat'

/**
 * Animated number. Counts from 0 to `value` the first time it scrolls into
 * view, then eases between old and new values when the data changes (for
 * example after a date-filter change). Re-renders with the same value never
 * restart it, and users who prefer reduced motion see the final value at once.
 */


export interface CountUpProps {
  /** Final value. For 'inr' pass rupees, not paise. */
  value: number
  format?: CountFormat
  decimals?: number
  durationMs?: number
  prefix?: string
  suffix?: string
  className?: string
}

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export function CountUp({ value, format = 'number', decimals, durationMs = 1600, prefix = '', suffix = '', className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(() => (reduceMotion() ? value : 0))
  const shown = useRef(reduceMotion() ? value : 0)
  const started = useRef(false)
  const visible = useRef(false)
  const frame = useRef<number | undefined>(undefined)

  // Wait until the number is on screen before the first count.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { visible.current = true; return }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        visible.current = true
        io.disconnect()
        animateTo(value)
      }
    }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Value changes after the first reveal animate from the current number.
  useEffect(() => {
    if (!visible.current) return
    if (!started.current || value !== shown.current) animateTo(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current) }, [])

  function animateTo(target: number) {
    started.current = true
    if (frame.current) cancelAnimationFrame(frame.current)
    if (reduceMotion() || !Number.isFinite(target)) {
      shown.current = target
      setDisplay(target)
      return
    }
    const from = shown.current
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs)
      const v = from + (target - from) * easeOutCubic(t)
      shown.current = v
      setDisplay(v)
      if (t < 1) frame.current = requestAnimationFrame(step)
      else { shown.current = target; setDisplay(target) }
    }
    frame.current = requestAnimationFrame(step)
  }

  return (
    <span ref={ref} className={className} aria-label={`${prefix}${formatCount(value, format, decimals)}${suffix}`}>
      <span aria-hidden>{prefix}{formatCount(display, format, decimals)}{suffix}</span>
    </span>
  )
}
