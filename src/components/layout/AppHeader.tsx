import { useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  Bell, Calendar, ChevronDown, Menu, Play, Search, Store, User, Settings2, LogOut, Sparkles,
} from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { cx, timeAgo, todayLabel } from '@/lib/format'
import { PRODUCTS, SERVICE_AGENTS } from '@/data/demo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarContent } from './AppSidebar'

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Overview', '/inventory': 'Inventory', '/analytics': 'Sales Analytics', '/insights': 'AI Insights',
  '/agents': 'Agent Marketplace', '/suppliers': 'Supplier Marketplace', '/negotiations': 'Negotiations',
  '/activity': 'Agent Activity', '/wallet': 'Wallet & Transactions', '/escrow': 'Escrow',
  '/reports': 'Reports', '/settings': 'Settings', '/import': 'Import Data',
}

const SEARCH_PAGES = [
  { label: 'Overview', route: '/' }, { label: 'Inventory', route: '/inventory' },
  { label: 'Sales Analytics', route: '/analytics' }, { label: 'AI Insights', route: '/insights' },
  { label: 'Agent Marketplace', route: '/agents' }, { label: 'Supplier Marketplace', route: '/suppliers' },
  { label: 'Negotiations', route: '/negotiations' }, { label: 'Agent Activity', route: '/activity' },
  { label: 'Wallet & Transactions', route: '/wallet' }, { label: 'Escrow', route: '/escrow' },
  { label: 'Reports', route: '/reports' }, { label: 'Settings', route: '/settings' },
  { label: 'Import Data', route: '/import' },
]

export function AppHeader() {
  const { agentStatus, demoLoaded, loadDemoBusiness, notifications, markNotificationsRead, auth, logout } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [store, setStore] = useState('UrbanNest Living')
  const searchRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const crumbs = ROUTE_TITLES[location.pathname] ?? 'Overview'
  const unread = notifications.filter((n) => !n.read).length

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const pages = SEARCH_PAGES.filter((p) => p.label.toLowerCase().includes(q)).map((p) => ({ kind: 'Page', label: p.label, route: p.route }))
    const products = PRODUCTS.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).map((p) => ({ kind: 'Product', label: `${p.name} · ${p.sku}`, route: `/inventory?q=${encodeURIComponent(p.name)}` }))
    const agents = SERVICE_AGENTS.filter((a) => a.name.toLowerCase().includes(q)).map((a) => ({ kind: 'Agent', label: a.name, route: '/agents' }))
    return [...pages, ...products, ...agents].slice(0, 8)
  }, [query])

  const go = (route: string) => {
    setSearchOpen(false)
    setQuery('')
    navigate(route)
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md md:gap-3 md:px-6">
      {/* Mobile menu */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex">
        <span className="font-medium text-foreground">EcomMind</span>
        <span aria-hidden>/</span>
        <span>{crumbs}</span>
      </nav>

      {/* Search */}
      <div ref={searchRef} className="relative mx-auto w-full max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchOpen(true) }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0].route); if (e.key === 'Escape') setSearchOpen(false) }}
          placeholder="Search products, agents, pages…"
          aria-label="Global search"
          className="h-9 w-full rounded-lg border border-border bg-card/70 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
        {searchOpen && results.length > 0 && (
          <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
            {results.map((r) => (
              <button
                key={r.kind + r.label}
                onMouseDown={() => go(r.route)}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
              >
                <span className="rounded-md bg-brand/12 px-1.5 py-0.5 text-[10px] font-semibold text-brand-soft">{r.kind}</span>
                <span className="truncate">{r.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AI status */}
      <div
        className={cx(
          'hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium xl:flex',
          agentStatus === 'active' ? 'border-success/30 bg-success/10 text-success' : agentStatus === 'paused' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-warning/30 bg-warning/10 text-warning',
        )}
        title={`EcomMind agent ecommind-01 is ${agentStatus}`}
      >
        <span className="relative flex h-2 w-2">
          {agentStatus === 'active' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />}
          <span className={cx('relative inline-flex h-2 w-2 rounded-full', agentStatus === 'active' ? 'bg-success' : agentStatus === 'paused' ? 'bg-danger' : 'bg-warning')} />
        </span>
        ecommind-01 {agentStatus === 'active' ? 'online' : agentStatus}
      </div>

      {/* Load demo */}
      <Button
        size="sm"
        onClick={() => loadDemoBusiness()}
        className={cx('hidden sm:inline-flex', demoLoaded ? 'border border-brand/40 bg-brand/10 text-brand-soft hover:bg-brand/20' : 'btn-glow border-0 text-white')}
      >
        {demoLoaded ? <Sparkles className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
        {demoLoaded ? 'Reload Demo' : 'Load Demo Business'}
      </Button>

      {/* Date */}
      <div className="hidden items-center gap-1.5 text-xs text-muted-foreground 2xl:flex">
        <Calendar className="h-3.5 w-3.5" aria-hidden />
        {todayLabel()}
      </div>

      {/* Store selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="hidden items-center gap-1.5 rounded-lg border border-border bg-card/70 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-secondary md:flex" aria-label="Select store">
            <Store className="h-3.5 w-3.5 text-brand-soft" aria-hidden />
            <span className="max-w-[110px] truncate">{store}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Sales channels</DropdownMenuLabel>
          {['UrbanNest Living', 'UrbanNest Outlet'].map((s) => (
            <DropdownMenuItem key={s} onSelect={() => setStore(s)} className="gap-2">
              <span className={cx('h-1.5 w-1.5 rounded-full', s === store ? 'bg-success' : 'bg-muted-foreground/40')} />
              {s}
              {s === store && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate('/settings')}>Manage stores…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Notifications */}
      <DropdownMenu onOpenChange={(open) => { if (!open) markNotificationsRead() }}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Bell className="h-4.5 w-4.5" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">{unread}</span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex items-center justify-between">
            Notifications
            {unread > 0 && <span className="text-[10px] font-normal text-muted-foreground">{unread} new</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notifications.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">No notifications yet. Load the demo business to see agent alerts.</div>
          )}
          {notifications.slice(0, 6).map((n) => (
            <DropdownMenuItem key={n.id} onSelect={() => navigate(n.route)} className="flex cursor-pointer flex-col items-start gap-0.5 py-2.5">
              <div className="flex w-full items-center gap-2">
                <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', n.tone === 'warning' ? 'bg-warning' : n.tone === 'success' ? 'bg-success' : 'bg-brand')} />
                <span className="flex-1 truncate text-[13px] font-medium">{n.title}</span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(n.time)}</span>
              </div>
              <span className="pl-3.5 text-xs text-muted-foreground line-clamp-2">{n.body}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Profile */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-soft to-brand text-xs font-bold text-white" aria-label="Profile menu">
            {(auth.sellerName || 'S').slice(0, 1).toUpperCase()}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <p className="text-sm font-medium">{auth.sellerName || 'Seller'}</p>
            <p className="text-xs font-normal text-muted-foreground">{auth.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate('/settings')}><User className="mr-2 h-4 w-4" /> Profile & mandate</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate('/settings')}><Settings2 className="mr-2 h-4 w-4" /> Settings</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { logout(); navigate('/login') }} className="text-danger focus:text-danger">
            <LogOut className="mr-2 h-4 w-4" /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
