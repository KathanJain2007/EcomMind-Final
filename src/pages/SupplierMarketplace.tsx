import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AlertCircle, BadgeCheck, Factory, FileText, History, Loader2, MapPin, Send, ShieldCheck, Sparkles, Star } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import { api, ApiError, newIdempotencyKey, type ApiNegotiation, type ApiProduct, type ApiRFQ, type ApiSupplier } from '@/lib/api'
import { cx, formatNum, formatPaise } from '@/lib/format'
import { EmptyState, PageHeader, PanelError, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AiProcurementSelector, PurchaseHistory, SupplierScores } from '@/components/suppliers/SupplierIntelligence'

interface RfqDraft { supplierId: string; sku: string; quantity: string; target: string; location: string; days: string }

/** Imported quotes often leave stock out, which is stored as 0: that means "ask", not "sold out". */
const availability = (q: { available: number; imported?: boolean }) => (q.imported && !q.available ? 'On request' : formatNum(q.available))

export default function SupplierMarketplace() {
  const { demoLoaded, loadDemoBusiness, business } = useApp()
  const store = useDataStore()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const suppliersQ = useApiQuery<{ suppliers: ApiSupplier[] }>('/api/suppliers', ['suppliers'])
  const productsQ = useApiQuery<{ products: ApiProduct[] }>('/api/products', ['products'])
  const [skuFilter, setSkuFilter] = useState('All')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxDays, setMaxDays] = useState('')
  const [draft, setDraft] = useState<RfqDraft | null>(null)
  const [sending, setSending] = useState(false)
  const [rfqError, setRfqError] = useState<string | null>(null)
  const requestKey = useRef<string>('')
  const [tab, setTab] = useState<'marketplace' | 'scores' | 'ai' | 'history'>('marketplace')

  const suppliers = useMemo(() => suppliersQ.data?.suppliers ?? [], [suppliersQ.data])
  const products = useMemo(() => productsQ.data?.products ?? [], [productsQ.data])
  const productName = (sku: string) => products.find((p) => p.sku === sku)?.name ?? sku

  const openRfq = (supplierId: string, sku?: string) => {
    const s = suppliers.find((x) => x.id === supplierId)
    if (!s) return
    const pick = sku && s.catalogue.includes(sku) ? sku : s.catalogue.find((c) => products.some((p) => p.sku === c)) ?? s.catalogue[0] ?? ''
    requestKey.current = newIdempotencyKey('rfq') // one key per RFQ dialog: double clicks can't create two RFQs
    setRfqError(null)
    setDraft({ supplierId, sku: pick, quantity: '300', target: '', location: business?.location?.text ?? '', days: '5' })
  }

  // Deep link from Inventory: /suppliers?rfq=SUP-B&sku=EAR-001
  useEffect(() => {
    const sid = params.get('rfq')
    if (sid && suppliers.length && products.length) {
      openRfq(sid, params.get('sku') ?? undefined)
      setParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, suppliers.length, products.length])

  const quotes = useMemo(() => suppliers.flatMap((s) => s.quotes.map((q) => ({ q, s }))).filter(({ q }) => {
    if (skuFilter !== 'All' && q.sku !== skuFilter) return false
    if (maxPrice && q.unitPrice > Number(maxPrice) * 100) return false
    if (maxDays && q.deliveryDays > Number(maxDays)) return false
    return true
  }), [suppliers, skuFilter, maxPrice, maxDays])

  if (!demoLoaded && productsQ.data && products.length === 0) {
    return (
      <>
        <PageHeader title="Supplier Marketplace" subtitle="Verified supplier agents ready to quote and negotiate." />
        <EmptyState title="Add products first" body="Quotation requests are for products in your catalogue. Load the demo business or add a product." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  const draftSupplier = draft ? suppliers.find((s) => s.id === draft.supplierId) : undefined
  const draftQuote = draft && draftSupplier ? draftSupplier.quotes.find((q) => q.sku === draft.sku) : undefined
  const draftErrors = draft ? {
    sku: !draft.sku ? 'Choose a product.' : !products.some((p) => p.sku === draft.sku) ? 'This product isn’t in your catalogue.' : undefined,
    quantity: !(Number(draft.quantity) >= 1 && Number.isInteger(Number(draft.quantity))) ? 'Enter a whole number of units.' : undefined,
    target: draft.target && !(Number(draft.target) > 0) ? 'Enter a price above ₹0, or leave it empty.' : undefined,
    location: draft.location.trim().length < 2 ? 'Enter a delivery location.' : undefined,
    days: !(Number(draft.days) >= 1 && Number(draft.days) <= 120) ? 'Enter 1–120 days.' : undefined,
  } : {}
  const draftValid = draft && Object.values(draftErrors).every((e) => !e)

  const submit = async () => {
    if (!draft || !draftValid || sending) return
    setSending(true)
    setRfqError(null)
    try {
      const res = await api<{ rfq: ApiRFQ; negotiation: ApiNegotiation }>('/api/rfqs', {
        idempotencyKey: requestKey.current,
        body: {
          supplierId: draft.supplierId, sku: draft.sku, quantity: Number(draft.quantity),
          targetUnitPrice: draft.target ? Math.round(Number(draft.target) * 100) : null,
          deliveryLocation: draft.location.trim(), deliveryDays: Number(draft.days),
        },
      })
      store.setData(`/api/negotiations/${res.negotiation.id}`, res.negotiation)
      store.invalidate('negotiations', 'activity')
      toast.success(`Quotation requested from ${res.rfq.supplierName.split('—')[0].trim()}`, { description: `${res.rfq.id} · ${res.negotiation.statusLabel}` })
      setDraft(null)
      navigate(`/negotiations/${res.negotiation.id}`)
    } catch (e) {
      // Stay on this page: nothing was created (or the same RFQ will be returned on retry).
      setRfqError(e instanceof ApiError ? e.message : 'Couldn’t send the quotation request.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <PageHeader title="Supplier Marketplace" subtitle="Supplier agents with catalogues, pricing, delivery commitments and relationship history." />

      <div role="tablist" aria-label="Supplier sections" className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border bg-secondary/40 p-1">
        {([
          ['marketplace', 'Marketplace & RFQs', Factory], ['scores', 'Supplier performance', ShieldCheck],
          ['ai', 'AI procurement selector', Sparkles], ['history', 'Delivery & PO history', History],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cx('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', tab === id ? 'bg-brand text-white' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
            <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === 'scores' && <SupplierScores />}
      {tab === 'ai' && <AiProcurementSelector onRequestRfq={(sid, sku) => openRfq(sid, sku)} />}
      {tab === 'history' && <PurchaseHistory />}

      {tab === 'marketplace' && (<>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select value={skuFilter} onValueChange={setSkuFilter}>
          <SelectTrigger className="w-52" aria-label="Filter by product"><SelectValue placeholder="All products" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All products</SelectItem>
            {products.map((p) => <SelectItem key={p.sku} value={p.sku}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="f-price" className="whitespace-nowrap text-xs text-muted-foreground">Max ₹/unit</Label>
          <Input id="f-price" type="number" min={0} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Any" className="w-24" />
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="f-days" className="whitespace-nowrap text-xs text-muted-foreground">Max delivery days</Label>
          <Input id="f-days" type="number" min={0} value={maxDays} onChange={(e) => setMaxDays(e.target.value)} placeholder="Any" className="w-24" />
        </div>
        {(skuFilter !== 'All' || maxPrice || maxDays) && (
          <Button variant="ghost" size="sm" onClick={() => { setSkuFilter('All'); setMaxPrice(''); setMaxDays('') }}>Reset</Button>
        )}
      </div>

      {suppliersQ.error && <div className="mb-4"><PanelError message={suppliersQ.error.message} onRetry={suppliersQ.reload} /></div>}

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {suppliersQ.loading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        {suppliers.map((s) => {
          const headline = [...s.quotes].sort((a, b) => a.unitPrice - b.unitPrice)[0]
          return (
            <Card key={s.id} className="card-surface card-hover">
              <CardContent className="p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-brand-soft">
                    <Factory className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="flex gap-1.5">
                    {!s.autoRespond && <StatusBadge label="Manual replies" tone="neutral" />}
                    {s.verified ? <StatusBadge label="Verified" tone="success" /> : <StatusBadge label="Unverified" tone="warning" />}
                  </div>
                </div>
                <h3 className="text-[15px] font-semibold">{s.name}</h3>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="font-mono">{s.agentId}</span> · <MapPin className="h-3 w-3" aria-hidden />{s.location}
                </p>
                {headline && (
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border bg-secondary/40 p-3 text-center">
                    <div><p className="tabular text-base font-semibold">{formatPaise(headline.unitPrice)}</p><p className="text-[10px] text-muted-foreground">from /unit</p></div>
                    <div><p className="tabular text-base font-semibold">{headline.deliveryDays}d</p><p className="text-[10px] text-muted-foreground">delivery</p></div>
                    <div><p className="tabular flex items-center justify-center gap-1 text-base font-semibold"><Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />{s.rating}</p><p className="text-[10px] text-muted-foreground">{s.reviews} reviews</p></div>
                  </div>
                )}
                <div className="mt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Catalogue · available stock</p>
                  <div className="space-y-1">
                    {s.quotes.map((q) => (
                      <div key={q.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{productName(q.sku)}</span>
                        <span className="tabular">{availability(q)}{q.imported && !q.available ? '' : ' units'} · {formatPaise(q.unitPrice)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Button className="btn-glow mt-4 w-full border-0 text-white" size="sm" onClick={() => openRfq(s.id)} disabled={!products.length}>
                  <Send className="h-3.5 w-3.5" aria-hidden /> Request quotation
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="card-surface overflow-x-auto">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <FileText className="h-4 w-4 text-brand-soft" aria-hidden />
          <h2 className="text-sm font-bold">Quotation comparison</h2>
          <span className="text-xs text-muted-foreground">· {quotes.length} quotes{skuFilter !== 'All' ? ` for ${productName(skuFilter)}` : ''}</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {['Supplier', 'Product', 'Unit price', 'MOQ', 'Available', 'Delivery', 'Rating', 'Valid till', ''].map((h) => (
                <TableHead key={h} className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map(({ q, s }) => {
              const best = quotes.filter((x) => x.q.sku === q.sku).every((x) => q.unitPrice <= x.q.unitPrice)
              return (
                <TableRow key={q.id} className="border-border">
                  <TableCell className="whitespace-nowrap font-medium">
                    <span className="flex items-center gap-1.5">{s.name.split('—')[0].trim()}{s.verified && <BadgeCheck className="h-3.5 w-3.5 text-success" aria-hidden />}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{productName(q.sku)}</TableCell>
                  <TableCell className={cx('tabular font-semibold', best && 'text-success')}>{formatPaise(q.unitPrice)}{best && <span className="ml-1 text-[10px] font-medium">best</span>}</TableCell>
                  <TableCell className="tabular">{q.moq}</TableCell>
                  <TableCell className="tabular">{availability(q)}</TableCell>
                  <TableCell className="tabular">{q.deliveryDays} days</TableCell>
                  <TableCell className="tabular">★ {s.rating}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(q.validTill).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openRfq(s.id, q.sku)} disabled={!products.some((p) => p.sku === q.sku)}>Request quotation</Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {!suppliersQ.loading && quotes.length === 0 && (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No quotes match these filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      </>)}

      <Dialog open={!!draft} onOpenChange={(o) => !o && !sending && setDraft(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
          {draft && draftSupplier && (
            <>
              <DialogHeader><DialogTitle>Request quotation</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-secondary/40 px-3.5 py-3 text-sm">
                  <p className="font-medium">{draftSupplier.name}</p>
                  <p className="text-xs text-muted-foreground">Supplier agent {draftSupplier.agentId} · {draftSupplier.location}{draftSupplier.autoRespond ? ' · responds automatically' : ' · replies manually'}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rfq-sku">Product</Label>
                  <Select value={draft.sku} onValueChange={(v) => setDraft({ ...draft, sku: v })}>
                    <SelectTrigger id="rfq-sku"><SelectValue placeholder="Choose a product" /></SelectTrigger>
                    <SelectContent>
                      {draftSupplier.catalogue.filter((c) => products.some((p) => p.sku === c)).map((c) => <SelectItem key={c} value={c}>{productName(c)} · {c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {draftQuote && <p className="text-xs text-muted-foreground">Listed at {formatPaise(draftQuote.unitPrice)}/unit · MOQ {draftQuote.moq} · {draftQuote.deliveryDays}-day delivery</p>}
                  {draftErrors.sku && <p className="text-xs text-danger">{draftErrors.sku}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="rfq-qty">Quantity (units)</Label>
                    <Input id="rfq-qty" type="number" min={1} value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} aria-invalid={!!draftErrors.quantity} />
                    {draftErrors.quantity && <p className="text-xs text-danger">{draftErrors.quantity}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rfq-target">Target ₹/unit <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="rfq-target" type="number" min={0} step="0.01" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} aria-invalid={!!draftErrors.target} placeholder="e.g. 175" />
                    {draftErrors.target && <p className="text-xs text-danger">{draftErrors.target}</p>}
                  </div>
                  <div className="col-span-2 space-y-1.5 sm:col-span-1">
                    <Label htmlFor="rfq-location">Delivery location</Label>
                    <Input id="rfq-location" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} aria-invalid={!!draftErrors.location} placeholder="City or warehouse address" />
                    {draftErrors.location && <p className="text-xs text-danger">{draftErrors.location}</p>}
                  </div>
                  <div className="col-span-2 space-y-1.5 sm:col-span-1">
                    <Label htmlFor="rfq-days">Deliver within (days)</Label>
                    <Input id="rfq-days" type="number" min={1} max={120} value={draft.days} onChange={(e) => setDraft({ ...draft, days: e.target.value })} aria-invalid={!!draftErrors.days} />
                    {draftErrors.days && <p className="text-xs text-danger">{draftErrors.days}</p>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sending an RFQ doesn’t buy anything. You confirm any deal yourself, and it must fit your mandate limits.
                  {draft.target ? ' With automatic negotiation on, EcomMind will counter once at your target price.' : ''}
                </p>
                {rfqError && <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{rfqError}</p>}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={sending}>Cancel</Button>
                <Button className="btn-glow border-0 text-white" disabled={!draftValid || sending} onClick={submit}>
                  {sending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending…</> : <><Send className="h-3.5 w-3.5" aria-hidden /> Send RFQ</>}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
