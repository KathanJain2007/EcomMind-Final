import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { formatDateTime, formatINR } from '@/lib/format'
import { EmptyState, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ActivityEvent } from '@/data/demo'

const STATUS_TONE: Record<ActivityEvent['status'], 'success' | 'info' | 'warning'> = {
  success: 'success', info: 'info', warning: 'warning', pending: 'warning',
}

export default function Activity() {
  const { demoLoaded, loadDemoBusiness, activity, agentStatus } = useApp()
  const [search, setSearch] = useState('')
  const [agent, setAgent] = useState('All')
  const [status, setStatus] = useState('All')
  const [date, setDate] = useState('All')
  const [selected, setSelected] = useState<ActivityEvent | null>(null)

  const agents = useMemo(() => ['All', ...new Set(activity.map((a) => a.agent))], [activity])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activity.filter((e) => {
      if (q && ![e.action, e.agent, e.product ?? '', e.detail ?? ''].join(' ').toLowerCase().includes(q)) return false
      if (agent !== 'All' && e.agent !== agent) return false
      if (status !== 'All' && e.status !== status) return false
      if (date !== 'All') {
        const t = new Date(e.time).toDateString()
        const today = new Date().toDateString()
        if (date === 'Today' && t !== today) return false
        if (date === 'Yesterday') {
          const y = new Date(); y.setDate(y.getDate() - 1)
          if (t !== y.toDateString()) return false
        }
      }
      return true
    }).sort((a, b) => b.time.localeCompare(a.time))
  }, [activity, search, agent, status, date])

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Agent Activity" subtitle="Every action EcomMind and its agents take on your behalf." />
        <EmptyState title="No activity yet" body="Load the demo business to see a full day of agent activity — forecasts, negotiations, escrow and payments." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="Agent Activity"
        subtitle="Every action EcomMind and its agents take on your behalf."
        actions={<StatusBadge label={agentStatus === 'active' ? 'EcomMind active' : 'EcomMind paused'} tone={agentStatus === 'active' ? 'success' : 'danger'} pulse={agentStatus === 'active'} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actions, products…" aria-label="Search activity" className="pl-9" />
          {search && <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')} aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger className="w-52" aria-label="Filter by agent"><SelectValue /></SelectTrigger>
          <SelectContent>{agents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>{['All', 'success', 'info', 'warning', 'pending'].map((s) => <SelectItem key={s} value={s}>{s === 'All' ? 'All statuses' : s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={date} onValueChange={setDate}>
          <SelectTrigger className="w-36" aria-label="Filter by date"><SelectValue /></SelectTrigger>
          <SelectContent>{['All', 'Today', 'Yesterday'].map((d) => <SelectItem key={d} value={d}>{d === 'All' ? 'All dates' : d}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} events</span>
      </div>

      <div className="card-surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {['Time', 'Agent', 'Action', 'Product', 'Amount', 'Status'].map((h) => (
                <TableHead key={h} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} className="cursor-pointer border-border hover:bg-secondary/50" onClick={() => setSelected(e)}>
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">{formatDateTime(e.time)}</TableCell>
                <TableCell className="font-medium whitespace-nowrap">{e.agent}</TableCell>
                <TableCell className="max-w-64"><span className="line-clamp-1">{e.action}</span></TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">{e.product ?? '—'}</TableCell>
                <TableCell className="tabular">{typeof e.amount === 'number' ? formatINR(e.amount) : '—'}</TableCell>
                <TableCell><StatusBadge label={e.status} tone={STATUS_TONE[e.status]} pulse={e.status === 'pending'} /></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No events match these filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="border-border bg-popover sm:max-w-md">
          {selected && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="text-base">Event details</SheetTitle>
              </SheetHeader>
              <dl className="space-y-3 text-sm">
                {[
                  { l: 'Event ID', v: selected.id, mono: true },
                  { l: 'Timestamp', v: formatDateTime(selected.time) },
                  { l: 'Agent', v: selected.agent },
                  { l: 'Action', v: selected.action },
                  { l: 'Product', v: selected.product ?? '—' },
                  { l: 'Amount', v: typeof selected.amount === 'number' ? formatINR(selected.amount) : '—' },
                ].map((r) => (
                  <div key={r.l} className="flex items-start justify-between gap-3 border-b border-border pb-2.5">
                    <dt className="text-muted-foreground">{r.l}</dt>
                    <dd className={r.mono ? 'font-mono text-xs' : 'text-right font-medium'}>{r.v}</dd>
                  </div>
                ))}
                <div>
                  <dt className="mb-1 text-muted-foreground">Detail</dt>
                  <dd className="rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed">{selected.detail ?? 'No additional detail recorded.'}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd><StatusBadge label={selected.status} tone={STATUS_TONE[selected.status]} /></dd>
                </div>
              </dl>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
