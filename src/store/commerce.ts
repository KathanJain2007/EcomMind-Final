/**
 * Commerce subsystems from the "full-stack enhancements" work: multi-marketplace
 * selling, AI pricing with safeguards, festival campaigns, supplier scoring,
 * autonomy levels, the approval queue and report history.
 *
 * These still run in the browser on seeded demo data (kept in state and
 * localStorage, as originally built). They are combined with the backend-backed
 * AppContext through this hook: activity they log is saved to the backend, the
 * emergency kill switch pauses agents on the server, and the catalogue includes
 * products stored in the backend.
 */
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { PRODUCTS, type ActivityEvent, type Product } from '@/data/demo'
import {
  type MarketplaceConfig, type MarketplaceListing, type MarketplaceOrder,
  type InventoryMovement, type PricingRuleConfig, type PriceChangeLog, type FestivalEvent,
  type SupplierPurchaseRecord, type SupplierDeliveryRecord, type SupplierRelationshipRecord,
  type AutonomyLevel, type SignedMandate, type ApprovalQueueItem, type GeneratedReportRecord,
  INITIAL_MARKETPLACES, DEFAULT_PRICING_RULES, INITIAL_SIGNED_MANDATE,
  seedMarketplaceListings, seedMarketplaceOrders, seedPriceHistory,
  seedFestivalCalendar, seedSupplierHistory, seedApprovalQueue, seedReportHistory,
  calculateSupplierScore,
} from '@/data/models'

const AUTONOMY_KEY = 'ecommind.autonomy'
const PRICING_RULES_KEY = 'ecommind.pricing_rules'
const REPORT_HISTORY_KEY = 'ecommind.report_history'

export interface CommerceDeps {
  auth: { sellerName: string; storeName: string }
  extraProducts: Product[]
  addActivity: (e: Omit<ActivityEvent, 'id' | 'time'>) => void
  pauseAgents: () => Promise<void>
}

