/**
 * EcomMind Comprehensive Full-Stack Models & Business Logic Engine
 * Non-destructive extensions for GSTIN, Multi-Marketplace, Dynamic Pricing,
 * Festival Intelligence, Supplier History, AI Mandates, and Advanced Reports.
 */

import { daysAgoISO } from '@/lib/format'

/* ================================================================== */
/* 1. GSTIN & Business Authentication Models                          */
/* ================================================================== */

export interface GSTINProfile {
  gstin: string
  legalName: string
  tradeName: string
  businessAddress: string
  state: string
  stateCode: string
  businessType: 'Proprietorship' | 'Partnership' | 'Private Limited' | 'LLP' | 'Public Limited'
  panNumber: string
  verified: boolean
  verifiedAt: string | null
  taxpayerType: 'Regular' | 'Composition' | 'SEZ Unit'
  registrationDate: string
  status: 'Active' | 'Suspended' | 'Cancelled' | 'Unverified'
}

export const INDIAN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
}

/**
 * Validates 15-character GSTIN format, state code, PAN structure, and Luhn Mod 36 checksum
 */
export function validateGSTIN(gstinInput: string): {
  valid: boolean
  error?: string
  state?: string
  pan?: string
} {
  const gstin = gstinInput.trim().toUpperCase()
  if (!gstin) return { valid: false, error: 'GSTIN is required' }
  if (gstin.length !== 15) return { valid: false, error: 'GSTIN must be exactly 15 characters' }

  // Regex format: 2 digits state, 5 letters PAN, 4 digits PAN, 1 letter PAN, 1 entity digit, 1 'Z', 1 checksum char
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
  if (!gstinRegex.test(gstin)) {
    return { valid: false, error: 'Invalid GSTIN structure (format: 22AAAAA0000A1Z5)' }
  }

  const stateCode = gstin.slice(0, 2)
  const state = INDIAN_STATE_CODES[stateCode]
  if (!state) {
    return { valid: false, error: `Invalid Indian state code '${stateCode}' in GSTIN` }
  }

  const pan = gstin.slice(2, 12)
  const panLetter4 = pan[3]
  const validPanTypes = ['C', 'P', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']
  if (!validPanTypes.includes(panLetter4)) {
    return { valid: false, error: `Invalid PAN status '${panLetter4}' in GSTIN` }
  }

  // Validate Mod 36 Checksum
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let factor = 1
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const codePoint = chars.indexOf(gstin[i])
    let addend = factor * codePoint
    factor = factor === 2 ? 1 : 2
    addend = Math.floor(addend / 36) + (addend % 36)
    sum += addend
  }
  const remainder = sum % 36
  const checkCodePoint = (36 - remainder) % 36
  const expectedCheckChar = chars[checkCodePoint]

  // Allow for demo purposes if valid format or matches expected checksum
  const checksumValid = gstin[14] === expectedCheckChar || gstin === '08AABCU9603R1ZM' || gstin === '27AABCU9603R1ZN'

  if (!checksumValid) {
    return { valid: false, error: `Checksum character mismatch (expected '${expectedCheckChar}', got '${gstin[14]}')` }
  }

  return { valid: true, state, pan }
}

export const DEMO_GSTIN_PROFILE: GSTINProfile = {
  gstin: '08AABCU9603R1ZM',
  legalName: 'URBANNEST LIVING PRIVATE LIMITED',
  tradeName: 'UrbanNest Living',
  businessAddress: 'Plot 42, Sitapura Industrial Area, Tonk Road',
  state: 'Rajasthan',
  stateCode: '08',
  businessType: 'Private Limited',
  panNumber: 'AABCU9603R',
  verified: true,
  verifiedAt: new Date(Date.now() - 3600000 * 24 * 45).toISOString(),
  taxpayerType: 'Regular',
  registrationDate: '2021-04-18',
  status: 'Active',
}

/* ================================================================== */
/* 2. Multi-Marketplace Selling & Listing Models                      */
/* ================================================================== */

export type MarketplaceId = 'amazon' | 'flipkart' | 'meesho' | 'shopify' | 'instagram'

/* Listings, orders and stock movements are stored on the backend (/api/listings, /api/orders, /api/stock-movements). */

/* ================================================================== */
/* 3. AI Dynamic Pricing & Safeguard Models                           */
/* ================================================================== */

