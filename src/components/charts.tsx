import { cx } from '@/lib/format'
import { RANGES } from '@/lib/chartTheme'

export function RangeTabs<T extends number>({ value, onChange, ranges = RANGES as unknown as T[] }: { value: T; onChange: (v: T) => void; ranges?: T[] }) {
  return (
    <div className="flex gap-1 rounded-xl border border-border bg-card p-1 shadow-xs" role="tablist" aria-label="Date range">
      {ranges.map((r) => (
        <button key={r} role="tab" aria-selected={value === r} onClick={() => onChange(r)}
          className={cx('rounded-lg px-3 py-1 text-xs font-semibold transition-colors', value === r ? 'btn-glow' : 'text-muted-foreground hover:text-foreground')}>
          {r}d
        </button>
      ))}
    </div>
  )
}
