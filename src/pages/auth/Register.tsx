import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { BadgeCheck, CheckCircle2, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { AuthShell } from './AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { INDIAN_STATE_CODES, validateGSTIN } from '@/data/models'

const CATEGORIES = [
  'Electronics & Accessories',
  'Fashion & Apparel',
  'Home & Kitchen',
  'Fitness & Sports',
  'Beauty & Personal Care',
  'Toys & Baby',
  'Other',
]

const BUSINESS_TYPES = [
  'Private Limited',
  'Proprietorship',
  'Partnership',
  'LLP',
  'Public Limited',
]

export default function Register() {
  const { register } = useApp()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: '',
    business: '',
    email: '',
    password: '',
    confirm: '',
    category: '',
    gstin: '',
    address: '',
    state: 'Rajasthan',
    businessType: 'Private Limited',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [gstinVerified, setGstinVerified] = useState(false)
  const [gstinChecking, setGstinChecking] = useState(false)
  const [gstinDetails, setGstinDetails] = useState<{ legalName?: string; state?: string; pan?: string } | null>(null)

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[k]
        return next
      })
    }
  }

  // Live GSTIN check
  const handleVerifyGSTIN = () => {
    const raw = form.gstin.trim().toUpperCase()
    if (!raw) {
      setErrors((e) => ({ ...e, gstin: 'Enter a 15-character GSTIN to verify.' }))
      return
    }

    setGstinChecking(true)
    setTimeout(() => {
      setGstinChecking(false)
      const res = validateGSTIN(raw)
      if (!res.valid) {
        setGstinVerified(false)
        setGstinDetails(null)
        setErrors((e) => ({ ...e, gstin: res.error || 'Invalid GSTIN structure.' }))
      } else {
        setGstinVerified(true)
        setGstinDetails({
          legalName: `${form.business ? form.business.toUpperCase() : 'ENTERPRISES'} PVT LTD`,
          state: res.state,
          pan: res.pan,
        })
        if (res.state) {
          setForm((f) => ({ ...f, state: res.state! }))
        }
        setErrors((prev) => {
          const next = { ...prev }
          delete next.gstin
          return next
        })
      }
    }, 600)
  }

  const handleUseDemoGSTIN = () => {
    const demo = '08AABCU9603R1ZM'
    setForm((f) => ({
      ...f,
      gstin: demo,
      business: f.business || 'UrbanNest Living',
      state: 'Rajasthan',
      address: f.address || 'Plot 42, Sitapura Industrial Area, Tonk Road, Jaipur',
      businessType: 'Private Limited',
    }))
    setGstinVerified(true)
    setGstinDetails({
      legalName: 'URBANNEST LIVING PRIVATE LIMITED',
      state: 'Rajasthan',
      pan: 'AABCU9603R',
    })
    setErrors((prev) => {
      const next = { ...prev }
      delete next.gstin
      return next
    })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}

    if (form.name.trim().length < 2) errs.name = 'Enter your full name.'
    if (form.business.trim().length < 2) errs.business = 'Enter your business name.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Enter a valid email address.'
    if (form.password.length < 6) errs.password = 'At least 6 characters.'
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match.'
    if (!form.category) errs.category = 'Select a category.'

    if (form.gstin.trim()) {
      const val = validateGSTIN(form.gstin)
      if (!val.valid) {
        errs.gstin = val.error || 'Invalid GSTIN.'
      }
    }

    setErrors(errs)
    if (Object.keys(errs).length) return

    setLoading(true)
    setTimeout(() => {
      register(
        form.name,
        form.business,
        form.email,
        form.gstin.trim().toUpperCase(),
        form.address.trim(),
        form.state,
        form.businessType
      )
      navigate('/onboarding')
    }, 800)
  }

  const field = (id: keyof typeof form, label: string, type = 'text', placeholder = '', help?: string) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs font-medium">
          {label}
        </Label>
        {help && <span className="text-[10px] text-muted-foreground">{help}</span>}
      </div>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        value={form[id]}
        onChange={(e) => set(id)(e.target.value)}
        aria-invalid={!!errors[id]}
        className="h-9 text-xs"
      />
      {errors[id] && <p className="text-[11px] text-danger">{errors[id]}</p>}
    </div>
  )

  return (
    <AuthShell>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Create your seller account</h2>
        <Badge variant="outline" className="border-brand/40 text-[10px] text-brand-soft">
          GST-Enabled
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Set up your autonomous selling workspace with verified business identity.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {/* Core Profile */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field('name', 'Seller Name', 'text', 'Aarav Sharma')}
          {field('business', 'Trade / Store Name', 'text', 'UrbanNest Living')}
        </div>

        {field('email', 'Business Email Address', 'email', 'you@yourstore.in')}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field('password', 'Password', 'password', '••••••••')}
          {field('confirm', 'Confirm Password', 'password', '••••••••')}
        </div>

        {/* Business Category & Type */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Primary Category</Label>
            <Select value={form.category} onValueChange={set('category')}>
              <SelectTrigger className="h-9 text-xs" aria-invalid={!!errors.category}>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-[11px] text-danger">{errors.category}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Constitution of Business</Label>
            <Select value={form.businessType} onValueChange={set('businessType')}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* GSTIN Integration Section (Feature 2) */}
        <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand-soft" />
              <Label htmlFor="gstin" className="text-xs font-semibold text-foreground">
                GSTIN Number (Optional or Verify)
              </Label>
            </div>
            <button
              type="button"
              onClick={handleUseDemoGSTIN}
              className="flex items-center gap-1 text-[11px] font-medium text-brand-soft hover:underline"
            >
              <Sparkles className="h-3 w-3" /> Fill Sample GSTIN
            </button>
          </div>

          <div className="flex gap-2">
            <Input
              id="gstin"
              type="text"
              placeholder="e.g. 08AABCU9603R1ZM"
              value={form.gstin}
              onChange={(e) => {
                set('gstin')(e.target.value.toUpperCase())
                setGstinVerified(false)
              }}
              maxLength={15}
              className="h-9 font-mono uppercase text-xs"
              aria-invalid={!!errors.gstin}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleVerifyGSTIN}
              disabled={gstinChecking || !form.gstin}
              className="h-9 whitespace-nowrap text-xs gap-1"
            >
              {gstinChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
              Verify
            </Button>
          </div>

          {errors.gstin && <p className="text-[11px] text-danger">{errors.gstin}</p>}

          {/* Verification Badge & Details */}
          {gstinVerified && gstinDetails && (
            <div className="rounded-lg border border-success/30 bg-success/10 p-2.5 text-xs text-success space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> GSTIN Verified Active
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">Luhn Mod-36 Passed</span>
              </div>
              <p className="text-[11px] text-foreground font-medium">{gstinDetails.legalName}</p>
              <p className="text-[10px] text-muted-foreground">
                State: <strong>{gstinDetails.state}</strong> · PAN: <strong>{gstinDetails.pan}</strong> · Taxpayer Type: Regular
              </p>
            </div>
          )}

          {/* Business address & state */}
          <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="address" className="text-[11px] text-muted-foreground">
                Registered Principal Address
              </Label>
              <Input
                id="address"
                placeholder="Plot 42, Sitapura Industrial Area, Tonk Road"
                value={form.address}
                onChange={(e) => set('address')(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">State Jurisdiction</Label>
              <Select value={form.state} onValueChange={set('state')}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {Object.entries(INDIAN_STATE_CODES).map(([code, s]) => (
                    <SelectItem key={code} value={s} className="text-xs">
                      {s} ({code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Button type="submit" className="btn-glow h-10 w-full border-0 text-white font-medium text-xs" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Create autonomous business account'}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-soft hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}
