import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Loader2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { ApiError } from '@/lib/api'
import { emailError } from '@/lib/validation/email'
import { AuthModeSwitch } from './AuthShell'
import type { DemoRouteState } from '@/pages/landing/authCta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

const DEMO_OPEN_DELAY_MS = 600

export default function Login() {
  const { login, demoLogin } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const wantsDemo = !!(location.state as DemoRouteState | null)?.startDemo
  const [autoDemoRunning, setAutoDemoRunning] = useState(false)
  const [demoRunning, setDemoRunning] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [emailTouched, setEmailTouched] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    const em = emailError(email)
    if (em) errs.email = em
    if (password.length < 6) errs.password = 'Password must be at least 6 characters.'
    setErrors(errs)
    setEmailTouched(true)
    if (Object.keys(errs).length) return
    setLoading(true)
    try {
      const me = await login(email.trim(), password)
      toast.success('Welcome back', { description: 'Signed in to EcomMind.' })
      navigate(me.business?.onboarded ? '/' : '/onboarding')
    } catch (err) {
      if (err instanceof ApiError && err.field === 'email') setErrors({ email: err.message })
      else setErrors({ form: err instanceof ApiError ? err.message : 'Sign-in failed. Try again.' })
    } finally {
      setLoading(false)
    }
  }

  const demo = async () => {
    setLoading(true)
    setDemoRunning(true)
    try {
      await demoLogin()
      navigate('/')
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Demo login failed.' })
    } finally {
      setLoading(false)
      setDemoRunning(false)
    }
  }

  // "Try the Live Demo" on the landing page arrives here and runs the same handler as the button.
  // It waits for the dialog to finish opening; closing the dialog before then cancels it.
  useEffect(() => {
    if (!wantsDemo) return
    const timer = window.setTimeout(() => {
      setAutoDemoRunning(true)
      navigate('/login', { replace: true, state: null })
      demo().finally(() => setAutoDemoRunning(false))
    }, DEMO_OPEN_DELAY_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsDemo])

  if (wantsDemo || autoDemoRunning) {
    return (
      <div role="status" className="flex flex-col items-center py-14 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-soft" aria-hidden />
        <h2 className="mt-5 text-xl font-bold tracking-tight">Opening the live demo</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Loading UrbanNest Living, a sample business.</p>
      </div>
    )
  }

  return (
    <>
      <AuthModeSwitch />
      <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your autonomous commerce workspace.</p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email" type="email" autoComplete="email" placeholder="you@gmail.com" value={email}
            onChange={(e) => { setEmail(e.target.value); if (emailTouched) setErrors((x) => ({ ...x, email: emailError(e.target.value), form: undefined })) }}
            onBlur={() => { setEmailTouched(true); if (email) setErrors((x) => ({ ...x, email: emailError(email) })) }}
            aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : 'email-hint'}
          />
          {errors.email
            ? <p id="email-error" className="text-xs text-danger">{errors.email}</p>
            : <p id="email-hint" className="text-xs text-muted-foreground">Use your Gmail address (ending in @gmail.com).</p>}
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
        {errors.form && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{errors.form}</p>}
        <div className="flex items-center gap-2">
          <Checkbox id="remember" checked={remember} onCheckedChange={(c) => setRemember(c === true)} />
          <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">Remember me on this device</Label>
        </div>
        <Button type="submit" className="btn-glow h-10 w-full border-0 text-white" disabled={loading}>
          {loading && !demoRunning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Sign in'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" className="h-10 w-full border-brand/40 bg-brand/10 text-brand-soft hover:bg-brand/20 hover:text-brand-soft" onClick={demo} disabled={loading}>
        {demoRunning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} Demo Login — explore with sample data
      </Button>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to EcomMind?{' '}
        <Link to="/register" className="font-medium text-brand-soft hover:underline">Create an account</Link>
      </p>
    </>
  )
}
