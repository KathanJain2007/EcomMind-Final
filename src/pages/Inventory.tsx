import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Plus, Search, Upload, Download, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '@/store/AppContext'
import { COMPETITOR_PRICES, PRODUCTS, SUPPLIERS, SUPPLIER_QUOTES, forecastSeries, salesInRange, stockCoverage, stockStatus, type Product } from '@/data/demo'
import { cx, downloadCSV, formatINR, formatNum } from '@/lib/format'
import { EmptyState, PageHeader, ProductIcon, StatusBadge, stockTone } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const tooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12, color: 'hsl(var(--popover-foreground))' }
const CATEGORIES = ['All', ...new Set(PRODUCTS.map((p) => p.category))]
const STATUSES = ['All', 'In Stock', 'Low Stock', 'Critical', 'Out of Stock', 'Paused']

export default function Inventory() {
  const { demoLoaded, loadDemoBusiness, extraProducts, addProduct } = useApp()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [category, setCategory] = useState('All')
  const [status, setStatus] = useState('All')
  const [selected, setSelected] = useState<Product | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', sku: '', category: 'Electronics', price: '', cost: '', stock: '', avgDaily: '' })
  const navigate = useNavigate()

  const allProducts = useMemo(() => [...PRODUCTS, ...extraProducts], [extraProducts])

  const filtered = useMemo(() => allProducts.filter((p) => {
    const q = search.trim().toLowerCase()
    if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false
    if (category !== 'All' && p.category !== category) return false
    if (status !== 'All' && stockStatus(p) !== status) return false
    return true
  }), [allProducts, search, category, status])

  const submitAdd = () => {
    const price = Number(draft.price), cost = Number(draft.cost), stock = Number(draft.stock), avgDaily = Number(draft.avgDaily)
    if (!draft.name.trim() || !draft.sku.trim()) { toast.error('Name and SKU are required'); return }
    if (!(price > 0) || !(cost >= 0) || cost >= price) { toast.error('Enter a valid price and unit cost (cost must be below price)'); return }
    if (!(stock >= 0) || !(avgDaily > 0)) { toast.error('Enter a valid stock and average daily sales'); return }
    if (allProducts.some((p) => p.sku.toLowerCase() === draft.sku.toLowerCase())) { toast.error('A product with this SKU already exists'); return }
    addProduct({ sku: draft.sku.toUpperCase(), name: draft.name, category: draft.category, price, cost, stock, avgDailySales: avgDaily, returnRate: 0.05, icon: 'headphones' })
    toast.success(`${draft.name} added to inventory`)
    setAddOpen(false)
    setDraft({ name: '', sku: '', category: 'Electronics', price: '', cost: '', stock: '', avgDaily: '' })
  }

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Inventory Management" subtitle="Track stock, coverage and AI reorder signals across your catalogue." />
        <EmptyState title="No inventory yet" body="Load the demo business to explore a live catalogue, or import your own products file." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
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
                allProducts.map((p) => [p.sku, p.name, p.category, p.price, p.cost, p.stock, p.avgDailySales, stockCoverage(p), stockStatus(p)]))
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
              const st = stockStatus(p)
              const cov = stockCoverage(p)
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
            {filtered.length === 0 && (
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
            <Button className="btn-glow border-0 text-white" onClick={submitAdd}>Add product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ProductDrawer({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const navigate = useNavigate()
  const data = useMemo(() => (product ? forecastSeries(product.sku, 14).map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) })) : []), [product])
  const history = useMemo(() => (product ? salesInRange(30).filter((r) => r.sku === product.sku) : []), [product])

  if (!product) return <Sheet open={false} onOpenChange={onClose} />

  const st = stockStatus(product)
  const cov = stockCoverage(product)
  const forecast30 = Math.round(product.avgDailySales * 0.75 * 30)
  const forecast7 = Math.round(product.avgDailySales * 0.75 * 7)
  const reorderQty = Math.max(0, forecast30 - product.stock + Math.ceil(product.avgDailySales * 5))
  const quotes = SUPPLIER_QUOTES.filter((q) => q.sku === product.sku)
  const competitors = COMPETITOR_PRICES[product.sku] ?? []
  const revenue30 = history.reduce((s, r) => s + r.revenue, 0)

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
          {/* Key stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Selling price', v: formatINR(product.price) },
              { l: 'Unit cost', v: formatINR(product.cost) },
              { l: 'Gross margin', v: `${Math.round(((product.price - product.cost) / product.price) * 100)}%` },
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

          {/* Sales + forecast chart */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Sales & AI forecast</h3>
              <span className="text-xs text-muted-foreground">30d revenue {formatINR(revenue30)}</span>
            </div>
            <div className="h-44 rounded-lg border border-border bg-card/50 p-2">
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
                  <Area type="monotone" dataKey="predicted" name="Predicted" stroke="#22C55E" strokeWidth={1.5} strokeDasharray="5 4" fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI recommendation */}
          <div className="rounded-xl border border-brand/30 bg-brand/8 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-soft">
              <Sparkles className="h-4 w-4" aria-hidden /> EcomMind recommendation
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="tabular text-lg font-semibold">{forecast7}</p><p className="text-[10px] text-muted-foreground">7-day demand</p></div>
              <div><p className="tabular text-lg font-semibold">{forecast30}</p><p className="text-[10px] text-muted-foreground">30-day demand</p></div>
              <div><p className="tabular text-lg font-semibold text-success">{reorderQty}</p><p className="text-[10px] text-muted-foreground">Recommended reorder</p></div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {reorderQty > 0
                ? `Order ${reorderQty} units to cover forecast demand plus a 5-day safety buffer. Supplier options below are ranked by price and delivery.`
                : 'Stock comfortably covers forecast demand. No reorder needed right now.'}
            </p>
          </div>

          {/* Competitor prices */}
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

          {/* Supplier options */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Supplier options</h3>
            {quotes.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No supplier quotes on file for this SKU yet — EcomMind will broadcast an RFQ when stock runs low.</p>}
            <div className="space-y-2">
              {quotes.map((q) => {
                const s = SUPPLIERS.find((x) => x.id === q.supplierId)!
                return (
                  <div key={q.id} className="flex items-center justify-between rounded-lg border border-border bg-card/60 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{s.name.split('—')[0].trim()}</p>
                      <p className="text-[11px] text-muted-foreground">MOQ {q.moq} · {q.deliveryDays}d delivery · ★ {s.rating}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-sm font-semibold">{formatINR(q.unitPrice)}/unit</p>
                      <button className="text-[11px] font-medium text-brand-soft hover:underline" onClick={() => { onClose(); navigate('/suppliers') }}>
                        Request quotation
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <Button className="btn-glow w-full border-0 text-white" onClick={() => { onClose(); navigate('/negotiations') }}>
            Negotiate restock with EcomMind
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
