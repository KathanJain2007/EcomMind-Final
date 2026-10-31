import { useEffect, useState } from 'react'
import { Building2, KeyRound, Loader2, PauseCircle, Save, ShieldCheck, SlidersHorizontal, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import { api, ApiError, type ApiMandate } from '@/lib/api'
import { cx, formatPaise } from '@/lib/format'
import { getExpectedCheckDigit, gstinLiveError, normalizeGstin, validateGstin } from '@/lib/validation/gstin'
import { BudgetProgress, PageHeader, PanelError, StatusBadge } from '@/components/common'
import { LocationAutocomplete } from '@/components/LocationAutocomplete'
import type { PlaceValue } from '@/lib/place'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ThemeSegmentedControl } from '@/components/ThemeToggle'
import type { AutonomyLevel } from '@/data/models'

/** Form values: money in rupees (the API uses paise). */
type Draft = Omit<ApiMandate, 'dailyBudget' | 'maxOrderValue' | 'maxPerCallCost' | 'walletDailyLimit'> & {
  dailyBudget: string; maxOrderValue: string; maxPerCallCost: string; walletDailyLimit: string
  maxPriceChangePct: number; minGrossMarginPct: number; autoPauseReturnPct: number
}
const MONEY: (keyof Draft)[] = ['dailyBudget', 'maxOrderValue', 'maxPerCallCost', 'walletDailyLimit']
const LABELS: Record<string, string> = {
  dailyBudget: 'Daily budget', maxOrderValue: 'Maximum per-order value', maxPerCallCost: 'Maximum per-call cost',
  walletDailyLimit: 'Daily wallet spending limit', maxPriceChangePct: 'Maximum price change', minGrossMarginPct: 'Minimum gross margin',
  autoPauseReturnPct: 'Auto-pause return threshold',
}

const toDraft = (m: ApiMandate): Draft => ({ ...m, dailyBudget: String(m.dailyBudget / 100), maxOrderValue: String(m.maxOrderValue / 100), maxPerCallCost: String(m.maxPerCallCost / 100), walletDailyLimit: String(m.walletDailyLimit / 100) })

interface Profile {
  name: string; gstin: string | null; gstinMasked: string | null; gstinStatus: string | null; gstinNote: string | null; gstinUpdatedAt: string | null
  location: { text: string; placeId: string | null; city: string | null; state: string | null; country: string | null; verified: boolean } | null
}

