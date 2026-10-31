import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  TrendingUp, BarChart3, ShieldAlert, Truck, Headphones, Smartphone, Lamp, ChevronRight,
  type LucideIcon, Droplets, Dumbbell, Inbox,
} from 'lucide-react'
import { cx, formatINR } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/* Icon mapper for product / agent icon keys */
const ICONS: Record<string, LucideIcon> = {
  'trending-up': TrendingUp,
  chart: BarChart3,
  'shield-alert': ShieldAlert,
  truck: Truck,
  headphones: Headphones,
  smartphone: Smartphone,
  lamp: Lamp,
  bottle: Droplets,
  stretch: Dumbbell,
}

export function DynIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Inbox
  return <Icon className={className} aria-hidden />
}

export function ProductIcon({ icon, className }: { icon: string; className?: string }) {
  return (
    <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-brand-soft', className)}>
      <DynIcon name={icon} className="h-4.5 w-4.5" />
    </div>
  )
}

/* Page header with breadcrumb */
export function PageHeader({ title, subtitle, crumbs, actions }: { title: string; subtitle?: string; crumbs?: string[]; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground">EcomMind</Link>
          {(crumbs ?? [title]).map((c) => (
            <span key={c} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" aria-hidden />
              <span className="text-muted-foreground/90">{c}</span>
            </span>
          ))}
        </nav>
        <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* Metric card */
export function MetricCard({ label, value, delta, up, icon, hint, loading }: {
  label: string; value: string; delta?: string; up?: boolean; icon: ReactNode; hint?: string; loading?: boolean
}) {
  if (loading) {
    return (
      <Card className="card-surface">
        <CardContent className="p-5">
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="mb-2 h-7 w-32" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="card-surface card-hover">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/12 text-brand-soft">{icon}</div>
        </div>
        <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {delta && (
            <span className={cx('inline-flex items-center gap-0.5 font-medium', up ? 'text-success' : 'text-danger')}>
              <TrendingUp className={cx('h-3 w-3', !up && 'rotate-180')} aria-hidden />
              {delta}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

/* Status badge */
const BADGE_TONES: Record<string, string> = {
  success: 'bg-success/12 text-success border-success/25',
  warning: 'bg-warning/12 text-warning border-warning/25',
  danger: 'bg-danger/12 text-danger border-danger/25',
  info: 'bg-brand/12 text-brand-soft border-brand/25',
  neutral: 'bg-secondary text-muted-foreground border-border',
  violet: 'bg-brand/12 text-brand-soft border-brand/25',
}

export function StatusBadge({ label, tone = 'neutral', pulse }: { label: string; tone?: keyof typeof BADGE_TONES; pulse?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', BADGE_TONES[tone])}>
      {pulse && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" /></span>}
      {label}
    </span>
  )
}

export function stockTone(status: string): keyof typeof BADGE_TONES {
  switch (status) {
    case 'In Stock': return 'success'
    case 'Low Stock': return 'warning'
    case 'Critical': return 'danger'
    case 'Out of Stock': return 'danger'
    case 'Paused': return 'neutral'
    default: return 'neutral'
  }
}

/* Chart card wrapper */
export function ChartCard({ title, subtitle, action, children, className }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <Card className={cx('card-surface', className)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/* Empty state */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card-surface flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="panel-grid mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-secondary">
        <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* Budget progress bar */
export function BudgetProgress({ label, value, max, tone = 'brand' }: { label: string; value: number; max: number; tone?: 'brand' | 'success' | 'warning' }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const bar = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-gradient-to-r from-brand-soft to-brand'
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular font-medium text-foreground">{formatINR(value)} <span className="text-muted-foreground">/ {formatINR(max)}</span></span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cx('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/* INR delta text */
export function inr(n: number) {
  return formatINR(Math.abs(n))
}
