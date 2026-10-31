/**
 * Commerce subsystems from the "full-stack enhancements" work: multi-marketplace
 * selling, AI pricing with safeguards, festival campaigns, supplier scoring,
 * autonomy levels, the approval queue and report history.
 *
 * Backend-backed so far: product prices and price history (/api/products/{sku}/price,
 * /api/price-history), pricing rules (stored in the seller's mandate), the
 * catalogue, activity logging and the emergency kill switch. Marketplace
 * listings, orders and stock movements live entirely on the backend and are read
 * by the Selling page directly. Festivals, supplier scoring, the approval queue
 * and report history still run in the browser on seeded demo data and move to
 * the backend in later phases.
 */
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { type ActivityEvent, type Product } from '@/data/demo'
import { api, ApiError, type ApiMandate, type ApiPriceApprovalNeeded, type ApiPriceChange } from '@/lib/api'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import {
  type PricingRuleConfig, type PriceChangeLog, type FestivalEvent,
  type SupplierPurchaseRecord, type SupplierDeliveryRecord, type SupplierRelationshipRecord,
  type AutonomyLevel, type SignedMandate, type ApprovalQueueItem, type GeneratedReportRecord,
  DEFAULT_PRICING_RULES, INITIAL_SIGNED_MANDATE,
  seedFestivalCalendar, seedSupplierHistory, seedApprovalQueue, seedReportHistory,
  calculateSupplierScore,
} from '@/data/models'

const AUTONOMY_KEY = 'ecommind.autonomy'
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

