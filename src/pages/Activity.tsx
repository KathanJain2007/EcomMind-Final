import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  Activity as ActivityIcon, ArrowDown, ArrowUp, BarChart3, ChevronLeft, ChevronRight, CircleCheck, CircleX, Download,
  FileText, Handshake, KeyRound, Loader2, OctagonAlert, Package, Search, ShieldCheck, Wallet, X, Zap,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { buildUrl, useApiQuery } from '@/store/DataStore'
import { downloadFile, type ApiAgentCall, type ApiEvent, type ApiServiceAgent, type ApiTxn, type Paged } from '@/lib/api'
import { cx, formatDateTime, formatPaise } from '@/lib/format'
import { ChartCard, ChartEmpty, ChartSkeleton, MetricCard, PageHeader, PanelError, StatusBadge } from '@/components/common'
import { ActivityTimeline } from '@/components/ActivityTimeline'
import { ApprovalsPanel, MandatesPanel } from '@/components/activity/AutonomyPanels'
import { ReportsManager } from '@/components/ReportsManager'
import { CountUp } from '@/components/CountUp'
import { tooltipStyle } from '@/lib/chartTheme'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/* Agent Activity is the single home for operational history: the former
   Reports page lives in the "Business reports" tab, and /reports redirects here. */

const TABS = [
  { id: 'overview', label: 'Activity overview', icon: ActivityIcon },
  { id: 'executions', label: 'Execution history', icon: Zap },
  { id: 'transactions', label: 'Transaction history', icon: Wallet },
  { id: 'log', label: 'Activity log', icon: FileText },
  { id: 'reports', label: 'Business reports', icon: BarChart3 },
  { id: 'approvals', label: 'Approval queue', icon: ShieldCheck },
  { id: 'mandates', label: 'AI mandates & safeguards', icon: KeyRound },
] as const
type TabId = (typeof TABS)[number]['id']

const RANGES = [
  { id: '1', label: 'Today' }, { id: '7', label: 'Last 7 days' }, { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' }, { id: 'all', label: 'All time' }, { id: 'custom', label: 'Custom range' },
]
const PAGE_SIZES = [10, 25, 50]
const money = (p: number) => formatPaise(p, { decimals: p % 100 ? 2 : 0 })

const CALL_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  success: { label: 'Success', tone: 'success' }, failed: { label: 'Failed', tone: 'danger' },
  rejected: { label: 'Rejected', tone: 'warning' }, timed_out: { label: 'Timed out', tone: 'danger' }, pending: { label: 'Pending', tone: 'info' },
}
const TXN_KINDS: Record<string, string> = { service_call: 'Agent payment', topup: 'Top-up', logistics: 'Logistics', escrow_lock: 'Escrow lock', escrow_release: 'Escrow release', refund: 'Refund' }

/* ------------------------------------------------------------------ */
/* shared filter state                                                  */
/* ------------------------------------------------------------------ */

