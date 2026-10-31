import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  Activity as ActivityIcon, CheckCircle2, FileText, KeyRound, OctagonAlert,
  Search, ShieldAlert, ShieldCheck, Sliders, X, XCircle,
} from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { cx, formatDateTime, formatINR } from '@/lib/format'
import { EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReportsManager } from '@/components/ReportsManager'
import type { ActivityEvent } from '@/data/demo'
import type { AutonomyLevel } from '@/data/models'

const STATUS_TONE: Record<ActivityEvent['status'], 'success' | 'info' | 'warning'> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  pending: 'warning',
}

export default function Activity() {
  const {
    demoLoaded, loadDemoBusiness, activity, agentStatus,
    approvalQueue, approveQueuedAction, rejectQueuedAction,
    autonomyLevel, setAutonomyLevel, signedMandate, emergencyKillSwitch,
  } = useApp()

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'activity'

  const handleTabChange = (t: string) => {
    setSearchParams(t === 'activity' ? {} : { tab: t }, { replace: true })
  }

  // Activity Log filters
  const [search, setSearch] = useState('')
  const [agent, setAgent] = useState('All')
  const [status, setStatus] = useState('All')
  const [date, setDate] = useState('All')
  const [selected, setSelected] = useState<ActivityEvent | null>(null)

  const agents = useMemo(() => ['All', ...new Set(activity.map((a) => a.agent))], [activity])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activity
      .filter((e) => {
        if (q && ![e.action, e.agent, e.product ?? '', e.detail ?? ''].join(' ').toLowerCase().includes(q)) return false
        if (agent !== 'All' && e.agent !== agent) return false
        if (status !== 'All' && e.status !== status) return false
        if (date !== 'All') {
          const t = new Date(e.time).toDateString()
          const today = new Date().toDateString()
          if (date === 'Today' && t !== today) return false
          if (date === 'Yesterday') {
            const y = new Date()
            y.setDate(y.getDate() - 1)
            if (t !== y.toDateString()) return false
          }
        }
        return true
      })
      .sort((a, b) => b.time.localeCompare(a.time))
  }, [activity, search, agent, status, date])

  const pendingApprovals = useMemo(
    () => approvalQueue.filter((q) => q.status === 'pending'),
    [approvalQueue]
  )

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Agent Activity & Transparency" subtitle="Every action EcomMind and its agents take on your behalf." />
        <EmptyState
          title="No activity yet"
          body="Load the demo business to see live agent activities, approval requests, and integrated reports."
          action={
            <Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>
              Load Demo Business
            </Button>
          }
        />
      </>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Activity & Autonomous Control"
        subtitle="Transparent audit timeline, integrated reports, approval queue, and signed agent mandates."
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge
              label={agentStatus === 'active' ? 'EcomMind active' : 'EcomMind paused'}
              tone={agentStatus === 'active' ? 'success' : 'danger'}
              pulse={agentStatus === 'active'}
            />
            {agentStatus === 'active' && (
              <Button
                variant="outline"
                size="sm"
                onClick={emergencyKillSwitch}
                className="gap-1.5 border-danger/40 text-xs text-danger hover:bg-danger/10 hover:text-danger"
              >
                <OctagonAlert className="h-3.5 w-3.5" /> Emergency Kill-Switch
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="h-10 bg-secondary/60 p-1">
          <TabsTrigger value="activity" className="gap-2 text-xs">
            <ActivityIcon className="h-3.5 w-3.5" />
            <span>Activity Log</span>
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
              {activity.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="reports" className="gap-2 text-xs">
            <FileText className="h-3.5 w-3.5 text-brand-soft" />
            <span>Reports</span>
            <span className="rounded-full bg-brand/20 px-1.5 py-0.2 text-[9px] font-semibold text-brand-soft">
              6 Types
            </span>
          </TabsTrigger>

          <TabsTrigger value="approvals" className="gap-2 text-xs">
            <ShieldAlert className="h-3.5 w-3.5 text-warning" />
            <span>Approval Queue</span>
            {pendingApprovals.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[9px] font-bold text-black">
                {pendingApprovals.length}
              </span>
            )}
          </TabsTrigger>

          <TabsTrigger value="mandates" className="gap-2 text-xs">
            <KeyRound className="h-3.5 w-3.5" />
            <span>AI Mandates & Safeguards</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Activity Log */}
        <TabsContent value="activity" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1 md:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actions, products…"
                aria-label="Search activity"
                className="pl-9"
              />
              {search && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger className="w-52" aria-label="Filter by agent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['All', 'success', 'info', 'warning', 'pending'].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === 'All' ? 'All statuses' : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={date} onValueChange={setDate}>
              <SelectTrigger className="w-36" aria-label="Filter by date">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['All', 'Today', 'Yesterday'].map((d) => (
                  <SelectItem key={d} value={d}>
                    {d === 'All' ? 'All dates' : d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{filtered.length} events recorded</span>
          </div>

          <div className="card-surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {['Time', 'Agent', 'Action', 'Product', 'Amount', 'Status'].map((h) => (
                    <TableHead
                      key={h}
                      className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer border-border hover:bg-secondary/50"
                    onClick={() => setSelected(e)}
                  >
                    <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                      {formatDateTime(e.time)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{e.agent}</TableCell>
                    <TableCell className="max-w-64">
                      <span className="line-clamp-1">{e.action}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{e.product ?? '—'}</TableCell>
                    <TableCell className="tabular">
                      {typeof e.amount === 'number' ? formatINR(e.amount) : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={e.status} tone={STATUS_TONE[e.status]} pulse={e.status === 'pending'} />
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                      No events match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 2: Reports (Feature 1 implementation) */}
        <TabsContent value="reports" className="space-y-4">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-foreground">Advanced Reports Engine</h3>
            <p className="text-xs text-muted-foreground">
              Generate, preview, filter, and export live reports across Sales, Inventory, Activities, Financials, Suppliers, and Pricing.
            </p>
          </div>
          <ReportsManager />
        </TabsContent>

        {/* TAB 3: Approval Queue (Feature 7 & 8) */}
        <TabsContent value="approvals" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Autonomous Operations Approval Queue</h3>
              <p className="text-xs text-muted-foreground">
                High-value purchases, margin exceptions, and promotional discounts requiring human sign-off.
              </p>
            </div>
            <span className="text-xs text-muted-foreground font-medium">
              Policy: Level {autonomyLevel} Autonomy Enforced
            </span>
          </div>

          <div className="space-y-3">
            {approvalQueue.map((item) => {
              const isPending = item.status === 'pending'
              return (
                <Card
                  key={item.id}
                  className={cx(
                    'card-surface transition-all',
                    isPending && 'border-warning/40 bg-warning/5'
                  )}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={isPending ? 'default' : 'outline'}
                            className={cx(
                              'text-[10px] uppercase font-mono',
                              isPending ? 'bg-warning text-black' : item.status === 'approved' ? 'text-success' : 'text-danger'
                            )}
                          >
                            {item.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{item.agentName}</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                        </div>
                        <h4 className="text-base font-semibold text-foreground">{item.title}</h4>
                        <p className="text-xs text-muted-foreground max-w-2xl">{item.description}</p>
                      </div>

                      <div className="text-right">
                        <p className="text-[11px] text-muted-foreground">Financial Impact</p>
                        <p className={cx('tabular text-base font-bold', item.financialImpact >= 0 ? 'text-success' : 'text-foreground')}>
                          {formatINR(item.financialImpact)}
                        </p>
                      </div>
                    </div>

                    {/* Technical details pill */}
                    {item.details && (
                      <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-border bg-card/60 p-2.5 text-[11px]">
                        {Object.entries(item.details).map(([k, v]) => {
                          if (typeof v === 'object') return null
                          return (
                            <span key={k} className="rounded-md bg-secondary/70 px-2 py-0.5 text-muted-foreground">
                              <strong>{k}:</strong> {String(v)}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* Action buttons */}
                    {isPending && (
                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rejectQueuedAction(item.id, 'Declined by seller from Approval Queue')}
                          className="h-8 gap-1.5 border-danger/30 text-xs text-danger hover:bg-danger/10"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Reject Action
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => approveQueuedAction(item.id)}
                          className="h-8 btn-glow gap-1.5 border-0 text-xs text-white"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Authorize & Execute
                        </Button>
                      </div>
                    )}

                    {!isPending && (
                      <p className="mt-3 text-[11px] text-muted-foreground italic">
                        {item.status === 'approved' ? '✓ Authorized by seller' : '✕ Declined by seller'}{' '}
                        {item.reviewedAt ? `on ${formatDateTime(item.reviewedAt)}` : ''}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}

            {approvalQueue.length === 0 && (
              <div className="card-surface p-12 text-center text-xs text-muted-foreground">
                Approval queue is empty. High-risk operations will automatically appear here.
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 4: AI Mandates & Safeguards (Feature 7) */}
        <TabsContent value="mandates" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Autonomy Level Control */}
            <div className="space-y-4 lg:col-span-2">
              <Card className="card-surface">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-brand-soft" />
                      <h4 className="text-sm font-semibold text-foreground">Autonomy Execution Modes</h4>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      Active: Level {autonomyLevel}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      {
                        level: 1 as AutonomyLevel,
                        title: 'Level 1 – Advisory',
                        desc: 'AI observes, runs forecasts, and recommends actions. Requires explicit seller initiation for all changes.',
                      },
                      {
                        level: 2 as AutonomyLevel,
                        title: 'Level 2 – Approval-Based',
                        desc: 'AI negotiates and drafts restocks and price adjustments, routing them to the Approval Queue before execution.',
                      },
                      {
                        level: 3 as AutonomyLevel,
                        title: 'Level 3 – Restricted Auto',
                        desc: 'AI autonomously executes purchases, repricing and discounts strictly within signed mandate bounds.',
                      },
                    ].map((m) => {
                      const isSel = autonomyLevel === m.level
                      return (
                        <button
                          key={m.level}
                          type="button"
                          onClick={() => setAutonomyLevel(m.level)}
                          className={cx(
                            'flex flex-col rounded-xl border p-4 text-left transition-all',
                            isSel
                              ? 'border-brand bg-brand/10 shadow-sm ring-1 ring-brand/50'
                              : 'border-border bg-card/60 hover:border-brand/40 hover:bg-secondary/30'
                          )}
                        >
                          <span className={cx('text-xs font-bold', isSel ? 'text-brand-soft' : 'text-foreground')}>
                            {m.title}
                          </span>
                          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{m.desc}</p>
                          {isSel && (
                            <span className="mt-auto pt-2 text-[10px] font-semibold text-brand-soft">
                              ✓ Currently Active
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Cryptographic Signed Mandate Details */}
              <Card className="card-surface">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-success" />
                      <h4 className="text-sm font-semibold text-foreground">Ed25519 Cryptographic Mandate Token</h4>
                    </div>
                    <Badge variant={signedMandate.revoked ? 'destructive' : 'default'} className="text-[10px]">
                      {signedMandate.revoked ? 'REVOKED' : 'CRYPTOGRAPHICALLY VERIFIED'}
                    </Badge>
                  </div>

                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
                      <dt className="text-muted-foreground font-mono text-[10px] uppercase">Mandate ID</dt>
                      <dd className="font-mono font-medium text-foreground mt-0.5">{signedMandate.mandateId}</dd>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
                      <dt className="text-muted-foreground font-mono text-[10px] uppercase">Agent Principal</dt>
                      <dd className="font-mono font-medium text-foreground mt-0.5">{signedMandate.agentId}</dd>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
                      <dt className="text-muted-foreground font-mono text-[10px] uppercase">Authorized Max Transaction</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {formatINR(signedMandate.spendingLimits.maxPerTransaction)}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
                      <dt className="text-muted-foreground font-mono text-[10px] uppercase">Daily Budget Ceiling</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {formatINR(signedMandate.spendingLimits.maxDailyBudget)}
                      </dd>
                    </div>
                    <div className="sm:col-span-2 rounded-lg border border-border bg-secondary/30 p-2.5">
                      <dt className="text-muted-foreground font-mono text-[10px] uppercase">Public Key & Signature Proof</dt>
                      <dd className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">
                        PK: {signedMandate.publicKey}
                      </dd>
                      <dd className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">
                        SIG: {signedMandate.signature}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>

            {/* Emergency Kill-Switch & Safeguards summary */}
            <div className="space-y-4">
              <Card className="card-surface border-danger/30">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-danger">
                    <OctagonAlert className="h-4 w-4" /> Fail-Closed Protection
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Triggering the emergency kill-switch immediately invalidates active Ed25519 mandate signatures, cancels unconfirmed agent RFQs, and locks all autonomous spending.
                  </p>
                  <Button
                    variant="destructive"
                    className="w-full text-xs font-semibold"
                    onClick={emergencyKillSwitch}
                  >
                    Trigger Emergency AI Pause
                  </Button>
                </CardContent>
              </Card>

              <Card className="card-surface">
                <CardContent className="space-y-3 p-5">
                  <h4 className="text-sm font-semibold text-foreground">Backend Enforced Limits</h4>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-center justify-between">
                      <span>Min Gross Profit Floor</span>
                      <strong className="text-foreground">15.0%</strong>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Max Autonomous Discount</span>
                      <strong className="text-foreground">20.0%</strong>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Max Price Band Movement</span>
                      <strong className="text-foreground">±10.0%</strong>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Max Micro-Payment Per Call</span>
                      <strong className="text-foreground">₹10.00</strong>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Details Sheet for Activity Log */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="border-border bg-popover sm:max-w-md">
          {selected && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="text-base">Event Details</SheetTitle>
              </SheetHeader>
              <dl className="space-y-3 text-sm">
                {[
                  { l: 'Event ID', v: selected.id, mono: true },
                  { l: 'Timestamp', v: formatDateTime(selected.time) },
                  { l: 'Agent', v: selected.agent },
                  { l: 'Action', v: selected.action },
                  { l: 'Product / Context', v: selected.product ?? '—' },
                  { l: 'Amount', v: typeof selected.amount === 'number' ? formatINR(selected.amount) : '—' },
                ].map((r) => (
                  <div key={r.l} className="flex items-start justify-between gap-3 border-b border-border pb-2.5">
                    <dt className="text-muted-foreground">{r.l}</dt>
                    <dd className={r.mono ? 'font-mono text-xs' : 'text-right font-medium'}>{r.v}</dd>
                  </div>
                ))}
                <div>
                  <dt className="mb-1 text-muted-foreground">Execution Detail</dt>
                  <dd className="rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed">
                    {selected.detail ?? 'No additional detail recorded.'}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusBadge label={selected.status} tone={STATUS_TONE[selected.status]} />
                  </dd>
                </div>
              </dl>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
