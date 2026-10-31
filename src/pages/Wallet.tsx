import { useMemo } from 'react'
import { ArrowDownLeft, ArrowUpRight, Landmark, Plus, ReceiptText, Wallet as WalletIcon, Zap } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '@/store/AppContext'
import { AGENT_SPEND_BREAKDOWN, FIN } from '@/data/demo'
import { cx, formatDateTime, formatINR } from '@/lib/format'
import { ChartCard, EmptyState, MetricCard, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const tooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12, color: 'hsl(var(--popover-foreground))' }
const DAILY_WALLET_LIMIT = 1000

export default function Wallet() {
  const { demoLoaded, loadDemoBusiness, walletBalance, walletTxns, topUpWallet } = useApp()

  const totalCalls = AGENT_SPEND_BREAKDOWN.reduce((s, a) => s + a.calls, 0)
  const spentToday = FIN.serviceCallSpend + FIN.logisticsAdvance
  const avgCost = totalCalls ? FIN.serviceCallSpend / totalCalls : 0

  const dailySpend = useMemo(() => {
    // synthetic 7-day micro-spend series ending today
    const rngVals = [21, 34, 12, 46, 28, 19, FIN.serviceCallSpend + FIN.logisticsAdvance]
    return rngVals.map((v, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i))
      return { label: d.toLocaleDateString('en-IN', { weekday: 'short' }), amount: v }
    })
  }, [])

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Wallet & Transactions" subtitle="Micro-payment wallet for agent-to-agent commerce." />
        <EmptyState title="Wallet not active yet" body="Load the demo business to see simulated micro-payments, signed receipts and agent spending." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="Wallet & Transactions"
        subtitle="Micro-payment wallet powering agent-to-agent commerce. All transactions are simulated."
        actions={<Button size="sm" className="btn-glow border-0 text-white" onClick={() => topUpWallet(5000)}><Plus className="h-3.5 w-3.5" aria-hidden /> Top up ₹5,000</Button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Available Balance" value={formatINR(walletBalance)} icon={<WalletIcon className="h-4 w-4" aria-hidden />} hint="micro-payments" />
        <MetricCard label="Daily Spending Limit" value={formatINR(DAILY_WALLET_LIMIT)} icon={<Landmark className="h-4 w-4" aria-hidden />} hint="resets midnight" />
        <MetricCard label="Spent Today" value={formatINR(spentToday)} icon={<Zap className="h-4 w-4" aria-hidden />} hint={`${Math.round((spentToday / DAILY_WALLET_LIMIT) * 100)}% of limit`} />
        <MetricCard label="Total Service Calls" value={String(totalCalls)} icon={<ReceiptText className="h-4 w-4" aria-hidden />} hint="today" />
        <MetricCard label="Avg Cost / Call" value={formatINR(avgCost, { decimals: 2 })} icon={<ArrowDownLeft className="h-4 w-4" aria-hidden />} hint="across 4 agents" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Agent payment breakdown" subtitle="Today's spend by service agent">
          <ul className="space-y-2.5">
            {AGENT_SPEND_BREAKDOWN.map((a) => (
              <li key={a.agent} className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{a.agent}</p>
                  <p className="text-[11px] text-muted-foreground">{a.calls} calls</p>
                </div>
                <span className="tabular font-semibold">{formatINR(a.amount)}</span>
              </li>
            ))}
            <li className="flex items-center justify-between rounded-lg bg-brand/10 px-3.5 py-2.5 text-sm">
              <span className="font-semibold text-brand-soft">Total service spend</span>
              <span className="tabular font-bold text-brand-soft">{formatINR(FIN.serviceCallSpend)}</span>
            </li>
            <li className="flex items-center justify-between px-3.5 text-xs text-muted-foreground">
              <span>+ Logistics booking advance (BlueDart)</span>
              <span className="tabular">{formatINR(FIN.logisticsAdvance)}</span>
            </li>
          </ul>
        </ChartCard>

        <ChartCard title="Agent-wise spending" subtitle="₹ per agent today">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={AGENT_SPEND_BREAKDOWN} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27334D" vertical={false} />
                <XAxis dataKey="agent" tickLine={false} axisLine={false} tickFormatter={(v: string) => v.split(' ')[0]} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatINR(v), 'Spent']} />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]} barSize={38}>
                  {AGENT_SPEND_BREAKDOWN.map((_, i) => <Cell key={i} fill={['#7965F2', '#22C55E', '#F59E0B', '#9A8BFF'][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Daily spending" subtitle="Wallet debits, last 7 days">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailySpend} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27334D" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatINR(v), 'Spent']} />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]} barSize={26} fill="#7965F2" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Transactions */}
      <div className="card-surface overflow-x-auto">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">Transaction history</h2>
          <span className="text-xs text-muted-foreground">{walletTxns.length} transactions · cryptographically signed (simulated)</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {['Transaction', 'Time', 'Counterparty', 'Memo', 'Amount', 'Status', 'Signature'].map((h) => (
                <TableHead key={h} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {walletTxns.map((t) => (
              <TableRow key={t.id} className="border-border">
                <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{t.id}</TableCell>
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">{formatDateTime(t.time)}</TableCell>
                <TableCell className="font-medium whitespace-nowrap">{t.counterparty}</TableCell>
                <TableCell className="max-w-56"><span className="line-clamp-1 text-muted-foreground">{t.memo}</span></TableCell>
                <TableCell className={cx('tabular font-semibold whitespace-nowrap', t.amount < 0 ? 'text-danger' : 'text-success')}>
                  <span className="inline-flex items-center gap-1">
                    {t.amount < 0 ? <ArrowDownLeft className="h-3 w-3" aria-hidden /> : <ArrowUpRight className="h-3 w-3" aria-hidden />}
                    {formatINR(Math.abs(t.amount))}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge label={t.status} tone={t.status === 'Completed' ? 'success' : t.status === 'Locked' ? 'warning' : t.status === 'Released' ? 'info' : 'neutral'} pulse={t.status === 'Locked'} />
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{t.signature}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
