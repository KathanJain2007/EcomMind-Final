import { useState } from 'react'
import { Save, ShieldCheck, SlidersHorizontal, PauseCircle } from 'lucide-react'
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

export default function Settings() {
  const { mandate, saveMandate, auth } = useApp()
  const [draft, setDraft] = useState<Mandate>({ ...mandate })
  const dirty = JSON.stringify(draft) !== JSON.stringify(mandate)

  const numField = (key: keyof Mandate, _label: string, prefix = '₹', suffix = '') => (
    <div className="space-y-1.5">
      <Label htmlFor={`m-${key}`}>{LABELS[key]}</Label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
        <Input
          id={`m-${key}`}
          type="number"
          min={0}
          className={cx(prefix && 'pl-7', suffix && 'pr-8')}
          value={String(draft[key])}
          onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
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
    <div>
      <PageHeader
        title="Autonomous Agent Mandate"
        subtitle="Set your rules once. Let EcomMind operate within your limits."
        actions={
          <Button className="btn-glow border-0 text-white" onClick={() => saveMandate(draft)} disabled={!dirty}>
            <Save className="h-3.5 w-3.5" aria-hidden /> Save Mandate
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Financial limits */}
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
                  <span className="text-muted-foreground">Max price change — EcomMind may reprice within ±{draft.maxPriceChangePct}% without approval</span>
                  <span className="tabular font-medium">±{draft.maxPriceChangePct}%</span>
                </div>
                <Slider
                  value={[draft.maxPriceChangePct]}
                  min={1} max={30} step={1}
                  onValueChange={([v]) => setDraft({ ...draft, maxPriceChangePct: v })}
                  aria-label="Maximum price change percentage"
                />
              </div>
            </CardContent>
          </Card>

          {/* Autonomy toggles */}
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

        <div className="space-y-4">
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
                <p className="tabular mt-1 text-2xl font-semibold text-success">{formatINR(Math.max(0, draft.dailyBudget - FIN.budgetConsumed))}</p>
                <p className="mt-1 text-xs text-muted-foreground">of {formatINR(draft.dailyBudget)} daily mandate</p>
              </div>
            </CardContent>
          </Card>

          {/* Account */}
          <Card className="card-surface">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <PauseCircle className="h-4 w-4 text-brand-soft" aria-hidden /> Account
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Seller</dt><dd className="font-medium">{auth.sellerName || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Store</dt><dd className="font-medium">{auth.storeName || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Plan</dt><dd className="font-medium text-brand-soft">{auth.plan}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd className="max-w-40 truncate font-medium">{auth.email || '—'}</dd></div>
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
