import { useState } from 'react'
import { Outlet } from 'react-router'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from './AppSidebar'
import { AppHeader } from './AppHeader'
import { cx } from '@/lib/format'

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-background">
        <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <div className={cx('flex min-h-dvh flex-col transition-[margin] duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-64')}>
          <AppHeader />
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6">
            <Outlet />
          </main>
          <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
            EcomMind – Your Business. Your Agents. Your Autonomous Economy. · All payments on this demo are simulated.
          </footer>
        </div>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: '#151E33', border: '1px solid #27334D', color: '#F8FAFC' },
          }}
        />
      </div>
    </TooltipProvider>
  )
}