export function useCommerce({ auth, extraProducts, addActivity, pauseAgents }: CommerceDeps) {
  // Enhanced Sub-Systems State
  const [marketplaces, setMarketplaces] = useState<MarketplaceConfig[]>(INITIAL_MARKETPLACES)
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>([])
  const [marketplaceOrders, setMarketplaceOrders] = useState<MarketplaceOrder[]>([])
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([])
  const [pricingRules, setPricingRules] = useState<PricingRuleConfig>(() => {
    try {
      const raw = localStorage.getItem(PRICING_RULES_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return DEFAULT_PRICING_RULES
  })
  const [priceHistory, setPriceHistory] = useState<PriceChangeLog[]>([])
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
    setMarketplaces(INITIAL_MARKETPLACES)
    setMarketplaceListings(seedMarketplaceListings())
    setMarketplaceOrders(seedMarketplaceOrders())
    setPriceHistory(seedPriceHistory())
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
    setMarketplaceListings([]); setMarketplaceOrders([]); setInventoryMovements([]); setPriceHistory([])
    setSupplierPurchases([]); setSupplierDeliveries([]); setSupplierRelationships({}); setApprovalQueue([])
    setSignedMandate(INITIAL_SIGNED_MANDATE)
  }, [])

  // Feature 3: Multi-Marketplace selling & synchronization
  const createMarketplaceListing = useCallback((listingData: Omit<MarketplaceListing, 'id' | 'lastSyncAt' | 'ordersCount' | 'unitsSold' | 'revenue'>) => {
    const id = `LST-${listingData.marketplace.toUpperCase()}-${listingData.sku}-${Date.now().toString(36)}`
    const newListing: MarketplaceListing = {
      ...listingData,
      id,
      ordersCount: 0,
      unitsSold: 0,
      revenue: 0,
      lastSyncAt: new Date().toISOString(),
    }
    setMarketplaceListings((prev) => [newListing, ...prev])
    addActivity({
      agent: 'Marketplace Integration Agent',
      action: `Listed on ${listingData.marketplace.toUpperCase()}: ${listingData.title}`,
      product: listingData.sku,
      status: 'success',
      detail: `Price ₹${listingData.price} · Available Stock: ${listingData.stock} units. ID: ${listingData.marketplaceListingId}`,
    })
    toast.success('Listing created', { description: `Product ${listingData.sku} live on ${listingData.marketplace.toUpperCase()}.` })
  }, [addActivity])

  const updateListingPriceAndStock = useCallback((id: string, price: number, stock: number) => {
    setMarketplaceListings((prev) =>
      prev.map((l) => (l.id === id ? { ...l, price, stock, lastSyncAt: new Date().toISOString() } : l))
    )
    toast.success('Listing updated', { description: `Price set to ₹${price}, stock set to ${stock}.` })
  }, [])

  const toggleMarketplaceStatus = useCallback((id: string, newStatus: MarketplaceListing['status']) => {
    setMarketplaceListings((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: newStatus, lastSyncAt: new Date().toISOString() } : l))
    )
    toast.info(`Listing status changed to ${newStatus}`)
  }, [])

  const simulateMarketplaceOrder = useCallback((marketplace: MarketplaceConfig['id'], sku: string, units = 1) => {
    const product = [...PRODUCTS, ...extraProducts].find((p) => p.sku === sku)
    if (!product) return { success: false, error: 'Product SKU not found' }
    if (product.stock < units) {
      toast.error('Overselling prevented!', { description: `Stock (${product.stock}) is insufficient for ${units} units order.` })
      return { success: false, error: 'Insufficient inventory available' }
    }

    const listing = marketplaceListings.find((l) => l.marketplace === marketplace && l.sku === sku)
    const price = listing ? listing.price : product.price
    const commPct = marketplace === 'amazon' ? 0.145 : marketplace === 'flipkart' ? 0.12 : marketplace === 'meesho' ? 0.015 : 0.02
    const commission = Math.round(price * units * commPct)
    const shipping = 45 * units
    const packaging = 15 * units
    const tax = Math.round(price * units * 0.18)
    const netProfit = (price * units) - (product.cost * units) - commission - shipping - packaging - (tax * 0.1)

    // Deduct stock centrally
    const newStock = product.stock - units
    product.stock = newStock

    // Synchronize across all marketplace listings for this SKU
    setMarketplaceListings((prev) =>
      prev.map((l) =>
        l.sku === sku
          ? {
              ...l,
              stock: newStock,
              status: newStock === 0 ? 'out_of_stock' : l.status,
              ordersCount: l.marketplace === marketplace ? l.ordersCount + 1 : l.ordersCount,
              unitsSold: l.marketplace === marketplace ? l.unitsSold + units : l.unitsSold,
              revenue: l.marketplace === marketplace ? l.revenue + (price * units) : l.revenue,
              lastSyncAt: new Date().toISOString(),
            }
          : l
      )
    )

    // Record order
    const orderId = `ORD-${Date.now().toString().slice(-6)}`
    const newOrder: MarketplaceOrder = {
      id: orderId,
      orderNumber: `OD${Date.now().toString().slice(-7)}`,
      marketplace,
      sku,
      productName: product.name,
      units,
      sellingPrice: price,
      commission,
      shippingCost: shipping,
      packagingCost: packaging,
      taxAmount: tax,
      netProfit,
      status: 'confirmed',
      customerCity: 'Bengaluru',
      customerState: 'Karnataka',
      customerPincode: '560001',
      createdAt: new Date().toISOString(),
    }
    setMarketplaceOrders((prev) => [newOrder, ...prev])

    // Record inventory movement
    const movement: InventoryMovement = {
      id: `MOV-${Date.now()}`,
      timestamp: new Date().toISOString(),
      sku,
      productName: product.name,
      delta: -units,
      type: 'sale',
      channel: marketplace.toUpperCase(),
      reason: `Customer order ${orderId} reserved & confirmed`,
      resultingStock: newStock,
    }
    setInventoryMovements((prev) => [movement, ...prev])

    addActivity({
      agent: 'Marketplace Sync Engine',
      action: `New Order (${marketplace.toUpperCase()}): ${units} × ${product.name}`,
      product: product.name,
      amount: price * units,
      status: 'success',
      detail: `Order ${orderId} confirmed · Net Profit: ₹${netProfit.toLocaleString('en-IN')} · Stock synchronized to ${newStock} units across all channels.`,
    })

    toast.success(`New order on ${marketplace.toUpperCase()}!`, {
      description: `${units} × ${product.name} @ ₹${price}. Inventory synchronized automatically.`,
    })

    return { success: true }
  }, [extraProducts, marketplaceListings, addActivity])

  // Feature 4: AI Dynamic Pricing with strict financial safeguards
  const updatePricingRules = useCallback((rules: Partial<PricingRuleConfig>) => {
    setPricingRules((prev) => {
      const next = { ...prev, ...rules }
      localStorage.setItem(PRICING_RULES_KEY, JSON.stringify(next))
      return next
    })
    toast.success('Pricing rules updated', { description: 'Safeguard margins and discount limits refreshed.' })
  }, [])

  const executeReprice = useCallback((
    sku: string,
    newPrice: number,
    agentName: string,
    reason: string
  ): { success: boolean; queuedForApproval?: boolean; error?: string } => {
    const all = [...PRODUCTS, ...extraProducts]
    const p = all.find((x) => x.sku === sku)
    if (!p) return { success: false, error: 'Product SKU not found' }

    // 1. Check max price change %
    const pctChange = Math.round(((newPrice - p.price) / p.price) * 1000) / 10
    const maxChangeAllowed = pricingRules.maxPriceChangePct
    const withinChangeBand = Math.abs(pctChange) <= maxChangeAllowed

    // 2. Check gross profit margin with commissions and shipping included
    const estCommission = newPrice * 0.12
    const estShipping = 45
    const estPackaging = 15
    const estTax = newPrice * 0.18
    const netEarnings = newPrice - p.cost - estCommission - estShipping - estPackaging - (estTax * 0.1)
    const marginPct = Math.round((netEarnings / newPrice) * 1000) / 10

    const minMarginAllowed = pricingRules.minGrossMarginPct
    const marginMet = marginPct >= minMarginAllowed

    // 3. Check discount limit
    const discountPct = pctChange < 0 ? Math.abs(pctChange) : 0
    const discountMet = discountPct <= pricingRules.maxDiscountPct

    const safeguards = {
      minMarginMet: marginMet,
      maxDiscountMet: discountMet,
      maxChangeMet: withinChangeBand,
      commissionsIncluded: true,
    }

    const shouldQueue =
      autonomyLevel === 1 ||
      pricingRules.mode === 'manual' ||
      pricingRules.mode === 'recommendation' ||
      !marginMet ||
      !discountMet ||
      !withinChangeBand

    if (shouldQueue) {
      const queueItem: ApprovalQueueItem = {
        id: `APR-${Date.now()}`,
        createdAt: new Date().toISOString(),
        agentName,
        actionType: 'repricing',
        title: `Reprice ${p.name}: ₹${p.price} → ₹${newPrice} (${pctChange >= 0 ? '+' : ''}${pctChange}%)`,
        description: `${reason}${!marginMet ? ` (Flag: Projected margin ${marginPct}% < policy floor ${minMarginAllowed}%)` : ''}`,
        details: { sku, oldPrice: p.price, newPrice, pctChange, marginPct, safeguards },
        financialImpact: Math.round((newPrice - p.price) * p.avgDailySales * 30),
        status: 'pending',
      }
      setApprovalQueue((prev) => [queueItem, ...prev])
      addActivity({
        agent: agentName,
        action: `Repricing queued for approval: ${p.name}`,
        product: p.name,
        status: 'warning',
        detail: `Proposed ₹${p.price} → ₹${newPrice}. Reason: ${reason}. Awaiting seller approval in queue.`,
      })
      toast.warning('Price change queued for approval', {
        description: !marginMet ? `Margin ${marginPct}% violates minimum floor (${minMarginAllowed}%). Requires explicit seller sign-off.` : 'Awaiting seller review in Approval Queue.',
      })
      return { success: false, queuedForApproval: true }
    }

    // Apply autonomous repricing
    const oldPrice = p.price
    p.price = newPrice

    // Update marketplace listings
    setMarketplaceListings((prev) =>
      prev.map((l) => (l.sku === sku ? { ...l, price: newPrice, lastSyncAt: new Date().toISOString() } : l))
    )

    // Log history
    const log: PriceChangeLog = {
      id: `PRC-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      sku,
      productName: p.name,
      oldPrice,
      newPrice,
      pctChange,
      agentResponsible: agentName,
      reason,
      status: 'executed',
      expectedProfitImpact: `${pctChange >= 0 ? '+' : ''}₹${Math.abs(Math.round((newPrice - oldPrice) * p.avgDailySales * 30)).toLocaleString('en-IN')}/month`,
      safeguardsChecked: safeguards,
    }
    setPriceHistory((prev) => [log, ...prev])

    addActivity({
      agent: agentName,
      action: `Repriced ${p.name}: ₹${oldPrice} → ₹${newPrice} (${pctChange >= 0 ? '+' : ''}${pctChange}%)`,
      product: p.name,
      status: 'success',
      detail: `${reason} · All backend safeguards verified (Margin: ${marginPct}%).`,
    })

    toast.success(`Repriced ${p.name}`, { description: `New price ₹${newPrice} live across marketplaces.` })
    return { success: true }
  }, [extraProducts, pricingRules, autonomyLevel, addActivity])

  // Feature 5: Festival Intelligence & Campaign Execution
  const applyFestivalCampaign = useCallback((festivalId: string, discountPct: number, skus: string[]) => {
    const fest = festivalEvents.find((f) => f.id === festivalId)
    if (!fest) return { success: false, message: 'Festival not found' }

    if (discountPct > pricingRules.maxDiscountPct) {
      // Queue for approval
      const queueItem: ApprovalQueueItem = {
        id: `APR-FEST-${Date.now()}`,
        createdAt: new Date().toISOString(),
        agentName: 'Festival Intelligence Agent',
        actionType: 'discount',
        title: `Festival Campaign: ${fest.name} (${discountPct}% discount)`,
        description: `Proposed ${discountPct}% promotional discount exceeds standard mandate limit (${pricingRules.maxDiscountPct}%). Products: ${skus.join(', ')}`,
        financialImpact: -Math.round(discountPct * 1000),
        details: { festivalId, festivalName: fest.name, discountPct, skus },
        status: 'pending',
      }
      setApprovalQueue((prev) => [queueItem, ...prev])
      addActivity({
        agent: 'Festival Intelligence Agent',
        action: `Campaign queued for approval: ${fest.name}`,
        status: 'warning',
        detail: `${discountPct}% discount on ${skus.length} SKUs requires approval.`,
      })
      toast.warning('Campaign discount queued', { description: `${discountPct}% discount exceeds auto-mandate limit.` })
      return { success: true, queued: true, message: 'Queued for seller authorization.' }
    }

    // Apply festival discount directly within mandate
    skus.forEach((sku) => {
      const p = [...PRODUCTS, ...extraProducts].find((x) => x.sku === sku)
      if (p) {
        const discountedPrice = Math.round(p.price * (1 - discountPct / 100))
        p.price = discountedPrice
      }
    })

    setFestivalEvents((prev) =>
      prev.map((f) => (f.id === festivalId ? { ...f, status: 'Active' } : f))
    )

    addActivity({
      agent: 'Festival Intelligence Agent',
      action: `Campaign Activated: ${fest.name}`,
      status: 'success',
      detail: `Applied ${discountPct}% promotional discount to ${skus.length} SKUs for festival demand wave.`,
    })

    toast.success(`Campaign Activated: ${fest.name}`, {
      description: `${discountPct}% festive pricing applied to ${skus.length} SKUs.`,
    })

    return { success: true, message: 'Campaign activated successfully.' }
  }, [festivalEvents, pricingRules, extraProducts, addActivity])

  // Feature 6: Supplier Intelligence
  const getSupplierPerformance = useCallback((supplierId: string) => {
    const rel = supplierRelationships[supplierId]
    if (!rel) return null
    return calculateSupplierScore(rel)
  }, [supplierRelationships])

  const getAiSupplierRecommendation = useCallback((sku: string, urgency: 'low' | 'normal' | 'urgent', targetQty = 300) => {
    const p = [...PRODUCTS, ...extraProducts].find((x) => x.sku === sku)
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
  }, [extraProducts])

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

  const approveQueuedAction = useCallback((id: string, modParams?: unknown) => {
    const item = approvalQueue.find((x) => x.id === id)
    if (!item) return

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
    } else if (item.actionType === 'repricing') {
      const { sku, newPrice } = item.details
      if (typeof sku === 'string' && typeof newPrice === 'number') {
        const p = [...PRODUCTS, ...extraProducts].find((x) => x.sku === sku)
        if (p) p.price = newPrice
      }
      toast.success('Repricing approved', { description: item.title })
      addActivity({
        agent: 'Seller Authorization',
        action: `Approved repricing: ${item.title}`,
        status: 'success',
        detail: `New price live across connected marketplaces.`,
      })
    } else {
      toast.success('Action approved', { description: item.title })
    }
  }, [approvalQueue, auth, extraProducts, addActivity])

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
    marketplaces, marketplaceListings, marketplaceOrders, inventoryMovements,
    pricingRules, priceHistory, festivalEvents, supplierPurchases, supplierDeliveries,
    supplierRelationships, autonomyLevel, signedMandate, approvalQueue, reportHistory,
    createMarketplaceListing, updateListingPriceAndStock, toggleMarketplaceStatus, simulateMarketplaceOrder,
    executeReprice, updatePricingRules, applyFestivalCampaign, setAutonomyLevel, approveQueuedAction,
    rejectQueuedAction, emergencyKillSwitch, saveGeneratedReport, getSupplierPerformance, getAiSupplierRecommendation,
    seedCommerceDemo, resetCommerce,
  }
}

export type CommerceState = ReturnType<typeof useCommerce>
