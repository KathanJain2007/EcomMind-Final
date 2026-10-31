import { useMemo, useState } from 'react'
import { Activity, BarChart3, Download, FileText, Handshake, Package, ShieldCheck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import {
  AGENT_SPEND_BREAKDOWN, FIN, LOGISTICS_QUOTES, PRODUCTS, RETURNS_BY_PINCODE, SUPPLIER_QUOTES, SUPPLIERS,
  salesInRange, stockCoverage, stockStatus,
} from '@/data/demo'
import { cx, downloadCSV, formatINR } from '@/lib/format'
import { EmptyState, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const RANGES = [{ label: 'Last 7 days', days: 7 }, { label: 'Last 30 days', days: 30 }, { label: 'Last 90 days', days: 90 }]

interface ReportDef {
  id: string
  title: string
  desc: string
  icon: typeof FileText
  build: (days: number) => { headers: string[]; rows: Array<Array<string | number>> }
}

const REPORTS: ReportDef[] = [
  {
    id: 'agent-activity', title: 'Daily Agent Activity Report', icon: Activity,
    desc: 'Every autonomous action with timestamps, agents and amounts.',
    build: () => ({ headers: ['Time', 'Agent', 'Action', 'Product', 'Amount (INR)', 'Status'], rows: [] }), // filled at runtime
  },
  {
    id: 'sales', title: 'Sales Performance Report', icon: BarChart3,
    desc: 'Daily revenue and units across your catalogue.',
    build: (days) => {
      const rows = salesInRange(days).map((r) => [r.date, r.sku, PRODUCTS.find((p) => p.sku === r.sku)?.name ?? r.sku, r.units, r.revenue])
      return { headers: ['Date', 'SKU', 'Product', 'Units', 'Revenue (INR)'], rows }
    },
  },
  {
    id: 'inventory', title: 'Inventory Report', icon: Package,
    desc: 'Stock levels, coverage and status for every SKU.',
    build: () => ({
      headers: ['SKU', 'Product', 'Category', 'Price (INR)', 'Cost (INR)', 'Stock', 'Avg daily sales', 'Coverage (days)', 'Status'],
      rows: PRODUCTS.map((p) => [p.sku, p.name, p.category, p.price, p.cost, p.stock, p.avgDailySales, stockCoverage(p), stockStatus(p)]),
    }),
  },
  {
    id: 'agent-spend', title: 'Agent Spending Report', icon: Wallet,
    desc: 'Micro-payment breakdown by service agent.',
    build: () => ({
      headers: ['Agent', 'Calls', 'Spend (INR)'],
      rows: [...AGENT_SPEND_BREAKDOWN.map((a) => [a.agent, a.calls, a.amount] as Array<string | number>), ['Total', AGENT_SPEND_BREAKDOWN.reduce((s, a) => s + a.calls, 0), FIN.serviceCallSpend]],
    }),
  },
  {
    id: 'negotiation', title: 'Supplier Negotiation Report', icon: Handshake,
    desc: 'Quotes, counter-offers and negotiated outcomes.',
    build: () => ({
      headers: ['Supplier', 'SKU', 'Quoted (INR)', 'Negotiated (INR)', 'Delivery (days)', 'Outcome'],
      rows: SUPPLIER_QUOTES.map((q) => {
        const s = SUPPLIERS.find((x) => x.id === q.supplierId)!
        const won = q.sku === 'EAR-001' && q.supplierId === 'SUP-B'
        return [s.name, q.sku, q.unitPrice, won ? FIN.negotiatedUnitPrice : '', q.deliveryDays, won ? 'Won — escrow locked' : 'Not selected']
      }),
    }),
  },
  {
    id: 'escrow', title: 'Escrow Report', icon: ShieldCheck,
    desc: 'Locked, released and refunded escrow movements.',
    build: () => ({
      headers: ['Escrow ID', 'Product', 'Supplier', 'Qty', 'Unit price (INR)', 'Total (INR)', 'Status'],
      rows: [['ESC-2026-1042', 'Wireless Earbuds', 'Supplier B — Kedar Electronics', 300, 180, 54000, 'Locked (demo)']],
    }),
  },
]

export default function Reports() {
  const { demoLoaded, loadDemoBusiness, activity, escrow } = useApp()
  const [range, setRange] = useState(30)

  const reports = useMemo(() => REPORTS.map((r) => {
    if (r.id === 'agent-activity') {
      return { ...r, build: () => ({ headers: ['Time', 'Agent', 'Action', 'Product', 'Amount (INR)', 'Status'], rows: activity.map((e) => [new Date(e.time).toLocaleString('en-IN'), e.agent, e.action, e.product ?? '', e.amount ?? '', e.status]) }) }
    }
    if (r.id === 'escrow') {
      return { ...r, build: () => ({ headers: ['Escrow ID', 'Product', 'Supplier', 'Qty', 'Unit price (INR)', 'Total (INR)', 'Status'], rows: [[escrow.id, escrow.product, escrow.supplier, escrow.qty, escrow.unitPrice, escrow.total, escrow.status]] }) }
    }
    return r
  }), [activity, escrow])

  if (!demoLoaded) {
    return (
      <>
        <PageHeader title="Reports" subtitle="Downloadable business reports generated from your data." />
        <EmptyState title="Nothing to report yet" body="Load the demo business to generate sales, inventory, agent-spend, negotiation and escrow reports." action={<Button className="btn-glow border-0 text-white" onClick={() => loadDemoBusiness()}>Load Demo Business</Button>} />
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Downloadable CSV reports generated from live demo data."
        actions={
          <div className="flex gap-1 rounded-lg border border-border bg-secondary/60 p-0.5" role="tablist" aria-label="Report date range">
            {RANGES.map((r) => (
              <button key={r.days} role="tab" aria-selected={range === r.days} onClick={() => setRange(r.days)}
                className={cx('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', range === r.days ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground')}>
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => {
          const { rows } = r.build(range)
          return (
            <Card key={r.id} className="card-surface card-hover flex flex-col">
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand-soft">
                  <r.icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="text-sm font-semibold">{r.title}</h3>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{r.desc}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{rows.length} rows · {r.id === 'sales' ? `last ${range} days` : 'current snapshot'}</p>
                <Button
                  variant="outline" size="sm" className="mt-4"
                  onClick={() => {
                    const { headers, rows: data } = r.build(range)
                    downloadCSV(`ecommind_${r.id}_report.csv`, headers, data)
                    toast.success(`${r.title} downloaded`, { description: `${data.length} rows exported as CSV.` })
                  }}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden /> Download CSV
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* quick summary strip */}
      <Card className="card-surface mt-4">
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Snapshot</span>
          <span className="text-muted-foreground">Revenue ({range}d): <span className="tabular font-semibold text-foreground">{formatINR(salesInRange(range).reduce((s, r) => s + r.revenue, 0))}</span></span>
          <span className="text-muted-foreground">Agent spend today: <span className="tabular font-semibold text-foreground">{formatINR(FIN.serviceCallSpend)}</span></span>
          <span className="text-muted-foreground">In escrow: <span className="tabular font-semibold text-foreground">{formatINR(escrow.status === 'Released' ? 0 : escrow.total)}</span></span>
          <span className="text-muted-foreground">High-risk pincodes: <span className="tabular font-semibold text-warning">{RETURNS_BY_PINCODE.filter((x) => x.returnRate >= 0.15).length}</span></span>
          <span className="text-muted-foreground">Couriers compared: <span className="tabular font-semibold text-foreground">{LOGISTICS_QUOTES.length}</span></span>
        </CardContent>
      </Card>
    </div>
  )
}
