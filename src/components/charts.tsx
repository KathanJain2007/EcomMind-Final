import { cx } from '@/lib/format'
import { RANGES } from '@/lib/chartTheme'

export function RangeTabs<T extends number>({ value, onChange, ranges = RANGES as unknown as T[] }: { value: T; onChange: (v: T) => void; ranges?: T[] }) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-secondary/60 p-0.5" role="tablist" aria-label="Date range">
      {ranges.map((r) => (
        <button key={r} role="tab" aria-selected={value === r} onClick={() => onChange(r)}
          className={cx('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', value === r ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground')}>
          {r}d
        </button>
      ))}
    </div>
  )
}
