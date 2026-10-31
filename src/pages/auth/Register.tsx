import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useApp } from '@/store/AppContext'
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

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (form.name.trim().length < 2) errs.name = 'Enter your full name.'
    if (form.business.trim().length < 2) errs.business = 'Enter your business name.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Enter a valid email address.'
    if (form.password.length < 6) errs.password = 'At least 6 characters.'
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match.'
    if (!form.category) errs.category = 'Select a category.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setLoading(true)
    setTimeout(() => {
      register(form.name, form.business, form.email)
      navigate('/onboarding')
    }, 800)
  }

  const field = (id: keyof typeof form, label: string, type = 'text', placeholder = '') => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} placeholder={placeholder} value={form[id]} onChange={(e) => set(id)(e.target.value)} aria-invalid={!!errors[id]} />
      {errors[id] && <p className="text-xs text-danger">{errors[id]}</p>}
    </div>
  )

  return (
    <AuthShell>
      <h2 className="text-2xl font-semibold tracking-tight">Create your account</h2>
      <p className="mt-1 text-sm text-muted-foreground">Set up your autonomous selling workspace in minutes.</p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        {field('name', 'Seller name', 'text', 'Aarav Sharma')}
        {field('business', 'Business name', 'text', 'UrbanNest Living')}
        {field('email', 'Email', 'email', 'you@yourstore.in')}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field('password', 'Password', 'password', '••••••••')}
          {field('confirm', 'Confirm password', 'password', '••••••••')}
        </div>
        <div className="space-y-1.5">
          <Label>Business category</Label>
          <Select value={form.category} onValueChange={set('category')}>
            <SelectTrigger aria-invalid={!!errors.category}><SelectValue placeholder="Select a category" /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          {errors.category && <p className="text-xs text-danger">{errors.category}</p>}
        </div>
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
