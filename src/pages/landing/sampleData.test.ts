import { describe, expect, it } from 'vitest'
import {
  createActivityStream, createRandom, createStockStream, createTrafficStream, initialStock, initialTraffic,
  isLowStock, LOW_STOCK_DAYS, ORDERS_RANGE, REVENUE_RANGE, sampleChartBars, sampleKpis,
} from './sampleData'

describe('landing sample data', () => {
  it('replays the same numbers for the same seed', () => {
    const a = createRandom(7)
    const b = createRandom(7)
    const c = createRandom(8)
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect([c(), c(), c()]).not.toEqual(first)
  })

  it('keeps the traffic stream inside its ranges with increasing ids', () => {
    const next = createTrafficStream(11)
    const points = initialTraffic(next, 500)
    points.forEach((p, i) => {
      expect(p.id).toBe(i + 1)
      expect(p.revenue).toBeGreaterThanOrEqual(REVENUE_RANGE.min)
      expect(p.revenue).toBeLessThanOrEqual(REVENUE_RANGE.max)
      expect(p.orders).toBeGreaterThanOrEqual(ORDERS_RANGE.min)
      expect(p.orders).toBeLessThanOrEqual(ORDERS_RANGE.max)
    })
  })

  it('moves stock gently around each starting level and flags low cover', () => {
    const start = initialStock()
    const next = createStockStream(3)
    for (let i = 0; i < 300; i++) {
      next().forEach((item, index) => {
        expect(Math.abs(item.days - start[index].days)).toBeLessThanOrEqual(4)
        expect(item.days).toBeGreaterThanOrEqual(2)
      })
    }
    expect(isLowStock(LOW_STOCK_DAYS - 0.1)).toBe(true)
    expect(isLowStock(LOW_STOCK_DAYS)).toBe(false)
    expect(start.some((item) => isLowStock(item.days))).toBe(true)
  })

  it('never repeats an activity source twice in a row', () => {
    const next = createActivityStream(5)
    let previous = next().source
    for (let i = 0; i < 300; i++) {
      const event = next()
      expect(event.source).not.toBe(previous)
      previous = event.source
    }
  })

  it('keeps hero chart values in the order of their bars', () => {
    const bars = sampleChartBars([62, 100, 142, 184])
    expect(bars).toEqual(sampleChartBars([62, 100, 142, 184]))
    expect(bars.map((bar) => bar.label)).toEqual(['Week 1', 'Week 2', 'Week 3', 'Week 4'])
    bars.slice(1).forEach((bar, i) => expect(bar.value).toBeGreaterThan(bars[i].value))
  })

  it('produces stable KPIs with profit below revenue', () => {
    expect(sampleKpis(9)).toEqual(sampleKpis(9))
    const kpis = sampleKpis()
    expect(kpis.estimatedProfit).toBeLessThan(kpis.revenue)
    expect(kpis.activeAgents).toBe(4)
  })
})
