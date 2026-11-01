/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const REVEAL_THRESHOLD = 0.2
export const STAGGER_MS = 80

/** One observer for the whole page: elements register, reveal once, and are dropped. */
let sharedObserver: IntersectionObserver | null = null
const pending = new Set<Element>()

function observer() {
  sharedObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('is-visible')
      release(entry.target)
    }
  }, { threshold: REVEAL_THRESHOLD })
  return sharedObserver
}

function release(el: Element) {
  sharedObserver?.unobserve(el)
  pending.delete(el)
  if (pending.size === 0) {
    sharedObserver?.disconnect()
    sharedObserver = null
  }
}

/** Reveals `el` the first time it scrolls in. Returns the cleanup for an effect. */
export function observeReveal(el: Element) {
  if (typeof IntersectionObserver === 'undefined') {
    el.classList.add('is-visible')
    return () => {}
  }
  pending.add(el)
  observer().observe(el)
  return () => release(el)
}

interface RevealProps {
  as?: ElementType
  /** Position within its row; each step adds a short delay. */
  index?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** Fades and lifts its content in as it enters the viewport (see .lp-reveal in landing.css). */
export function Reveal({ as: Tag = 'div', index = 0, className, style, children }: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (ref.current) return observeReveal(ref.current)
  }, [])
  return (
    <Tag ref={ref} className={cn('lp-reveal', className)} style={{ '--lp-delay': `${index * STAGGER_MS}ms`, ...style } as CSSProperties}>
      {children}
    </Tag>
  )
}