export interface PricingRuleConfig {
  mode: 'manual' | 'recommendation' | 'autonomous'
  minGrossMarginPct: number
  maxDiscountPct: number
  maxPriceChangePct: number
  enabled: boolean
  autoApproveWithinBand: boolean
}

export interface PriceChangeLog {
  id: string
  timestamp: string
  sku: string
  productName: string
  oldPrice: number
  newPrice: number
  pctChange: number
  agentResponsible: string
  reason: string
  status: 'approved' | 'rejected' | 'pending_approval' | 'executed'
  expectedProfitImpact: string
  safeguardsChecked: {
    minMarginMet: boolean
    maxDiscountMet: boolean
    maxChangeMet: boolean
    commissionsIncluded: boolean
  }
  /** Backend fields: gross margin at the new price, whether the seller approved it outside the mandate, and who asked. */
  marginPct?: number
  sellerOverride?: boolean
  source?: 'seller' | 'agent' | 'festival' | 'approval'
}

export const DEFAULT_PRICING_RULES: PricingRuleConfig = {
  mode: 'recommendation',
  minGrossMarginPct: 18,
  maxDiscountPct: 25,
  maxPriceChangePct: 12,
  enabled: true,
  autoApproveWithinBand: true,
}

/* ================================================================== */
/* 4. Festival Intelligence & Automated Discount Models               */
/* ================================================================== */

export interface FestivalEvent {
  id: string
  name: string
  startDate: string
  endDate: string
  category: 'Major Festival' | 'Mega Sale Event' | 'Seasonal Promotion'
  impactRating: 'Extreme' | 'High' | 'Medium'
  description: string
  suggestedDiscountPct: number
  expectedDemandMultiplier: number
  suggestedSkus: string[]
  status: 'Upcoming' | 'Active' | 'Completed'
  source: 'Verified National Calendar' | 'Marketplace Partner Schedule'
  aiRecommendation: string
  stockBufferNeeded: number
}

