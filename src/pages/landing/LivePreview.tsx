import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { Area, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Check } from 'lucide-react'
import { CountUp } from '@/components/CountUp'
import { formatCount } from '@/lib/countFormat'
import { cx } from '@/lib/format'
import { SectionDecor, type SectionDecorItem } from './BackgroundDecor'
import { Reveal } from './Reveal'
import {
  createActivityStream, createStockStream, createTrafficStream, ESCROW_STAGES, initialStock, initialTraffic, isLowStock,
  LOW_STOCK_DAYS, ORDERS_RANGE, REVENUE_RANGE, sampleKpis, STREAM_INTERVAL_MS, VISIBLE_POINTS,
} from './sampleData'

const STOCK_INTERVAL_MS = 3200
const ACTIVITY_INTERVAL_MS = 2800
const ESCROW_INTERVAL_MS = 2400
const ACTIVITY_ROWS = 5
const STOCK_SCALE_MAX = 32

// The track is wider than its window: one extra interval scrolls in per tick, and a further
// point stays out of sight so the curve's last visible segment doesn't change shape.
const VISIBLE_INTERVALS = VISIBLE_POINTS - 1
const TRACK_INTERVALS = VISIBLE_INTERVALS + 2

const DECOR: SectionDecorItem[] = [
  { kind: 'profit', style: { top: '5rem', right: '6%' } },
  { kind: 'spark', style: { top: '9.5rem', right: '12%' } },
  { kind: 'plus', style: { top: '6rem', right: '26%' } },
]

/** True only while the panel is on screen and the tab is showing. */
function useLiveActive(ref: RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(false)
  const [tabVisible, setTabVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    io.observe(el)
    const onVisibility = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ref])
  return onScreen && tabVisible
}

/** Runs `tick` on an interval while `active`; the timer is gone the moment it isn't. */
function useTicker(tick: () => void, ms: number, active: boolean) {
  const latest = useRef(tick)
  useEffect(() => { latest.current = tick })
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => latest.current(), ms)
    return () => window.clearInterval(id)
  }, [ms, active])
}

interface LiveProps {
  live: boolean
}