/** Page number that resets to 1 whenever the filter signature changes. */
function usePageFor(signature: string): [number, (p: number) => void] {
  const [state, setState] = useState({ signature, page: 1 })
  const page = state.signature === signature ? state.page : 1
  return [page, (p: number) => setState({ signature, page: p })]
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

interface RangeState { range: string; from: string; to: string }
function rangeQuery(r: RangeState): Record<string, string | undefined> {
  if (r.range === 'custom') return { from: r.from || undefined, to: r.to || undefined }
  if (r.range === 'all') return {}
  return { days: r.range }
}

function RangePicker({ value, onChange }: { value: RangeState; onChange: (v: RangeState) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.range} onValueChange={(range) => onChange({ ...value, range })}>
        <SelectTrigger className="w-40" aria-label="Date range"><SelectValue /></SelectTrigger>
        <SelectContent>{RANGES.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
      </Select>
      {value.range === 'custom' && (
        <>
          <Input type="date" aria-label="From date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} className="w-40" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" aria-label="To date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} className="w-40" />
        </>
      )}
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-52 flex-1 md:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-9" />
      {value && <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => onChange('')} aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
    </div>
  )
}

function SortHead({ label, field, sort, order, onSort }: { label: string; field?: string; sort: string; order: 'asc' | 'desc'; onSort: (f: string) => void }) {
  const cls = 'whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
  if (!field) return <TableHead className={cls}>{label}</TableHead>
  const active = sort === field
  return (
    <TableHead className={cls} aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onSort(field)} className="inline-flex items-center gap-1 uppercase hover:text-foreground">
        {label}{active && (order === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
      </button>
    </TableHead>
  )
}

function Pager({ page, pageSize, total, onPage, onSize }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onSize: (s: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total ? (page - 1) * pageSize + 1 : 0
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
      <span>{from}–{Math.min(total, page * pageSize)} of {total.toLocaleString('en-IN')}</span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onSize(Number(v))}>
          <SelectTrigger className="h-8 w-24" aria-label="Rows per page"><SelectValue /></SelectTrigger>
          <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="tabular">Page {page} of {pages}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

function ExportButton({ path, query, name }: { path: string; query: Record<string, string | number | undefined>; name: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
      setBusy(true)
      try { await downloadFile(path, query, name); toast.success('Export downloaded', { description: 'Filtered records saved as CSV.' }) }
      catch (e) { toast.error('Export failed', { description: (e as Error).message }) }
      finally { setBusy(false) }
    }}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />} Export CSV
    </Button>
  )
}

function TableState({ cols, loading, error, empty, reload, emptyText }: { cols: number; loading: boolean; error?: { message: string }; empty: boolean; reload: () => void; emptyText: string }) {
  if (loading) return <TableRow className="hover:bg-transparent"><TableCell colSpan={cols} className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />Loading…</TableCell></TableRow>
  if (error) return <TableRow className="hover:bg-transparent"><TableCell colSpan={cols} className="py-6"><PanelError message={error.message} onRetry={reload} /></TableCell></TableRow>
  if (empty) return <TableRow className="hover:bg-transparent"><TableCell colSpan={cols} className="py-12 text-center text-sm text-muted-foreground">{emptyText}</TableCell></TableRow>
  return null
}

/* ------------------------------------------------------------------ */