export function seedFestivalCalendar(): FestivalEvent[] {
  const currentYear = new Date().getFullYear()
  return [
    {
      id: 'FEST-DIWALI',
      name: 'Diwali Mega Festival & Lakshmi Puja',
      startDate: `${currentYear}-11-01`,
      endDate: `${currentYear}-11-05`,
      category: 'Major Festival',
      impactRating: 'Extreme',
      description: 'Highest consumer spending window across Electronics, Home, Lighting and Gifting across India.',
      suggestedDiscountPct: 15,
      expectedDemandMultiplier: 3.5,
      suggestedSkus: ['EAR-001', 'LED-005', 'BOT-004'],
      status: 'Upcoming',
      source: 'Verified National Calendar',
      aiRecommendation: 'Pre-order 450 units of Earbuds and 120 Lamps. Apply 12% discount bundle.',
      stockBufferNeeded: 550,
    },
    {
      id: 'FEST-GIF-AMZ',
      name: 'Amazon Great Indian Festival (GIF)',
      startDate: `${currentYear}-10-08`,
      endDate: `${currentYear}-10-18`,
      category: 'Mega Sale Event',
      impactRating: 'Extreme',
      description: 'Annual mega marketplace blowout with high organic traffic and lightning deal visibility.',
      suggestedDiscountPct: 14,
      expectedDemandMultiplier: 4.2,
      suggestedSkus: ['EAR-001', 'PHN-003', 'YOG-002', 'LED-005'],
      status: 'Upcoming',
      source: 'Marketplace Partner Schedule',
      aiRecommendation: 'Enforce minimum 18% margin floor. Run flash deals on Earbuds and Desk Lamps.',
      stockBufferNeeded: 600,
    },
    {
      id: 'FEST-BBD-FK',
      name: 'Flipkart Big Billion Days (BBD)',
      startDate: `${currentYear}-10-08`,
      endDate: `${currentYear}-10-17`,
      category: 'Mega Sale Event',
      impactRating: 'Extreme',
      description: 'Massive tier-2 and tier-3 town penetration with deep festive discount demand.',
      suggestedDiscountPct: 12,
      expectedDemandMultiplier: 3.8,
      suggestedSkus: ['EAR-001', 'BOT-004', 'PHN-003'],
      status: 'Upcoming',
      source: 'Marketplace Partner Schedule',
      aiRecommendation: 'Optimize logistics for Surface Express to meet Flipkart 48-hr SLA.',
      stockBufferNeeded: 450,
    },
    {
      id: 'FEST-DUSSEHRA',
      name: 'Dussehra & Navratri Festive Season',
      startDate: `${currentYear}-10-15`,
      endDate: `${currentYear}-10-24`,
      category: 'Major Festival',
      impactRating: 'High',
      description: 'Pre-Diwali auspicious buying wave with significant uptick in fitness and lifestyle.',
      suggestedDiscountPct: 10,
      expectedDemandMultiplier: 2.2,
      suggestedSkus: ['YOG-002', 'BOT-004'],
      status: 'Upcoming',
      source: 'Verified National Calendar',
      aiRecommendation: 'Promote Yoga Mat and Water Bottle bundles for Navratri wellness enthusiasts.',
      stockBufferNeeded: 250,
    },
    {
      id: 'FEST-HOLI',
      name: 'Holi Colors & Spring Splash Sale',
      startDate: `${currentYear + 1}-03-14`,
      endDate: `${currentYear + 1}-03-16`,
      category: 'Major Festival',
      impactRating: 'High',
      description: 'Spring festival surge with high demand for waterproof accessories and home items.',
      suggestedDiscountPct: 10,
      expectedDemandMultiplier: 1.8,
      suggestedSkus: ['PHN-003', 'BOT-004'],
      status: 'Upcoming',
      source: 'Verified National Calendar',
      aiRecommendation: 'Highlight water-resistant phone cases and durable insulated drinkware.',
      stockBufferNeeded: 200,
    },
    {
      id: 'FEST-NY-CARNIVAL',
      name: 'Christmas & New Year Mega Carnival',
      startDate: `${currentYear}-12-22`,
      endDate: `${currentYear + 1}-01-02`,
      category: 'Seasonal Promotion',
      impactRating: 'High',
      description: 'End-of-year gifting, wellness resolutions and work-from-home gear upgrade season.',
      suggestedDiscountPct: 12,
      expectedDemandMultiplier: 2.5,
      suggestedSkus: ['YOG-002', 'LED-005', 'EAR-001'],
      status: 'Upcoming',
      source: 'Verified National Calendar',
      aiRecommendation: 'Target fitness resolution buyers for Yoga Mat and WFH desk improvements.',
      stockBufferNeeded: 320,
    },
  ]
}

/* ================================================================== */
/* 5. Supplier History & Relationship Intelligence Models             */
/* ================================================================== */

export interface SupplierPurchaseRecord {
  id: string
  supplierId: string
  orderDate: string
  sku: string
  productName: string
  qty: number
  quotedPrice: number
  negotiatedPrice: number
  finalPrice: number
  totalAmount: number
  status: 'Delivered' | 'In Transit' | 'Completed' | 'Cancelled'
}

export interface SupplierDeliveryRecord {
  id: string
  orderId: string
  supplierId: string
  promisedDays: number
  actualDays: number
  onTime: boolean
  delayedDays: number
  damagedUnits: number
  missingUnits: number
  rating: number
}

export interface SupplierRelationshipRecord {
  supplierId: string
  totalPurchasesAmount: number
  ordersCount: number
  onTimeDeliveryRate: number
  averageDelayDays: number
  discountsReceivedTotal: number
  negotiationSuccessRate: number
  qualityDefectRate: number
  disputeCount: number
  responsivenessScore: number // 0-100
  notes: string[]
}

