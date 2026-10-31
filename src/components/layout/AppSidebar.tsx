import { NavLink, useNavigate } from 'react-router'
import {
  LayoutDashboard, Package, BarChart3, Sparkles, Bot, Factory, Handshake, Activity,
  Wallet, ShieldCheck, Settings, Upload, ChevronsLeft, ChevronsRight, LogOut,
  ShoppingBag, Flame,
} from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { cx } from '@/lib/format'
import { StatusBadge } from '@/components/common'
import BrandMark from '@/components/BrandMark'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const NAV_SECTIONS: { label: string; items: { to: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard },
      { to: '/inventory', label: 'Inventory', icon: Package },
      { to: '/analytics', label: 'Sales Analytics', icon: BarChart3 },
      { to: '/insights', label: 'AI Insights', icon: Sparkles },
    ],
  },
  {
    label: 'Commerce & Selling',
    items: [
      { to: '/selling', label: 'Selling / Marketplaces', icon: ShoppingBag },
      { to: '/festivals', label: 'Festival Intelligence', icon: Flame },
    ],
  },
  {
    label: 'Agent Economy',
    items: [
      { to: '/agents', label: 'Agent Marketplace', icon: Bot },
      { to: '/suppliers', label: 'Supplier Marketplace', icon: Factory },
      { to: '/negotiations', label: 'Negotiations', icon: Handshake },
      { to: '/activity', label: 'Agent Activity', icon: Activity },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/wallet', label: 'Wallet & Transactions', icon: Wallet },
      { to: '/escrow', label: 'Escrow', icon: ShieldCheck },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/import', label: 'Import Data', icon: Upload },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export function SidebarContent({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { auth, demoLoaded, agentStatus, logout } = useApp()
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={cx('flex h-[68px] items-center gap-2.5 border-b border-sidebar-border px-4', collapsed && 'justify-center px-2')}>
        <BrandMark className="h-9 w-9" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-heading truncate text-[15px] font-bold tracking-tight text-foreground">EcomMind</p>
            <p className="truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Autonomous Economy</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Primary">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[10px] font-bold tracking-[0.14em] text-muted-foreground/75 uppercase">{section.label}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const link = (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cx(
                        'group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-all duration-150',
                        collapsed && 'justify-center px-0',
                        isActive
                          ? 'nav-active'
                          : 'text-sidebar-foreground hover:bg-brand/8 hover:text-brand-soft',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.to === '/import' && !demoLoaded && (
                      <span className="nav-badge ml-auto rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] font-semibold text-brand-soft">DEMO</span>
                    )}
                  </NavLink>
                )
                if (collapsed) {
                  return (
                    <li key={item.to}>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    </li>
                  )
                }
                return <li key={item.to}>{link}</li>
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Seller profile */}
      <div className="border-t border-sidebar-border p-2.5">
        {!collapsed ? (
          <div className="rounded-2xl border border-border bg-secondary/70 p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-soft to-brand text-xs font-bold text-white">
                {(auth.sellerName || 'S').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">{auth.sellerName || 'Seller'}</p>
                <p className="truncate text-[11px] text-muted-foreground">{auth.storeName || 'Store not configured'}</p>
              </div>
              <StatusBadge
                label={agentStatus === 'active' ? 'Live' : agentStatus === 'paused' ? 'Paused' : 'Idle'}
                tone={agentStatus === 'active' ? 'success' : agentStatus === 'paused' ? 'danger' : 'warning'}
                pulse={agentStatus === 'active'}
              />
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{auth.plan}</span>
              <button
                onClick={async () => { await logout(); navigate('/login') }}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                aria-label="Log out"
              >
                <LogOut className="h-3 w-3" aria-hidden /> Log out
              </button>
            </div>
          </div>
        ) : (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={async () => { await logout(); navigate('/login') }}
                className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-soft to-brand text-xs font-bold text-white"
                aria-label={`${auth.sellerName} — log out`}
              >
                {(auth.sellerName || 'S').slice(0, 1).toUpperCase()}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{auth.sellerName} — click to log out</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cx(
        'glass fixed inset-y-3 left-3 z-30 hidden flex-col rounded-[22px] border transition-all duration-200 lg:flex',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      <SidebarContent collapsed={collapsed} />
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
      </button>
    </aside>
  )
}
