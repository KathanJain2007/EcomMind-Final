import { formatPaise, formatTime } from '@/lib/format'
import type { ApiEvent } from '@/lib/api'
import { cx } from '@/lib/format'

const TONE_DOT: Record<ApiEvent['status'], string> = {
  success: 'bg-success',
  info: 'bg-brand',
  warning: 'bg-warning',
  pending: 'bg-warning',
}

export function ActivityTimeline({ events, compact }: { events: ApiEvent[]; compact?: boolean }) {
  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No agent activity yet.</p>
  }
  return (
    <ol className="relative space-y-0">
      {events.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < events.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-border" aria-hidden />}
          <span className={cx('relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', TONE_DOT[e.status])} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-[13px] font-medium text-foreground">{e.action}</p>
              <time className="shrink-0 text-[11px] tabular text-muted-foreground">{formatTime(e.time)}</time>
            </div>
            {!compact && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {e.agent}{e.product ? ` · ${e.product}` : ''}{typeof e.amount === 'number' ? ` · ${formatPaise(e.amount, { decimals: e.amount % 100 ? 2 : 0 })}` : ''}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
