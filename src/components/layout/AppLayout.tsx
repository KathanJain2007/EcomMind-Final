import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from './AppSidebar'
import { AppHeader } from './AppHeader'
import { cx } from '@/lib/format'

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  // First segment only: /negotiations/:id must not remount the page on every switch.
  const section = useLocation().pathname.split('/')[1]
  return (
    <TooltipProvider>
      <div className="min-h-dvh">
        <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <div className={cx('flex min-h-dvh flex-col transition-[margin] duration-200', collapsed ? 'lg:pl-[84px]' : 'lg:pl-[272px]')}>
          <AppHeader />
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6">
            <div key={section} className="page-enter">
              <Outlet />
            </div>
          </main>
          <footer className="px-6 py-4 text-center text-xs text-muted-foreground">
            EcomMind – Your Business. Your Agents. Your Autonomous Economy. · All payments on this demo are simulated.
          </footer>
        </div>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))' },
          }}
        />
      </div>
    </TooltipProvider>
  )
}