export default function Settings() {
  const { auth, refreshMe, autonomyLevel, setAutonomyLevel } = useApp()
  const store = useDataStore()
  const mandateQ = useApiQuery<{ mandate: ApiMandate; today: { consumed: number } }>('/api/mandate', ['mandate', 'wallet'])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (mandateQ.data && !draft) setDraft(toDraft(mandateQ.data.mandate)) }, [mandateQ.data, draft])

  const errors: Partial<Record<keyof Draft, string>> = {}
  if (draft) {
    for (const k of MONEY) { const v = draft[k] as string; if (v === '' || !(Number(v) >= 0)) errors[k] = 'Enter an amount of ₹0 or more.' }
    if (draft.minGrossMarginPct < 0 || draft.minGrossMarginPct >= 100) errors.minGrossMarginPct = 'Enter 0–99%.'
    if (draft.autoPauseReturnPct < 0 || draft.autoPauseReturnPct > 100) errors.autoPauseReturnPct = 'Enter 0–100%.'
    if (Number(draft.maxOrderValue) > Number(draft.dailyBudget)) errors.maxOrderValue = 'Can’t be more than the daily budget.'
  }
  const dirty = !!draft && !!mandateQ.data && JSON.stringify(draft) !== JSON.stringify(toDraft(mandateQ.data.mandate))
  const valid = Object.keys(errors).length === 0

  const save = async () => {
    if (!draft || !valid || saving) return
    setSaving(true)
    try {
      const body = { ...draft, ...Object.fromEntries(MONEY.map((k) => [k, Math.round(Number(draft[k]) * 100)])) }
      const res = await api<{ mandate: ApiMandate }>('/api/mandate', { method: 'PUT', body })
      setDraft(toDraft(res.mandate))
      store.invalidate('mandate', 'wallet', 'analytics', 'activity')
      if (res.mandate.agentsPaused) await refreshMe()
      toast.success('Mandate saved', { description: 'EcomMind will operate within your updated limits.' })
    } catch (e) {
      toast.error('Couldn’t save the mandate', { description: e instanceof ApiError ? e.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  const numField = (key: keyof Draft, prefix = '₹', suffix = '') => (
    <div className="space-y-1.5">
      <Label htmlFor={`m-${key}`}>{LABELS[key]}</Label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
        <Input id={`m-${key}`} type="number" min={0} step="any" className={cx(prefix && 'pl-7', suffix && 'pr-8')} aria-invalid={!!errors[key]}
          value={String(draft![key])}
          onChange={(e) => setDraft({ ...draft!, [key]: MONEY.includes(key) ? e.target.value : Number(e.target.value) })} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {errors[key] && <p className="text-xs text-danger">{errors[key]}</p>}
    </div>
  )

  const toggle = (key: keyof Draft, label: string, desc: string, danger = false) => (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 px-4 py-3.5">
      <div>
        <p className={cx('text-sm font-medium', danger && 'text-danger')}>{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={Boolean(draft![key])} onCheckedChange={(v) => setDraft({ ...draft!, [key]: v })} aria-label={label} />
    </div>
  )

  const consumed = mandateQ.data?.today.consumed ?? 0
  const budget = draft ? Number(draft.dailyBudget) * 100 : 0

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Your business profile and the mandate EcomMind operates within."
        actions={
          <Button className="btn-glow border-0 text-white" onClick={save} disabled={!dirty || !valid || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />} Save Mandate
          </Button>
        }
      />
      {mandateQ.error && <div className="mb-4"><PanelError message={mandateQ.error.message} onRetry={mandateQ.reload} /></div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <BusinessProfileCard />
          {/* Autonomy Level Control (Feature 7) */}
          <Card className="card-surface">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-brand-soft" aria-hidden />
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

          {!draft ? <Skeleton className="h-96 rounded-xl" /> : (
            <>
              <Card className="card-surface">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-brand-soft" aria-hidden /> Financial limits</div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {numField('dailyBudget')}
                    {numField('maxOrderValue')}
                    {numField('maxPerCallCost')}
                    {numField('walletDailyLimit')}
                    {numField('minGrossMarginPct', '', '%')}
                    {numField('autoPauseReturnPct', '', '%')}
                  </div>
                  <div className="mt-5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Max price change — EcomMind may reprice within ±{draft.maxPriceChangePct}% without approval</span>
                      <span className="tabular font-medium">±{draft.maxPriceChangePct}%</span>
                    </div>
                    <Slider value={[draft.maxPriceChangePct]} min={1} max={30} step={1} onValueChange={([v]) => setDraft({ ...draft, maxPriceChangePct: v })} aria-label="Maximum price change percentage" />
                  </div>
                </CardContent>
              </Card>

              <Card className="card-surface">
                <CardContent className="space-y-3 p-5">
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4 text-brand-soft" aria-hidden /> Autonomy controls</div>
                  {toggle('autoPurchasing', 'Automatic purchasing', 'EcomMind may place purchase orders within your order limit.')}
                  {toggle('autoNegotiation', 'Automatic negotiation', 'EcomMind may counter supplier quotes at your target price.')}
                  {toggle('autoRepricing', 'Automatic repricing', 'EcomMind may adjust listing prices within the max change band.')}
                  {toggle('approvalAboveLimit', 'Require approval above spending limit', 'Any action beyond limits pauses and asks for your approval first.')}
                  {toggle('agentsPaused', 'Pause all agents', 'Immediately halts every autonomous action and agent call.', true)}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-4">
          {/* Appearance & Themes (Complete Dark & Light Mode Support) */}
          <Card className="card-surface">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4 text-brand-soft" aria-hidden />
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

          <Card className="card-surface">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Today's budget</h2>
                {draft && <StatusBadge label={draft.agentsPaused ? 'Paused' : 'Enforced'} tone={draft.agentsPaused ? 'danger' : 'success'} />}
              </div>
              <BudgetProgress label="Consumed today" value={consumed / 100} max={Math.max(1, budget / 100)} />
              <div className="rounded-xl border border-border bg-secondary/30 p-4">
                <p className="text-xs text-muted-foreground">Remaining autonomous budget</p>
                <p className="tabular mt-1 text-2xl font-semibold text-success">{formatPaise(Math.max(0, budget - consumed))}</p>
                <p className="mt-1 text-xs text-muted-foreground">of {formatPaise(budget)} daily mandate · resets at midnight IST</p>
              </div>
            </CardContent>
          </Card>

          <Card className="card-surface">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold"><PauseCircle className="h-4 w-4 text-brand-soft" aria-hidden /> Account</div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Seller</dt><dd className="font-medium">{auth.sellerName || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Plan</dt><dd className="font-medium text-brand-soft">{auth.plan}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Email</dt><dd className="truncate font-medium">{auth.email || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Email verified</dt><dd className="font-medium">{auth.emailVerified ? 'Yes' : 'No'}</dd></div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function BusinessProfileCard() {
  const { refreshMe } = useApp()
  const store = useDataStore()
  const q = useApiQuery<Profile>('/api/business/profile', ['profile'])
  const [editing, setEditing] = useState<null | 'gstin' | 'location'>(null)
  const [gstin, setGstin] = useState('')
  const [gstinError, setGstinError] = useState<string>()
  const [loc, setLoc] = useState<PlaceValue>({ text: '', placeId: null, sessionToken: null, verified: false })
  const [locError, setLocError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const p = q.data

  const save = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      await api('/api/business/profile', { method: 'PATCH', body })
      store.invalidate('profile')
      await refreshMe()
      setEditing(null)
      toast.success('Business profile updated')
    } catch (e) {
      const err = e instanceof ApiError ? e : undefined
      if (err?.field === 'gstin') setGstinError(err.message)
      else if (err?.field === 'location') setLocError(err.message)
      else toast.error('Couldn’t update the profile', { description: err?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="card-surface">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-brand-soft" aria-hidden /> Business profile</div>
        {q.error && <PanelError message={q.error.message} onRetry={q.reload} />}
        {!p ? <Skeleton className="h-28" /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Business GSTIN</p>
                {editing === 'gstin' ? (
                  <div className="mt-1.5 space-y-1.5">
                    <Input value={gstin} autoFocus maxLength={20} spellCheck={false} placeholder="Enter your 15-character GSTIN" className="max-w-xs font-mono uppercase tracking-wide"
                      aria-label="Business GSTIN" aria-invalid={!!gstinError}
                      onChange={(e) => { const v = normalizeGstin(e.target.value); setGstin(v); setGstinError(gstinLiveError(v)) }} />
                    {(() => {
                      const expectedCheck = getExpectedCheckDigit(gstin)
                      if (expectedCheck && gstin.length === 15 && gstin[14] !== expectedCheck) {
                        return (
                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                const fixed = gstin.slice(0, 14) + expectedCheck
                                setGstin(fixed)
                                setGstinError(undefined)
                              }}
                              className="inline-flex items-center gap-1 rounded bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 text-xs font-medium text-indigo-400 hover:bg-indigo-500/25 transition-colors"
                            >
                              Fix check digit to &quot;{expectedCheck}&quot;
                            </button>
                            <span className="text-[11px] text-muted-foreground">(Luhn mod-36)</span>
                          </div>
                        )
                      }
                      return null
                    })()}
                    <p className={cx('text-xs', gstinError ? 'text-danger' : 'text-muted-foreground')}>{gstinError ?? 'The GST identification number registered for your business.'}</p>
                  </div>
                ) : (
                  <>
                    <p className="mt-0.5 font-mono text-sm font-semibold tracking-wide">{p.gstin ?? 'Not added yet'}</p>
                    {p.gstin && <p className="mt-0.5 text-[11px] text-muted-foreground">{p.gstinNote}</p>}
                  </>
                )}
              </div>
              {editing === 'gstin' ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
                  <Button size="sm" disabled={busy || !validateGstin(gstin).ok} onClick={() => save({ gstin })}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : 'Save'}</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {p.gstin && <StatusBadge label="Format validated" tone="info" />}
                  <Button variant="outline" size="sm" onClick={() => { setGstin(p.gstin ?? ''); setGstinError(undefined); setEditing('gstin') }}>{p.gstin ? 'Edit' : 'Add GSTIN'}</Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Business location</p>
                {editing === 'location' ? (
                  <div className="mt-1.5 max-w-md"><LocationAutocomplete id="settings-location" value={loc} onChange={(v) => { setLoc(v); setLocError(undefined) }} error={locError} /></div>
                ) : (
                  <>
                    <p className="mt-0.5 text-sm font-medium">{p.location?.text ?? 'Not set'}</p>
                    {p.location && <p className="mt-0.5 text-[11px] text-muted-foreground">{p.location.verified ? 'Verified with Google Places' : 'Entered manually · not verified'}</p>}
                  </>
                )}
              </div>
              {editing === 'location' ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
                  <Button size="sm" disabled={busy || loc.text.trim().length < 2} onClick={() => save({ location: { text: loc.text.trim(), placeId: loc.placeId, sessionToken: loc.sessionToken } })}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : 'Save'}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => { setLoc({ text: '', placeId: null, sessionToken: null, verified: false }); setEditing('location') }}>Change</Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
