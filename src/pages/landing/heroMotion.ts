import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Smoothed pointer position, handed to every first-screen effect once per animation frame. */
export interface HeroFrame {
  x: number
  y: number
  /** Position across the viewport, -1 to 1. */
  nx: number
  ny: number
  /** No precise pointer here, so the position drifts on its own. */
  touch: boolean
  hasPointer: boolean
}

const SMOOTHING = 0.09
const LIVE_ATTR = 'data-lp-hero-live'
const HIDDEN_ATTR = 'data-lp-tab-hidden'

const clamp = (value: number) => Math.max(-1, Math.min(1, value))

const listeners = new Set<(frame: HeroFrame) => void>()
const target = { x: 0, y: 0 }
const frame: HeroFrame = { x: 0, y: 0, nx: 0, ny: 0, touch: false, hasPointer: false }
let raf = 0
let live = false

function tick(now: number) {
  raf = 0
  const halfW = window.innerWidth / 2
  const halfH = window.innerHeight / 2
  if (frame.touch) {
    target.x = halfW + Math.sin(now / 3400) * halfW * 0.6
    target.y = halfH + Math.cos(now / 4600) * halfH * 0.5
  }
  frame.x += (target.x - frame.x) * SMOOTHING
  frame.y += (target.y - frame.y) * SMOOTHING
  frame.nx = clamp((frame.x - halfW) / halfW)
  frame.ny = clamp((frame.y - halfH) / halfH)
  listeners.forEach((listener) => listener(frame))
  // A resting mouse costs nothing: the loop sleeps until the pointer moves again.
  if (frame.touch || Math.abs(target.x - frame.x) > 0.1 || Math.abs(target.y - frame.y) > 0.1) schedule()
}

function schedule() {
  if (!raf && live && listeners.size) raf = requestAnimationFrame(tick)
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  target.x = event.clientX
  target.y = event.clientY
  frame.hasPointer = true
  schedule()
}

function subscribe(listener: (frame: HeroFrame) => void) {
  if (listeners.size === 0) {
    frame.touch = !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    target.x = frame.x = window.innerWidth / 2
    target.y = frame.y = window.innerHeight / 2
    window.addEventListener('pointermove', onPointerMove, { passive: true })
  }
  listeners.add(listener)
  schedule()
  return () => {
    listeners.delete(listener)
    if (listeners.size) return
    window.removeEventListener('pointermove', onPointerMove)
    cancelAnimationFrame(raf)
    raf = 0
  }
}

function setLive(next: boolean) {
  live = next
  if (next) document.documentElement.setAttribute(LIVE_ATTR, '')
  else document.documentElement.removeAttribute(LIVE_ATTR)
  if (next) schedule()
  else {
    cancelAnimationFrame(raf)
    raf = 0
  }
}

/** Calls `listener` every frame while the hero is on screen and the tab is showing. */
export function useHeroFrame(listener: (frame: HeroFrame) => void, enabled: boolean) {
  const latest = useRef(listener)
  useLayoutEffect(() => { latest.current = listener })
  useEffect(() => {
    if (!enabled) return
    return subscribe((f) => latest.current(f))
  }, [enabled])
}

/** Tracks whether the hero is on screen in a visible tab, and pauses its effects when it isn't. */
export function useHeroLive(ref: RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(true)
  const [tabVisible, setTabVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    io.observe(el)
    const onVisibility = () => {
      const visible = document.visibilityState === 'visible'
      setTabVisible(visible)
      if (visible) document.documentElement.removeAttribute(HIDDEN_ATTR)
      else document.documentElement.setAttribute(HIDDEN_ATTR, '')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      document.documentElement.removeAttribute(HIDDEN_ATTR)
    }
  }, [ref])
  const heroLive = onScreen && tabVisible
  useEffect(() => {
    setLive(heroLive)
    return () => setLive(false)
  }, [heroLive])
  return heroLive
}

/** A cached viewport-space centre for `ref`, measured again only after a scroll or resize. */
export function useCenterOf(ref: RefObject<HTMLElement | null>) {
  const center = useRef({ x: 0, y: 0 })
  const dirty = useRef(true)
  useEffect(() => {
    const mark = () => { dirty.current = true }
    window.addEventListener('scroll', mark, { passive: true })
    window.addEventListener('resize', mark, { passive: true })
    return () => {
      window.removeEventListener('scroll', mark)
      window.removeEventListener('resize', mark)
    }
  }, [])
  return () => {
    if (dirty.current && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      center.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      dirty.current = false
    }
    return center.current
  }
}

/** False while the full-screen logo intro is still covering the page. */
export function useIntroCleared() {
  const [cleared, setCleared] = useState(() => !document.getElementById('intro-splash'))
  useEffect(() => {
    if (cleared) return
    const onDone = () => setCleared(true)
    window.addEventListener('ecommind:intro-done', onDone, { once: true })
    return () => window.removeEventListener('ecommind:intro-done', onDone)
  }, [cleared])
  return cleared
}
