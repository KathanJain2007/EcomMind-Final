import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarClock, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError, type AgentRunOutcome, type ApiAgentRun, type ApiAgentRunsResponse } from '@/lib/api'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import { timeAgo } from '@/lib/format'
import { PanelError, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const OUTCOME: Record<AgentRunOutcome, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  purchased: { label: 'Deal agreed', tone: 'success' },
  applied: { label: 'Applied', tone: 'success' },
  rfq_sent: { label: 'RFQ sent', tone: 'info' },
  queued: { label: 'Needs approval', tone: 'warning' },
  recommended: { label: 'Suggested', tone: 'info' },
  waiting: { label: 'Waiting', tone: 'neutral' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  blocked: { label: 'Blocked', tone: 'danger' },
  error: { label: 'Error', tone: 'danger' },
}
// Most useful first: what changed, then what needs the seller, then the rest.
const ORDER: AgentRunOutcome[] = ['purchased', 'applied', 'rfq_sent', 'queued', 'recommended', 'blocked', 'error', 'waiting', 'skipped']
const MAX_ROWS = 5

function sortedActions(run: ApiAgentRun) {
  return [...run.actions].sort((a, b) => ORDER.indexOf(a.outcome) - ORDER.indexOf(b.outcome))
}

export function AgentRunsCard() {
  const navigate = useNavigate()
  const store = useDataStore()
  const q = useApiQuery<ApiAgentRunsResponse>('/api/agent/runs?limit=5', ['runs'])
  const [running, setRunning] = useState(false)

  const runNow = async () => {
    setRunning(true)
    try {
      const { run } = await api<{ run: ApiAgentRun }>('/api/agent/runs', { method: 'POST' })
      store.invalidate('runs', 'approvals', 'activity', 'negotiations', 'products', 'analytics', 'escrow', 'wallet')
      if (run.status === 'skipped') toast.info('Check skipped', { description: run.summary })
      else toast.success('Check complete', { description: run.summary })
    } catch (e) {
      toast.error('Couldn’t run the check', { description: e instanceof ApiError ? e.message : undefined })
    } finally {
      setRunning(false)
    }
  }

  const last = q.data?.runs[0]
  const schedule = q.data?.schedule
  const rows = last ? sortedActions(last) : []
  const needsApproval = rows.some((a) => a.outcome === 'queued' || a.outcome === 'waiting')

  return (
    <Card className="card-surface">
      <CardContent className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-soft">
              <CalendarClock className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold">Scheduled checks</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {schedule
                  ? schedule.enabled
                    ? `${schedule.label}, EcomMind checks stock and prices and acts within your mandate.`
                    : 'Daily checks aren’t switched on for this site yet. You can still run a check now.'
                  : 'EcomMind checks stock and prices and acts within your mandate.'}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            {running ? 'Checking…' : 'Run check now'}
          </Button>
        </div>

        <div className="mt-4">
          {q.error && !q.data ? (
            <PanelError message={q.error.message} onRetry={q.reload} />
          ) : q.loading && !q.data ? (
            <div className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-10" /></div>
          ) : !last ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No checks yet. Run one now to see what EcomMind would restock or reprice.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <StatusBadge label={last.trigger === 'schedule' ? 'Scheduled' : 'Run by you'} tone="neutral" />
                {last.status !== 'completed' && <StatusBadge label={last.status === 'skipped' ? 'Skipped' : 'Failed'} tone={last.status === 'skipped' ? 'warning' : 'danger'} />}
                <span className="text-muted-foreground" title={new Date(last.startedAt).toLocaleString()}>Last check {timeAgo(last.startedAt)}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium">{last.summary}</p>
              {rows.length > 0 && (
                <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                  {rows.slice(0, MAX_ROWS).map((a) => (
                    <li key={`${a.kind}-${a.sku}`} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                      <div className="w-28 shrink-0"><StatusBadge label={OUTCOME[a.outcome]?.label ?? a.outcome} tone={OUTCOME[a.outcome]?.tone ?? 'neutral'} /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{a.kind === 'restock' ? 'Restock' : 'Price'} · {a.productName}</p>
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">{a.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {needsApproval && (
                  <Button size="sm" className="btn-glow border-0 text-white" onClick={() => navigate('/activity?tab=approvals')}>Review approvals</Button>
                )}
                {rows.length > MAX_ROWS && (
                  <span className="self-center text-[11px] text-muted-foreground">+{rows.length - MAX_ROWS} more in Agent Activity</span>
                )}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
