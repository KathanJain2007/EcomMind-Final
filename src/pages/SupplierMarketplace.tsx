import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  BadgeCheck,
  Factory, FileText, History, MapPin, Send, ShieldCheck, Sparkles, Star,
} from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { PRODUCTS, SUPPLIERS, SUPPLIER_QUOTES } from '@/data/demo'
import { cx, formatINR, formatNum, formatDate } from '@/lib/format'
import { EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

export default function SupplierMarketplace() {
  const {
    demoLoaded, loadDemoBusiness, addActivity,
    supplierPurchases, supplierRelationships,
    getSupplierPerformance, getAiSupplierRecommendation,
  } = useApp()

  const [activeTab, setActiveTab] = useState('marketplace')
  const [skuFilter, setSkuFilter] = useState('All')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxDays, setMaxDays] = useState('')
  const [rfq, setRfq] = useState<{ supplierId: string; sku: string } | null>(null)
  const [qty, setQty] = useState('300')
  const [sending, setSending] = useState(false)
  const navigate = useNavigate()

  // AI Selector state
  const [aiSku, setAiSku] = useState('EAR-001')
  const [aiUrgency, setAiUrgency] = useState<'low' | 'normal' | 'urgent'>('urgent')
  const [aiTargetQty, setAiTargetQty] = useState(300)

  const aiRecommendation = useMemo(
    () => getAiSupplierRecommendation(aiSku, aiUrgency, aiTargetQty),
    [aiSku, aiUrgency, aiTargetQty, getAiSupplierRecommendation]
  )

  const quotes = useMemo(() => SUPPLIER_QUOTES.filter((q) => {
    if (skuFilter !== 'All' && q.sku !== skuFilter) return false
    if (maxPrice && q.unitPrice > Number(maxPrice)) return false
    if (maxDays && q.deliveryDays > Number(maxDays)) return false
    return true
  }), [skuFilter, maxPrice, maxDays])

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Supplier Marketplace & Intelligence" subtitle="Verified supplier agents ready to quote, negotiate, and deliver." />
        <EmptyState
          title="No suppliers discovered yet"
          body="Load the demo business to meet 3 supplier agents with live quotes, relationship history, and AI supplier selection."
          action={
            <Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>
              Load Demo Business
            </Button>
          }
        />
      </>
    )
  }

  const earbudsQuotes = SUPPLIER_QUOTES.filter((q) => q.sku === 'EAR-001')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Marketplace & Relationship Intelligence"
        subtitle="Manage supplier procurement, compare live quotations, track delivery SLAs, and leverage historical relationship memory."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="h-10 bg-secondary/60 p-1">
          <TabsTrigger value="marketplace" className="gap-2 text-xs">
            <Factory className="h-3.5 w-3.5" />
            <span>Active Marketplace & RFQs</span>
          </TabsTrigger>

          <TabsTrigger value="intelligence" className="gap-2 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-soft" />
            <span>Supplier Performance Scores</span>
          </TabsTrigger>

          <TabsTrigger value="ai-recommend" className="gap-2 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-warning" />
            <span>AI Procurement Selector</span>
          </TabsTrigger>

          <TabsTrigger value="history" className="gap-2 text-xs">
            <History className="h-3.5 w-3.5" />
            <span>Delivery & PO History</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Marketplace & RFQs (Preserved 100%) */}
        <TabsContent value="marketplace" className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={skuFilter} onValueChange={setSkuFilter}>
              <SelectTrigger className="w-52 h-9 text-xs" aria-label="Filter by product">
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All products</SelectItem>
                {PRODUCTS.map((p) => (
                  <SelectItem key={p.sku} value={p.sku}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
              <Label htmlFor="f-price" className="text-xs text-muted-foreground whitespace-nowrap">
                Max ₹/unit
              </Label>
              <Input
                id="f-price"
                type="number"
                min={0}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Any"
                className="w-24 h-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Label htmlFor="f-days" className="text-xs text-muted-foreground whitespace-nowrap">
                Max delivery days
              </Label>
              <Input
                id="f-days"
                type="number"
                min={0}
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value)}
                placeholder="Any"
                className="w-24 h-9 text-xs"
              />
            </div>

            {(skuFilter !== 'All' || maxPrice || maxDays) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSkuFilter('All')
                  setMaxPrice('')
                  setMaxDays('')
                }}
                className="h-9 text-xs"
              >
                Reset
              </Button>
            )}
          </div>

          {/* Supplier cards */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {SUPPLIERS.map((s) => {
              const headline = earbudsQuotes.find((q) => q.supplierId === s.id)
              const score = getSupplierPerformance(s.id)

              return (
                <Card key={s.id} className="card-surface card-hover flex flex-col justify-between">
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-brand-soft">
                        <Factory className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {score && (
                          <Badge variant="outline" className="text-[10px] font-mono border-brand/40 text-brand-soft">
                            Score {score.overallScore}/100
                          </Badge>
                        )}
                        {s.verified ? (
                          <StatusBadge label="Verified" tone="success" />
                        ) : (
                          <StatusBadge label="Unverified" tone="warning" />
                        )}
                      </div>
                    </div>

                    <h3 className="text-[15px] font-semibold text-foreground">{s.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="font-mono">{s.agentId}</span> · <MapPin className="h-3 w-3" aria-hidden />
                      {s.location}
                    </p>

                    {headline && (
                      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border bg-secondary/40 p-3 text-center">
                        <div>
                          <p className="tabular text-base font-semibold">{formatINR(headline.unitPrice)}</p>
                          <p className="text-[10px] text-muted-foreground">starting /unit</p>
                        </div>
                        <div>
                          <p className="tabular text-base font-semibold">{headline.deliveryDays}d</p>
                          <p className="text-[10px] text-muted-foreground">delivery</p>
                        </div>
                        <div>
                          <p className="tabular flex items-center justify-center gap-1 text-base font-semibold">
                            <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
                            {s.rating}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{s.reviews} reviews</p>
                        </div>
                      </div>
                    )}

                    <div className="mt-4">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Catalogue · available stock
                      </p>
                      <div className="space-y-1">
                        {s.catalogue.map((sku) => {
                          const q = SUPPLIER_QUOTES.find((x) => x.supplierId === s.id && x.sku === sku)
                          const p = PRODUCTS.find((x) => x.sku === sku)!
                          return (
                            <div key={sku} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{p.name}</span>
                              <span className="tabular font-medium">
                                {q ? `${formatNum(q.available)} units · ${formatINR(q.unitPrice)}` : 'on request'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <Button
                      className="btn-glow mt-5 w-full border-0 text-white text-xs"
                      size="sm"
                      onClick={() => setRfq({ supplierId: s.id, sku: s.catalogue[0] })}
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden /> Request quotation
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Comparison table */}
          <div className="card-surface overflow-x-auto">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
              <FileText className="h-4 w-4 text-brand-soft" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Quotation comparison</h2>
              <span className="text-xs text-muted-foreground">
                · {quotes.length} quotes{skuFilter !== 'All' ? ` for ${PRODUCTS.find((p) => p.sku === skuFilter)?.name}` : ''}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {['Supplier', 'Product', 'Unit price', 'MOQ', 'Available', 'Delivery', 'Rating', 'Valid till', ''].map(
                    (h) => (
                      <TableHead
                        key={h}
                        className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {h}
                      </TableHead>
                    )
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => {
                  const s = SUPPLIERS.find((x) => x.id === q.supplierId)!
                  const p = PRODUCTS.find((x) => x.sku === q.sku)!
                  const best = quotes.filter((x) => x.sku === q.sku).every((x) => q.unitPrice <= x.unitPrice)
                  return (
                    <TableRow key={q.id} className="border-border hover:bg-secondary/40">
                      <TableCell className="whitespace-nowrap font-medium text-xs">
                        <span className="flex items-center gap-1.5">
                          {s.name.split('—')[0].trim()}
                          {s.verified && <BadgeCheck className="h-3.5 w-3.5 text-success" aria-hidden />}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{p.name}</TableCell>
                      <TableCell className={cx('tabular text-xs font-semibold', best && 'text-success')}>
                        {formatINR(q.unitPrice)}
                        {best && <span className="ml-1 text-[10px] font-medium text-success">best</span>}
                      </TableCell>
                      <TableCell className="tabular text-xs">{q.moq}</TableCell>
                      <TableCell className="tabular text-xs">{formatNum(q.available)}</TableCell>
                      <TableCell className="tabular text-xs">{q.deliveryDays} days</TableCell>
                      <TableCell className="tabular text-xs">★ {s.rating}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(q.validTill).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setRfq({ supplierId: q.supplierId, sku: q.sku })}
                        >
                          Negotiate
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 2: Supplier Performance Scores (Feature 6 Spec) */}
        <TabsContent value="intelligence" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {SUPPLIERS.map((s) => {
              const rel = supplierRelationships[s.id]
              const score = getSupplierPerformance(s.id)
              if (!rel || !score) return null

              return (
                <Card key={s.id} className="card-surface">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-foreground">{s.name}</h4>
                        <p className="text-xs text-muted-foreground">{s.location} · {rel.ordersCount} completed POs</p>
                      </div>
                      <div className="rounded-xl border border-border bg-brand/10 p-2 text-center">
                        <span className="tabular text-xl font-extrabold text-brand-soft">{score.overallScore}</span>
                        <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Score / 100</span>
                      </div>
                    </div>

                    {/* 5-Criteria Weighted Scoring */}
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Delivery Reliability (30%)</span>
                          <span className="font-semibold">{score.deliveryScore}%</span>
                        </div>
                        <Progress value={score.deliveryScore} className="h-1.5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Product Quality (25%)</span>
                          <span className="font-semibold">{score.qualityScore}%</span>
                        </div>
                        <Progress value={score.qualityScore} className="h-1.5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Price Competitiveness (25%)</span>
                          <span className="font-semibold">{score.priceScore}%</span>
                        </div>
                        <Progress value={score.priceScore} className="h-1.5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Responsiveness (10%)</span>
                          <span className="font-semibold">{score.responsivenessScore}%</span>
                        </div>
                        <Progress value={score.responsivenessScore} className="h-1.5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Fulfilment Reliability (10%)</span>
                          <span className="font-semibold">{score.fulfilmentScore}%</span>
                        </div>
                        <Progress value={score.fulfilmentScore} className="h-1.5" />
                      </div>
                    </div>

                    {/* Relationship Memory Notes */}
                    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1.5 text-xs">
                      <p className="font-semibold text-foreground text-[11px] uppercase tracking-wide">
                        Relationship Memory & Track Record
                      </p>
                      <ul className="space-y-1 text-muted-foreground text-[11px]">
                        {rel.notes.map((n, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-brand-soft">•</span>
                            <span>{n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* TAB 3: AI Procurement Selector */}
        <TabsContent value="ai-recommend" className="space-y-6">
          <Card className="card-surface">
            <CardContent className="p-5 space-y-5">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Sparkles className="h-4 w-4 text-brand-soft" />
                <h3 className="text-sm font-semibold text-foreground">AI Procurement & Supplier Selection Engine</h3>
              </div>

              {/* Selector Controls */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Product to Replenish</Label>
                  <Select value={aiSku} onValueChange={setAiSku}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCTS.map((p) => (
                        <SelectItem key={p.sku} value={p.sku}>
                          {p.name} ({p.sku})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Order Urgency & Stock Level</Label>
                  <Select value={aiUrgency} onValueChange={(v) => setAiUrgency(v as 'low' | 'normal' | 'urgent')}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent (&lt; 5 Days Coverage Remaining)</SelectItem>
                      <SelectItem value="normal">Normal (Regular Replenishment Cycle)</SelectItem>
                      <SelectItem value="low">Low Urgency (Bulk Restock Discount Focus)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Target Order Quantity</Label>
                  <Input
                    type="number"
                    value={aiTargetQty}
                    onChange={(e) => setAiTargetQty(Number(e.target.value))}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              {/* AI Recommendation Box */}
              <div className="rounded-xl border border-brand/40 bg-brand/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-brand text-white text-xs">Top AI Choice</Badge>
                    <span className="font-bold text-sm text-foreground">
                      {SUPPLIERS.find((s) => s.id === aiRecommendation.recommendedSupplierId)?.name}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs text-success border-success/30">
                    Highest Fit Rationale
                  </Badge>
                </div>

                <p className="text-xs leading-relaxed text-foreground bg-card/60 p-3 rounded-lg border border-border">
                  {aiRecommendation.reason}
                </p>

                {/* Candidate Comparison Table */}
                <div className="pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">
                    Multi-Factor Candidate Tradeoff Analysis
                  </p>
                  <div className="divide-y divide-border rounded-lg border border-border bg-card/50 text-xs">
                    {aiRecommendation.comparison.map((c) => (
                      <div
                        key={c.supplierId}
                        className={cx(
                          'flex items-center justify-between p-3',
                          c.supplierId === aiRecommendation.recommendedSupplierId && 'bg-brand/10 font-medium'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{c.name.split('—')[0].trim()}</span>
                          <span className="text-muted-foreground">· Quote: {formatINR(c.quote)}/unit</span>
                          <span className="text-muted-foreground">· SLA: {c.days} days</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground font-mono">{c.score} Score</span>
                          <Badge
                            variant={c.supplierId === aiRecommendation.recommendedSupplierId ? 'default' : 'secondary'}
                            className="text-[10px]"
                          >
                            {c.verdict}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    className="btn-glow border-0 text-white text-xs gap-1.5"
                    onClick={() => {
                      setRfq({ supplierId: aiRecommendation.recommendedSupplierId, sku: aiSku })
                    }}
                  >
                    <Send className="h-3.5 w-3.5" /> Initialize Recommended Procurement RFQ
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: Delivery History & Past Orders */}
        <TabsContent value="history" className="space-y-4">
          <Card className="card-surface overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h4 className="text-sm font-semibold text-foreground">Purchase Order History & Fulfilment SLAs</h4>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">PO Number</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Date</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Supplier</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Product & Qty</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Quoted Price</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Final Settled</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Total Spent</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Fulfilment Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierPurchases.map((p) => {
                  const s = SUPPLIERS.find((x) => x.id === p.supplierId)
                  return (
                    <TableRow key={p.id} className="border-border hover:bg-secondary/40 text-xs">
                      <TableCell className="font-mono font-medium">{p.id}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(p.orderDate)}</TableCell>
                      <TableCell className="font-medium">{s?.name || p.supplierId}</TableCell>
                      <TableCell>{p.qty} × {p.productName}</TableCell>
                      <TableCell className="tabular text-muted-foreground">{formatINR(p.quotedPrice)}</TableCell>
                      <TableCell className="tabular font-bold text-success">{formatINR(p.finalPrice)}</TableCell>
                      <TableCell className="tabular font-semibold">{formatINR(p.totalAmount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* RFQ modal (Preserved from existing application) */}
      <Dialog open={!!rfq} onOpenChange={(o) => !o && setRfq(null)}>
        <DialogContent aria-describedby={undefined} className="border-border bg-popover sm:max-w-md">
          {rfq && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">Request Quotation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-lg border border-border bg-secondary/40 px-3.5 py-3 text-xs">
                  <p className="font-semibold text-foreground">{SUPPLIERS.find((s) => s.id === rfq.supplierId)?.name}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {PRODUCTS.find((p) => p.sku === rfq.sku)?.name} · agent {SUPPLIERS.find((s) => s.id === rfq.supplierId)?.agentId}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Product</Label>
                  <Select value={rfq.sku} onValueChange={(v) => setRfq({ ...rfq, sku: v })}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCTS.map((p) => (
                        <SelectItem key={p.sku} value={p.sku}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rfq-qty" className="text-xs">Quantity (units)</Label>
                  <Input
                    id="rfq-qty"
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setRfq(null)}>
                  Cancel
                </Button>
                <Button
                  className="btn-glow border-0 text-white text-xs"
                  size="sm"
                  disabled={sending || !(Number(qty) > 0)}
                  onClick={() => {
                    setSending(true)
                    setTimeout(() => {
                      const sName = SUPPLIERS.find((s) => s.id === rfq.supplierId)?.name.split('—')[0].trim()
                      const pName = PRODUCTS.find((p) => p.sku === rfq.sku)?.name
                      addActivity({
                        agent: 'EcomMind',
                        action: `RFQ sent to ${sName}`,
                        product: pName,
                        status: 'info',
                        detail: `${qty} units requested · quote expected within minutes.`,
                      })
                      toast.success('Quotation requested', {
                        description: `${sName} will respond shortly. Continue in the Negotiation Center.`,
                      })
                      setSending(false)
                      setRfq(null)
                      navigate('/negotiations')
                    }, 900)
                  }}
                >
                  {sending ? 'Sending…' : 'Send RFQ'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
