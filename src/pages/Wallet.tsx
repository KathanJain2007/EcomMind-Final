import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowDownLeft, ArrowUpRight, Landmark, Loader2, Plus, ReceiptText, Wallet as WalletIcon, Zap } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { useApiQuery, useDataStore } from '@/store/DataStore'
import { api, ApiError, newIdempotencyKey, type ApiTxn, type Paged } from '@/lib/api'
import { cx, formatDateTime, formatPaise } from '@/lib/format'
import { ChartCard, ChartEmpty, ChartSkeleton, MetricCard, PageHeader, PanelError, StatusBadge } from '@/components/common'
import { CountUp } from '@/components/CountUp'
import { tooltipStyle } from '@/lib/chartTheme'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface WalletInfo { balance: number; spentToday: number; dailyLimit: number; budgetConsumedToday: number; dailyBudget: number }
interface Overview { totalCalls: number; successfulCalls: number; totalSpend: number; byAgent: { agent: string; calls: number; spend: number }[] }

const money = (p: number) => formatPaise(p, { decimals: p % 100 ? 2 : 0 })

export default function Wallet() {
  const store = useDataStore()
  const navigate = useNavigate()
  const wallet = useApiQuery<WalletInfo>('/api/wallet', ['wallet', 'mandate'])
  const today = useApiQuery<Overview>('/api/activity/overview?days=1', ['activity', 'wallet'])
  const daily = useApiQuery<{ series: { date: string; amount: number }[] }>('/api/analytics/wallet-daily?days=7', ['wallet'])
  const txns = useApiQuery<Paged<ApiTxn>>('/api/activity/transactions?pageSize=15', ['wallet'])
  const [topping, setTopping] = useState(false)

  const topUp = async () => {
    if (topping) return
    setTopping(true)
    try {
      await api('/api/wallet/topups', { body: { amount: 5000_00 }, idempotencyKey: newIdempotencyKey('topup') })
      store.invalidate('wallet', 'activity', 'analytics')
      toast.success('Wallet topped up', { description: '₹5,000 added (simulated demo funds).' })
    } catch (e) {
      toast.error('Top-up failed', { description: e instanceof ApiError ? e.message : undefined })
    } finally {
      setTopping(false)
    }
  }

  const w = wallet.data
  const o = today.data
  const avg = o && o.successfulCalls ? o.totalSpend / o.successfulCalls : 0
  const spendSeries = (daily.data?.series ?? []).map((d) => ({ label: new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' }), amount: d.amount / 100 }))

  return (
    <div>
      <PageHeader
        title="Wallet & Transactions"
        subtitle="Micro-payment wallet for agent-to-agent commerce. Balances come from the transaction ledger; all funds are simulated."
        actions={<Button size="sm" className="btn-glow border-0 text-white" onClick={topUp} disabled={topping}>{topping ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />} Top up ₹5,000</Button>}
      />

      {wallet.error && <div className="mb-4"><PanelError message={wallet.error.message} onRetry={wallet.reload} /></div>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard loading={wallet.loading} label="Available Balance" value={<CountUp value={(w?.balance ?? 0) / 100} format="inr" />} icon={<WalletIcon className="h-4 w-4" aria-hidden />} hint="from ledger" />
        <MetricCard loading={wallet.loading} label="Daily Spending Limit" value={<CountUp value={(w?.dailyLimit ?? 0) / 100} format="inr" />} icon={<Landmark className="h-4 w-4" aria-hidden />} hint="set in your mandate" />
        <MetricCard loading={wallet.loading} label="Spent Today" value={<CountUp value={(w?.spentToday ?? 0) / 100} format="inr" />} icon={<Zap className="h-4 w-4" aria-hidden />} hint={w?.dailyLimit ? `${Math.round((w.spentToday / w.dailyLimit) * 100)}% of limit` : undefined} />
        <MetricCard loading={today.loading} label="Service Calls Today" value={<CountUp value={o?.successfulCalls ?? 0} />} icon={<ReceiptText className="h-4 w-4" aria-hidden />} hint={`${(o?.totalCalls ?? 0) - (o?.successfulCalls ?? 0)} not completed`} />
        <MetricCard loading={today.loading} label="Avg Cost / Call" value={<CountUp value={avg / 100} format="inr" decimals={2} />} icon={<ArrowDownLeft className="h-4 w-4" aria-hidden />} hint="successful calls today" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Agent payment breakdown" subtitle="Today's spend by service agent">
          {today.loading ? <div className="h-40"><ChartSkeleton /></div> : today.error ? <PanelError message={today.error.message} onRetry={today.reload} /> : (
            <ul className="space-y-2.5">
              {(o?.byAgent ?? []).map((a) => (
                <li key={a.agent} className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5 text-sm">
                  <div><p className="font-medium">{a.agent}</p><p className="text-[11px] text-muted-foreground">{a.calls} calls</p></div>
                  <span className="tabular font-semibold">{money(a.spend)}</span>
                </li>
              ))}
              {(o?.byAgent ?? []).length === 0 && <li className="text-xs text-muted-foreground">No agent calls today.</li>}
              <li className="flex items-center justify-between rounded-lg bg-brand/10 px-3.5 py-2.5 text-sm">
                <span className="font-semibold text-brand-soft">Total service spend</span>
                <span className="tabular font-bold text-brand-soft">{money(o?.totalSpend ?? 0)}</span>
              </li>
            </ul>
          )}
        </ChartCard>

        <ChartCard title="Agent-wise spending" subtitle="₹ per agent today">
          <div className="h-56">
            {today.loading ? <ChartSkeleton /> : (o?.byAgent ?? []).length === 0 ? <ChartEmpty text="No agent spending today." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(o?.byAgent ?? []).map((a) => ({ ...a, rs: a.spend / 100 }))} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="agent" tickLine={false} axisLine={false} tickFormatter={(v: string) => v.split(' ')[0]} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [money(v * 100), 'Spent']} />
                  <Bar dataKey="rs" radius={[6, 6, 0, 0]} barSize={38}>
                    {(o?.byAgent ?? []).map((_, i) => <Cell key={i} fill={['#7965F2', '#22C55E', '#F59E0B', '#9A8BFF'][i % 4]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Daily spending" subtitle="Agent calls and logistics debits, last 7 days">
          <div className="h-56">
            {daily.loading ? <ChartSkeleton /> : daily.error ? <PanelError message={daily.error.message} onRetry={daily.reload} />
              : spendSeries.every((d) => d.amount === 0) ? <ChartEmpty text="No wallet debits in the last 7 days." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spendSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => `₹${v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [money(v * 100), 'Spent']} />
                  <Bar dataKey="amount" radius={[6, 6, 0, 0]} barSize={26} fill="#7965F2" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>

      <div className="card-surface overflow-x-auto">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">Recent transactions</h2>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('/activity?tab=transactions')}>
            View all {txns.data ? `${txns.data.total} ` : ''}in Agent Activity
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {['Transaction', 'Time', 'Counterparty', 'Memo', 'Amount', 'Status'].map((h) => (
                <TableHead key={h} className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(txns.data?.items ?? []).map((t) => (
              <TableRow key={t.id} className="border-border">
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{t.id}</TableCell>
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">{formatDateTime(t.time)}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">{t.counterparty}</TableCell>
                <TableCell className="max-w-56"><span className="line-clamp-1 text-muted-foreground">{t.memo}</span></TableCell>
                <TableCell className={cx('tabular whitespace-nowrap font-semibold', t.amount < 0 ? 'text-danger' : 'text-success')}>
                  <span className="inline-flex items-center gap-1">
                    {t.amount < 0 ? <ArrowDownLeft className="h-3 w-3" aria-hidden /> : <ArrowUpRight className="h-3 w-3" aria-hidden />}
                    {money(Math.abs(t.amount))}
                  </span>
                </TableCell>
                <TableCell><StatusBadge label={t.status} tone={t.status === 'Completed' ? 'success' : t.status === 'Locked' ? 'warning' : 'info'} /></TableCell>
              </TableRow>
            ))}
            {txns.data && txns.data.items.length === 0 && (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No transactions yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