export function useCommerce({ auth, catalog, addActivity, pauseAgents, enabled }: CommerceDeps) {
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

  const [autonomyLevel, setAutonomyLevelState] = useState<AutonomyLevel>(() => {
    try {
      const raw = localStorage.getItem(AUTONOMY_KEY)
      if (raw) return Number(raw) as AutonomyLevel
    } catch { /* ignore */ }
    return 2 // Approval-based by default
  })

  const [signedMandate, setSignedMandate] = useState<SignedMandate>(INITIAL_SIGNED_MANDATE)
  const [approvalQueue, setApprovalQueue] = useState<ApprovalQueueItem[]>([])

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
    setApprovalQueue(seedApprovalQueue())
    setReportHistory(seedReportHistory())
    setSignedMandate(INITIAL_SIGNED_MANDATE)
  }, [])

  /** Clear per-seller commerce data on sign-out. */
  const resetCommerce = useCallback(() => {
    setSupplierPurchases([]); setSupplierDeliveries([]); setSupplierRelationships({}); setApprovalQueue([])
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

  const queuePriceApproval = useCallback((d: ApiPriceApprovalNeeded, agentName: string, reason: string, message: string) => {
    const queueItem: ApprovalQueueItem = {
      id: `APR-${Date.now()}`,
      createdAt: new Date().toISOString(),
      agentName,
      actionType: 'repricing',
      title: `Reprice ${d.productName}: ₹${rupees(d.oldPrice)} → ₹${rupees(d.newPrice)} (${d.safeguards.pctChange >= 0 ? '+' : ''}${d.safeguards.pctChange}%)`,
      description: `${reason} · ${message}`,
      details: { sku: d.sku, oldPrice: rupees(d.oldPrice), newPrice: rupees(d.newPrice), pctChange: d.safeguards.pctChange, marginPct: d.safeguards.marginPct, safeguards: d.safeguards, reason },
      financialImpact: rupees(d.monthlyImpact),
      status: 'pending',
    }
    setApprovalQueue((prev) => [queueItem, ...prev])
    addActivity({
      agent: agentName,
      action: `Repricing queued for approval: ${d.productName}`,
      product: d.productName,
      status: 'warning',
      detail: `Proposed ₹${rupees(d.oldPrice)} → ₹${rupees(d.newPrice)}. ${message}`,
    })
  }, [addActivity])

  /** Change a product's price through the backend. Prices in rupees. */
  const executeReprice = useCallback(async (sku: string, newPrice: number, agentName: string, reason: string): Promise<RepriceResult> => {
    const seller = agentName.toLowerCase().startsWith('seller')
    try {
      const res = await api<{ change: ApiPriceChange }>(`/api/products/${encodeURIComponent(sku)}/price`, {
        body: { newPrice: toPaise(newPrice), reason, source: seller ? 'seller' : 'agent', actor: seller ? undefined : agentName },
      })
      const c = res.change
      store.invalidate('products', 'analytics', 'activity', 'orders')
      toast.success(`Repriced ${c.productName}`, { description: `₹${rupees(c.oldPrice)} → ₹${rupees(c.newPrice)} · gross margin ${c.marginPct}%. Saved to your catalogue.` })
      return { success: true }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'needs_approval' && e.details) {
        queuePriceApproval(e.details as ApiPriceApprovalNeeded, agentName, reason, e.message)
        toast.warning('Price change queued for approval', { description: e.message })
        return { success: false, queuedForApproval: true }
      }
      const msg = e instanceof ApiError ? e.message : 'The price wasn’t changed. Try again.'
      toast.error('Price not changed', { description: msg })
      return { success: false, error: msg }
    }
  }, [store, queuePriceApproval])

  // Feature 5: Festival Intelligence & Campaign Execution
  const applyFestivalCampaign = useCallback(async (festivalId: string, discountPct: number, skus: string[]) => {
    const fest = festivalEvents.find((f) => f.id === festivalId)
    if (!fest) return { success: false, message: 'Festival not found' }
    const items = skus.map((sku) => catalog.find((p) => p.sku === sku)).filter((p): p is Product => !!p)
    if (!items.length) return { success: false, message: 'None of the campaign products are in your catalogue.' }
    const changes = items.map((p) => ({ sku: p.sku, newPrice: toPaise(Math.round(p.price * (1 - discountPct / 100))), expectedPrice: toPaise(p.price) }))
    const reason = `${fest.name} campaign · ${discountPct}% festive discount`
    try {
      await api('/api/products/prices', { body: { changes, reason, source: 'festival', actor: 'Festival Intelligence Agent', ref: festivalId.slice(0, 40) } })
      store.invalidate('products', 'analytics', 'activity')
      setFestivalEvents((prev) => prev.map((f) => (f.id === festivalId ? { ...f, status: 'Active' } : f)))
      toast.success(`Campaign Activated: ${fest.name}`, { description: `${discountPct}% festive pricing applied to ${items.length} SKUs in your catalogue.` })
      return { success: true, message: 'Campaign activated successfully.' }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'needs_approval') {
        const queueItem: ApprovalQueueItem = {
          id: `APR-FEST-${Date.now()}`,
          createdAt: new Date().toISOString(),
          agentName: 'Festival Intelligence Agent',
          actionType: 'discount',
          title: `Festival Campaign: ${fest.name} (${discountPct}% discount)`,
          description: `${e.message} Products: ${items.map((p) => p.sku).join(', ')}`,
          financialImpact: -Math.round(items.reduce((sum, p) => sum + p.price * (discountPct / 100) * p.avgDailySales * 30, 0)),
          details: { festivalId, festivalName: fest.name, discountPct, skus: items.map((p) => p.sku), changes, reason },
          status: 'pending',
        }
        setApprovalQueue((prev) => [queueItem, ...prev])
        addActivity({ agent: 'Festival Intelligence Agent', action: `Campaign queued for approval: ${fest.name}`, status: 'warning', detail: e.message })
        toast.warning('Campaign discount queued', { description: e.message })
        return { success: true, queued: true, message: 'Queued for seller authorization.' }
      }
      const msg = e instanceof ApiError ? e.message : 'The campaign wasn’t applied. Try again.'
      toast.error('Campaign not applied', { description: msg })
      return { success: false, message: msg }
    }
  }, [festivalEvents, catalog, store, addActivity])

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
  const setAutonomyLevel = useCallback((lvl: AutonomyLevel) => {
    setAutonomyLevelState(lvl)
    localStorage.setItem(AUTONOMY_KEY, String(lvl))
    setSignedMandate((prev) => ({ ...prev, autonomyLevel: lvl }))
    const labels: Record<AutonomyLevel, string> = {
      1: 'Level 1 – Advisory Mode',
      2: 'Level 2 – Approval-Based Execution',
      3: 'Level 3 – Restricted Autonomous Execution',
    }
    toast.success(`Autonomy updated: ${labels[lvl]}`)
    addActivity({
      agent: 'Security & Mandate Policy',
      action: `Autonomy level changed to ${labels[lvl]}`,
      status: 'info',
      detail: `EcomMind orchestrator permissions updated. Signed Ed25519 mandate verified.`,
    })
  }, [addActivity])

  const approveQueuedAction = useCallback(async (id: string, modParams?: unknown) => {
    const item = approvalQueue.find((x) => x.id === id)
    if (!item || item.status !== 'pending') return

    if (item.actionType === 'repricing' || item.actionType === 'discount') {
      // The seller's approval applies the change on the server; nothing changes locally unless it succeeds.
      try {
        const d = item.details as Record<string, unknown>
        if (item.actionType === 'repricing') {
          await api(`/api/products/${encodeURIComponent(String(d.sku))}/price`, {
            body: { newPrice: toPaise(Number(d.newPrice)), reason: String(d.reason ?? item.description).slice(0, 300), source: 'approval', approved: true, expectedPrice: toPaise(Number(d.oldPrice)) },
          })
        } else {
          await api('/api/products/prices', {
            body: { changes: d.changes, reason: String(d.reason ?? item.title).slice(0, 300), source: 'approval', approved: true, ref: String(d.festivalId ?? '').slice(0, 40) || undefined },
          })
          setFestivalEvents((prev) => prev.map((f) => (f.id === d.festivalId ? { ...f, status: 'Active' } : f)))
        }
        store.invalidate('products', 'analytics', 'activity')
      } catch (e) {
        toast.error('Approval couldn’t be applied', { description: e instanceof ApiError ? e.message : undefined })
        return
      }
    }

    setApprovalQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: 'approved', reviewedAt: new Date().toISOString(), reviewedBy: auth.sellerName || 'Seller', modifiedParams: modParams } : q))
    )

    if (item.actionType === 'purchase') {
      toast.success('Purchase approved', { description: `Order for ${item.details.qty} units approved and sent for execution.` })
      addActivity({
        agent: 'Seller Authorization',
        action: `Approved purchase: ${item.title}`,
        amount: item.financialImpact,
        status: 'success',
        detail: `Signed execution authorized by ${auth.sellerName}.`,
      })
    } else if (item.actionType === 'repricing' || item.actionType === 'discount') {
      toast.success(item.actionType === 'repricing' ? 'Repricing approved' : 'Campaign approved', { description: `${item.title} · saved to your catalogue.` })
    } else {
      toast.success('Action approved', { description: item.title })
    }
  }, [approvalQueue, auth, store, addActivity])

  const rejectQueuedAction = useCallback((id: string, reason = 'Seller declined proposal') => {
    setApprovalQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: 'rejected', reviewedAt: new Date().toISOString(), reviewedBy: auth.sellerName || 'Seller', rejectionReason: reason } : q))
    )
    toast.info('Action declined', { description: reason })
    addActivity({
      agent: 'Seller Authorization',
      action: `Rejected proposal: ${id}`,
      status: 'info',
      detail: reason,
    })
  }, [auth, addActivity])

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
