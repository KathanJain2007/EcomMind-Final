import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { Sparkles, ShieldCheck, Handshake } from 'lucide-react'
import { Toaster } from 'sonner'
import BrandMark from '@/components/BrandMark'
import LogoLoop from '@/components/LogoLoop'
import { cx } from '@/lib/format'

/** Switches between signing in and creating an account. */
export function AuthModeSwitch() {
  return (
    <nav aria-label="Sign in or create an account" className="mb-7 grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary/80 p-1">
      {[{ to: '/login', label: 'Sign In' }, { to: '/register', label: 'Create Account' }].map((m) => (
        <NavLink
          key={m.to}
          to={m.to}
          className={({ isActive }) => cx(
            'rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors',
            isActive ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {m.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      {/* Brand panel */}
      <div className="glass relative m-3 hidden w-[46%] flex-col justify-between gap-8 overflow-hidden rounded-[28px] border p-10 lg:flex">
        <div className="panel-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" aria-hidden />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-96 w-96 rounded-full bg-[var(--chart-teal)]/20 blur-[110px]" aria-hidden />
        <div className="pointer-events-none absolute -right-24 top-10 h-96 w-96 rounded-full bg-[var(--chart-lavender)]/30 blur-[110px]" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <BrandMark className="h-10 w-10" />
          <div>
            <p className="font-heading text-lg font-bold tracking-tight">EcomMind</p>
            <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">Autonomous Economy</p>
          </div>
        </div>

        <div className="relative">
          <div className="mb-8 overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)] ring-1 ring-black/5">
            <LogoLoop className="aspect-video max-h-[36vh] w-full" />
          </div>
          <h1 className="max-w-lg text-[34px] font-extrabold leading-[1.14] tracking-tight">
            Not another dashboard. <span className="text-gradient">An AI agent that discovers, negotiates with and pays other agents</span> for you.
          </h1>
          <ul className="mt-7 space-y-3.5">
            {[
              { icon: Sparkles, text: 'Forecasts demand and detects stockouts before they cost you sales' },
              { icon: Handshake, text: 'Negotiates with supplier agents and locks the best price' },
              { icon: ShieldCheck, text: 'Pays suppliers through escrow — released only on delivery' },
            ].map((f) => (
              <li key={f.text} className="flex items-start gap-3 text-sm text-muted-foreground">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-card text-brand-soft shadow-xs">
                  <f.icon className="h-3.5 w-3.5" aria-hidden />
                </div>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Built for sellers on Amazon, Flipkart, Meesho, Shopify & Instagram.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="glass w-full max-w-md rounded-[28px] border p-6 sm:p-8">{children}</div>
      </div>
      <Toaster position="bottom-right" toastOptions={{ style: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))' } }} />
    </div>
  )
}
