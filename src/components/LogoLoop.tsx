import { useEffect, useRef, useState } from 'react'
import introSrc from '@/assets/intro/ecommind-intro-landscape.mp4'
import { cn } from '@/lib/utils'

const HOLD_MS = 2500 // the finished logo rests on screen between runs
const FADE_MS = 350
const FINAL_FRAME_S = 4.9

/**
 * The logo animation running silently on a loop. Give it a white container: the video's own
 * background is white, so the logo's colours stay exact and no edge shows.
 */
export default function LogoLoop({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const timers = useRef<number[]>([])
  const [faded, setFaded] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const showFinalFrame = () => {
      video.pause()
      video.currentTime = FINAL_FRAME_S
    }
    let running = false
    const play = () =>
      video.play().catch(() => {
        // Hidden tabs refuse playback, which onVisible recovers from. A refusal while visible
        // means autoplay really is off (e.g. Low Power Mode), so settle on the finished logo.
        if (document.visibilityState !== 'visible') return
        running = false
        showFinalFrame()
      })
    const start = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return showFinalFrame()
      // React doesn't reflect `muted` as an attribute, and Safari needs it set before play().
      video.muted = true
      running = true
      play()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && running && video.paused && !video.ended) play()
    }
    document.addEventListener('visibilitychange', onVisible)
    // Only fetch once it's actually on screen: the auth brand panel is hidden on phones.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      // Don't run underneath the full-screen intro; pick up the moment it clears.
      if (document.getElementById('intro-splash')) window.addEventListener('ecommind:intro-done', start, { once: true })
      else start()
    })
    observer.observe(video)
    const pending = timers.current
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('ecommind:intro-done', start)
      pending.forEach(window.clearTimeout)
    }
  }, [])

  const restart = () => {
    timers.current.push(
      window.setTimeout(() => setFaded(true), HOLD_MS),
      window.setTimeout(() => {
        const video = videoRef.current
        if (!video) return
        video.currentTime = 0
        video.play().catch(() => {})
        setFaded(false)
      }, HOLD_MS + FADE_MS),
    )
  }

  return (
    <video
      ref={videoRef}
      src={introSrc}
      className={cn(
        'object-contain transition-opacity ease-out',
        className,
      )}
      style={{ opacity: faded ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
      muted
      playsInline
      preload="none"
      aria-hidden
      onEnded={restart}
    />
  )
}
