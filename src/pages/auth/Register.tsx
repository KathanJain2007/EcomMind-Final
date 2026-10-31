import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { ApiError } from '@/lib/api'
import { emailError } from '@/lib/validation/email'
import { getExpectedCheckDigit, gstinLiveError, normalizeGstin, SAMPLE_GSTINS, validateGstin } from '@/lib/validation/gstin'
import { EMPTY_PLACE, locationProblem, type PlaceValue } from '@/lib/place'
import { LocationAutocomplete } from '@/components/LocationAutocomplete'
import { AuthModeSwitch, AuthShell } from './AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CATEGORIES = ['Electronics & Accessories', 'Fashion & Apparel', 'Home & Kitchen', 'Fitness & Sports', 'Beauty & Personal Care', 'Toys & Baby', 'Other']

export default function Register() {
  const { register } = useApp()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', business: '', email: '', gstin: '', password: '', confirm: '', category: '' })
  const [location, setLocation] = useState<PlaceValue>(EMPTY_PLACE)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => {
      const next = { ...f, [k]: v }
      // Re-check a field as the user edits it once it has been visited (instant feedback).
      if (touched[k]) setErrors((x) => ({ ...x, [k]: validateField(k, v, next) ?? '', form: '' }))
      return next
    })
  }

  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const validateField = (k: keyof typeof form, v: string, all = form): string | undefined => {
    switch (k) {
      case 'name': return v.trim().length < 2 ? 'Enter your full name.' : undefined
      case 'business': return v.trim().length < 2 ? 'Enter your business name.' : undefined
      case 'email': return emailError(v)
      case 'gstin': {
        if (!v.trim()) return undefined // optional here
        const r = validateGstin(v)
        return r.ok ? undefined : r.message
      }
      case 'password': return v.length < 6 ? 'At least 6 characters.' : undefined
      case 'confirm': return v !== all.password ? 'Passwords do not match.' : undefined
      case 'category': return !v ? 'Select a category.' : undefined
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    for (const k of Object.keys(form) as (keyof typeof form)[]) {
      const m = validateField(k, form[k])
      if (m) errs[k] = m
    }
    const locationError = locationProblem(location, false)
    if (locationError) errs.location = locationError
    setErrors(errs)
    setTouched({ name: true, business: true, email: true, password: true, confirm: true, category: true })
    if (Object.keys(errs).length) return
    setLoading(true)
    try {
      await register({ name: form.name.trim(), business: form.business.trim(), email: form.email.trim(), password: form.password, category: form.category, location: location.text.trim(), gstin: normalizeGstin(form.gstin) || undefined })
      navigate('/onboarding')
    } catch (err) {
      if (err instanceof ApiError && err.field) setErrors({ [err.field]: err.message })
      else setErrors({ form: err instanceof ApiError ? err.message : 'Couldn’t create your account. Try again.' })
    } finally {
      setLoading(false)
    }
  }

  const field = (id: keyof typeof form, label: string, type = 'text', placeholder = '') => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id} type={type} placeholder={placeholder} value={form[id]} onChange={(e) => set(id)(e.target.value)}
        onBlur={() => { setTouched((t) => ({ ...t, [id]: true })); if (form[id]) setErrors((x) => ({ ...x, [id]: validateField(id, form[id]) ?? '' })) }}
        aria-invalid={!!errors[id]} aria-describedby={errors[id] ? `${id}-error` : undefined}
        autoComplete={id === 'email' ? 'email' : id === 'password' || id === 'confirm' ? 'new-password' : undefined}
      />
      {errors[id] ? <p id={`${id}-error`} className="text-xs text-danger">{errors[id]}</p>
        : id === 'email' ? <p className="text-xs text-muted-foreground">Only Gmail addresses (ending in @gmail.com) are accepted.</p> : null}
    </div>
  )

  return (
    <AuthShell>
      <AuthModeSwitch />
      <h2 className="text-2xl font-bold tracking-tight">Create your account</h2>
      <p className="mt-1 text-sm text-muted-foreground">Set up your autonomous selling workspace in minutes.</p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        {field('name', 'Seller name', 'text', 'Aarav Sharma')}
        {field('business', 'Business name', 'text', 'UrbanNest Living')}
        {field('email', 'Email', 'email', 'you@gmail.com')}
        <div className="space-y-1.5">
          <Label htmlFor="location">City / Location <span className="font-normal text-muted-foreground">(type a letter, e.g. b for Bengaluru)</span></Label>
          <LocationAutocomplete
            id="location"
            cityListOnly
            value={location}
            onChange={(v) => { setLocation(v); setErrors((x) => ({ ...x, location: '', form: '' })) }}
            error={errors.location || undefined}
            placeholder="Type a city or its first letter"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="gstin">Business GSTIN <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <span className="text-[11px] text-muted-foreground">15 characters</span>
          </div>
          <Input
            id="gstin"
            placeholder="e.g. 27AAPFU0939F1ZV"
            value={form.gstin}
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase tracking-wide placeholder:normal-case placeholder:font-sans placeholder:tracking-normal"
            aria-invalid={!!errors.gstin}
            aria-describedby="gstin-help"
            onChange={(e) => {
              const v = normalizeGstin(e.target.value)
              setForm((f) => ({ ...f, gstin: v }))
              setErrors((x) => ({ ...x, gstin: gstinLiveError(v) ?? '', form: '' }))
            }}
          />
          {errors.gstin
            ? <p id="gstin-help" className="text-xs text-danger">{errors.gstin}</p>
            : <p id="gstin-help" className="text-xs text-muted-foreground">{form.gstin && validateGstin(form.gstin).ok ? 'Format looks valid. Not checked with the GST portal.' : 'Any GSTIN with a correct format and check digit is accepted.'}</p>}
          {form.gstin.length >= 14 && !validateGstin(form.gstin).ok && getExpectedCheckDigit(form.gstin) && (
            <button
              type="button"
              onClick={() => { setForm((f) => ({ ...f, gstin: f.gstin.slice(0, 14) + getExpectedCheckDigit(f.gstin) })); setErrors((x) => ({ ...x, gstin: '' })) }}
              className="rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-soft transition-colors hover:bg-brand/20"
            >
              Use check digit &quot;{getExpectedCheckDigit(form.gstin)}&quot;
            </button>
          )}
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none">Sample GSTINs for testing</summary>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SAMPLE_GSTINS.map((g) => (
                <button
                  key={g.gstin}
                  type="button"
                  title={g.state}
                  onClick={() => { setForm((f) => ({ ...f, gstin: g.gstin })); setErrors((x) => ({ ...x, gstin: '' })) }}
                  className="rounded-md border border-border bg-secondary/60 px-2 py-0.5 font-mono transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <span className="text-brand-soft">{g.label}</span> {g.gstin}
                </button>
              ))}
            </div>
          </details>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field('password', 'Password', 'password', '••••••••')}
          {field('confirm', 'Confirm password', 'password', '••••••••')}
        </div>
        <div className="space-y-1.5">
          <Label>Business category</Label>
          <Select value={form.category} onValueChange={(v) => { setTouched((t) => ({ ...t, category: true })); set('category')(v); setErrors((x) => ({ ...x, category: '' })) }}>
            <SelectTrigger aria-invalid={!!errors.category}><SelectValue placeholder="Select a category" /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          {errors.category && <p className="text-xs text-danger">{errors.category}</p>}
        </div>
        {errors.form && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{errors.form}</p>}
        <Button type="submit" className="btn-glow h-10 w-full border-0 text-white" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-soft hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
