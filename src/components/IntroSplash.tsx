import { useCallback, useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import landscapeSrc from '@/assets/intro/ecommind-intro-landscape.mp4'
import portraitSrc from '@/assets/intro/ecommind-intro-portrait.mp4'

// Also read by the inline boot script in index.html.
const PLAYED_KEY = 'ecommind-intro-played'
const START_TIMEOUT_MS = 2500 // slow connection: don't hold people on a blank screen
const MAX_DURATION_MS = 9000 // covers a stall part-way through
const FADE_MS = 500

function shouldPlayIntro() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try {
    return !sessionStorage.getItem(PLAYED_KEY)
  } catch {
    return true
  }
}

/** Full-screen logo intro, shown once per browser tab session over the already-mounting app. */
export default function IntroSplash() {
  const [phase, setPhase] = useState<'playing' | 'leaving' | 'done'>(() => (shouldPlayIntro() ? 'playing' : 'done'))
  const [src] = useState(() => (window.matchMedia('(orientation: portrait)').matches ? portraitSrc : landscapeSrc))
  const [muted, setMuted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const startedRef = useRef(false)

  const leave = useCallback(() => setPhase(p => (p === 'playing' ? 'leaving' : p)), [])

  useEffect(() => {
    document.getElementById('intro-boot')?.remove()
  }, [])

  useEffect(() => {
    if (phase !== 'playing') return
    let startTimer = 0
    let maxTimer = 0
    // A tab opened in the background waits, so the visitor still gets the intro on arriving.
    let begun = false
    const begin = () => {
      if (document.visibilityState !== 'visible') return
      if (begun) {
        const video = videoRef.current
        if (video?.paused && !video.ended) video.play().catch(leave)
        return
      }
      begun = true
      try {
        sessionStorage.setItem(PLAYED_KEY, '1')
      } catch {
        // Private mode: the intro simply plays again next load.
      }
      const video = videoRef.current
      if (video) {
        // Browsers only allow sound on autoplay for sites the visitor already engages with.
        video.muted = false
        video.play().catch(() => {
          video.muted = true
          setMuted(true)
          return video.play().catch(leave)
        })
      }
      startTimer = window.setTimeout(() => {
        if (!startedRef.current) leave()
      }, START_TIMEOUT_MS)
      maxTimer = window.setTimeout(leave, MAX_DURATION_MS)
    }
    document.addEventListener('visibilitychange', begin)
    begin()
    return () => {
      document.removeEventListener('visibilitychange', begin)
      window.clearTimeout(startTimer)
      window.clearTimeout(maxTimer)
    }
  }, [phase, leave])

  useEffect(() => {
    if (phase !== 'leaving') return
    const timer = window.setTimeout(() => {
      setPhase('done')
      window.dispatchEvent(new Event('ecommind:intro-done'))
    }, FADE_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (phase === 'done') return null

  const toggleSound = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-white transition-opacity ease-out"
      style={{ opacity: phase === 'leaving' ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
      id="intro-splash"
    >
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full object-contain"
        playsInline
        preload="auto"
        aria-label="EcomMind logo intro"
        onPlaying={() => { startedRef.current = true }}
        onEnded={leave}
        onError={leave}
      />
      <div className="absolute right-4 bottom-4 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? 'Turn intro sound on' : 'Turn intro sound off'}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#0B2A8A]/20 bg-white/80 text-[#0B2A8A] transition-colors hover:bg-[#0B2A8A]/10 focus-visible:ring-2 focus-visible:ring-[#1E5BEF] focus-visible:outline-none"
        >
          {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={leave}
          className="h-9 rounded-full border border-[#0B2A8A]/20 bg-white/80 px-4 text-sm font-medium text-[#0B2A8A] transition-colors hover:bg-[#0B2A8A]/10 focus-visible:ring-2 focus-visible:ring-[#1E5BEF] focus-visible:outline-none"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
