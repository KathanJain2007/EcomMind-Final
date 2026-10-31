import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { BadgeCheck, Factory, FileText, MapPin, Send, Star } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { PRODUCTS, SUPPLIERS, SUPPLIER_QUOTES } from '@/data/demo'
import { cx, formatINR, formatNum } from '@/lib/format'
import { EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function SupplierMarketplace() {
  const { demoLoaded, loadDemoBusiness, addActivity } = useApp()
  const [skuFilter, setSkuFilter] = useState('All')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxDays, setMaxDays] = useState('')
  const [rfq, setRfq] = useState<{ supplierId: string; sku: string } | null>(null)
  const [qty, setQty] = useState('300')
  const [sending, setSending] = useState(false)
  const navigate = useNavigate()

  const quotes = useMemo(() => SUPPLIER_QUOTES.filter((q) => {
    if (skuFilter !== 'All' && q.sku !== skuFilter) return false
    if (maxPrice && q.unitPrice > Number(maxPrice)) return false
    if (maxDays && q.deliveryDays > Number(maxDays)) return false
    return true
  }), [skuFilter, maxPrice, maxDays])

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Supplier Marketplace" subtitle="Verified supplier agents ready to quote and negotiate." />
        <EmptyState title="No suppliers discovered yet" body="Load the demo business to meet 3 supplier agents with live quotes and catalogues." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  const earbudsQuotes = SUPPLIER_QUOTES.filter((q) => q.sku === 'EAR-001')

  return (
    <div>
      <PageHeader title="Supplier Marketplace" subtitle="Supplier agents with live catalogues, pricing and delivery commitments." />

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select value={skuFilter} onValueChange={setSkuFilter}>
          <SelectTrigger className="w-52" aria-label="Filter by product"><SelectValue placeholder="All products" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All products</SelectItem>
            {PRODUCTS.map((p) => <SelectItem key={p.sku} value={p.sku}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="f-price" className="text-xs text-muted-foreground whitespace-nowrap">Max ₹/unit</Label>
          <Input id="f-price" type="number" min={0} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Any" className="w-24" />
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="f-days" className="text-xs text-muted-foreground whitespace-nowrap">Max delivery days</Label>
          <Input id="f-days" type="number" min={0} value={maxDays} onChange={(e) => setMaxDays(e.target.value)} placeholder="Any" className="w-24" />
        </div>
        {(skuFilter !== 'All' || maxPrice || maxDays) && (
          <Button variant="ghost" size="sm" onClick={() => { setSkuFilter('All'); setMaxPrice(''); setMaxDays('') }}>Reset</Button>
        )}
      </div>

      {/* Supplier cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {SUPPLIERS.map((s) => {
          const headline = earbudsQuotes.find((q) => q.supplierId === s.id)
          return (
            <Card key={s.id} className="card-surface card-hover">
              <CardContent className="p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-brand-soft">
                    <Factory className="h-5 w-5" aria-hidden />
                  </div>
                  {s.verified ? <StatusBadge label="Verified" tone="success" /> : <StatusBadge label="Unverified" tone="warning" />}
                </div>
                <h3 className="text-[15px] font-semibold">{s.name}</h3>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="font-mono">{s.agentId}</span> · <MapPin className="h-3 w-3" aria-hidden />{s.location}
                </p>
                {headline && (
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border bg-secondary/40 p-3 text-center">
                    <div><p className="tabular text-base font-semibold">{formatINR(headline.unitPrice)}</p><p className="text-[10px] text-muted-foreground">starting /unit</p></div>
                    <div><p className="tabular text-base font-semibold">{headline.deliveryDays}d</p><p className="text-[10px] text-muted-foreground">delivery</p></div>
                    <div><p className="tabular flex items-center justify-center gap-1 text-base font-semibold"><Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />{s.rating}</p><p className="text-[10px] text-muted-foreground">{s.reviews} reviews</p></div>
                  </div>
                )}
                <div className="mt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Catalogue · available stock</p>
                  <div className="space-y-1">
                    {s.catalogue.map((sku) => {
                      const q = SUPPLIER_QUOTES.find((x) => x.supplierId === s.id && x.sku === sku)
                      const p = PRODUCTS.find((x) => x.sku === sku)!
                      return (
                        <div key={sku} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{p.name}</span>
                          <span className="tabular">{q ? `${formatNum(q.available)} units · ${formatINR(q.unitPrice)}` : 'on request'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <Button className="btn-glow mt-4 w-full border-0 text-white" size="sm" onClick={() => setRfq({ supplierId: s.id, sku: s.catalogue[0] })}>
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
          <h2 className="text-sm font-semibold">Quotation comparison</h2>
          <span className="text-xs text-muted-foreground">· {quotes.length} quotes{skuFilter !== 'All' ? ` for ${PRODUCTS.find((p) => p.sku === skuFilter)?.name}` : ''}</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {['Supplier', 'Product', 'Unit price', 'MOQ', 'Available', 'Delivery', 'Rating', 'Valid till', ''].map((h) => (
                <TableHead key={h} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((q) => {
              const s = SUPPLIERS.find((x) => x.id === q.supplierId)!
              const p = PRODUCTS.find((x) => x.sku === q.sku)!
              const best = quotes.filter((x) => x.sku === q.sku).every((x) => q.unitPrice <= x.unitPrice)
              return (
                <TableRow key={q.id} className="border-border">
                  <TableCell className="font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">{s.name.split('—')[0].trim()}{s.verified && <BadgeCheck className="h-3.5 w-3.5 text-success" aria-hidden />}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{p.name}</TableCell>
                  <TableCell className={cx('tabular font-semibold', best && 'text-success')}>{formatINR(q.unitPrice)}{best && <span className="ml-1 text-[10px] font-medium">best</span>}</TableCell>
                  <TableCell className="tabular">{q.moq}</TableCell>
                  <TableCell className="tabular">{formatNum(q.available)}</TableCell>
                  <TableCell className="tabular">{q.deliveryDays} days</TableCell>
                  <TableCell className="tabular">★ {s.rating}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{new Date(q.validTill).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRfq({ supplierId: q.supplierId, sku: q.sku })}>Negotiate</Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {quotes.length === 0 && (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No quotes match these filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* RFQ modal */}
      <Dialog open={!!rfq} onOpenChange={(o) => !o && setRfq(null)}>
        <DialogContent aria-describedby={undefined}>
          {rfq && (
            <>
              <DialogHeader><DialogTitle>Request quotation</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-secondary/40 px-3.5 py-3 text-sm">
                  <p className="font-medium">{SUPPLIERS.find((s) => s.id === rfq.supplierId)?.name}</p>
                  <p className="text-xs text-muted-foreground">{PRODUCTS.find((p) => p.sku === rfq.sku)?.name} · agent {SUPPLIERS.find((s) => s.id === rfq.supplierId)?.agentId}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Product</Label>
                  <Select value={rfq.sku} onValueChange={(v) => setRfq({ ...rfq, sku: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRODUCTS.map((p) => <SelectItem key={p.sku} value={p.sku}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rfq-qty">Quantity (units)</Label>
                  <Input id="rfq-qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setRfq(null)}>Cancel</Button>
                <Button className="btn-glow border-0 text-white" disabled={sending || !(Number(qty) > 0)} onClick={() => {
                  setSending(true)
                  setTimeout(() => {
                    const sName = SUPPLIERS.find((s) => s.id === rfq.supplierId)?.name.split('—')[0].trim()
                    const pName = PRODUCTS.find((p) => p.sku === rfq.sku)?.name
                    addActivity({ agent: 'EcomMind', action: `RFQ sent to ${sName}`, product: pName, status: 'info', detail: `${qty} units requested · quote expected within minutes.` })
                    toast.success('Quotation requested', { description: `${sName} will respond shortly. Continue in the Negotiation Center.` })
                    setSending(false)
                    setRfq(null)
                    navigate('/negotiations')
                  }, 900)
                }}>
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
