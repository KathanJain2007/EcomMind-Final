import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useHeroFrame } from './heroMotion'

const SPOTLIGHT_SIZE = 720

/** Blobs that lean toward the pointer, and a soft violet spotlight that follows it. */
export default function HeroAmbient() {
  const reduceMotion = useReducedMotion()
  const { scrollY } = useScroll()
  const blobShift = useTransform(scrollY, [0, 1200], [0, reduceMotion ? 0 : -140])
  const blobs = useRef<(HTMLSpanElement | null)[]>([])
  const spotlight = useRef<HTMLDivElement>(null)

  useHeroFrame((frame) => {
    // `translate` is separate from the `transform` the floating keyframes animate.
    blobs.current.forEach((blob, i) => {
      if (!blob) return
      const reach = [34, 26, 18][i]
      blob.style.translate = `${frame.nx * reach}px ${frame.ny * reach}px`
    })
    if (!spotlight.current) return
    spotlight.current.style.transform = `translate3d(${frame.x - SPOTLIGHT_SIZE / 2}px, ${frame.y - SPOTLIGHT_SIZE / 2}px, 0)`
    spotlight.current.classList.toggle('is-on', frame.hasPointer || frame.touch)
  }, !reduceMotion)

  return (
    <div className="lp-ambient" aria-hidden>
      {!reduceMotion && <div ref={spotlight} className="lp-spotlight" style={{ width: SPOTLIGHT_SIZE, height: SPOTLIGHT_SIZE }} />}
      <motion.div className="lp-blobs" style={{ y: blobShift }}>
        {['a', 'b', 'c'].map((name, i) => (
          <span key={name} ref={(el) => { blobs.current[i] = el }} className={`lp-blob lp-blob-${name}`} />
        ))}
      </motion.div>
    </div>
  )
}
