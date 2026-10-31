import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { ApiError } from '@/lib/api'
import { emailError } from '@/lib/validation/email'
import { AuthShell } from './AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CATEGORIES = ['Electronics & Accessories', 'Fashion & Apparel', 'Home & Kitchen', 'Fitness & Sports', 'Beauty & Personal Care', 'Toys & Baby', 'Other']

export default function Register() {
  const { register } = useApp()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', business: '', email: '', password: '', confirm: '', category: '' })
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
    setErrors(errs)
    setTouched({ name: true, business: true, email: true, password: true, confirm: true, category: true })
    if (Object.keys(errs).length) return
    setLoading(true)
    try {
      await register({ name: form.name.trim(), business: form.business.trim(), email: form.email.trim(), password: form.password, category: form.category })
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
      <h2 className="text-2xl font-semibold tracking-tight">Create your account</h2>
      <p className="mt-1 text-sm text-muted-foreground">Set up your autonomous selling workspace in minutes.</p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        {field('name', 'Seller name', 'text', 'Aarav Sharma')}
        {field('business', 'Business name', 'text', 'UrbanNest Living')}
        {field('email', 'Email', 'email', 'you@gmail.com')}
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