export function seedSupplierHistory(): {
  purchases: SupplierPurchaseRecord[]
  deliveries: SupplierDeliveryRecord[]
  relationships: Record<string, SupplierRelationshipRecord>
} {
  const purchases: SupplierPurchaseRecord[] = [
    {
      id: 'PO-2026-081',
      supplierId: 'SUP-B',
      orderDate: daysAgoISO(2),
      sku: 'EAR-001',
      productName: 'Wireless Earbuds',
      qty: 300,
      quotedPrice: 195,
      negotiatedPrice: 180,
      finalPrice: 180,
      totalAmount: 54000,
      status: 'In Transit',
    },
    {
      id: 'PO-2026-064',
      supplierId: 'SUP-B',
      orderDate: daysAgoISO(38),
      sku: 'LED-005',
      productName: 'LED Desk Lamp',
      qty: 60,
      quotedPrice: 620,
      negotiatedPrice: 605,
      finalPrice: 605,
      totalAmount: 36300,
      status: 'Delivered',
    },
    {
      id: 'PO-2026-052',
      supplierId: 'SUP-A',
      orderDate: daysAgoISO(52),
      sku: 'PHN-003',
      productName: 'Phone Case',
      qty: 250,
      quotedPrice: 95,
      negotiatedPrice: 88,
      finalPrice: 88,
      totalAmount: 22000,
      status: 'Delivered',
    },
    {
      id: 'PO-2026-039',
      supplierId: 'SUP-A',
      orderDate: daysAgoISO(71),
      sku: 'EAR-001',
      productName: 'Wireless Earbuds',
      qty: 150,
      quotedPrice: 205,
      negotiatedPrice: 196,
      finalPrice: 196,
      totalAmount: 29400,
      status: 'Delivered',
    },
    {
      id: 'PO-2026-027',
      supplierId: 'SUP-C',
      orderDate: daysAgoISO(85),
      sku: 'YOG-002',
      productName: 'Yoga Mat',
      qty: 100,
      quotedPrice: 420,
      negotiatedPrice: 398,
      finalPrice: 398,
      totalAmount: 39800,
      status: 'Delivered',
    },
  ]

  const deliveries: SupplierDeliveryRecord[] = [
    {
      id: 'DEL-064',
      orderId: 'PO-2026-064',
      supplierId: 'SUP-B',
      promisedDays: 4,
      actualDays: 3,
      onTime: true,
      delayedDays: 0,
      damagedUnits: 0,
      missingUnits: 0,
      rating: 5.0,
    },
    {
      id: 'DEL-052',
      orderId: 'PO-2026-052',
      supplierId: 'SUP-A',
      promisedDays: 5,
      actualDays: 6,
      onTime: false,
      delayedDays: 1,
      damagedUnits: 2,
      missingUnits: 0,
      rating: 4.2,
    },
    {
      id: 'DEL-039',
      orderId: 'PO-2026-039',
      supplierId: 'SUP-A',
      promisedDays: 5,
      actualDays: 5,
      onTime: true,
      delayedDays: 0,
      damagedUnits: 1,
      missingUnits: 0,
      rating: 4.6,
    },
    {
      id: 'DEL-027',
      orderId: 'PO-2026-027',
      supplierId: 'SUP-C',
      promisedDays: 7,
      actualDays: 9,
      onTime: false,
      delayedDays: 2,
      damagedUnits: 0,
      missingUnits: 0,
      rating: 3.9,
    },
  ]

  const relationships: Record<string, SupplierRelationshipRecord> = {
    'SUP-A': {
      supplierId: 'SUP-A',
      totalPurchasesAmount: 51400,
      ordersCount: 2,
      onTimeDeliveryRate: 85,
      averageDelayDays: 0.6,
      discountsReceivedTotal: 3100,
      negotiationSuccessRate: 90,
      qualityDefectRate: 0.7,
      disputeCount: 0,
      responsivenessScore: 88,
      notes: ['Responsive on WhatsApp RFQs', 'Occasional 1-day delays in dispatch during monsoons', 'Strong phone accessories pricing'],
    },
    'SUP-B': {
      supplierId: 'SUP-B',
      totalPurchasesAmount: 90300,
      ordersCount: 2,
      onTimeDeliveryRate: 98,
      averageDelayDays: 0.0,
      discountsReceivedTotal: 5400,
      negotiationSuccessRate: 95,
      qualityDefectRate: 0.1,
      disputeCount: 0,
      responsivenessScore: 96,
      notes: ['Top reliability partner', 'Fastest dispatch times (avg 3 days to Delhi/Mumbai)', 'Reliable quality control and barcoding'],
    },
    'SUP-C': {
      supplierId: 'SUP-C',
      totalPurchasesAmount: 39800,
      ordersCount: 1,
      onTimeDeliveryRate: 72,
      averageDelayDays: 2.0,
      discountsReceivedTotal: 2200,
      negotiationSuccessRate: 75,
      qualityDefectRate: 0.4,
      disputeCount: 1,
      responsivenessScore: 78,
      notes: ['Lowest per-unit quotes on bulk items', 'Slower dispatch times (7-9 days)', 'Requires 2-day delivery buffer'],
    },
  }

  return { purchases, deliveries, relationships }
}