export default function Activity() {
  const { agentStatus, approvalQueue, emergencyKillSwitch } = useApp()
  const pendingApprovals = approvalQueue.filter((q) => q.status === 'pending').length
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview') as TabId
  const setTab = (t: TabId) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })

  return (
    <div>
      <PageHeader
        title="Agent Activity"
        subtitle="Every action, agent call, payment and report in one place."
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge label={agentStatus === 'active' ? 'EcomMind active' : 'EcomMind paused'} tone={agentStatus === 'active' ? 'success' : 'danger'} pulse={agentStatus === 'active'} />
            {agentStatus === 'active' && (
              <Button variant="outline" size="sm" onClick={emergencyKillSwitch} className="gap-1.5 border-danger/40 text-xs text-danger hover:bg-danger/10 hover:text-danger">
                <OctagonAlert className="h-3.5 w-3.5" aria-hidden /> Emergency Kill-Switch
              </Button>
            )}
          </div>
        }
      />
      <div role="tablist" aria-label="Agent Activity sections" className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border bg-secondary/40 p-1">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} id={`tab-${t.id}`} onClick={() => setTab(t.id)}
            className={cx('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', tab === t.id ? 'bg-brand text-white' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
            <t.icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
            {t.id === 'approvals' && pendingApprovals > 0 && <span className="rounded-full bg-warning px-1.5 text-[10px] font-bold text-black">{pendingApprovals}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && <OverviewTab onOpen={setTab} />}
        {tab === 'executions' && <ExecutionsTab />}
        {tab === 'transactions' && <TransactionsTab />}
        {tab === 'log' && <LogTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'approvals' && <ApprovalsPanel />}
        {tab === 'mandates' && <MandatesPanel />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ overview */

interface Overview {
  totalCalls: number; successfulCalls: number; failedCalls: number; pendingCalls: number; totalSpend: number
  byAgent: { agent: string; calls: number; spend: number }[]; recent: ApiEvent[]
}

function OverviewTab({ onOpen }: { onOpen: (t: TabId) => void }) {
  const [range, setRange] = useState<RangeState>({ range: '30', from: '', to: '' })
  const q = useApiQuery<Overview>(buildUrl('/api/activity/overview', rangeQuery(range)), ['activity', 'wallet'])
  const o = q.data
  return (
    <div className="space-y-4">
      <RangePicker value={range} onChange={setRange} />
      {q.error && <PanelError message={q.error.message} onRetry={q.reload} />}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard loading={q.loading} label="Total agent calls" value={<CountUp value={o?.totalCalls ?? 0} />} icon={<Zap className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={q.loading} label="Successful calls" value={<CountUp value={o?.successfulCalls ?? 0} />} hint={o?.totalCalls ? `${Math.round((o.successfulCalls / o.totalCalls) * 100)}% success rate` : undefined} icon={<CircleCheck className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={q.loading} label="Failed or rejected" value={<CountUp value={o?.failedCalls ?? 0} />} hint="never charged" icon={<CircleX className="h-4 w-4" aria-hidden />} />
        <MetricCard loading={q.loading} label="Agent spending" value={<CountUp value={(o?.totalSpend ?? 0) / 100} format="inr" decimals={(o?.totalSpend ?? 0) % 100 ? 2 : 0} />} icon={<Wallet className="h-4 w-4" aria-hidden />} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <ChartCard title="Calls by agent" subtitle="Successful calls in the selected period" className="xl:col-span-3"
          action={<Button variant="ghost" size="sm" className="text-xs" onClick={() => onOpen('executions')}>Execution history</Button>}>
          <div className="h-60">
            {q.loading ? <ChartSkeleton /> : (o?.byAgent ?? []).length === 0 ? <ChartEmpty text="No agent calls in this period." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={o!.byAgent.map((a) => ({ ...a, short: a.agent.replace(' Agent', ''), spendRs: a.spend / 100 }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="short" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _n, item) => [`${v} calls · ${money(item.payload.spend)}`, item.payload.agent]} labelFormatter={() => ''} />
                  <Bar dataKey="calls" name="Calls" radius={[6, 6, 0, 0]} barSize={36} fill="#7965F2" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <Card className="card-surface xl:col-span-2">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent activity</h2>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => onOpen('log')}>Full log</Button>
            </div>
            <ActivityTimeline events={o?.recent ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ executions */

function ExecutionsTab() {
  const agentsQ = useApiQuery<{ agents: ApiServiceAgent[] }>('/api/service-agents', ['agents'])
  const [range, setRange] = useState<RangeState>({ range: 'all', from: '', to: '' })
  const [agent, setAgent] = useState('All')
  const [status, setStatus] = useState('All')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('time')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [size, setSize] = useState(25)
  const q = useDebounced(search)
  const filters = { ...rangeQuery(range), agent: agent === 'All' ? undefined : agent, status: status === 'All' ? undefined : status, q: q || undefined, sort, order }
  const [page, setPage] = usePageFor(JSON.stringify([filters, size]))
  const data = useApiQuery<Paged<ApiAgentCall>>(buildUrl('/api/activity/executions', { ...filters, page, pageSize: size }), ['activity'])
  const onSort = (f: string) => { if (sort === f) setOrder(order === 'asc' ? 'desc' : 'asc'); else { setSort(f); setOrder('desc') } }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search call ID, product, agent…" />
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger className="w-52" aria-label="Filter by agent"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="All">All agents</SelectItem>{(agentsQ.data?.agents ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed_any">Failed, rejected or timed out</SelectItem>
            <SelectItem value="rejected">Rejected by mandate</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <RangePicker value={range} onChange={setRange} />
        <div className="ml-auto"><ExportButton path="/api/activity/executions.csv" query={filters} name="ecommind_agent_executions.csv" /></div>
      </div>
      <div className="card-surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <SortHead label="Time" field="time" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Agent" field="agent" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Operation" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Product" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Cost" field="cost" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Status" field="status" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Call ID" sort={sort} order={order} onSort={onSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableState cols={7} loading={data.loading} error={data.error} empty={!!data.data && data.data.items.length === 0} reload={data.reload} emptyText="No agent calls match these filters." />
            {!data.loading && (data.data?.items ?? []).map((c) => (
              <TableRow key={c.id} className="border-border">
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">{c.createdAt ? formatDateTime(c.createdAt) : '—'}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">{c.agentName}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{c.operation.replaceAll('_', ' ')}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{c.productName ?? '—'}</TableCell>
                <TableCell className="tabular whitespace-nowrap">{money(c.cost)}{c.status !== 'success' && <span className="ml-1 text-[10px] text-muted-foreground">(not charged)</span>}</TableCell>
                <TableCell><StatusBadge label={CALL_STATUS[c.status]?.label ?? c.status} tone={CALL_STATUS[c.status]?.tone ?? 'neutral'} />{c.errorMessage && <p className="mt-0.5 max-w-56 truncate text-[10px] text-muted-foreground" title={c.errorMessage}>{c.errorMessage}</p>}</TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{c.id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.data && <Pager page={page} pageSize={size} total={data.data.total} onPage={setPage} onSize={setSize} />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ transactions */

function TransactionsTab() {
  const [range, setRange] = useState<RangeState>({ range: 'all', from: '', to: '' })
  const [kind, setKind] = useState('All')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('time')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [size, setSize] = useState(25)
  const q = useDebounced(search)
  const filters = { ...rangeQuery(range), kind: kind === 'All' ? undefined : kind, q: q || undefined, sort, order }
  const [page, setPage] = usePageFor(JSON.stringify([filters, size]))
  const data = useApiQuery<Paged<ApiTxn>>(buildUrl('/api/activity/transactions', { ...filters, page, pageSize: size }), ['wallet', 'activity'])
  const onSort = (f: string) => { if (sort === f) setOrder(order === 'asc' ? 'desc' : 'asc'); else { setSort(f); setOrder('desc') } }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search ID, counterparty, memo…" />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-48" aria-label="Filter by transaction type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All transaction types</SelectItem>
            <SelectItem value="service_call">Agent payments</SelectItem>
            <SelectItem value="topup">Top-ups (credits)</SelectItem>
            <SelectItem value="logistics">Logistics</SelectItem>
            <SelectItem value="escrow">Escrow-related</SelectItem>
            <SelectItem value="refund">Refunds</SelectItem>
          </SelectContent>
        </Select>
        <RangePicker value={range} onChange={setRange} />
        <div className="ml-auto"><ExportButton path="/api/activity/transactions.csv" query={filters} name="ecommind_transactions.csv" /></div>
      </div>
      <div className="card-surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <SortHead label="Time" field="time" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Transaction" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Counterparty" field="counterparty" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Type" field="kind" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Memo" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Amount" field="amount" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Status" sort={sort} order={order} onSort={onSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableState cols={7} loading={data.loading} error={data.error} empty={!!data.data && data.data.items.length === 0} reload={data.reload} emptyText="No transactions match these filters." />
            {!data.loading && (data.data?.items ?? []).map((t) => (
              <TableRow key={t.id} className="border-border">
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">{formatDateTime(t.time)}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{t.id}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">{t.counterparty}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{TXN_KINDS[t.kind] ?? t.kind}</TableCell>
                <TableCell className="max-w-56"><span className="line-clamp-1 text-muted-foreground">{t.memo}</span></TableCell>
                <TableCell className={cx('tabular whitespace-nowrap font-semibold', t.amount < 0 ? 'text-danger' : t.amount > 0 ? 'text-success' : 'text-foreground')} title={t.amount === 0 && t.grossAmount ? 'Paid from escrow; wallet balance unchanged' : undefined}>
                  {t.amount === 0 && t.grossAmount ? money(t.grossAmount) : `${t.amount < 0 ? '−' : '+'}${money(Math.abs(t.amount))}`}
                </TableCell>
                <TableCell><StatusBadge label={t.status} tone={t.status === 'Completed' ? 'success' : t.status === 'Locked' ? 'warning' : 'info'} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.data && <Pager page={page} pageSize={size} total={data.data.total} onPage={setPage} onSize={setSize} />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ activity log */

const EVENT_TONE: Record<ApiEvent['status'], 'success' | 'info' | 'warning'> = { success: 'success', info: 'info', warning: 'warning', pending: 'warning' }

function LogTab() {
  const [range, setRange] = useState<RangeState>({ range: 'all', from: '', to: '' })
  const [agent, setAgent] = useState('All')
  const [status, setStatus] = useState('All')
  const [search, setSearch] = useState('')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [size, setSize] = useState(25)
  const [selected, setSelected] = useState<ApiEvent | null>(null)
  const q = useDebounced(search)
  const filters = { ...rangeQuery(range), agent: agent === 'All' ? undefined : agent, status: status === 'All' ? undefined : status, q: q || undefined, order }
  const [page, setPage] = usePageFor(JSON.stringify([filters, size]))
  const data = useApiQuery<Paged<ApiEvent> & { agents: string[] }>(buildUrl('/api/activity/events', { ...filters, page, pageSize: size }), ['activity'])
  const agents = data.data?.agents ?? []

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search actions, products…" />
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger className="w-52" aria-label="Filter by agent"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="All">All agents</SelectItem>{agents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>{['All', 'success', 'info', 'warning', 'pending'].map((s) => <SelectItem key={s} value={s}>{s === 'All' ? 'All statuses' : s}</SelectItem>)}</SelectContent>
        </Select>
        <RangePicker value={range} onChange={setRange} />
        <div className="ml-auto"><ExportButton path="/api/activity/events.csv" query={filters} name="ecommind_agent_activity.csv" /></div>
      </div>
      <div className="card-surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <SortHead label="Time" field="time" sort="time" order={order} onSort={() => setOrder(order === 'asc' ? 'desc' : 'asc')} />
              {['Agent', 'Action', 'Product', 'Amount', 'Status'].map((h) => <SortHead key={h} label={h} sort="" order={order} onSort={() => {}} />)}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableState cols={6} loading={data.loading} error={data.error} empty={!!data.data && data.data.items.length === 0} reload={data.reload} emptyText="No events match these filters." />
            {!data.loading && (data.data?.items ?? []).map((e) => (
              <TableRow key={e.id} className="cursor-pointer border-border hover:bg-secondary/50" onClick={() => setSelected(e)}>
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">{formatDateTime(e.time)}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">{e.agent}</TableCell>
                <TableCell className="max-w-64"><span className="line-clamp-1">{e.action}</span></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{e.product ?? '—'}</TableCell>
                <TableCell className="tabular">{typeof e.amount === 'number' ? money(e.amount) : '—'}</TableCell>
                <TableCell><StatusBadge label={e.status} tone={EVENT_TONE[e.status]} pulse={e.status === 'pending'} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.data && <Pager page={page} pageSize={size} total={data.data.total} onPage={setPage} onSize={setSize} />}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="border-border bg-popover sm:max-w-md">
          {selected && (
            <>
              <SheetHeader className="pb-4"><SheetTitle className="text-base">Event details</SheetTitle></SheetHeader>
              <dl className="space-y-3 px-4 text-sm">
                {[
                  { l: 'Event ID', v: String(selected.id) }, { l: 'Timestamp', v: formatDateTime(selected.time) },
                  { l: 'Agent', v: selected.agent }, { l: 'Action', v: selected.action }, { l: 'Product', v: selected.product ?? '—' },
                  { l: 'Amount', v: typeof selected.amount === 'number' ? money(selected.amount) : '—' }, { l: 'Reference', v: selected.ref ?? '—' },
                ].map((r) => (
                  <div key={r.l} className="flex items-start justify-between gap-3 border-b border-border pb-2.5">
                    <dt className="text-muted-foreground">{r.l}</dt><dd className="text-right font-medium">{r.v}</dd>
                  </div>
                ))}
                <div>
                  <dt className="mb-1 text-muted-foreground">Detail</dt>
                  <dd className="rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed">{selected.detail ?? 'No additional detail recorded.'}</dd>
                </div>
              </dl>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/* ------------------------------------------------------------------ business reports (formerly /reports) */

const REPORT_ICONS: Record<string, typeof FileText> = { sales: BarChart3, inventory: Package, 'agent-usage': Wallet, negotiations: Handshake, escrow: ShieldCheck }
const REPORT_DESC: Record<string, string> = {
  sales: 'Daily units, orders and revenue for every SKU.',
  inventory: 'Stock levels, coverage and status for every SKU.',
  'agent-usage': 'Successful and failed calls and spend per service agent.',
  negotiations: 'RFQs, offers, counter-offers and agreed prices.',
  escrow: 'Every escrow order with its amount, status and lock, dispatch, delivery, release and refund times.',
}

function ReportsTab() {
  const [days, setDays] = useState(30)
  const q = useApiQuery<{ reports: { id: string; title: string; rows: number }[]; snapshot: { revenue: number; agentSpend: number; highRiskPincodes: number; inEscrow: number } }>(`/api/activity/reports?days=${days}`, ['analytics', 'activity', 'products', 'negotiations', 'escrow'])
  const reports = useMemo(() => q.data?.reports ?? [], [q.data])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Downloadable CSV reports generated from your stored data. Use the report builder below for Excel and PDF.</p>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40" aria-label="Report period"><SelectValue /></SelectTrigger>
          <SelectContent>{[7, 30, 90].map((d) => <SelectItem key={d} value={String(d)}>Last {d} days</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {q.error && <PanelError message={q.error.message} onRetry={q.reload} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.loading && Array.from({ length: 3 }).map((_, i) => <Card key={i} className="card-surface h-44 animate-pulse" />)}
        {reports.map((r) => (
          <ReportCard key={r.id} icon={REPORT_ICONS[r.id] ?? FileText} title={r.title} desc={REPORT_DESC[r.id] ?? ''}
            meta={`${r.rows} rows · ${r.id === 'sales' || r.id === 'agent-usage' || r.id === 'escrow' ? `last ${days} days` : 'current snapshot'}`}
            onDownload={() => downloadFile(`/api/activity/reports/${r.id}.csv`, { days }, `ecommind_${r.id}_report.csv`)} />
        ))}
        <ReportCard icon={ActivityIcon} title="Daily Agent Activity Report" desc="Every autonomous action with timestamps, agents and amounts." meta="all activity · use the Activity log tab to filter"
          onDownload={() => downloadFile('/api/activity/events.csv', { days }, 'ecommind_agent_activity.csv')} />
      </div>
      <div className="pt-2">
        <h2 className="mb-1 text-sm font-semibold">Report builder</h2>
        <p className="mb-3 text-xs text-muted-foreground">Custom reports with CSV, Excel and PDF export, and a history of reports you’ve generated.</p>
        <ReportsManager />
      </div>
      {q.data && (
        <Card className="card-surface">
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Snapshot</span>
            <span className="text-muted-foreground">Revenue ({days}d): <span className="tabular font-semibold text-foreground">{formatPaise(q.data.snapshot.revenue)}</span></span>
            <span className="text-muted-foreground">Agent spend ({days}d): <span className="tabular font-semibold text-foreground">{money(q.data.snapshot.agentSpend)}</span></span>
            <span className="text-muted-foreground">In escrow now: <span className="tabular font-semibold text-foreground">{money(q.data.snapshot.inEscrow)}</span></span>
            <span className="text-muted-foreground">High-risk pincodes: <span className="tabular font-semibold text-warning">{q.data.snapshot.highRiskPincodes}</span></span>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ReportCard({ icon: Icon, title, desc, meta, onDownload }: { icon: typeof FileText; title: string; desc: string; meta: ReactNode; onDownload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <Card className="card-surface card-hover flex flex-col">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand-soft"><Icon className="h-5 w-5" aria-hidden /></div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">{meta}</p>
        <Button variant="outline" size="sm" className="mt-4" disabled={busy} onClick={async () => {
          setBusy(true)
          try { await onDownload(); toast.success(`${title} downloaded`) } catch (e) { toast.error('Download failed', { description: (e as Error).message }) } finally { setBusy(false) }
        }}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />} Download CSV
        </Button>
      </CardContent>
    </Card>
  )
}
