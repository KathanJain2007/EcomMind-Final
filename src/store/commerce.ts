/**
 * Commerce subsystems from the "full-stack enhancements" work: multi-marketplace
 * selling, AI pricing with safeguards, festival campaigns, supplier scoring,
 * autonomy levels, the approval queue and report history.
 *
 * Backend-backed so far: product prices and price history (/api/products/{sku}/price,
 * /api/price-history), pricing rules (stored in the seller's mandate), the
 * catalogue, the autonomy level and the approval queue (/api/approvals),
 * activity logging and the emergency kill switch. Marketplace
 * listings, orders and stock movements live entirely on the backend and are read
 * by the Selling page directly. Festivals, supplier scoring and report history
 * still run in the browser on seeded demo data and move to the backend in
 * later phases.
 */
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { type ActivityEvent, type Product } from '@/data/demo'
import { api, ApiError, type ApiApproval, type ApiMandate, type ApiPriceChange } from '@/lib/api'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import {
  type PricingRuleConfig, type PriceChangeLog, type FestivalEvent,
  type SupplierPurchaseRecord, type SupplierDeliveryRecord, type SupplierRelationshipRecord,
  type AutonomyLevel, type SignedMandate, type ApprovalQueueItem, type GeneratedReportRecord,
  DEFAULT_PRICING_RULES, INITIAL_SIGNED_MANDATE,
  seedFestivalCalendar, seedSupplierHistory, seedReportHistory,
  calculateSupplierScore,
} from '@/data/models'

const REPORT_HISTORY_KEY = 'ecommind.report_history'

export interface CommerceDeps {
  auth: { sellerName: string; storeName: string }
  catalog: Product[]
  addActivity: (e: Omit<ActivityEvent, 'id' | 'time'>) => void
  pauseAgents: () => Promise<void>
  /** Signed in with a business: backend reads are allowed. */
  enabled: boolean
}

export interface RepriceResult { success: boolean; queuedForApproval?: boolean; error?: string }

const rupees = (paise: number) => Math.round(paise) / 100
const toPaise = (rupee: number) => Math.round(rupee * 100)