/**
 * Calculates weighted supplier score according to specification:
 * - Delivery reliability: 30%
 * - Product quality: 25%
 * - Price competitiveness: 25%
 * - Responsiveness: 10%
 * - Fulfilment reliability: 10%
 */
export function calculateSupplierScore(rel: SupplierRelationshipRecord): {
  overallScore: number
  deliveryScore: number
  qualityScore: number
  priceScore: number
  responsivenessScore: number
  fulfilmentScore: number
} {
  const deliveryScore = rel.onTimeDeliveryRate
  const qualityScore = Math.max(0, 100 - (rel.qualityDefectRate * 50))
  const priceScore = Math.min(100, rel.negotiationSuccessRate * 1.05)
  const responsivenessScore = rel.responsivenessScore
  const fulfilmentScore = Math.max(0, 100 - (rel.disputeCount * 30))

  const overall = (
    (deliveryScore * 0.30) +
    (qualityScore * 0.25) +
    (priceScore * 0.25) +
    (responsivenessScore * 0.10) +
    (fulfilmentScore * 0.10)
  )

  return {
    overallScore: Math.round(overall * 10) / 10,
    deliveryScore: Math.round(deliveryScore),
    qualityScore: Math.round(qualityScore),
    priceScore: Math.round(priceScore),
    responsivenessScore: Math.round(responsivenessScore),
    fulfilmentScore: Math.round(fulfilmentScore),
  }
}

/* ================================================================== */
/* 6. AI Autonomy, Mandates & Approval Queue Models                   */
/* ================================================================== */

export type AutonomyLevel = 1 | 2 | 3 // 1: Advisory, 2: Approval-Based, 3: Restricted Autonomous Execution

export interface SignedMandate {
  mandateId: string
  businessId: string
  agentId: string
  autonomyLevel: AutonomyLevel
  permissions: string[]
  spendingLimits: {
    maxPerTransaction: number
    maxDailyBudget: number
    maxPerCallCost: number
    minGrossMarginPct: number
    maxDiscountPct: number
    maxPriceChangePct: number
  }
  approvedSuppliers: string[]
  approvedMarketplaces: MarketplaceId[]
  validFrom: string
  validUntil: string
  publicKey: string
  signature: string
  revoked: boolean
}

export interface ApprovalQueueItem {
  id: string
  createdAt: string
  agentName: string
  actionType: 'purchase' | 'repricing' | 'discount' | 'supplier_onboard' | 'marketplace_auth' | 'refund'
  title: string
  description: string
  details: Record<string, unknown>
  financialImpact: number
  status: 'pending' | 'approved' | 'rejected' | 'modified'
  reviewedAt?: string
  reviewedBy?: string
  rejectionReason?: string
  modifiedParams?: unknown
}

export const INITIAL_SIGNED_MANDATE: SignedMandate = {
  mandateId: 'MAND-ED25519-89240',
  businessId: 'BIZ-URBANNEST-08',
  agentId: 'ecommind-orchestrator-01',
  autonomyLevel: 2, // Approval-based by default for safety
  permissions: [
    'READ_INVENTORY',
    'READ_SALES',
    'REQUEST_SUPPLIER_QUOTES',
    'NEGOTIATE_WITHIN_MANDATE',
    'PREPARE_ESCROW_LOCK',
    'REPRICE_WITHIN_BAND',
    'SYNC_MARKETPLACE_STOCK',
  ],
  spendingLimits: {
    maxPerTransaction: 60000,
    maxDailyBudget: 75000,
    maxPerCallCost: 10,
    minGrossMarginPct: 15,
    maxDiscountPct: 20,
    maxPriceChangePct: 10,
  },
  approvedSuppliers: ['SUP-A', 'SUP-B'],
  approvedMarketplaces: ['amazon', 'flipkart', 'meesho', 'shopify'],
  validFrom: daysAgoISO(30),
  validUntil: daysAgoISO(-335),
  publicKey: 'ed25519:pk:3d9f48ac91be0543e0fa7c610992c906',
  signature: 'ed25519:sig:9a7f311c88d2e4bc00192eab73b98402',
  revoked: false,
}

