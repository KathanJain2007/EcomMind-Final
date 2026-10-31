import { useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2,
  Layers, Pause, Play, Plus, RefreshCw,
  Search, ShieldCheck, ShoppingBag,
  Sparkles, Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { cx, formatINR, formatNum, formatDate, formatDateTime } from '@/lib/format'
import { EmptyState, PageHeader } from '@/components/common'
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
import type { MarketplaceId, PricingRuleConfig } from '@/data/models'

export default function Selling() {
  const {
    demoLoaded, loadDemoBusiness, catalog,
    marketplaces, marketplaceListings, marketplaceOrders, inventoryMovements,
    createMarketplaceListing, toggleMarketplaceStatus,
    simulateMarketplaceOrder, pricingRules, updatePricingRules, priceHistory, executeReprice,
  } = useApp()

  const allProducts = catalog

  // Filters
  const [activeTab, setActiveTab] = useState('listings')
  const [channelFilter, setChannelFilter] = useState<string>('All')
  const [search, setSearch] = useState('')

  // New Listing Dialog State
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState({
    marketplace: 'amazon' as MarketplaceId,
    sku: 'EAR-001',
    title: '',
    price: '',
    mrp: '',
    stock: '',
  })

  // Reprice Modal State
  const [repriceModal, setRepriceModal] = useState<{ open: boolean; sku: string; currentPrice: number; name: string } | null>(null)
  const [newPriceInput, setNewPriceInput] = useState('')
  const [repriceReason, setRepriceReason] = useState('Optimize for competitor pricing and seasonal demand')

  // Filter listings
  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase()
    return marketplaceListings.filter((l) => {
      if (channelFilter !== 'All' && l.marketplace !== channelFilter) return false
      if (q && !l.title.toLowerCase().includes(q) && !l.sku.toLowerCase().includes(q)) return false
      return true
    })
  }, [marketplaceListings, channelFilter, search])

  // Aggregate metrics
  const totalMarketplaceRevenue = useMemo(
    () => marketplaceListings.reduce((acc, l) => acc + l.revenue, 0),
    [marketplaceListings]
  )
  const totalUnitsSold = useMemo(
    () => marketplaceListings.reduce((acc, l) => acc + l.unitsSold, 0),
    [marketplaceListings]
  )

  const handleCreateListing = () => {
    const p = allProducts.find((x) => x.sku === draft.sku)
    if (!p) {
      toast.error('Please select a valid product SKU')
      return
    }

    const price = Number(draft.price) || p.price
    const mrp = Number(draft.mrp) || Math.round(price * 1.35)
    const stock = draft.stock ? Number(draft.stock) : p.stock

    createMarketplaceListing({
      marketplace: draft.marketplace,
      sku: draft.sku,
      title: draft.title.trim() || `${p.name} — Premium Edition (${p.category})`,
      price,
      mrp,
      stock,
      status: stock > 0 ? 'active' : 'out_of_stock',
      marketplaceListingId: `${draft.marketplace.toUpperCase()}-${draft.sku}-${Math.floor(Math.random() * 899 + 100)}`,
      url: `https://${draft.marketplace}.in/dp/${draft.sku.toLowerCase()}`,
      commissionPct: draft.marketplace === 'amazon' ? 14.5 : draft.marketplace === 'flipkart' ? 12 : 2.5,
      rating: 4.5,
      reviewsCount: 12,
    })

    setCreateOpen(false)
    setDraft({ marketplace: 'amazon', sku: 'EAR-001', title: '', price: '', mrp: '', stock: '' })
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

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Multi-Marketplace Selling" subtitle="Centralized catalogue management and multi-channel inventory sync." />
        <EmptyState
          title="Marketplace integrations ready"
          body="Load the demo business to manage multi-marketplace listings across Amazon, Flipkart, Meesho and Shopify."
          action={
            <Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>
              Load Demo Business
            </Button>
          }
        />
      </>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Multi-Marketplace Selling & Dynamic Pricing"
        subtitle="Manage product listings across Amazon, Flipkart, Meesho, and Shopify with synchronized inventory and AI safeguards."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const sampleChannel = 'amazon'
                simulateMarketplaceOrder(sampleChannel, 'EAR-001', 1)
              }}
              className="gap-1.5 text-xs border-brand/40 bg-brand/5 text-brand-soft hover:bg-brand/15"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Simulate Channel Order
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="btn-glow gap-1.5 border-0 text-xs text-white"
            >
              <Plus className="h-3.5 w-3.5" /> List Product
            </Button>
          </div>
        }
      />

      {/* Marketplace Channel Status Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {marketplaces.map((m) => {
          const isConnected = m.status === 'connected'
          const channelListings = marketplaceListings.filter((l) => l.marketplace === m.id)
          const channelRev = channelListings.reduce((acc, l) => acc + l.revenue, 0)

          return (
            <Card
              key={m.id}
              onClick={() => setChannelFilter(channelFilter === m.id ? 'All' : m.id)}
              className={cx(
                'card-surface cursor-pointer transition-all',
                channelFilter === m.id && 'border-brand bg-brand/10 ring-1 ring-brand/50'
              )}
            >
              <CardContent className="p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{m.name}</span>
                  <Badge
                    variant="outline"
                    className={cx(
                      'text-[9px] px-1.5 py-0',
                      isConnected ? 'text-success border-success/30' : 'text-muted-foreground border-border'
                    )}
                  >
                    {isConnected ? 'API Connected' : 'Manual Mode'}
                  </Badge>
                </div>

                <div className="pt-1">
                  <p className="tabular text-base font-bold text-foreground">{formatINR(channelRev)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {channelListings.length} listings · {m.commissionPct}% commission
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="h-10 bg-secondary/60 p-1">
          <TabsTrigger value="listings" className="gap-2 text-xs">
            <Layers className="h-3.5 w-3.5" />
            <span>Marketplace Listings</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {marketplaceListings.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="orders" className="gap-2 text-xs">
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>Sales & Orders</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {marketplaceOrders.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="pricing" className="gap-2 text-xs">
            <Tag className="h-3.5 w-3.5 text-brand-soft" />
            <span>AI Pricing & Safeguards</span>
          </TabsTrigger>

          <TabsTrigger value="movements" className="gap-2 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Inventory Sync Log</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Listings */}
        <TabsContent value="listings" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search listings by title or SKU…"
                  className="h-9 pl-8 text-xs"
                />
              </div>

              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-36 h-9 text-xs">
                  <SelectValue placeholder="All channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All channels</SelectItem>
                  <SelectItem value="amazon">Amazon India</SelectItem>
                  <SelectItem value="flipkart">Flipkart</SelectItem>
                  <SelectItem value="meesho">Meesho</SelectItem>
                  <SelectItem value="shopify">Shopify</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <span className="text-xs text-muted-foreground">
              {filteredListings.length} listings displayed across {channelFilter === 'All' ? 'all marketplaces' : channelFilter}
            </span>
          </div>

          <div className="card-surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Channel</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Product & SKU</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Selling Price</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sync Stock</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Units Sold</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Revenue</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredListings.map((l) => {
                  const channel = marketplaces.find((m) => m.id === l.marketplace)
                  return (
                    <TableRow key={l.id} className="border-border hover:bg-secondary/40">
                      <TableCell className="font-semibold text-xs whitespace-nowrap">
                        <span className="rounded-md bg-secondary/80 px-2 py-1 text-[11px]">
                          {channel?.name || l.marketplace}
                        </span>
                      </TableCell>

                      <TableCell className="max-w-xs">
                        <p className="font-medium text-xs text-foreground truncate">{l.title}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {l.sku} · ID: {l.marketplaceListingId}
                        </p>
                      </TableCell>

                      <TableCell className="tabular font-bold text-xs whitespace-nowrap text-foreground">
                        {formatINR(l.price)}
                        <span className="ml-1 text-[10px] line-through text-muted-foreground font-normal">
                          {formatINR(l.mrp)}
                        </span>
                      </TableCell>

                      <TableCell className="tabular text-xs whitespace-nowrap">
                        <span className={cx('font-semibold', l.stock <= 15 ? 'text-danger' : 'text-foreground')}>
                          {l.stock} units
                        </span>
                      </TableCell>

                      <TableCell className="tabular text-xs text-muted-foreground whitespace-nowrap">
                        {formatNum(l.unitsSold)} units
                      </TableCell>

                      <TableCell className="tabular font-semibold text-xs text-success whitespace-nowrap">
                        {formatINR(l.revenue)}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={cx(
                            'text-[10px]',
                            l.status === 'active' ? 'text-success border-success/30' : 'text-muted-foreground'
                          )}
                        >
                          {l.status}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRepriceModal({
                                open: true,
                                sku: l.sku,
                                currentPrice: allProducts.find((p) => p.sku === l.sku)?.price ?? l.price,
                                name: l.title,
                              })
                              setNewPriceInput(String(l.price))
                            }}
                            className="h-7 text-[11px] gap-1 text-brand-soft hover:text-brand"
                          >
                            <Tag className="h-3 w-3" /> Reprice
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleMarketplaceStatus(l.id, l.status === 'active' ? 'paused' : 'active')}
                            className="h-7 text-[11px]"
                          >
                            {l.status === 'active' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}

                {filteredListings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                      No marketplace listings found. Click "List Product" above to publish your first listing.
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
            <Card className="card-surface">
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Marketplace Revenue</p>
                <p className="tabular mt-1 text-xl font-bold text-foreground">{formatINR(totalMarketplaceRevenue)}</p>
              </CardContent>
            </Card>
            <Card className="card-surface">
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Units Delivered</p>
                <p className="tabular mt-1 text-xl font-bold text-foreground">{formatNum(totalUnitsSold)}</p>
              </CardContent>
            </Card>
            <Card className="card-surface">
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Channel Commissions Paid</p>
                <p className="tabular mt-1 text-xl font-bold text-danger">
                  {formatINR(Math.round(totalMarketplaceRevenue * 0.118))}
                </p>
              </CardContent>
            </Card>
            <Card className="card-surface">
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Avg Gross Margin</p>
                <p className="tabular mt-1 text-xl font-bold text-success">38.4%</p>
              </CardContent>
            </Card>
          </div>

          <div className="card-surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Order ID</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Channel</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Product & Units</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Destination</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Order Value</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Commission</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Net Margin</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marketplaceOrders.map((o) => (
                  <TableRow key={o.id} className="border-border hover:bg-secondary/40">
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {o.orderNumber}
                      <span className="block text-[10px] text-muted-foreground/80">{formatDateTime(o.createdAt)}</span>
                    </TableCell>

                    <TableCell className="font-semibold text-xs whitespace-nowrap uppercase">
                      {o.marketplace}
                    </TableCell>

                    <TableCell className="text-xs">
                      <p className="font-medium text-foreground">{o.productName}</p>
                      <p className="text-[11px] text-muted-foreground">{o.units} unit(s) · SKU {o.sku}</p>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {o.customerCity}, {o.customerState}
                    </TableCell>

                    <TableCell className="tabular font-bold text-xs whitespace-nowrap text-foreground">
                      {formatINR(o.sellingPrice * o.units)}
                    </TableCell>

                    <TableCell className="tabular text-xs text-danger whitespace-nowrap">
                      -{formatINR(o.commission)}
                    </TableCell>

                    <TableCell className="tabular font-semibold text-xs text-success whitespace-nowrap">
                      +{formatINR(o.netProfit)}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {o.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
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

        {/* TAB 4: Inventory Movements & Concurrency Audit */}
        <TabsContent value="movements" className="space-y-4">
          <Card className="card-surface overflow-hidden">
            <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Centralized Inventory Concurrency Log</h4>
                <p className="text-xs text-muted-foreground">Every reservation, sale, and release across all marketplaces.</p>
              </div>
              <Badge variant="outline" className="text-xs text-success">Transactional Lock Active</Badge>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Timestamp</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Channel</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Product</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Movement</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground">Reason</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground text-right">Resulting Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryMovements.map((m) => (
                  <TableRow key={m.id} className="border-border hover:bg-secondary/40">
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(m.timestamp)}
                    </TableCell>
                    <TableCell className="font-bold text-xs whitespace-nowrap">{m.channel}</TableCell>
                    <TableCell className="text-xs font-medium">{m.productName} ({m.sku})</TableCell>
                    <TableCell className="tabular text-xs font-semibold whitespace-nowrap text-danger">
                      {m.delta} units
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.reason}</TableCell>
                    <TableCell className="tabular font-bold text-xs text-right whitespace-nowrap text-foreground">
                      {m.resultingStock} units
                    </TableCell>
                  </TableRow>
                ))}

                {inventoryMovements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-xs text-muted-foreground">
                      No stock movements recorded yet. Click "Simulate Channel Order" to see real-time inventory reservation.
                    </TableCell>
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
            <DialogTitle className="text-base">List Product on Marketplace</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label>Target Marketplace</Label>
              <Select
                value={draft.marketplace}
                onValueChange={(v) => setDraft({ ...draft, marketplace: v as MarketplaceId })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amazon">Amazon India</SelectItem>
                  <SelectItem value="flipkart">Flipkart</SelectItem>
                  <SelectItem value="meesho">Meesho</SelectItem>
                  <SelectItem value="shopify">Shopify Storefront</SelectItem>
                  <SelectItem value="instagram">Instagram Shopping</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Select Catalogue Item</Label>
              <Select
                value={draft.sku}
                onValueChange={(v) => {
                  const p = allProducts.find((x) => x.sku === v)
                  setDraft({
                    ...draft,
                    sku: v,
                    title: p ? `${p.name} — Premium (${p.category})` : '',
                    price: p ? String(p.price) : '',
                    mrp: p ? String(Math.round(p.price * 1.35)) : '',
                    stock: p ? String(p.stock) : '',
                  })
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allProducts.map((p) => (
                    <SelectItem key={p.sku} value={p.sku}>
                      {p.name} ({p.sku}) — Available: {p.stock} units
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Listing Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Product title on marketplace"
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Selling Price (₹)</Label>
                <Input
                  type="number"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label>MRP (₹)</Label>
                <Input
                  type="number"
                  value={draft.mrp}
                  onChange={(e) => setDraft({ ...draft, mrp: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateListing} className="btn-glow border-0 text-white">
              Publish Listing
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
