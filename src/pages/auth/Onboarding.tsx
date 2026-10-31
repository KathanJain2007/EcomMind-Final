import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Check, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { AuthShell } from './AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LocationAutocomplete } from '@/components/LocationAutocomplete'
import { locationProblem, type PlaceValue } from '@/lib/place'
import { api, ApiError, type MeResponse } from '@/lib/api'
import { gstinLiveError, normalizeGstin, validateGstin } from '@/lib/validation/gstin'
import { cx } from '@/lib/format'

const STEPS = ['Business', 'Channel', 'Inventory']
const CATEGORIES = ['Electronics & Accessories', 'Fashion & Apparel', 'Home & Kitchen', 'Fitness & Sports', 'Beauty & Personal Care', 'Other']
const CHANNELS = ['Amazon', 'Flipkart', 'Meesho', 'Shopify', 'Instagram']
const CURRENCIES = ['INR (₹)', 'USD ($)']

export default function Onboarding() {
  const { auth, me, setMe } = useApp()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [verificationRequired, setVerificationRequired] = useState(false)
  const [form, setForm] = useState({ business: auth.storeName || '', category: '', channel: '', currency: 'INR (₹)', gstin: '', fileName: '' })
  const [location, setLocation] = useState<PlaceValue>({ text: '', placeId: null, sessionToken: null, verified: false })
  const [errors, setErrors] = useState<{ gstin?: string; location?: string; business?: string; form?: string }>({})

  useEffect(() => {
    api<{ verificationRequired: boolean }>('/api/places/config').then((c) => setVerificationRequired(c.verificationRequired)).catch(() => {})
  }, [])
  useEffect(() => {
    if (me?.business?.category && !form.category && CATEGORIES.includes(me.business.category)) setForm((f) => ({ ...f, category: me.business!.category! }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  const gstinOk = validateGstin(form.gstin).ok
  const canNext =
    step === 0 ? form.business.trim().length >= 2 && form.category !== '' && !locationProblem(location, verificationRequired) && gstinOk
    : step === 1 ? form.channel !== ''
    : true

  const next = () => {
    if (step === 0) {
      const g = validateGstin(form.gstin)
      const l = locationProblem(location, verificationRequired)
      setErrors({ gstin: g.ok ? undefined : g.message, location: l })
      if (!g.ok || l) return
    }
    setStep(step + 1)
  }

  const finish = async () => {
    setSaving(true)
    setErrors({})
    try {
      const res = await api<MeResponse>('/api/business/onboarding', {
        method: 'PUT',
        body: {
          business: form.business.trim(), category: form.category, currency: form.currency, channel: form.channel,
          gstin: normalizeGstin(form.gstin),
          location: { text: location.text.trim(), placeId: location.placeId, sessionToken: location.sessionToken },
        },
      })
      setMe(res)
      toast.success('Setup complete', { description: 'Your autonomous economy is ready. Load the demo business to explore.' })
      if (form.fileName) toast.info('Inventory file not uploaded yet', { description: `Open Import Data to upload ${form.fileName}.` })
      navigate('/')
    } catch (e) {
      if (e instanceof ApiError && (e.field === 'gstin' || e.field === 'location')) {
        setErrors({ [e.field]: e.message })
        setStep(0)
      } else {
        setErrors({ form: e instanceof ApiError ? e.message : 'Couldn’t save your business details. Try again.' })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthShell>
      <div className="mb-8">
        <ol className="flex items-center gap-2" aria-label="Onboarding progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cx(
                'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
                i < step ? 'border-success bg-success/15 text-success' : i === step ? 'border-brand bg-brand/15 text-brand-soft' : 'border-border text-muted-foreground',
              )}>
                {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cx('text-xs font-medium', i === step ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-border" aria-hidden />}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Tell us about your business</h2>
          <p className="text-sm text-muted-foreground">EcomMind uses this to tune forecasts and agent behaviour.</p>
          <div className="space-y-1.5 pt-2">
            <Label htmlFor="ob-business">Business name</Label>
            <Input id="ob-business" placeholder="UrbanNest Living" value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>E-commerce category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-gstin">Business GSTIN</Label>
            <Input
              id="ob-gstin"
              placeholder="Enter your 15-character GSTIN"
              value={form.gstin}
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase tracking-wide"
              onChange={(e) => {
                const v = normalizeGstin(e.target.value)
                setForm({ ...form, gstin: v })
                setErrors((x) => ({ ...x, gstin: gstinLiveError(v) }))
              }}
              onBlur={() => { if (!form.gstin) return; const r = validateGstin(form.gstin); setErrors((x) => ({ ...x, gstin: r.ok ? undefined : r.message })) }}
              aria-invalid={!!errors.gstin}
              aria-describedby="ob-gstin-help"
            />
            <p id="ob-gstin-help" className={cx('text-xs', errors.gstin ? 'text-danger' : gstinOk ? 'text-success' : 'text-muted-foreground')}>
              {errors.gstin ?? (gstinOk
                ? 'Format looks valid. EcomMind checks the format only, not registration with the GST portal.'
                : 'The GST identification number registered for your business, e.g. 27AAPFU0939F1ZV.')}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="ob-location">Business location</Label>
              <LocationAutocomplete id="ob-location" value={location} onChange={(v) => { setLocation(v); setErrors((x) => ({ ...x, location: undefined })) }} error={errors.location} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Where do you sell the most?</h2>
          <p className="text-sm text-muted-foreground">Pick your primary sales channel — you can connect more later.</p>
          <div className="grid grid-cols-1 gap-2.5 pt-2 sm:grid-cols-2">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm({ ...form, channel: c })}
                aria-pressed={form.channel === c}
                className={cx(
                  'rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition-all',
                  form.channel === c ? 'border-brand bg-brand/12 text-brand-soft' : 'border-border bg-card text-muted-foreground hover:border-brand/40 hover:text-foreground',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Upload your inventory</h2>
          <p className="text-sm text-muted-foreground">Optional — you can also do this later from the Import Center.</p>
          <label
            htmlFor="ob-file"
            className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center transition-colors hover:border-brand/50"
          >
            <Upload className="mb-2 h-6 w-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">{form.fileName || 'Drop Products.csv here, or click to browse'}</span>
            <span className="mt-1 text-xs text-muted-foreground">CSV or XLSX, up to 10 MB</span>
            <input id="ob-file" type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => setForm({ ...form, fileName: e.target.files?.[0]?.name ?? '' })} />
          </label>
        </div>
      )}

      {errors.form && <p role="alert" className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{errors.form}</p>}

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => (step === 0 ? navigate('/login') : setStep(step - 1))} disabled={saving}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button className="btn-glow border-0 text-white" disabled={!canNext} onClick={next}>
            Continue <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button className="btn-glow border-0 text-white" onClick={finish} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <>Finish setup <Check className="h-4 w-4" aria-hidden /></>}
          </Button>
        )}
      </div>
    </AuthShell>
  )
}