const TrafficChart = memo(function TrafficChart({ live, animated }: LiveProps & { animated: boolean }) {
  const [stream] = useState(() => createTrafficStream())
  const [points, setPoints] = useState(() => initialTraffic(stream, TRACK_INTERVALS + 1))
  const track = useRef<HTMLDivElement>(null)
  const scroll = useRef<Animation | null>(null)

  // The compositor slides the track one interval; at the end the data shifts in the same frame.
  useEffect(() => {
    if (!animated || !track.current?.animate) return
    const animation = track.current.animate(
      [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(-${100 / TRACK_INTERVALS}%, 0, 0)` }],
      { duration: STREAM_INTERVAL_MS, easing: 'linear', fill: 'forwards' },
    )
    animation.pause()
    animation.onfinish = () => {
      flushSync(() => setPoints((current) => [...current.slice(1), stream()]))
      animation.play()
    }
    scroll.current = animation
    return () => {
      animation.onfinish = null
      animation.cancel()
      scroll.current = null
    }
  }, [animated, stream])

  useEffect(() => {
    if (live) scroll.current?.play()
    else scroll.current?.pause()
  }, [live])

  const latest = points[TRACK_INTERVALS - 2]

  return (
    <div className="lp-tile flex h-full flex-col p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <h3 className="text-sm font-semibold">Revenue and orders</h3>
        <dl className="flex gap-5 text-xs" aria-hidden>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--chart-purple)]" />
            <dt className="text-muted-foreground">Revenue</dt>
            <dd className="tabular font-semibold">{formatCount(latest.revenue, 'inr')}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--chart-teal)]" />
            <dt className="text-muted-foreground">Orders</dt>
            <dd className="tabular font-semibold">{latest.orders}</dd>
          </div>
        </dl>
      </div>
      <div className="lp-stream mt-3" role="img" aria-label="Line chart of generated sample revenue and orders, moving left as new sample points arrive.">
        <div ref={track} className="lp-stream-track" style={{ width: `${(TRACK_INTERVALS / VISIBLE_INTERVALS) * 100}%` }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 0, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="lp-stream-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--chart-purple)" stopOpacity="0.24" />
                  <stop offset="1" stopColor="var(--chart-purple)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <XAxis dataKey="id" hide />
              <YAxis yAxisId="revenue" hide domain={[REVENUE_RANGE.min * 0.85, REVENUE_RANGE.max * 1.04]} />
              <YAxis yAxisId="orders" hide orientation="right" domain={[ORDERS_RANGE.min * 0.6, ORDERS_RANGE.max * 1.08]} />
              <Area yAxisId="revenue" dataKey="revenue" type="monotone" stroke="var(--chart-purple)" strokeWidth={2.25} fill="url(#lp-stream-fill)" dot={false} isAnimationActive={false} />
              <Line yAxisId="orders" dataKey="orders" type="monotone" stroke="var(--chart-teal)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground" aria-hidden>
        <span>Earlier</span>
        <span>{animated ? 'New sample point every 2.5 s' : 'Static sample'}</span>
      </div>
    </div>
  )
})

const StockCoverage = memo(function StockCoverage({ live, animated }: LiveProps & { animated: boolean }) {
  const [stream] = useState(() => createStockStream())
  const [items, setItems] = useState(initialStock)
  const [grown, setGrown] = useState(!animated)

  if (live && !grown) setGrown(true)
  useTicker(() => setItems(stream()), STOCK_INTERVAL_MS, live && animated)

  return (
    <div className="lp-tile h-full p-4 sm:p-5">
      <h3 className="text-sm font-semibold">Inventory stock coverage</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Days of cover. Red means under {LOW_STOCK_DAYS} days.</p>
      <ul className="mt-4 space-y-3.5">
        {items.map((item) => {
          const low = isLowStock(item.days)
          return (
            <li key={item.product}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate">{item.product}</span>
                <span className={cx('tabular shrink-0 font-semibold', low && 'text-danger')}>{item.days.toFixed(1)} days</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="lp-stock-bar" data-low={low} style={{ transform: `scaleX(${grown ? item.days / STOCK_SCALE_MAX : 0})` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
})

const ActivityFeed = memo(function ActivityFeed({ live, animated }: LiveProps & { animated: boolean }) {
  const [stream] = useState(() => createActivityStream())
  const [events, setEvents] = useState(() => Array.from({ length: ACTIVITY_ROWS }, () => stream()).reverse())

  useTicker(() => setEvents((current) => [stream(), ...current.slice(0, ACTIVITY_ROWS - 1)]), ACTIVITY_INTERVAL_MS, live && animated)

  return (
    <div className="lp-tile h-full p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Agent activity</h3>
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><span className="lp-pulse" aria-hidden /> Agents online</span>
      </div>
      <ul className="mt-3 h-[13.75rem] divide-y divide-border/70 overflow-hidden">
        {events.map((event) => (
          <li key={event.id} className="lp-activity-row flex h-11 items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-medium">{event.source}</span>
            <span className="shrink-0 text-muted-foreground">{event.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
})

const EscrowFlow = memo(function EscrowFlow({ live, animated }: LiveProps & { animated: boolean }) {
  const last = ESCROW_STAGES.length - 1
  const [stage, setStage] = useState(animated ? 0 : last)

  useTicker(() => setStage((current) => (current >= last ? 0 : current + 1)), ESCROW_INTERVAL_MS, live && animated)

  return (
    <div className="lp-tile h-full p-4 sm:p-5">
      <h3 className="text-sm font-semibold">Escrow workflow</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Illustration only. Wallet and escrow funds are simulated.</p>
      <div className="lp-escrow-rail mt-5 hidden sm:block" aria-hidden>
        <span style={{ transform: `scaleX(${stage / last})` }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5 sm:gap-3">
        {ESCROW_STAGES.map((label, i) => (
          <li key={label} aria-current={i === stage ? 'step' : undefined} className="flex items-center gap-2.5 sm:flex-col sm:items-start sm:gap-2">
            <span className={cx(
              'lp-escrow-node flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
              i < stage && 'border-brand/30 bg-brand/10 text-brand-soft',
              i === stage && 'border-transparent bg-[#7b2fe0] text-white',
              i > stage && 'border-border text-muted-foreground',
            )}>
              {i < stage ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cx('text-xs leading-snug', i === stage ? 'font-semibold' : 'text-muted-foreground')}>{label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
})

const KpiRow = memo(function KpiRow() {
  const [kpis] = useState(() => sampleKpis())
  const cards = [
    { label: 'Revenue', value: kpis.revenue, format: 'inr' as const },
    { label: 'Orders', value: kpis.orders, format: 'number' as const },
    { label: 'Inventory Value', value: kpis.inventoryValue, format: 'inr' as const },
    { label: 'Estimated Profit', value: kpis.estimatedProfit, format: 'inr' as const },
    { label: 'Active Agents', value: kpis.activeAgents, format: 'number' as const },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {cards.map((card, i) => (
        <div key={card.label} className={cx('lp-tile p-3.5 sm:p-4', i === cards.length - 1 && 'col-span-2 md:col-span-1')}>
          <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {card.label}
            <span className="rounded bg-secondary px-1 py-px text-[10px] font-medium">Sample</span>
          </dt>
          <dd className="tabular mt-1.5 font-heading text-lg font-bold tracking-tight sm:text-xl">
            <CountUp value={card.value} format={card.format} />
          </dd>
        </div>
      ))}
    </dl>
  )
})

/** The moving centrepiece: all generated numbers, paused off screen and in hidden tabs. */
export default function LivePreview() {
  const panel = useRef<HTMLDivElement>(null)
  const live = useLiveActive(panel)
  const reduceMotion = useReducedMotion()
  const animated = !reduceMotion
  const stage = useRef<HTMLDivElement>(null)
  // The panel tips up into place as it scrolls in, like a screen being lifted upright.
  const { scrollYProgress } = useScroll({ target: stage, offset: ['start end', 'start 40%'] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [animated ? 16 : 0, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [animated ? 0.93 : 1, 1])

  return (
    <section id="live-preview" className="lp-section" aria-labelledby="preview-title">
      <SectionDecor items={DECOR} />
      <div className="lp-container">
        <Reveal>
          <p className="lp-eyebrow">Live preview with sample data</p>
          <h2 id="preview-title" className="lp-heading">A working view of <span className="lp-accent">how your business is doing.</span></h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every number here is generated in your browser to show how the workspace behaves. None of it is real customer, marketplace or payment data.
          </p>
        </Reveal>

        <Reveal className="mt-8 sm:mt-10">
          <div ref={stage} className="lp-window-stage">
          <motion.div style={{ rotateX, scale, transformPerspective: 1400 }}>
          <div ref={panel} className={cx('lp-window', !live && 'lp-paused')}>
            <div className="mb-3 flex items-center justify-between gap-3 px-1.5 pt-1 sm:mb-4">
              <span className="inline-flex items-center gap-2 text-xs font-semibold">
                <span className="lp-pulse" aria-hidden /> Live preview with sample data
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{animated ? 'Pauses when out of view' : 'Motion reduced: static sample'}</span>
            </div>
            <div className="space-y-3">
              <KpiRow />
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="min-w-0 lg:col-span-8"><TrafficChart live={live} animated={animated} /></div>
                <div className="min-w-0 lg:col-span-4"><StockCoverage live={live} animated={animated} /></div>
              </div>
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="min-w-0 lg:col-span-5"><ActivityFeed live={live} animated={animated} /></div>
                <div className="min-w-0 lg:col-span-7"><EscrowFlow live={live} animated={animated} /></div>
              </div>
            </div>
          </div>
          </motion.div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
