import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { Plus, Search, Upload, Download, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '@/store/AppContext'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import { api, ApiError, type ApiProduct, type ApiSupplier } from '@/lib/api'
import { cx, downloadCSV, formatNum, formatPaise, shortDate } from '@/lib/format'
import { ChartEmpty, ChartSkeleton, EmptyState, PageHeader, PanelError, ProductIcon, StatusBadge, stockTone } from '@/components/common'
import { tooltipStyle } from '@/lib/chartTheme'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const BASE_CATEGORIES = ['Electronics', 'Fitness', 'Accessories', 'Home & Kitchen', 'Fashion', 'Beauty']
type Product = ApiProduct
const formatINR = (paise: number) => formatPaise(paise)
const STATUSES = ['All', 'In Stock', 'Low Stock', 'Critical', 'Out of Stock', 'Paused']

export default function Inventory() {
  const { demoLoaded, loadDemoBusiness } = useApp()
  const store = useDataStore()
  const productsQ = useApiQuery<{ products: ApiProduct[] }>('/api/products', ['products'])
  const [saving, setSaving] = useState(false)
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [category, setCategory] = useState('All')
  const [status, setStatus] = useState('All')
  const [selected, setSelected] = useState<Product | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', sku: '', category: 'Electronics', price: '', cost: '', stock: '', avgDaily: '' })
  const navigate = useNavigate()

  const allProducts = useMemo(() => productsQ.data?.products ?? [], [productsQ.data])
  const CATEGORIES = useMemo(() => ['All', ...new Set([...allProducts.map((p) => p.category), ...BASE_CATEGORIES])], [allProducts])

  const filtered = useMemo(() => allProducts.filter((p) => {
    const q = search.trim().toLowerCase()
    if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false
    if (category !== 'All' && p.category !== category) return false
    if (status !== 'All' && p.status !== status) return false
    return true
  }), [allProducts, search, category, status])

  const submitAdd = async () => {
    const price = Number(draft.price), cost = Number(draft.cost), stock = Number(draft.stock), avgDaily = Number(draft.avgDaily)
    if (!draft.name.trim() || !draft.sku.trim()) { toast.error('Name and SKU are required'); return }
    if (!(price > 0) || !(cost >= 0) || cost >= price) { toast.error('Enter a valid price and unit cost (cost must be below price)'); return }
    if (!(stock >= 0) || !(avgDaily > 0)) { toast.error('Enter a valid stock and average daily sales'); return }
    if (allProducts.some((p) => p.sku.toLowerCase() === draft.sku.trim().toLowerCase())) { toast.error('A product with this SKU already exists'); return }
    setSaving(true)
    try {
      await api('/api/products', { body: {
        sku: draft.sku.trim(), name: draft.name.trim(), category: draft.category,
        price: Math.round(price * 100), cost: Math.round(cost * 100), stock: Math.round(stock), avgDailySales: avgDaily,
      } })
      store.invalidate('products', 'analytics', 'activity')
      toast.success(`${draft.name} added to inventory`)
      setAddOpen(false)
      setDraft({ name: '', sku: '', category: 'Electronics', price: '', cost: '', stock: '', avgDaily: '' })
    } catch (e) {
      toast.error('Couldn’t add product', { description: e instanceof ApiError ? e.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  if (!demoLoaded && productsQ.data && allProducts.length === 0) {
    return (
      <>
        <PageHeader title="Inventory Management" subtitle="Track stock, coverage and AI reorder signals across your catalogue." />
        <EmptyState title="No inventory yet" body="Load the demo business to explore a sample catalogue, or add your first product." action={<div className="flex gap-2"><Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button><Button variant="outline" onClick={() => setAddOpen(true)}>Add product</Button></div>} />
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="Inventory Management"
        subtitle={`${allProducts.length} products · ${formatINR(allProducts.reduce((s, p) => s + p.stock * p.cost, 0))} at cost`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => {
              downloadCSV('inventory_export.csv', ['SKU', 'Product', 'Category', 'Price', 'Cost', 'Stock', 'Avg daily sales', 'Coverage (days)', 'Status'],
                allProducts.map((p) => [p.sku, p.name, p.category, p.price / 100, p.cost / 100, p.stock, p.avgDailySales, p.coverageDays ?? '', p.status]))
              toast.success('Inventory exported as CSV')
            }}>
              <Download className="h-3.5 w-3.5" aria-hidden /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/import')}>
              <Upload className="h-3.5 w-3.5" aria-hidden /> Import CSV/Excel
            </Button>
            <Button size="sm" className="btn-glow border-0 text-white" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add product
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setParams(e.target.value ? { q: e.target.value } : {}, { replace: true }) }}
            placeholder="Search by name or SKU…"
            aria-label="Search products"
            className="pl-9"
          />
          {search && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSearch(''); setParams({}, { replace: true }) }} aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44" aria-label="Filter by category"><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Filter by stock status"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        {(category !== 'All' || status !== 'All' || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setCategory('All'); setStatus('All'); setSearch(''); setParams({}, { replace: true }) }}>Reset</Button>
        )}
      </div>

      {/* Table */}
      <div className="card-surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {['Product', 'SKU', 'Category', 'Selling price', 'Unit cost', 'Stock', 'Avg daily sales', 'Coverage', 'Status'].map((h) => (
                <TableHead key={h} className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => {
              const st = p.status
              const cov = p.coverageDays ?? '—'
              return (
                <TableRow key={p.sku} className="cursor-pointer border-border hover:bg-secondary/50" onClick={() => setSelected(p)}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <ProductIcon icon={p.icon} />
                      <span className="font-medium whitespace-nowrap">{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.sku}</TableCell>
                  <TableCell className="text-muted-foreground">{p.category}</TableCell>
                  <TableCell className="tabular">{formatINR(p.price)}</TableCell>
                  <TableCell className="tabular text-muted-foreground">{formatINR(p.cost)}</TableCell>
                  <TableCell className="tabular font-medium">{formatNum(p.stock)}</TableCell>
                  <TableCell className="tabular">{p.avgDailySales}/day</TableCell>
                  <TableCell className="tabular">{cov} days</TableCell>
                  <TableCell><StatusBadge label={st} tone={stockTone(st)} pulse={st === 'Critical'} /></TableCell>
                </TableRow>
              )
            })}
            {productsQ.loading && (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />Loading products…</TableCell></TableRow>
            )}
            {productsQ.error && (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={9} className="py-6"><PanelError message={productsQ.error.message} onRetry={productsQ.reload} /></TableCell></TableRow>
            )}
            {!productsQ.loading && !productsQ.error && filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  No products match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ProductDrawer product={selected} onClose={() => setSelected(null)} />

      {/* Add product dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add product</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="np-name">Product name</Label>
              <Input id="np-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Bluetooth Speaker" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-sku">SKU</Label>
              <Input id="np-sku" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} placeholder="SPK-006" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.filter((c) => c !== 'All').map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="np-price">Selling price (₹)</Label><Input id="np-price" type="number" min={0} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="np-cost">Unit cost (₹)</Label><Input id="np-cost" type="number" min={0} value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="np-stock">Current stock</Label><Input id="np-stock" type="number" min={0} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="np-avg">Avg daily sales</Label><Input id="np-avg" type="number" min={0} value={draft.avgDaily} onChange={(e) => setDraft({ ...draft, avgDaily: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="btn-glow border-0 text-white" onClick={submitAdd} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Add product'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ */

interface Intelligence {
  product: ApiProduct
  forecast: { series: { date: string; actual?: number; predicted?: number }[]; demand7: number; demand30: number; reorderQty: number; confidencePct: number | null }
  pricing: { competitors: { channel: string; price: number }[]; suggestedPrice: number | null }
}

function ProductDrawer({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const navigate = useNavigate()
  const intel = useApiQuery<Intelligence>(product ? `/api/products/${encodeURIComponent(product.sku)}/intelligence` : null, ['products', 'analytics'])
  const suppliers = useApiQuery<{ suppliers: ApiSupplier[] }>(product ? '/api/suppliers' : null, ['suppliers'])

  if (!product) return <Sheet open={false} onOpenChange={onClose} />

  const st = product.status
  const cov = product.coverageDays ?? '—'
  const f = intel.data?.forecast
  const data = (f?.series ?? []).map((d) => ({ ...d, label: shortDate(d.date) }))
  const competitors = intel.data?.pricing.competitors ?? []
  const quotes = (suppliers.data?.suppliers ?? []).flatMap((s) => s.quotes.filter((q) => q.sku === product.sku).map((q) => ({ q, s })))
    .sort((a, b) => a.q.unitPrice - b.q.unitPrice)

  return (
    <Sheet open={!!product} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto border-border bg-popover sm:max-w-xl">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <ProductIcon icon={product.icon} className="h-11 w-11" />
            <div>
              <SheetTitle className="text-lg">{product.name}</SheetTitle>
              <p className="text-xs text-muted-foreground"><span className="font-mono">{product.sku}</span> · {product.category}</p>
            </div>
            <div className="ml-auto"><StatusBadge label={st} tone={stockTone(st)} pulse={st === 'Critical'} /></div>
          </div>
        </SheetHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Selling price', v: formatINR(product.price) },
              { l: 'Unit cost', v: formatINR(product.cost) },
              { l: 'Gross margin', v: `${Math.round(product.marginPct ?? 0)}%` },
              { l: 'Stock on hand', v: formatNum(product.stock) },
              { l: 'Coverage', v: `${cov} days` },
              { l: 'Return rate', v: `${(product.returnRate * 100).toFixed(0)}%` },
            ].map((s) => (
              <div key={s.l} className="rounded-lg border border-border bg-card/70 p-3">
                <p className="text-[10px] text-muted-foreground">{s.l}</p>
                <p className="tabular mt-0.5 text-sm font-semibold">{s.v}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Sales & forecast</h3>
              <span className="text-xs text-muted-foreground">{f?.confidencePct != null ? `${f.confidencePct}% backtest accuracy` : ''}</span>
            </div>
            <div className="h-44 rounded-lg border border-border bg-card/50 p-2">
              {intel.loading ? <ChartSkeleton /> : intel.error ? <PanelError message={intel.error.message} onRetry={intel.reload} />
                : data.length === 0 ? <ChartEmpty text="No sales history for this product yet." /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pd-a" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7965F2" stopOpacity={0.3} /><stop offset="100%" stopColor="#7965F2" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27334D" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={30} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="actual" name="Actual units" stroke="#9A8BFF" strokeWidth={2} fill="url(#pd-a)" />
                    <Area type="monotone" dataKey="predicted" name="Forecast units" stroke="#22C55E" strokeWidth={1.5} strokeDasharray="5 4" fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-brand/30 bg-brand/8 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-soft">
              <Sparkles className="h-4 w-4" aria-hidden /> EcomMind recommendation
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="tabular text-lg font-semibold">{f ? f.demand7 : '—'}</p><p className="text-[10px] text-muted-foreground">7-day demand</p></div>
              <div><p className="tabular text-lg font-semibold">{f ? f.demand30 : '—'}</p><p className="text-[10px] text-muted-foreground">30-day demand</p></div>
              <div><p className="tabular text-lg font-semibold text-success">{f ? f.reorderQty : '—'}</p><p className="text-[10px] text-muted-foreground">Recommended reorder</p></div>
            </div>
            {f && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {f.reorderQty > 0
                  ? `Order ${f.reorderQty} units to cover forecast demand plus a 5-day safety buffer. Supplier options below are ranked by price.`
                  : 'Stock comfortably covers forecast demand. No reorder needed right now.'}
              </p>
            )}
          </div>

          {competitors.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Market prices</h3>
              <div className="space-y-1.5">
                {competitors.map((c) => (
                  <div key={c.channel} className="flex items-center justify-between rounded-lg border border-border bg-card/60 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{c.channel}</span>
                    <span className={cx('tabular font-medium', c.price < product.price ? 'text-success' : 'text-foreground')}>{formatINR(c.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Supplier options</h3>
            {suppliers.data && quotes.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No supplier quotes on file for this SKU yet.</p>}
            <div className="space-y-2">
              {quotes.map(({ q, s }) => (
                <div key={q.id} className="flex items-center justify-between rounded-lg border border-border bg-card/60 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{s.name.split('—')[0].trim()}</p>
                    <p className="text-[11px] text-muted-foreground">MOQ {q.moq} · {q.deliveryDays}d delivery · ★ {s.rating}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-sm font-semibold">{formatINR(q.unitPrice)}/unit</p>
                    <button className="text-[11px] font-medium text-brand-soft hover:underline" onClick={() => { onClose(); navigate(`/suppliers?rfq=${s.id}&sku=${product.sku}`) }}>
                      Request quotation
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
