import type { ReactNode } from 'react'
import { BrainCircuit, Sparkles, ShieldCheck, Handshake } from 'lucide-react'
import { Toaster } from 'sonner'

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden border-r border-border bg-sidebar p-10 lg:flex">
        <div className="panel-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="pointer-events-none absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-brand/15 blur-[120px]" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <div className="btn-glow flex h-10 w-10 items-center justify-center rounded-xl">
            <BrainCircuit className="h-5.5 w-5.5 text-white" aria-hidden />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">EcomMind</p>
            <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">Autonomous Economy</p>
          </div>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Not another dashboard. <span className="text-gradient">An AI agent that discovers, negotiates with and pays other agents</span> for you.
          </h1>
          <ul className="mt-8 space-y-4">
            {[
              { icon: Sparkles, text: 'Forecasts demand and detects stockouts before they cost you sales' },
              { icon: Handshake, text: 'Negotiates with supplier agents and locks the best price' },
              { icon: ShieldCheck, text: 'Pays through simulated escrow — released only on delivery' },
            ].map((f) => (
              <li key={f.text} className="flex items-start gap-3 text-sm text-muted-foreground">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand-soft">
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
        <div className="w-full max-w-md">{children}</div>
      </div>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#151E33', border: '1px solid #27334D', color: '#F8FAFC' } }} />
    </div>
  )
}
