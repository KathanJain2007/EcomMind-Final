import { useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2,
  Layers, Loader2, Pause, Play, Plus, RefreshCw,
  Search, ShieldCheck, ShoppingBag,
  Sparkles, Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import { api, ApiError, newIdempotencyKey } from '@/lib/api'
import { cx, formatINR, formatDate, formatDateTime, formatNum, formatPaise } from '@/lib/format'
import { EmptyState, PageHeader, PanelError } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import type { PricingRuleConfig } from '@/data/models'

type ChannelId = 'amazon' | 'flipkart' | 'meesho' | 'shopify' | 'instagram'

interface ApiMarketplace {
  id: ChannelId; name: string; commissionPct: number; fixedFee: number
  connection: 'connected' | 'credentials_only' | 'not_connected'; connectionNote: string
  listings: number; revenue: number; pendingOrders: number
}
interface ApiListing {
  id: string; channel: ChannelId; channelName: string; sku: string; productName: string; title: string
  price: number; mrp: number | null; stock: number; status: 'active' | 'paused' | 'out_of_stock'; listingStatus: 'active' | 'paused'
  ordersCount: number; unitsSold: number; revenue: number
}
interface ApiOrder {
  id: string; channel: ChannelId; channelName: string; sku: string; productName: string; quantity: number
  unitPrice: number; grossAmount: number; commission: number; netProfit: number
  status: 'confirmed' | 'dispatched' | 'delivered' | 'cancelled' | 'returned'
  customerCity: string | null; customerState: string | null; customerPincode: string | null; externalOrderId: string | null
  createdAt: string
}
interface ApiOrderSummary { orders: number; units: number; grossRevenue: number; commission: number; unitsDelivered: number; netProfit: number; netMarginPct: number | null }
interface ApiMovement { id: number; sku: string; productName: string; delta: number; resultingStock: number; kind: string; channel: string | null; reason: string; createdAt: string }

const CHANNEL_NAMES: Record<ChannelId, string> = { amazon: 'Amazon India', flipkart: 'Flipkart', meesho: 'Meesho', shopify: 'Shopify Storefront', instagram: 'Instagram Shopping' }
const money = (p: number) => formatPaise(p, { decimals: p % 100 ? 2 : 0 })
const NEXT_ACTIONS: Record<ApiOrder['status'], Array<{ action: 'dispatch' | 'deliver' | 'cancel' | 'return'; label: string }>> = {
  confirmed: [{ action: 'dispatch', label: 'Dispatch' }, { action: 'cancel', label: 'Cancel' }],
  dispatched: [{ action: 'deliver', label: 'Delivered' }, { action: 'cancel', label: 'Cancel' }],
  delivered: [{ action: 'return', label: 'Return' }],
  cancelled: [],
  returned: [],
}
const MOVEMENT_LABEL: Record<string, string> = {
  sale: 'Sale', cancellation: 'Order cancelled', return: 'Customer return', restock_receipt: 'Supplier delivery',
  adjustment: 'Manual adjustment', opening: 'Opening stock', import: 'Import',
}

export default function Selling() {
  const store = useDataStore()
  const {
    demoLoaded, loadDemoBusiness, catalog,
    pricingRules, updatePricingRules, priceHistory, executeReprice,
  } = useApp()

  const allProducts = catalog
  const marketsQ = useApiQuery<{ marketplaces: ApiMarketplace[] }>('/api/marketplaces', ['orders', 'products'])
  const listingsQ = useApiQuery<{ listings: ApiListing[] }>('/api/listings', ['orders', 'products'])
  const ordersQ = useApiQuery<{ orders: ApiOrder[] }>('/api/orders?limit=200', ['orders'])
  const summaryQ = useApiQuery<ApiOrderSummary>('/api/orders/summary', ['orders'])
  const movementsQ = useApiQuery<{ movements: ApiMovement[] }>('/api/stock-movements?limit=200', ['orders', 'products', 'escrow'])
  const marketplaces = useMemo(() => marketsQ.data?.marketplaces ?? [], [marketsQ.data])
  const marketplaceListings = useMemo(() => listingsQ.data?.listings ?? [], [listingsQ.data])
  const marketplaceOrders = useMemo(() => ordersQ.data?.orders ?? [], [ordersQ.data])
  const inventoryMovements = useMemo(() => movementsQ.data?.movements ?? [], [movementsQ.data])
  const loadError = marketsQ.error ?? listingsQ.error ?? ordersQ.error

  // Filters
  const [activeTab, setActiveTab] = useState('listings')
  const [channelFilter, setChannelFilter] = useState<string>('All')
  const [search, setSearch] = useState('')

  // New Listing Dialog State
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState({ marketplace: 'amazon' as ChannelId, sku: '', title: '', mrp: '' })
  const [saving, setSaving] = useState(false)

  // Record Order Dialog State
  const [orderOpen, setOrderOpen] = useState(false)
  const [orderDraft, setOrderDraft] = useState({ channel: 'amazon' as ChannelId, sku: '', quantity: '1', city: '', state: '', pincode: '', externalId: '', key: '' })
  const [orderError, setOrderError] = useState<string | null>(null)
  const [busyOrder, setBusyOrder] = useState<string | null>(null)

  // Reprice Modal State
  const [repriceModal, setRepriceModal] = useState<{ open: boolean; sku: string; currentPrice: number; name: string } | null>(null)
  const [newPriceInput, setNewPriceInput] = useState('')
  const [repriceReason, setRepriceReason] = useState('Optimize for competitor pricing and seasonal demand')

  // Filter listings
  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase()
    return marketplaceListings.filter((l) => {
      if (channelFilter !== 'All' && l.channel !== channelFilter) return false
      if (q && !l.title.toLowerCase().includes(q) && !l.sku.toLowerCase().includes(q)) return false
      return true
    })
  }, [marketplaceListings, channelFilter, search])

  const refreshCommerce = () => store.invalidate('orders', 'products', 'analytics', 'activity')

  const handleCreateListing = async () => {
    const p = allProducts.find((x) => x.sku === draft.sku)
    if (!p) {
      toast.error('Please select a product from your catalogue')
      return
    }
    setSaving(true)
    try {
      await api('/api/listings', { body: { channel: draft.marketplace, sku: p.sku, title: draft.title.trim() || undefined, mrp: draft.mrp ? Math.round(Number(draft.mrp) * 100) : undefined } })
      refreshCommerce()
      toast.success('Listing created', { description: `${p.name} listed on ${CHANNEL_NAMES[draft.marketplace]} at the catalogue price ${formatINR(p.price)}.` })
      setCreateOpen(false)
      setDraft({ marketplace: 'amazon', sku: '', title: '', mrp: '' })
    } catch (e) {
      toast.error('Listing not created', { description: e instanceof ApiError ? e.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  const toggleListing = async (l: ApiListing) => {
    try {
      await api(`/api/listings/${l.id}`, { method: 'PATCH', body: { status: l.listingStatus === 'active' ? 'paused' : 'active' } })
      refreshCommerce()
      toast.info(`${l.channelName} listing ${l.listingStatus === 'active' ? 'paused' : 'resumed'}`)
    } catch (e) {
      toast.error('Listing not updated', { description: e instanceof ApiError ? e.message : undefined })
    }
  }

  const openOrderDialog = () => {
    const firstActive = marketplaceListings.find((l) => l.status === 'active')
    setOrderDraft({ channel: firstActive?.channel ?? 'amazon', sku: firstActive?.sku ?? '', quantity: '1', city: '', state: '', pincode: '', externalId: '', key: newIdempotencyKey('order') })
    setOrderError(null)
    setOrderOpen(true)
  }

  const submitOrder = async () => {
    const qty = Number(orderDraft.quantity)
    if (!orderDraft.sku || !Number.isInteger(qty) || qty <= 0) {
      setOrderError('Choose a listed product and a whole-number quantity.')
      return
    }
    setBusyOrder('new')
    setOrderError(null)
    try {
      const res = await api<{ order: ApiOrder; stock: number }>('/api/orders', {
        body: {
          channel: orderDraft.channel, sku: orderDraft.sku, quantity: qty,
          customerCity: orderDraft.city.trim() || undefined, customerState: orderDraft.state.trim() || undefined,
          customerPincode: orderDraft.pincode.trim() || undefined, externalOrderId: orderDraft.externalId.trim() || undefined,
        },
        idempotencyKey: orderDraft.key,
      })
      refreshCommerce()
      toast.success(`Order recorded on ${res.order.channelName}`, { description: `${res.order.quantity} × ${res.order.productName} · ${money(res.order.grossAmount)} · ${res.stock} units left across all channels.` })
      setOrderOpen(false)
    } catch (e) {
      setOrderError(e instanceof ApiError ? e.message : 'The order wasn’t recorded. Try again.')
      store.invalidate('products', 'orders')
    } finally {
      setBusyOrder(null)
    }
  }

  const orderAction = async (o: ApiOrder, action: 'dispatch' | 'deliver' | 'cancel' | 'return') => {
    if (busyOrder) return
    setBusyOrder(o.id)
    try {
      await api(`/api/orders/${o.id}/${action}`, { method: 'POST' })
      refreshCommerce()
      if (action === 'cancel' || action === 'return') toast.info(`Order ${o.id} ${action === 'cancel' ? 'cancelled' : 'returned'}`, { description: `${o.quantity} units back in stock.` })
    } catch (e) {
      toast.error('Order not updated', { description: e instanceof ApiError ? e.message : undefined })
    } finally {
      setBusyOrder(null)
    }
  }

  const [repricing, setRepricing] = useState(false)
  // Slider positions while dragging; saved to the mandate when released.
  const [ruleDraft, setRuleDraft] = useState<Partial<Pick<PricingRuleConfig, 'minGrossMarginPct' | 'maxDiscountPct' | 'maxPriceChangePct'>>>({})
  const handleTriggerReprice = async () => {
    if (!repriceModal || repricing) return
    const priceNum = Number(newPriceInput)
    if (!priceNum || priceNum <= 0) {
      toast.error('Enter a valid price')
      return
    }
    if (repriceReason.trim().length < 3) {
      toast.error('Add a short reason for the price change')
      return
    }
    setRepricing(true)
    const res = await executeReprice(repriceModal.sku, priceNum, 'Seller Manual Reprice', repriceReason.trim())
    setRepricing(false)
    if (res.success || res.queuedForApproval) {
      setRepriceModal(null)
      setNewPriceInput('')
    }
  }

  if (!demoLoaded && listingsQ.data && marketplaceListings.length === 0 && allProducts.length === 0) {
    return (
      <>
        <PageHeader title="Multi-Marketplace Selling" subtitle="Centralized catalogue management and multi-channel inventory sync." />
        <EmptyState
          title="No products to sell yet"
          body="Add or import products, then list them on your sales channels. Or load the demo business to explore."
          action={
            <Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>
              Load Demo Business
            </Button>
          }
        />
      </>
    )
  }

  const s = summaryQ.data
  const listedForChannel = marketplaceListings.filter((l) => l.channel === orderDraft.channel)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Multi-Marketplace Selling & Dynamic Pricing"
        subtitle="One catalogue price and one shared stock pool across every channel. Orders are recorded here; no marketplace API is connected."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openOrderDialog}
              disabled={!marketplaceListings.length}
              className="gap-1.5 text-xs border-brand/40 bg-brand/5 text-brand-soft hover:bg-brand/15"
            >
              <ShoppingBag className="h-3.5 w-3.5" /> Record Order
            </Button>
            <Button
              size="sm"
              onClick={() => { setDraft({ marketplace: 'amazon', sku: allProducts[0]?.sku ?? '', title: '', mrp: '' }); setCreateOpen(true) }}
              disabled={!allProducts.length}
              className="btn-glow gap-1.5 border-0 text-xs text-white"
            >
              <Plus className="h-3.5 w-3.5" /> List Product
            </Button>
          </div>
        }
      />

      {loadError && <PanelError message={loadError.message} onRetry={() => { marketsQ.reload(); listingsQ.reload(); ordersQ.reload() }} />}

      {/* Marketplace Channel Status Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {marketplaces.map((m) => (
          <Card
            key={m.id}
            onClick={() => setChannelFilter(channelFilter === m.id ? 'All' : m.id)}
            className={cx(
              'card-surface cursor-pointer transition-all',
              channelFilter === m.id && 'border-brand bg-brand/10 ring-1 ring-brand/50'
            )}
          >
            <CardContent className="p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-foreground">{m.name}</span>
                <Badge
                  variant="outline"
                  title={m.connectionNote}
                  className={cx('text-[9px] px-1.5 py-0', m.connection === 'connected' ? 'text-success border-success/30' : 'text-muted-foreground border-border')}
                >
                  {m.connection === 'connected' ? 'API connected' : 'Recorded manually'}
                </Badge>
              </div>
              <div className="pt-1">
                <p className="tabular text-base font-bold text-foreground">{money(m.revenue)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {m.listings} listings · {m.commissionPct}% commission{m.pendingOrders ? ` · ${m.pendingOrders} open orders` : ''}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="h-10 bg-secondary/60 p-1">
          <TabsTrigger value="listings" className="gap-2 text-xs">
            <Layers className="h-3.5 w-3.5" />
            <span>Marketplace Listings</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{marketplaceListings.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-2 text-xs">
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>Sales & Orders</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{marketplaceOrders.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pricing" className="gap-2 text-xs">
            <Tag className="h-3.5 w-3.5 text-brand-soft" />
            <span>AI Pricing & Safeguards</span>
          </TabsTrigger>
          <TabsTrigger value="movements" className="gap-2 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Stock Movements</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Listings */}
        <TabsContent value="listings" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search listings by title or SKU…" className="h-9 pl-8 text-xs" />
              </div>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="All channels" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All channels</SelectItem>
                  {(Object.keys(CHANNEL_NAMES) as ChannelId[]).map((c) => <SelectItem key={c} value={c}>{CHANNEL_NAMES[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground">
              {filteredListings.length} listings across {channelFilter === 'All' ? 'all channels' : CHANNEL_NAMES[channelFilter as ChannelId]}
            </span>
          </div>

          <div className="card-surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {['Channel', 'Product & SKU', 'Selling Price', 'Shared Stock', 'Units Sold', 'Revenue', 'Status'].map((h) => (
                    <TableHead key={h} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</TableHead>
                  ))}
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredListings.map((l) => (
                  <TableRow key={l.id} className="border-border hover:bg-secondary/40">
                    <TableCell className="font-semibold text-xs whitespace-nowrap">
                      <span className="rounded-md bg-secondary/80 px-2 py-1 text-[11px]">{l.channelName}</span>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="font-medium text-xs text-foreground truncate">{l.title}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{l.sku} · {l.id}</p>
                    </TableCell>
                    <TableCell className="tabular font-bold text-xs whitespace-nowrap text-foreground">
                      {money(l.price)}
                      {l.mrp ? <span className="ml-1 text-[10px] line-through text-muted-foreground font-normal">{money(l.mrp)}</span> : null}
                    </TableCell>
                    <TableCell className="tabular text-xs whitespace-nowrap">
                      <span className={cx('font-semibold', l.stock <= 15 ? 'text-danger' : 'text-foreground')}>{l.stock} units</span>
                    </TableCell>
                    <TableCell className="tabular text-xs text-muted-foreground whitespace-nowrap">{formatNum(l.unitsSold)} units</TableCell>
                    <TableCell className="tabular font-semibold text-xs text-success whitespace-nowrap">{money(l.revenue)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline" className={cx('text-[10px]', l.status === 'active' ? 'text-success border-success/30' : l.status === 'out_of_stock' ? 'text-danger border-danger/30' : 'text-muted-foreground')}>
                        {l.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const rupees = l.price / 100
                            setRepriceModal({ open: true, sku: l.sku, currentPrice: rupees, name: l.productName })
                            setNewPriceInput(String(rupees))
                          }}
                          className="h-7 text-[11px] gap-1 text-brand-soft hover:text-brand"
                        >
                          <Tag className="h-3 w-3" /> Reprice
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleListing(l)} className="h-7 text-[11px]" aria-label={l.listingStatus === 'active' ? 'Pause listing' : 'Resume listing'}>
                          {l.listingStatus === 'active' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {listingsQ.data && filteredListings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                      No listings yet. Click "List Product" to offer a catalogue product on a channel.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 2: Sales & Orders Tracking */}
        <TabsContent value="orders" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: 'Order Revenue', v: money(s?.grossRevenue ?? 0), tone: 'text-foreground' },
              { l: 'Units Delivered', v: formatNum(s?.unitsDelivered ?? 0), tone: 'text-foreground' },
              { l: 'Channel Commissions', v: money(s?.commission ?? 0), tone: 'text-danger' },
              { l: 'Est. Net Margin', v: s?.netMarginPct != null ? `${s.netMarginPct}%` : '—', tone: 'text-success' },
            ].map((c) => (
              <Card key={c.l} className="card-surface">
                <CardContent className="p-4">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{c.l}</p>
                  <p className={cx('tabular mt-1 text-xl font-bold', c.tone)}>{c.v}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Net margin is estimated after channel commission, GST included in the price, ₹45/unit shipping and ₹15/unit packaging. Every order is added to Sales Analytics.</p>

          <div className="card-surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {['Order ID', 'Channel', 'Product & Units', 'Destination', 'Order Value', 'Commission', 'Est. Net', 'Status', ''].map((h, i) => (
                    <TableHead key={i} className="text-[11px] font-semibold uppercase text-muted-foreground">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {marketplaceOrders.map((o) => (
                  <TableRow key={o.id} className="border-border hover:bg-secondary/40">
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {o.id}
                      <span className="block text-[10px] text-muted-foreground/80">{formatDateTime(o.createdAt)}{o.externalOrderId ? ` · ${o.externalOrderId}` : ''}</span>
                    </TableCell>
                    <TableCell className="font-semibold text-xs whitespace-nowrap">{o.channelName}</TableCell>
                    <TableCell className="text-xs">
                      <p className="font-medium text-foreground">{o.productName}</p>
                      <p className="text-[11px] text-muted-foreground">{o.quantity} unit(s) · SKU {o.sku} · {money(o.unitPrice)} each</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {[o.customerCity, o.customerState].filter(Boolean).join(', ') || '—'}{o.customerPincode ? ` · ${o.customerPincode}` : ''}
                    </TableCell>
                    <TableCell className="tabular font-bold text-xs whitespace-nowrap text-foreground">{money(o.grossAmount)}</TableCell>
                    <TableCell className="tabular text-xs text-danger whitespace-nowrap">−{money(o.commission)}</TableCell>
                    <TableCell className={cx('tabular font-semibold text-xs whitespace-nowrap', o.netProfit >= 0 ? 'text-success' : 'text-danger')}>
                      {o.netProfit >= 0 ? '+' : '−'}{money(Math.abs(o.netProfit))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline" className={cx('text-[10px] uppercase', o.status === 'cancelled' || o.status === 'returned' ? 'text-muted-foreground' : o.status === 'delivered' ? 'text-success border-success/30' : '')}>{o.status}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {busyOrder === o.id ? <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" /> : NEXT_ACTIONS[o.status].map((a) => (
                        <Button key={a.action} variant="ghost" size="sm" className={cx('h-7 text-[11px]', a.action === 'cancel' && 'text-muted-foreground')} onClick={() => orderAction(o, a.action)}>{a.label}</Button>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
                {ordersQ.data && marketplaceOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-xs text-muted-foreground">
                      No orders yet. Use "Record Order" when a channel sells something; stock is taken from the shared pool immediately.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 3: AI Dynamic Pricing & Safeguards */}
        <TabsContent value="pricing" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Seller Safeguard Controls */}
            <div className="space-y-4 lg:col-span-2">
              <Card className="card-surface">
                <CardContent className="space-y-5 p-5">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-brand-soft" />
                      <h4 className="text-sm font-semibold text-foreground">Seller Mandate & Safeguard Policies</h4>
                    </div>
                    <Badge variant="outline" className="text-xs text-success border-success/30">
                      Enforced by Backend Guardrails
                    </Badge>
                  </div>

                  {/* Pricing Mode Selection */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Pricing Operational Mode</Label>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      {[
                        { mode: 'manual', title: 'Manual Mode', desc: 'Seller initiates and approves every price update.' },
                        { mode: 'recommendation', title: 'AI Recommendation', desc: 'AI analyzes markets and prepares proposed changes for approval.' },
                        { mode: 'autonomous', title: 'Autonomous Execution', desc: 'AI reprices within strict pre-signed margin limits automatically.' },
                      ].map((pm) => (
                        <button
                          key={pm.mode}
                          type="button"
                          onClick={() => updatePricingRules({ mode: pm.mode as PricingRuleConfig['mode'] })}
                          className={cx(
                            'flex flex-col rounded-xl border p-3 text-left transition-all',
                            pricingRules.mode === pm.mode
                              ? 'border-brand bg-brand/10 ring-1 ring-brand/50'
                              : 'border-border bg-card/60 hover:bg-secondary/40'
                          )}
                        >
                          <span className={cx('text-xs font-bold', pricingRules.mode === pm.mode ? 'text-brand-soft' : 'text-foreground')}>
                            {pm.title}
                          </span>
                          <p className="mt-1 text-[11px] text-muted-foreground">{pm.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sliders & Numeric Safeguard Limits */}
                  <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-foreground">Min Gross Margin Floor</span>
                        <strong className="text-brand-soft font-mono">{ruleDraft.minGrossMarginPct ?? pricingRules.minGrossMarginPct}%</strong>
                      </div>
                      <Slider
                        value={[ruleDraft.minGrossMarginPct ?? pricingRules.minGrossMarginPct]}
                        min={5}
                        max={40}
                        step={1}
                        onValueChange={([v]) => setRuleDraft((d) => ({ ...d, minGrossMarginPct: v }))}
                        onValueCommit={([v]) => { void updatePricingRules({ minGrossMarginPct: v }).then(() => setRuleDraft((d) => ({ ...d, minGrossMarginPct: undefined }))) }}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Gross margin on cost price, (price − cost) ÷ price. Saved to your mandate.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-foreground">Max Allowed Discount</span>
                        <strong className="text-brand-soft font-mono">{ruleDraft.maxDiscountPct ?? pricingRules.maxDiscountPct}%</strong>
                      </div>
                      <Slider
                        value={[ruleDraft.maxDiscountPct ?? pricingRules.maxDiscountPct]}
                        min={5}
                        max={50}
                        step={1}
                        onValueChange={([v]) => setRuleDraft((d) => ({ ...d, maxDiscountPct: v }))}
                        onValueCommit={([v]) => { void updatePricingRules({ maxDiscountPct: v }).then(() => setRuleDraft((d) => ({ ...d, maxDiscountPct: undefined }))) }}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Hard cap on maximum single promotional markdown.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-foreground">Max Price Movement Band</span>
                        <strong className="text-brand-soft font-mono">±{ruleDraft.maxPriceChangePct ?? pricingRules.maxPriceChangePct}%</strong>
                      </div>
                      <Slider
                        value={[ruleDraft.maxPriceChangePct ?? pricingRules.maxPriceChangePct]}
                        min={2}
                        max={30}
                        step={1}
                        onValueChange={([v]) => setRuleDraft((d) => ({ ...d, maxPriceChangePct: v }))}
                        onValueCommit={([v]) => { void updatePricingRules({ maxPriceChangePct: v }).then(() => setRuleDraft((d) => ({ ...d, maxPriceChangePct: undefined }))) }}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Any larger swing automatically routes to the human Approval Queue.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Price Change Audit Trail */}
              <Card className="card-surface">
                <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">Repricing Audit Trail & History</h4>
                  <span className="text-xs text-muted-foreground">{priceHistory.length} adjustments logged</span>
                </div>
                <div className="divide-y divide-border">
                  {priceHistory.map((item) => (
                    <div key={item.id} className="p-4 text-xs space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{item.productName}</span>
                          <span className="font-mono text-muted-foreground text-[10px]">({item.sku})</span>
                          <Badge
                            variant="outline"
                            className={cx(
                              'text-[10px]',
                              item.pctChange >= 0 ? 'text-success border-success/30' : 'text-brand-soft border-brand/30'
                            )}
                          >
                            {item.pctChange >= 0 ? '+' : ''}{item.pctChange}%
                          </Badge>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{formatDate(item.timestamp)}</span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                        <p>{item.reason}</p>
                        <p className="tabular font-medium text-foreground">
                          {formatINR(item.oldPrice)} → {formatINR(item.newPrice)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 pt-1 text-[10px] text-muted-foreground">
                        {item.sellerOverride
                          ? <span className="text-warning font-medium">Approved by seller outside mandate{item.marginPct !== undefined ? ` · margin ${item.marginPct}%` : ''}</span>
                          : <span className="text-success font-medium">✓ Within mandate{item.marginPct !== undefined ? ` · margin ${item.marginPct}%` : ''}</span>}
                        <span>·</span>
                        <span>Agent: {item.agentResponsible}</span>
                        <span>·</span>
                        <span className="font-mono">{item.expectedProfitImpact}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Quick Test & Live Repricing Simulator */}
            <div className="space-y-4">
              <Card className="card-surface">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles className="h-4 w-4 text-brand-soft" /> AI Price Testing Simulator
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Test how our backend policy engine validates an aggressive price change against your {pricingRules.minGrossMarginPct}% margin floor.
                  </p>

                  <div className="space-y-3 pt-2">
                    <Button
                      variant="outline"
                      className="w-full text-xs justify-start gap-2"
                      onClick={() => executeReprice('EAR-001', 1450, 'Market Price Agent', 'Test safe repricing within band (-3.2%)')}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      <span>Test Safe Reprice: Earbuds to ₹1,450</span>
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full text-xs justify-start gap-2 text-warning hover:text-warning"
                      onClick={() => executeReprice('EAR-001', 899, 'Market Price Agent', 'Aggressive flash sale test below margin')}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      <span>Test Guardrail Violation: Earbuds to ₹899</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: Stock movements from the backend */}
        <TabsContent value="movements" className="space-y-4">
          <Card className="card-surface overflow-hidden">
            <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Stock Movement History</h4>
                <p className="text-xs text-muted-foreground">Every sale, cancellation, return, supplier delivery and adjustment, from one shared stock pool.</p>
              </div>
              <Badge variant="outline" className="text-xs text-success">Atomic stock updates</Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {['Timestamp', 'Channel', 'Product', 'Movement', 'Reason'].map((h) => (
                    <TableHead key={h} className="text-[11px] font-semibold uppercase text-muted-foreground">{h}</TableHead>
                  ))}
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground text-right">Resulting Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryMovements.map((m) => (
                  <TableRow key={m.id} className="border-border hover:bg-secondary/40">
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(m.createdAt)}</TableCell>
                    <TableCell className="font-bold text-xs whitespace-nowrap">{m.channel ? (CHANNEL_NAMES[m.channel as ChannelId] ?? m.channel) : '—'}</TableCell>
                    <TableCell className="text-xs font-medium">{m.productName} ({m.sku})</TableCell>
                    <TableCell className={cx('tabular text-xs font-semibold whitespace-nowrap', m.delta < 0 ? 'text-danger' : 'text-success')}>
                      {m.delta > 0 ? '+' : ''}{m.delta} units
                      <span className="block text-[10px] font-normal text-muted-foreground">{MOVEMENT_LABEL[m.kind] ?? m.kind}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.reason}</TableCell>
                    <TableCell className="tabular font-bold text-xs text-right whitespace-nowrap text-foreground">{m.resultingStock} units</TableCell>
                  </TableRow>
                ))}
                {movementsQ.data && inventoryMovements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-xs text-muted-foreground">No stock movements recorded yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Listing Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">List Product on a Channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label>Channel</Label>
              <Select value={draft.marketplace} onValueChange={(v) => setDraft({ ...draft, marketplace: v as ChannelId })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CHANNEL_NAMES) as ChannelId[]).map((c) => <SelectItem key={c} value={c}>{CHANNEL_NAMES[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Catalogue Product</Label>
              <Select
                value={draft.sku}
                onValueChange={(v) => {
                  const p = allProducts.find((x) => x.sku === v)
                  setDraft({ ...draft, sku: v, title: p ? p.name : '', mrp: p ? String(Math.round(p.price * 1.35)) : '' })
                }}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Choose a product" /></SelectTrigger>
                <SelectContent>
                  {allProducts.map((p) => {
                    const listed = marketplaceListings.some((l) => l.sku === p.sku && l.channel === draft.marketplace)
                    return (
                      <SelectItem key={p.sku} value={p.sku} disabled={listed}>
                        {p.name} ({p.sku}) — {formatINR(p.price)} · {p.stock} in stock{listed ? ' · already listed' : ''}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Listing Title</Label>
              <Input value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Product title on the channel" className="h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label>MRP (₹, optional)</Label>
              <Input type="number" min={0} value={draft.mrp} onChange={(e) => setDraft({ ...draft, mrp: e.target.value })} className="h-9 text-xs" />
            </div>
            <p className="text-[11px] text-muted-foreground">The listing sells at your catalogue price and from your shared stock. Change the price with Reprice so every channel stays in step.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateListing} disabled={saving || !draft.sku} className="btn-glow border-0 text-white">
              {saving ? 'Saving…' : 'Publish Listing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Order Dialog */}
      <Dialog open={orderOpen} onOpenChange={(o) => { if (!busyOrder) setOrderOpen(o) }}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Record a Channel Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Channel</Label>
                <Select value={orderDraft.channel} onValueChange={(v) => {
                  const first = marketplaceListings.find((l) => l.channel === v && l.status === 'active')
                  setOrderDraft({ ...orderDraft, channel: v as ChannelId, sku: first?.sku ?? '' })
                }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CHANNEL_NAMES) as ChannelId[]).map((c) => <SelectItem key={c} value={c}>{CHANNEL_NAMES[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="order-qty">Quantity</Label>
                <Input id="order-qty" type="number" min={1} step={1} value={orderDraft.quantity} onChange={(e) => setOrderDraft({ ...orderDraft, quantity: e.target.value })} className="h-9 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Product</Label>
              <Select value={orderDraft.sku} onValueChange={(v) => setOrderDraft({ ...orderDraft, sku: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={listedForChannel.length ? 'Choose a listed product' : 'Nothing listed on this channel'} /></SelectTrigger>
                <SelectContent>
                  {listedForChannel.map((l) => (
                    <SelectItem key={l.id} value={l.sku} disabled={l.status !== 'active'}>
                      {l.productName} ({l.sku}) — {money(l.price)} · {l.stock} in stock{l.status !== 'active' ? ` · ${l.status.replace(/_/g, ' ')}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="order-city">City</Label>
                <Input id="order-city" value={orderDraft.city} maxLength={80} onChange={(e) => setOrderDraft({ ...orderDraft, city: e.target.value })} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="order-state">State</Label>
                <Input id="order-state" value={orderDraft.state} maxLength={80} onChange={(e) => setOrderDraft({ ...orderDraft, state: e.target.value })} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="order-pin">Pincode</Label>
                <Input id="order-pin" inputMode="numeric" maxLength={6} value={orderDraft.pincode} onChange={(e) => setOrderDraft({ ...orderDraft, pincode: e.target.value.replace(/\D/g, '') })} className="h-9 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="order-ext">Channel order number (optional)</Label>
              <Input id="order-ext" value={orderDraft.externalId} maxLength={80} onChange={(e) => setOrderDraft({ ...orderDraft, externalId: e.target.value })} className="h-9 text-xs" />
            </div>
            {orderError && <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-danger"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{orderError}</p>}
            <p className="text-[11px] text-muted-foreground">Stock is taken from the shared pool in one transaction, so two channels can’t sell the same unit. The sale is added to Sales Analytics.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOrderOpen(false)} disabled={!!busyOrder}>Cancel</Button>
            <Button size="sm" onClick={submitOrder} disabled={!!busyOrder || !orderDraft.sku} className="btn-glow border-0 text-white">
              {busyOrder === 'new' ? 'Recording…' : 'Record Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Reprice Modal */}
      <Dialog open={!!repriceModal} onOpenChange={(o) => !o && setRepriceModal(null)}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          {repriceModal && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">Reprice: {repriceModal.name}</DialogTitle>
              </DialogHeader>

              <div className="space-y-3 py-2 text-xs">
                <div className="flex justify-between items-center rounded-lg border border-border bg-secondary/40 p-2.5">
                  <span className="text-muted-foreground">Current Price:</span>
                  <strong className="text-base text-foreground font-mono">{formatINR(repriceModal.currentPrice)}</strong>
                </div>

                <div className="space-y-1">
                  <Label>New Price (INR)</Label>
                  <Input
                    type="number"
                    value={newPriceInput}
                    onChange={(e) => setNewPriceInput(e.target.value)}
                    placeholder="Enter new price"
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Pricing Rationale</Label>
                  <Input
                    value={repriceReason}
                    onChange={(e) => setRepriceReason(e.target.value)}
                    placeholder="Reason for change"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="rounded-lg border border-border bg-card/60 p-2.5 text-[11px] text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">Backend Guardrail Check:</p>
                  <p>• Minimum Gross Margin Floor: {pricingRules.minGrossMarginPct}%</p>
                  <p>• Max Single Price Movement: ±{pricingRules.maxPriceChangePct}%</p>
                  <p>• Max Discount: {pricingRules.maxDiscountPct}%</p>
                  <p className="text-[10px]">Checked on the server against your mandate. Changes outside it go to the Approval Queue; nothing changes until you approve.</p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setRepriceModal(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleTriggerReprice} disabled={repricing} className="btn-glow border-0 text-white">
                  {repricing ? 'Validating…' : 'Validate & Execute'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