export function useCommerce({ catalog, addActivity, pauseAgents, enabled }: CommerceDeps) {
  const store = useDataStore()
  // Enhanced Sub-Systems State
  // Pricing rules are the seller's mandate; price history is the backend's record of applied changes.
  const mandateQ = useApiQuery<{ mandate: ApiMandate }>(enabled ? '/api/mandate' : null, ['mandate'])
  const historyQ = useApiQuery<{ changes: ApiPriceChange[] }>(enabled ? '/api/price-history?limit=200' : null, ['products'])
  const pricingRules = useMemo<PricingRuleConfig>(() => {
    const m = mandateQ.data?.mandate
    if (!m) return DEFAULT_PRICING_RULES
    return { mode: m.pricingMode, minGrossMarginPct: m.minGrossMarginPct, maxDiscountPct: m.maxDiscountPct,
      maxPriceChangePct: m.maxPriceChangePct, enabled: !m.agentsPaused, autoApproveWithinBand: m.pricingMode === 'autonomous' }
  }, [mandateQ.data])
  const priceHistory = useMemo<PriceChangeLog[]>(() => (historyQ.data?.changes ?? []).map((c) => {
    const p = catalog.find((x) => x.sku === c.sku)
    const monthly = Math.round(rupees(c.newPrice - c.oldPrice) * (p?.avgDailySales ?? 0) * 30)
    return {
      id: c.id, timestamp: c.createdAt, sku: c.sku, productName: c.productName, oldPrice: rupees(c.oldPrice), newPrice: rupees(c.newPrice),
      pctChange: c.pctChange, agentResponsible: c.actor, reason: c.reason, status: c.sellerOverride ? 'approved' : 'executed',
      expectedProfitImpact: `${monthly >= 0 ? '+' : '−'}₹${Math.abs(monthly).toLocaleString('en-IN')}/month`,
      safeguardsChecked: { minMarginMet: c.safeguards.minMarginMet, maxDiscountMet: c.safeguards.maxDiscountMet, maxChangeMet: c.safeguards.maxChangeMet, commissionsIncluded: false },
      marginPct: c.marginPct, sellerOverride: c.sellerOverride, source: c.source,
    }
  }), [historyQ.data, catalog])
  const [festivalEvents, setFestivalEvents] = useState<FestivalEvent[]>(seedFestivalCalendar())

  const [supplierPurchases, setSupplierPurchases] = useState<SupplierPurchaseRecord[]>([])
  const [supplierDeliveries, setSupplierDeliveries] = useState<SupplierDeliveryRecord[]>([])
  const [supplierRelationships, setSupplierRelationships] = useState<Record<string, SupplierRelationshipRecord>>({})

  // Autonomy level lives in the mandate; the approval queue lives on the server.
  const autonomyLevel = (mandateQ.data?.mandate.autonomyLevel ?? 2) as AutonomyLevel
  const [signedMandate, setSignedMandate] = useState<SignedMandate>(INITIAL_SIGNED_MANDATE)
  const approvalsQ = useApiQuery<{ approvals: ApiApproval[]; pendingCount: number }>(enabled ? '/api/approvals?limit=200' : null, ['approvals'])
  const approvalQueue = useMemo<ApprovalQueueItem[]>(() => (approvalsQ.data?.approvals ?? []).map((a) => {
    const details: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(a.payload ?? {})) {
      if (v === null || typeof v === 'object') continue
      details[k] = /price|amount|total/i.test(k) && typeof v === 'number' ? `₹${rupees(v).toLocaleString('en-IN')}` : v
    }
    if (a.reasons.length) details.needsApprovalBecause = a.reasons.join(', ')
    return {
      id: a.id, createdAt: a.createdAt, agentName: a.agentName, actionType: a.actionType, title: a.title, description: a.description,
      details, financialImpact: rupees(a.financialImpact), status: a.status, reviewedAt: a.decidedAt ?? undefined,
      reviewedBy: a.decidedBy ?? undefined, rejectionReason: a.rejectionReason ?? undefined, lastError: a.lastError ?? undefined,
    }
  }), [approvalsQ.data])

  const [reportHistory, setReportHistory] = useState<GeneratedReportRecord[]>(() => {
    try {
      const raw = localStorage.getItem(REPORT_HISTORY_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return []
  })

  /** Load the demo commerce data (called when the demo business loads). */
  const seedCommerceDemo = useCallback(() => {
    setFestivalEvents(seedFestivalCalendar())
    const sup = seedSupplierHistory()
    setSupplierPurchases(sup.purchases)
    setSupplierDeliveries(sup.deliveries)
    setSupplierRelationships(sup.relationships)
    setReportHistory(seedReportHistory())
    setSignedMandate(INITIAL_SIGNED_MANDATE)
  }, [])

  /** Clear per-seller commerce data on sign-out. */
  const resetCommerce = useCallback(() => {
    setSupplierPurchases([]); setSupplierDeliveries([]); setSupplierRelationships({})
    setSignedMandate(INITIAL_SIGNED_MANDATE)
  }, [])

  // Feature 4: AI Dynamic Pricing with strict financial safeguards
  const updatePricingRules = useCallback(async (rules: Partial<PricingRuleConfig>) => {
    const body: Partial<ApiMandate> = {}
    if (rules.mode) body.pricingMode = rules.mode
    if (rules.minGrossMarginPct !== undefined) body.minGrossMarginPct = rules.minGrossMarginPct
    if (rules.maxDiscountPct !== undefined) body.maxDiscountPct = rules.maxDiscountPct
    if (rules.maxPriceChangePct !== undefined) body.maxPriceChangePct = rules.maxPriceChangePct
    try {
      const res = await api<{ mandate: ApiMandate }>('/api/mandate', { method: 'PATCH', body })
      store.setData('/api/mandate', { ...(mandateQ.data ?? {}), mandate: res.mandate })
      store.invalidate('mandate')
      if (rules.mode) toast.success('Pricing mode saved', { description: `Stored in your mandate: ${rules.mode}.` })
    } catch (e) {
      toast.error('Couldn’t save pricing rules', { description: e instanceof ApiError ? e.message : undefined })
      store.invalidate('mandate')
    }
  }, [store, mandateQ.data])

  /** Change a product's price through the backend. Prices in rupees. Changes outside the mandate go to the approval queue. */
  const executeReprice = useCallback(async (sku: string, newPrice: number, agentName: string, reason: string): Promise<RepriceResult> => {
    const seller = agentName.toLowerCase().startsWith('seller')
    try {
      const res = await api<{ change: ApiPriceChange | null; approval: ApiApproval | null }>(`/api/products/${encodeURIComponent(sku)}/price`, {
        body: { newPrice: toPaise(newPrice), reason, source: seller ? 'seller' : 'agent', actor: seller ? undefined : agentName },
      })
      if (res.approval) {
        store.invalidate('approvals', 'activity')
        toast.warning('Price change sent for approval', { description: `${res.approval.description} Review it in Agent Activity → Approval queue.` })
        return { success: false, queuedForApproval: true }
      }
      const c = res.change!
      store.invalidate('products', 'analytics', 'activity', 'orders')
      toast.success(`Repriced ${c.productName}`, { description: `₹${rupees(c.oldPrice)} → ₹${rupees(c.newPrice)} · gross margin ${c.marginPct}%. Saved to your catalogue.` })
      return { success: true }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'The price wasn’t changed. Try again.'
      toast.error('Price not changed', { description: msg })
      return { success: false, error: msg }
    }
  }, [store])

  // Feature 5: Festival Intelligence & Campaign Execution
  const applyFestivalCampaign = useCallback(async (festivalId: string, discountPct: number, skus: string[]) => {
    const fest = festivalEvents.find((f) => f.id === festivalId)
    if (!fest) return { success: false, message: 'Festival not found' }
    const items = skus.map((sku) => catalog.find((p) => p.sku === sku)).filter((p): p is Product => !!p)
    if (!items.length) return { success: false, message: 'None of the campaign products are in your catalogue.' }
    const changes = items.map((p) => ({ sku: p.sku, newPrice: toPaise(Math.round(p.price * (1 - discountPct / 100))), expectedPrice: toPaise(p.price) }))
    const reason = `${fest.name} campaign · ${discountPct}% festive discount`
    try {
      const res = await api<{ approval: ApiApproval | null }>('/api/products/prices', { body: { changes, reason, source: 'festival', actor: 'Festival Intelligence Agent', ref: festivalId.slice(0, 40) } })
      if (res.approval) {
        store.invalidate('approvals', 'activity')
        toast.warning('Campaign sent for approval', { description: res.approval.description })
        return { success: true, queued: true, message: 'Queued for seller authorization.' }
      }
      store.invalidate('products', 'analytics', 'activity', 'orders')
      setFestivalEvents((prev) => prev.map((f) => (f.id === festivalId ? { ...f, status: 'Active' } : f)))
      toast.success(`Campaign Activated: ${fest.name}`, { description: `${discountPct}% festive pricing applied to ${items.length} SKUs in your catalogue.` })
      return { success: true, message: 'Campaign activated successfully.' }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'The campaign wasn’t applied. Try again.'
      toast.error('Campaign not applied', { description: msg })
      return { success: false, message: msg }
    }
  }, [festivalEvents, catalog, store])

  // Feature 6: Supplier Intelligence
  const getSupplierPerformance = useCallback((supplierId: string) => {
    const rel = supplierRelationships[supplierId]
    if (!rel) return null
    return calculateSupplierScore(rel)
  }, [supplierRelationships])

  const getAiSupplierRecommendation = useCallback((sku: string, urgency: 'low' | 'normal' | 'urgent', targetQty = 300) => {
    const p = catalog.find((x) => x.sku === sku)
    const pName = p ? p.name : sku
    const candidateQuotes = [
      { supplierId: 'SUP-A', name: 'Supplier A — NovaSource Traders', quote: 198, days: 5, onTime: 85, score: 86.4 },
      { supplierId: 'SUP-B', name: 'Supplier B — Kedar Electronics', quote: 195, days: 3, onTime: 98, score: 94.2 },
      { supplierId: 'SUP-C', name: 'Supplier C — Sona Wholesale', quote: 189, days: 8, onTime: 72, score: 77.8 },
    ]

    let bestId = 'SUP-B'
    let reason = ''

    if (urgency === 'urgent') {
      bestId = 'SUP-B'
      reason = `Supplier B is recommended for ${pName}: delivers in 3 days with a 98% on-time delivery rate. Fast dispatch protects against imminent stockout despite ₹6/unit premium over Supplier C.`
    } else if (urgency === 'low' && targetQty >= 500) {
      bestId = 'SUP-C'
      reason = `Supplier C is recommended for bulk replenishment of ${pName}: lowest quoted price (₹189/unit) saves ₹1,800–₹2,700 on bulk order with sufficient 8-day delivery window.`
    } else {
      bestId = 'SUP-B'
      reason = `Supplier B is recommended overall for ${pName}: highest supplier composite score (94.2/100), 0 quality disputes, and successful historical negotiation record (consistently settles at ₹180/unit).`
    }

    const comparison = candidateQuotes.map((c) => ({
      ...c,
      verdict: c.supplierId === bestId ? 'Recommended by AI' : c.days > 6 ? 'Delivery risk' : 'Higher cost',
    }))

    return { recommendedSupplierId: bestId, reason, comparison }
  }, [catalog])

  // Feature 7 & 10: AI Autonomy & Approval Queue
  const setAutonomyLevel = useCallback(async (lvl: AutonomyLevel) => {
    const labels: Record<AutonomyLevel, string> = {
      1: 'Level 1 – Advisory Mode',
      2: 'Level 2 – Approval-Based Execution',
      3: 'Level 3 – Restricted Autonomous Execution',
    }
    try {
      const res = await api<{ mandate: ApiMandate }>('/api/mandate', { method: 'PATCH', body: { autonomyLevel: lvl } })
      store.setData('/api/mandate', { ...(mandateQ.data ?? {}), mandate: res.mandate })
      store.invalidate('mandate', 'activity')
      setSignedMandate((prev) => ({ ...prev, autonomyLevel: lvl }))
      toast.success(`Autonomy updated: ${labels[lvl]}`, { description: 'Saved to your mandate on the server.' })
    } catch (e) {
      toast.error('Autonomy level not saved', { description: e instanceof ApiError ? e.message : undefined })
    }
  }, [store, mandateQ.data])

  /** Approve on the server: it executes the action exactly once and records who approved it. */
  const approveQueuedAction = useCallback(async (id: string) => {
    try {
      const a = await api<ApiApproval>(`/api/approvals/${id}/approve`, { method: 'POST' })
      store.invalidate('approvals', 'products', 'analytics', 'activity', 'orders', 'negotiations', 'escrow', 'wallet')
      if (a.actionType === 'bulk_price_change' && typeof a.payload.ref === 'string') {
        setFestivalEvents((prev) => prev.map((f) => (f.id === a.payload.ref ? { ...f, status: 'Active' } : f)))
      }
      toast.success('Approved and executed', { description: a.title })
    } catch (e) {
      store.invalidate('approvals')
      toast.error('Approval couldn’t be executed', { description: e instanceof ApiError ? `${e.message} The request is still pending.` : undefined })
    }
  }, [store])

  const rejectQueuedAction = useCallback(async (id: string, reason = 'Declined by the seller') => {
    try {
      await api(`/api/approvals/${id}/reject`, { method: 'POST', body: { reason } })
      store.invalidate('approvals', 'activity', 'escrow')
      toast.info('Request declined', { description: reason })
    } catch (e) {
      toast.error('Couldn’t decline', { description: e instanceof ApiError ? e.message : undefined })
    }
  }, [store])

  const emergencyKillSwitch = useCallback(() => {
    void pauseAgents() // server-side pause: the backend then refuses every agent call
    setSignedMandate((prev) => ({ ...prev, revoked: true }))
    addActivity({
      agent: 'Security System',
      action: 'EMERGENCY AI KILL-SWITCH TRIGGERED',
      status: 'warning',
      detail: 'All autonomous operations halted and agents paused on the server. Mandate token revoked.',
    })
    toast.error('EMERGENCY KILL-SWITCH ACTIVE', { description: 'All AI agent operations halted across your business.' })
  }, [addActivity, pauseAgents])

  // Feature 1: Report History Persistence
  const saveGeneratedReport = useCallback((recordData: Omit<GeneratedReportRecord, 'id' | 'generatedAt'>) => {
    const newRecord: GeneratedReportRecord = {
      ...recordData,
      id: `RPT-${Date.now().toString().slice(-6)}`,
      generatedAt: new Date().toISOString(),
    }
    setReportHistory((prev) => {
      const next = [newRecord, ...prev]
      localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(next.slice(0, 50)))
      return next
    })
    return newRecord
  }, [])


  return {
    pricingRules, priceHistory, festivalEvents, supplierPurchases, supplierDeliveries,
    supplierRelationships, autonomyLevel, signedMandate, approvalQueue, reportHistory,
    executeReprice, updatePricingRules, applyFestivalCampaign, setAutonomyLevel, approveQueuedAction,
    rejectQueuedAction, emergencyKillSwitch, saveGeneratedReport, getSupplierPerformance, getAiSupplierRecommendation,
    seedCommerceDemo, resetCommerce,
  }
}

export type CommerceState = ReturnType<typeof useCommerce>
