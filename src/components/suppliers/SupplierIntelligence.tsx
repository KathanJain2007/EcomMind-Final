import { useMemo, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { SUPPLIERS } from '@/data/demo'
import { cx, formatDate, formatINR } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

/* Supplier relationship intelligence (scores, AI selector, PO history).
   Runs on the demo supplier history kept in the browser. */

export function SupplierScores() {
  const { supplierRelationships, getSupplierPerformance } = useApp()
  const hasData = Object.keys(supplierRelationships).length > 0
  if (!hasData) return <EmptyHistory />
  return (
    <div className="space-y-6">
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
    </div>
  )
}

export function AiProcurementSelector({ onRequestRfq }: { onRequestRfq: (supplierId: string, sku: string) => void }) {
  const { getAiSupplierRecommendation, catalog } = useApp()
  const [aiSku, setAiSku] = useState('EAR-001')
  const [aiUrgency, setAiUrgency] = useState<'low' | 'normal' | 'urgent'>('urgent')
  const [aiTargetQty, setAiTargetQty] = useState(300)
  const aiRecommendation = useMemo(
    () => getAiSupplierRecommendation(aiSku, aiUrgency, aiTargetQty),
    [aiSku, aiUrgency, aiTargetQty, getAiSupplierRecommendation]
  )
  return (
    <div className="space-y-6">
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
                      {catalog.map((p) => (
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
                    onClick={() => onRequestRfq(aiRecommendation.recommendedSupplierId, aiSku)}
                  >
                    <Send className="h-3.5 w-3.5" /> Initialize Recommended Procurement RFQ
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
    </div>
  )
}

export function PurchaseHistory() {
  const { supplierPurchases } = useApp()
  if (supplierPurchases.length === 0) return <EmptyHistory />
  return (
    <div className="space-y-4">
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
    </div>
  )
}

function EmptyHistory() {
  return <div className="card-surface p-12 text-center text-xs text-muted-foreground">No supplier history yet. Load the demo business to see relationship scores and past purchase orders.</div>
}