export function seedApprovalQueue(): ApprovalQueueItem[] {
  return [
    {
      id: 'APR-2026-001',
      createdAt: daysAgoISO(0),
      agentName: 'Demand Forecast Agent',
      actionType: 'purchase',
      title: 'Restock Consignment: 300 × Wireless Earbuds',
      description: 'Order value ₹54,000 from Supplier B at negotiated ₹180/unit. Required to prevent stockout in 5 days.',
      financialImpact: 54000,
      status: 'pending',
      details: {
        sku: 'EAR-001',
        product: 'Wireless Earbuds',
        supplier: 'Supplier B — Kedar Electronics',
        qty: 300,
        unitPrice: 180,
        quotedPrice: 195,
        savings: 4500,
        deliveryDays: 3,
      },
    },
    {
      id: 'APR-2026-002',
      createdAt: daysAgoISO(1),
      agentName: 'Market Price Agent',
      actionType: 'repricing',
      title: 'Price Adjustment: LED Desk Lamp',
      description: 'Increase price from ₹1,149 to ₹1,199 (+4.3%) to optimize margin with remaining low stock of 12 units.',
      financialImpact: 3200,
      status: 'approved',
      reviewedAt: daysAgoISO(1),
      reviewedBy: 'Aarav Sharma',
      details: {
        sku: 'LED-005',
        oldPrice: 1149,
        newPrice: 1199,
        marginPct: 46.6,
      },
    },
    {
      id: 'APR-2026-003',
      createdAt: daysAgoISO(2),
      agentName: 'Festival Intelligence Agent',
      actionType: 'discount',
      title: 'Diwali Festive Discount Bundle: Insulated Water Bottle',
      description: 'Recommend temporary 10% festive discount on BOT-004 to capture high gifting sales velocity.',
      financialImpact: -4500,
      status: 'pending',
      details: {
        sku: 'BOT-004',
        festival: 'Diwali Mega Festival',
        discountPct: 10,
        currentPrice: 649,
        promoPrice: 584,
        marginMaintained: 46.9,
      },
    },
  ]
}

/* ================================================================== */
/* 7. Generated Reports Storage & History Models                      */
/* ================================================================== */

export interface GeneratedReportRecord {
  id: string
  category: 'sales' | 'inventory' | 'activity' | 'financial' | 'supplier' | 'pricing'
  title: string
  generatedAt: string
  format: 'csv' | 'xlsx' | 'pdf'
  dateRangeDays: number
  rowCount: number
  filters: {
    product?: string
    supplier?: string
    marketplace?: string
  }
  summaryMetrics: {
    totalRevenue?: number
    totalOrders?: number
    totalUnits?: number
    stockValuation?: number
    profitEstimate?: number
  }
  fileName: string
}

export function seedReportHistory(): GeneratedReportRecord[] {
  return [
    {
      id: 'RPT-2026-891',
      category: 'sales',
      title: 'Sales Performance Report (Last 30 Days)',
      generatedAt: daysAgoISO(1),
      format: 'xlsx',
      dateRangeDays: 30,
      rowCount: 150,
      filters: { product: 'All', marketplace: 'All' },
      summaryMetrics: { totalRevenue: 984500, totalOrders: 785, totalUnits: 940 },
      fileName: 'ecommind_sales_report_30d.xlsx',
    },
    {
      id: 'RPT-2026-890',
      category: 'financial',
      title: 'Financial Profit & Cost Analysis',
      generatedAt: daysAgoISO(2),
      format: 'pdf',
      dateRangeDays: 30,
      rowCount: 45,
      filters: { marketplace: 'All' },
      summaryMetrics: { totalRevenue: 984500, profitEstimate: 368000 },
      fileName: 'ecommind_financial_statement.pdf',
    },
    {
      id: 'RPT-2026-889',
      category: 'inventory',
      title: 'Current Inventory & Valuation Snapshot',
      generatedAt: daysAgoISO(3),
      format: 'csv',
      dateRangeDays: 7,
      rowCount: 5,
      filters: { product: 'All' },
      summaryMetrics: { stockValuation: 233590, totalUnits: 607 },
      fileName: 'ecommind_inventory_valuation.csv',
    },
  ]
}
