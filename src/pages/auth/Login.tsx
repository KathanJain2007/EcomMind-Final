import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { BrainCircuit, Loader2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { AuthShell } from './AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

export default function Login() {
  const { login, demoLogin } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = 'Enter a valid email address.'
    if (password.length < 6) errs.password = 'Password must be at least 6 characters.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setLoading(true)
    setTimeout(() => {
      login(email)
      toast.success('Welcome back', { description: 'Signed in to EcomMind.' })
      navigate('/onboarding')
    }, 700)
  }

  return (
    <AuthShell>
      <div className="mb-8 lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="btn-glow flex h-9 w-9 items-center justify-center rounded-xl">
            <BrainCircuit className="h-5 w-5 text-white" aria-hidden />
          </div>
          <p className="text-lg font-semibold">EcomMind</p>
        </div>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your autonomous commerce workspace.</p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@yourstore.in" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
          {errors.email && <p className="text-xs text-danger">{errors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <button type="button" onClick={() => toast.info('Password reset', { description: 'A reset link would be emailed to you in the connected backend.' })} className="text-xs font-medium text-brand-soft hover:underline">
              Forgot password?
            </button>
          </div>
          <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
          {errors.password && <p className="text-xs text-danger">{errors.password}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="remember" checked={remember} onCheckedChange={(c) => setRemember(c === true)} />
          <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">Remember me on this device</Label>
        </div>
        <Button type="submit" className="btn-glow h-10 w-full border-0 text-white" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Sign in'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" className="h-10 w-full border-brand/40 bg-brand/10 text-brand-soft hover:bg-brand/20 hover:text-brand-soft" onClick={() => { demoLogin(); navigate('/') }}>
        <Play className="h-4 w-4" aria-hidden /> Demo Login — explore with sample data
      </Button>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to EcomMind?{' '}
        <Link to="/register" className="font-medium text-brand-soft hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  )
}
