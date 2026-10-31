import { useMemo, useState } from 'react'
import { CheckCircle2, Play, ShieldAlert, Sparkles } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { cx, formatINR, formatNum, formatDate } from '@/lib/format'
import { EmptyState, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { FestivalEvent } from '@/data/models'

export default function Festivals() {
  const {
    demoLoaded, loadDemoBusiness, festivalEvents, catalog,
    pricingRules, applyFestivalCampaign,
  } = useApp()

  const allProducts = catalog

  const [selectedFestival, setSelectedFestival] = useState<FestivalEvent | null>(null)
  const [discountOverride, setDiscountOverride] = useState('')

  // Calculate days remaining dynamically
  const festivalsWithCountdown = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return festivalEvents.map((f) => {
      const start = new Date(f.startDate)
      start.setHours(0, 0, 0, 0)
      const diffTime = start.getTime() - today.getTime()
      const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))

      return {
        ...f,
        daysRemaining,
        isStartingSoon: daysRemaining <= 14 && daysRemaining > 0,
      }
    }).sort((a, b) => a.daysRemaining - b.daysRemaining)
  }, [festivalEvents])

  const upcomingCount = festivalsWithCountdown.filter((f) => f.daysRemaining > 0).length
  const activeCount = festivalsWithCountdown.filter((f) => f.status === 'Active').length

  const [applying, setApplying] = useState(false)
  const handleApplyCampaign = async () => {
    if (!selectedFestival || applying) return
    const discount = Number(discountOverride) || selectedFestival.suggestedDiscountPct
    setApplying(true)
    const res = await applyFestivalCampaign(selectedFestival.id, discount, selectedFestival.suggestedSkus)
    setApplying(false)
    if (res.success) {
      setSelectedFestival(null)
      setDiscountOverride('')
    }
  }

  if (!demoLoaded && allProducts.length === 0) {
    return (
      <>
        <PageHeader title="Festival Intelligence & Automated Discounts" subtitle="AI seasonal forecasting for Indian festivals and marketplace mega sales." />
        <EmptyState
          title="Festival Calendar Ready"
          body="Load the demo business to explore AI demand forecasts for Diwali, Amazon Great Indian Festival, and Flipkart Big Billion Days."
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
        title="Festival Intelligence & Automated Discounts"
        subtitle="Dynamic calendar awareness, demand surge modeling, automated margin-safe discounts, and inventory prep."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-brand/40 text-brand-soft">
              Active Festive Strategy: Diwali & Q4 Mega Sales
            </Badge>
          </div>
        }
      />

      {/* Top Highlights Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="card-surface">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Upcoming Major Events</p>
            <p className="tabular mt-1 text-2xl font-bold text-foreground">{upcomingCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Across India & marketplaces</p>
          </CardContent>
        </Card>

        <Card className="card-surface">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Next Mega Peak</p>
            <p className="tabular mt-1 text-2xl font-bold text-brand-soft">
              {festivalsWithCountdown[0]?.name.split(' ')[0] || 'Diwali'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              In {festivalsWithCountdown[0]?.daysRemaining} days ({formatDate(festivalsWithCountdown[0]?.startDate)})
            </p>
          </CardContent>
        </Card>

        <Card className="card-surface">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Projected Demand Surge</p>
            <p className="tabular mt-1 text-2xl font-bold text-success">+3.5× to +4.2×</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Historical Q4 sales multiplier</p>
          </CardContent>
        </Card>

        <Card className="card-surface">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Active Campaigns</p>
            <p className="tabular mt-1 text-2xl font-bold text-foreground">{activeCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Discounts within mandate</p>
          </CardContent>
        </Card>
      </div>

      {/* Festival Event Cards Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {festivalsWithCountdown.map((fest) => {
          const isActive = fest.status === 'Active'
          const productsAffected = allProducts.filter((p) => fest.suggestedSkus.includes(p.sku))

          return (
            <Card
              key={fest.id}
              className={cx(
                'card-surface transition-all duration-200 flex flex-col justify-between',
                fest.isStartingSoon && 'border-brand/40 shadow-sm',
                isActive && 'border-success/40 bg-success/5'
              )}
            >
              <CardContent className="p-5 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={fest.impactRating === 'Extreme' ? 'default' : 'outline'}
                        className={cx(
                          'text-[10px]',
                          fest.impactRating === 'Extreme'
                            ? 'bg-danger text-white'
                            : 'border-brand/40 text-brand-soft'
                        )}
                      >
                        {fest.impactRating} Impact
                      </Badge>

                      <Badge variant="outline" className="text-[10px]">
                        {fest.category}
                      </Badge>

                      {isActive && (
                        <Badge className="bg-success text-white text-[10px]">
                          Campaign Active
                        </Badge>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-foreground pt-1">{fest.name}</h3>
                    <p className="text-xs text-muted-foreground">{fest.description}</p>
                  </div>

                  {/* Countdown Badge */}
                  <div className="rounded-xl border border-border bg-secondary/60 p-3 text-center shrink-0 min-w-20">
                    <p className="tabular text-xl font-bold text-foreground">{fest.daysRemaining}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Days Left</p>
                  </div>
                </div>

                {/* AI Demand & Recommendation Box */}
                <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-soft">
                    <Sparkles className="h-3.5 w-3.5" /> AI Strategy Recommendation
                  </div>
                  <p className="text-xs leading-relaxed text-foreground">{fest.aiRecommendation}</p>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">Demand Spike</span>
                      <p className="tabular font-bold text-foreground mt-0.5">
                        {fest.expectedDemandMultiplier}× Normal Velocity
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">Stock Buffer Needed</span>
                      <p className="tabular font-bold text-foreground mt-0.5">
                        +{fest.stockBufferNeeded} units
                      </p>
                    </div>
                  </div>
                </div>

                {/* Products Affected */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Target Products ({productsAffected.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {productsAffected.map((p) => (
                      <span
                        key={p.sku}
                        className="rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs font-medium text-foreground"
                      >
                        {p.name} · {formatINR(p.price)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Campaign Action Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Suggested Markdown: </span>
                    <strong className="text-brand-soft font-semibold">{fest.suggestedDiscountPct}% off</strong>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedFestival(fest)
                      setDiscountOverride(String(fest.suggestedDiscountPct))
                    }}
                    disabled={isActive}
                    className={cx(
                      'text-xs gap-1.5',
                      isActive ? 'bg-secondary text-muted-foreground' : 'btn-glow border-0 text-white'
                    )}
                  >
                    {isActive ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Campaign Live
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" /> Launch Festive Strategy
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Launch Campaign Confirmation Dialog */}
      <Dialog open={!!selectedFestival} onOpenChange={(o) => !o && setSelectedFestival(null)}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          {selectedFestival && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  Launch Campaign: {selectedFestival.name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                <p className="text-muted-foreground leading-relaxed">
                  Prepare automated promotional pricing for the upcoming demand wave. All prices will strictly respect your {pricingRules.minGrossMarginPct}% minimum profit margin floor.
                </p>

                <div className="space-y-1">
                  <Label>Promotional Discount Percentage (%)</Label>
                  <Input
                    type="number"
                    value={discountOverride}
                    onChange={(e) => setDiscountOverride(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                  {Number(discountOverride) > pricingRules.maxDiscountPct && (
                    <p className="text-[11px] text-warning flex items-center gap-1 pt-1">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Exceeds {pricingRules.maxDiscountPct}% mandate ceiling. Will route to human Approval Queue.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-1.5">
                  <p className="font-semibold text-foreground">Target Catalogue SKUs:</p>
                  <p className="text-muted-foreground">{selectedFestival.suggestedSkus.join(', ')}</p>
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Forecast Projected Revenue Impact: +₹{formatNum(Math.round(selectedFestival.expectedDemandMultiplier * 185000))}
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setSelectedFestival(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleApplyCampaign} className="btn-glow border-0 text-white">
                  Confirm & Apply Strategy
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
