import { useState } from 'react'
import {
  KeyRound, PauseCircle,
  Save, ShieldCheck, SlidersHorizontal, Sun,
} from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { FIN, type Mandate } from '@/data/demo'
import { cx, formatINR } from '@/lib/format'
import { BudgetProgress, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ThemeSegmentedControl } from '@/components/ThemeToggle'
import type { AutonomyLevel } from '@/data/models'

export default function Settings() {
  const {
    mandate, saveMandate, auth, gstinProfile, verifyAndSaveGSTIN,
    autonomyLevel, setAutonomyLevel,
  } = useApp()

  const [draft, setDraft] = useState<Mandate>({ ...mandate })
  const dirty = JSON.stringify(draft) !== JSON.stringify(mandate)

  // GSTIN edit state
  const [gstinInput, setGstinInput] = useState(gstinProfile?.gstin || auth.gstin || '')
  const [addressInput, setAddressInput] = useState(gstinProfile?.businessAddress || auth.businessAddress || '')

  const handleUpdateGSTIN = () => {
    if (!gstinInput) {
      toast.error('Enter a valid 15-character GSTIN')
      return
    }
    const res = verifyAndSaveGSTIN(gstinInput, addressInput)
    if (!res.valid) {
      toast.error(res.error || 'Invalid GSTIN')
    }
  }

  const numField = (key: keyof Mandate, _label: string, prefix = '₹', suffix = '') => (
    <div className="space-y-1.5">
      <Label htmlFor={`m-${key}`}>{LABELS[key]}</Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          id={`m-${key}`}
          type="number"
          min={0}
          className={cx(prefix && 'pl-7', suffix && 'pr-8')}
          value={String(draft[key])}
          onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )

  const toggle = (key: keyof Mandate, label: string, desc: string, danger = false) => (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 px-4 py-3.5">
      <div>
        <p className={cx('text-sm font-medium', danger && 'text-danger')}>{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch
        checked={Boolean(draft[key])}
        onCheckedChange={(v) => setDraft({ ...draft, [key]: v })}
        aria-label={label}
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & Autonomous Mandates"
        subtitle="Configure business verification, financial guardrails, autonomy levels, and theme preferences."
        actions={
          <Button className="btn-glow border-0 text-white" onClick={() => saveMandate(draft)} disabled={!dirty}>
            <Save className="h-3.5 w-3.5" aria-hidden /> Save Mandate
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* GSTIN Business Verification (Feature 2) */}
          <Card className="card-surface">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-soft" />
                  <h3 className="text-sm font-semibold text-foreground">GSTIN & Business Authentication</h3>
                </div>
                <Badge
                  variant={gstinProfile?.verified ? 'default' : 'outline'}
                  className={cx('text-[10px]', gstinProfile?.verified ? 'bg-success text-white' : 'text-muted-foreground')}
                >
                  {gstinProfile?.verified ? 'Verified Active (Regular)' : 'Pending Verification'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                <div className="space-y-1.5">
                  <Label htmlFor="s-gstin">15-Digit GSTIN Number</Label>
                  <div className="flex gap-2">
                    <Input
                      id="s-gstin"
                      value={gstinInput}
                      onChange={(e) => setGstinInput(e.target.value.toUpperCase())}
                      placeholder="e.g. 08AABCU9603R1ZM"
                      className="font-mono text-xs uppercase"
                    />
                    <Button variant="outline" size="sm" onClick={handleUpdateGSTIN} className="text-xs">
                      Verify
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="s-address">Principal Place of Business</Label>
                  <Input
                    id="s-address"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    placeholder="Registered industrial / office address"
                    className="text-xs"
                  />
                </div>
              </div>

              {gstinProfile && (
                <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Legal Entity Name:</span>
                    <strong className="text-foreground">{gstinProfile.legalName}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">PAN Number:</span>
                    <strong className="font-mono text-foreground">{gstinProfile.panNumber}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">State Jurisdiction:</span>
                    <span className="text-foreground">{gstinProfile.state} (Code {gstinProfile.stateCode})</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Constitution of Business:</span>
                    <span className="text-foreground">{gstinProfile.businessType}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Autonomy Level Control (Feature 7) */}
          <Card className="card-surface">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-brand-soft" />
                  <h3 className="text-sm font-semibold text-foreground">AI Autonomy Level & Delegation</h3>
                </div>
                <Badge variant="outline" className="text-xs font-mono">
                  Level {autonomyLevel} Active
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { lvl: 1 as AutonomyLevel, title: 'Level 1: Advisory', desc: 'AI observes & recommends only.' },
                  { lvl: 2 as AutonomyLevel, title: 'Level 2: Approval-Based', desc: 'Actions queued for human sign-off.' },
                  { lvl: 3 as AutonomyLevel, title: 'Level 3: Restricted Auto', desc: 'Auto-executes within signed limits.' },
                ].map((a) => (
                  <button
                    key={a.lvl}
                    type="button"
                    onClick={() => setAutonomyLevel(a.lvl)}
                    className={cx(
                      'rounded-xl border p-3.5 text-left transition-all',
                      autonomyLevel === a.lvl
                        ? 'border-brand bg-brand/10 ring-1 ring-brand/50'
                        : 'border-border bg-card/60 hover:bg-secondary/40'
                    )}
                  >
                    <p className={cx('text-xs font-bold', autonomyLevel === a.lvl ? 'text-brand-soft' : 'text-foreground')}>
                      {a.title}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{a.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Financial limits (Preserved) */}
          <Card className="card-surface">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-brand-soft" aria-hidden /> Financial limits
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {numField('dailyBudget', 'Daily budget')}
                {numField('maxOrderValue', 'Maximum per-order value')}
                {numField('maxPerCallCost', 'Maximum per-call cost')}
                {numField('maxPriceChangePct', 'Maximum price change', '', '%')}
                {numField('minGrossMarginPct', 'Minimum gross margin', '', '%')}
                {numField('autoPauseReturnPct', 'Auto-pause return threshold', '', '%')}
              </div>
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Max price change — EcomMind may reprice within ±{draft.maxPriceChangePct}% without approval
                  </span>
                  <span className="tabular font-medium">±{draft.maxPriceChangePct}%</span>
                </div>
                <Slider
                  value={[draft.maxPriceChangePct]}
                  min={1}
                  max={30}
                  step={1}
                  onValueChange={([v]) => setDraft({ ...draft, maxPriceChangePct: v })}
                  aria-label="Maximum price change percentage"
                />
              </div>
            </CardContent>
          </Card>

          {/* Autonomy toggles (Preserved) */}
          <Card className="card-surface">
            <CardContent className="space-y-3 p-5">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="h-4 w-4 text-brand-soft" aria-hidden /> Autonomy controls
              </div>
              {toggle('autoPurchasing', 'Automatic purchasing', 'EcomMind may place purchase orders within your order limit.')}
              {toggle('autoNegotiation', 'Automatic negotiation', 'EcomMind may counter-offer supplier quotes autonomously.')}
              {toggle('autoRepricing', 'Automatic repricing', 'EcomMind may adjust listing prices within the max change band.')}
              {toggle('approvalAboveLimit', 'Require approval above spending limit', 'Any action beyond limits pauses and asks for your approval first.')}
              {toggle('agentsPaused', 'Pause all agents', 'Immediately halts every autonomous action across your account.', true)}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Appearance & Themes (Complete Dark & Light Mode Support) */}
          <Card className="card-surface">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4 text-brand-soft" />
                  <h3 className="text-sm font-semibold text-foreground">Theme & Appearance</h3>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Select your preferred theme. Your choice is saved persistently across sessions and devices.
              </p>
              <div>
                <ThemeSegmentedControl className="w-full justify-between" />
              </div>
            </CardContent>
          </Card>

          {/* Budget allocation */}
          <Card className="card-surface">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Today's budget allocation</h2>
                <StatusBadge label={draft.agentsPaused ? 'Paused' : 'Enforced'} tone={draft.agentsPaused ? 'danger' : 'success'} />
              </div>
              <BudgetProgress label="Escrow locked" value={FIN.escrowLocked} max={draft.dailyBudget || 1} />
              <BudgetProgress label="Service agent calls" value={FIN.serviceCallSpend} max={draft.dailyBudget || 1} tone="success" />
              <BudgetProgress label="Logistics advance" value={FIN.logisticsAdvance} max={draft.dailyBudget || 1} tone="warning" />
              <div className="rounded-xl border border-border bg-secondary/30 p-4">
                <p className="text-xs text-muted-foreground">Remaining autonomous budget</p>
                <p className="tabular mt-1 text-2xl font-semibold text-success">
                  {formatINR(Math.max(0, draft.dailyBudget - FIN.budgetConsumed))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">of {formatINR(draft.dailyBudget)} daily mandate</p>
              </div>
            </CardContent>
          </Card>

          {/* Account profile */}
          <Card className="card-surface">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <PauseCircle className="h-4 w-4 text-brand-soft" aria-hidden /> Account & Store
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Seller</dt>
                  <dd className="font-medium">{auth.sellerName || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Store</dt>
                  <dd className="font-medium">{auth.storeName || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">GSTIN</dt>
                  <dd className="font-mono text-xs font-medium">{auth.gstin || 'Not linked'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-medium text-brand-soft">{auth.plan}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="max-w-40 truncate font-medium">{auth.email || '—'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

const LABELS: Record<string, string> = {
  dailyBudget: 'Daily budget',
  maxOrderValue: 'Maximum per-order value',
  maxPerCallCost: 'Maximum per-call cost',
  maxPriceChangePct: 'Maximum price change',
  minGrossMarginPct: 'Minimum gross margin',
  autoPauseReturnPct: 'Auto-pause return threshold',
}
