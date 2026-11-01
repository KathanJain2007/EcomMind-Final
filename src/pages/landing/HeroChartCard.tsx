import { useEffect, useRef, useState, type CSSProperties } from 'react'
import LogoLoop from '@/components/LogoLoop'
import { formatCount } from '@/lib/countFormat'
import { cx } from '@/lib/format'
import { useHeroFrame } from './heroMotion'
import { sampleChartBars } from './sampleData'

const MAX_TILT_DEG = 7
const VIEW = { x: 112, y: -26, width: 248, height: 296 }
const CARD_ASPECT = 16 / 9

// Same geometry and colours as src/assets/brand/ecommind-mark.svg.
const BARS = [
  { x: 134, y: 168, height: 62, fill: '#7FA8FF' },
  { x: 180, y: 130, height: 100, fill: '#2F6BFF' },
  { x: 226, y: 88, height: 142, fill: '#1A4BDD' },
  { x: 272, y: 46, height: 184, fill: '#0B2A8A' },
]
const BAR_WIDTH = 34

/** Where a bar's centre falls across the card, as a percentage of its width. */
function barPercent(barX: number) {
  const fromCentre = barX + BAR_WIDTH / 2 - (VIEW.x + VIEW.width / 2)
  return 50 + (fromCentre / VIEW.height / CARD_ASPECT) * 100
}

/**
 * The logo video keeps playing in the card. A video has no bars to hover, so pointing at the card
 * (or tabbing to a bar) fades in the same chart as live SVG, with sample values on each bar.
 */
export default function HeroChartCard({ motionEnabled }: { motionEnabled: boolean }) {
  const tilt = useRef<HTMLDivElement>(null)
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const [tapped, setTapped] = useState(false)
  const [activeBar, setActiveBar] = useState<number | null>(null)
  const [values] = useState(() => sampleChartBars(BARS.map((bar) => bar.height)))
  const open = hovering || focused || tapped

  // LogoLoop seeks to its finished frame under reduced motion, but with preload="none" a video
  // that never plays never fetches that frame, leaving the card blank.
  useEffect(() => {
    if (motionEnabled) return
    const video = tilt.current?.querySelector('video')
    if (video) video.preload = 'auto'
  }, [motionEnabled])

  useHeroFrame((frame) => {
    if (!tilt.current) return
    const strength = frame.touch ? MAX_TILT_DEG * 0.5 : MAX_TILT_DEG
    tilt.current.style.transform = `rotateX(${-frame.ny * strength}deg) rotateY(${frame.nx * strength}deg)`
  }, motionEnabled)

  return (
    <div className="lp-card-stage">
      <div
        ref={tilt}
        className={cx('lp-card-tilt', open && 'is-open')}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHovering(true) }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return
          setHovering(false)
          setActiveBar(null)
        }}
        onClick={(e) => {
          // Touch has no hover: a tap on the card toggles the chart, a tap on a bar picks that bar.
          if (!matchMedia('(hover: none)').matches) return
          if (!(e.target as Element).closest('.lp-chart-hit')) setTapped((t) => !t)
        }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (e.currentTarget.contains(e.relatedTarget)) return
          setFocused(false)
          setActiveBar(null)
        }}
      >
        {/* Turns the video's white background transparent, so the logo sits directly on the page. */}
        <svg width="0" height="0" className="absolute" aria-hidden>
          <filter id="lp-white-key" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1.6 -1.6 -1.6 4.8 -0.4" />
          </filter>
          {/* Same, plus lighter blues: the logo's navy can't be read directly on a dark page. */}
          <filter id="lp-white-key-dark" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0.8 0 0 0 0.35  0 0.8 0 0 0.45  0 0 0.6 0 0.65  -1.6 -1.6 -1.6 4.8 -0.4" />
          </filter>
        </svg>
        <div className="lp-hero-logo">
          <LogoLoop className="h-full w-full" />
          <svg className="lp-chart" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`} role="group" aria-label="Sample chart. Every value is sample data.">
            <defs>
              <linearGradient id="lp-chart-trend" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#0B2A8A" />
                <stop offset="1" stopColor="#1E7BFF" />
              </linearGradient>
            </defs>
            <path d="M136 258H318" stroke="#0B2A8A" strokeWidth="10" strokeLinecap="round" />
            {BARS.map((bar, i) => (
              <rect key={bar.x} className="lp-chart-bar" style={{ '--i': i } as CSSProperties} x={bar.x} y={bar.y} width={BAR_WIDTH} height={bar.height} rx="5" fill={bar.fill} />
            ))}
            <path className="lp-chart-trend" d="M118 148C190 134 270 86 332 8" pathLength={1} fill="none" stroke="url(#lp-chart-trend)" strokeWidth="13" strokeLinecap="round" />
            <path className="lp-chart-head" d="M292 0L350 -14L340 46Z" fill="#1E7BFF" stroke="#1E7BFF" strokeWidth="6" strokeLinejoin="round" />
            {BARS.map((bar, i) => (
              <circle key={bar.x} className="lp-chart-dot" style={{ '--i': i } as CSSProperties} cx={bar.x + BAR_WIDTH / 2} cy={bar.y} r="8" fill="#fff" stroke={bar.fill} strokeWidth="5" />
            ))}
            {BARS.map((bar, i) => (
              <rect
                key={bar.x}
                className="lp-chart-hit"
                x={bar.x - 6}
                y={VIEW.y}
                width={BAR_WIDTH + 12}
                height={VIEW.height}
                rx="8"
                tabIndex={0}
                role="img"
                aria-label={`${values[i].label}: ${formatCount(values[i].value, 'inr')}. Sample data.`}
                onPointerEnter={() => setActiveBar(i)}
                onFocus={() => setActiveBar(i)}
                onClick={() => setActiveBar(i)}
              />
            ))}
          </svg>
        </div>
        {open && activeBar !== null && (
          <div className="lp-chart-tip" style={{ left: `${barPercent(BARS[activeBar].x)}%` }} aria-hidden>
            <span className="font-semibold">{values[activeBar].label}: {formatCount(values[activeBar].value, 'inr')}</span>
            <span className="lp-chart-tip-note">Sample data</span>
          </div>
        )}
      </div>
    </div>
  )
}
