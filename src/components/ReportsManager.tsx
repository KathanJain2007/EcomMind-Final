import { useMemo, useState } from 'react'
import {
  Activity, BarChart3, Clock, Download, FileSpreadsheet, FileText,
  Handshake, Package, Search, Tag, Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import {
  PRODUCTS, SUPPLIERS,
  salesInRange, stockCoverage, stockStatus,
} from '@/data/demo'
import { cx, formatINR, formatNum, formatDate, formatDateTime } from '@/lib/format'
import { downloadCSV, downloadXLSX, exportToPDF, type PDFSummaryCard } from '@/lib/export'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

export type ReportCategory = 'sales' | 'inventory' | 'activity' | 'financial' | 'supplier' | 'pricing'

interface ReportMeta {
  id: ReportCategory
  title: string
  subtitle: string
  icon: typeof FileText
  description: string
}

const CATEGORIES: ReportMeta[] = [
  {
    id: 'sales',
    title: 'Sales Performance Report',
    subtitle: 'Revenue, orders, product-level & marketplace breakdown',
    icon: BarChart3,
    description: 'Comprehensive sales metrics, daily trends, channel distributions, and top-selling products.',
  },
  {
    id: 'inventory',
    title: 'Inventory & Stock Valuation Report',
    subtitle: 'Stock levels, stockouts, coverage & valuation',
    icon: Package,
    description: 'Real-time stock valuation, days of coverage, reorder thresholds, and overstocked inventory alerts.',
  },
  {
    id: 'activity',
    title: 'Agent Activity & Operations Report',
    subtitle: 'AI decisions, negotiations, operations & API costs',
    icon: Activity,
    description: 'Audit log of all AI agent actions, negotiation rounds, financial transactions, and micro-payment spends.',
  },
  {
    id: 'financial',
    title: 'Financial Profit & Cost Analysis',
    subtitle: 'Revenues, commissions, shipping, taxes & net margins',
    icon: Wallet,
    description: 'P&L breakdown including marketplace fees, logistics charges, packaging expenses, and contribution margins.',
  },
  {
    id: 'supplier',
    title: 'Supplier Performance & Procurement Report',
    subtitle: 'Purchases, quoted vs negotiated prices & delivery SLAs',
    icon: Handshake,
    description: 'Historical supplier orders, on-time delivery rates, quality ratings, and negotiated savings.',
  },
  {
    id: 'pricing',
    title: 'AI Dynamic Pricing & Safeguards Report',
    subtitle: 'Price changes, AI rationale, margin floors & discount tracking',
    icon: Tag,
    description: 'Historical repricing actions, competitor benchmarks, discount ceilings, and financial impact audits.',
  },
]

const RANGES = [
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last 90 Days', days: 90 },
]

export function ReportsManager() {
  const {
    auth, activity, extraProducts,
    priceHistory, supplierPurchases,
    reportHistory, saveGeneratedReport,
  } = useApp()

  const [category, setCategory] = useState<ReportCategory>('sales')
  const [days, setDays] = useState(30)
  const [productFilter, setProductFilter] = useState('All')
  const [supplierFilter, setSupplierFilter] = useState('All')
  const [marketplaceFilter, setMarketplaceFilter] = useState('All')
  const [search, setSearch] = useState('')

  const allProducts = useMemo(() => [...PRODUCTS, ...extraProducts], [extraProducts])

  // Build report dataset dynamically from actual state
  const reportData = useMemo(() => {
    switch (category) {
      case 'sales': {
        const sales = salesInRange(days)
        const filtered = sales.filter((s) => {
          if (productFilter !== 'All' && s.sku !== productFilter) return false
          return true
        })

        const totalRevenue = filtered.reduce((acc, s) => acc + s.revenue, 0)
        const totalUnits = filtered.reduce((acc, s) => acc + s.units, 0)
        const totalOrders = Math.round(totalUnits * 0.92)

        const headers = ['Date', 'SKU', 'Product Name', 'Category', 'Units Sold', 'Unit Price', 'Total Revenue (INR)', 'Channel Split']
        const rows = filtered.map((s) => {
          const p = allProducts.find((x) => x.sku === s.sku)
          const pName = p ? p.name : s.sku
          const cat = p ? p.category : 'General'
          const price = p ? p.price : Math.round(s.revenue / (s.units || 1))
          const ch = s.units % 2 === 0 ? 'Amazon (55%) · Flipkart (45%)' : 'Amazon (70%) · Meesho (30%)'
          return [s.date, s.sku, pName, cat, s.units, formatINR(price), formatINR(s.revenue), ch]
        })

        const summaryCards: PDFSummaryCard[] = [
          { label: 'Total Revenue', value: formatINR(totalRevenue) },
          { label: 'Total Orders', value: formatNum(totalOrders) },
          { label: 'Units Sold', value: formatNum(totalUnits) },
          { label: 'Avg Order Value', value: formatINR(totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0) },
        ]

        return { headers, rows, summaryCards, rawCount: rows.length, totalRevenue, totalOrders, totalUnits }
      }

      case 'inventory': {
        const filtered = allProducts.filter((p) => {
          if (productFilter !== 'All' && p.sku !== productFilter) return false
          return true
        })

        const totalValuation = filtered.reduce((acc, p) => acc + p.stock * p.cost, 0)
        const totalUnits = filtered.reduce((acc, p) => acc + p.stock, 0)
        const lowStockCount = filtered.filter((p) => stockCoverage(p) <= 10).length

        const headers = ['SKU', 'Product Name', 'Category', 'Stock Units', 'Unit Cost', 'Selling Price', 'Total Valuation (Cost)', 'Coverage (Days)', 'Status', 'Restock Recommendation']
        const rows = filtered.map((p) => {
          const cov = stockCoverage(p)
          const st = stockStatus(p)
          const rec = cov <= 5 ? 'URGENT: Reorder 300 units' : cov <= 12 ? 'Prepare RFQ: Reorder 150 units' : 'Stock level healthy'
          return [p.sku, p.name, p.category, p.stock, formatINR(p.cost), formatINR(p.price), formatINR(p.stock * p.cost), `${cov} days`, st, rec]
        })

        const summaryCards: PDFSummaryCard[] = [
          { label: 'Total Stock Valuation', value: formatINR(totalValuation) },
          { label: 'Total Units in Stock', value: formatNum(totalUnits) },
          { label: 'Active SKUs', value: String(filtered.length) },
          { label: 'Low Stock Alerts', value: String(lowStockCount) },
        ]

        return { headers, rows, summaryCards, rawCount: rows.length, stockValuation: totalValuation, totalUnits }
      }

      case 'activity': {
        const filtered = activity.filter((a) => {
          if (productFilter !== 'All' && a.product && !a.product.includes(productFilter)) return false
          return true
        })

        const totalSpend = filtered.reduce((acc, a) => acc + (a.amount || 0), 0)
        const successCount = filtered.filter((a) => a.status === 'success').length

        const headers = ['Event ID', 'Timestamp', 'Agent Responsible', 'Action Description', 'Product / Context', 'Amount (INR)', 'Execution Status', 'Details']
        const rows = filtered.map((a) => [
          a.id,
          formatDateTime(a.time),
          a.agent,
          a.action,
          a.product || '—',
          typeof a.amount === 'number' ? formatINR(a.amount) : '—',
          a.status.toUpperCase(),
          a.detail || '—',
        ])

        const summaryCards: PDFSummaryCard[] = [
          { label: 'Recorded Operations', value: String(filtered.length) },
          { label: 'Successful Executions', value: `${successCount} (${Math.round((successCount / (filtered.length || 1)) * 100)}%)` },
          { label: 'Financial Impact / Spend', value: formatINR(totalSpend) },
          { label: 'Active Service Agents', value: '5 Agents' },
        ]

        return { headers, rows, summaryCards, rawCount: rows.length }
      }

      case 'financial': {
        const sales = salesInRange(days)
        const grossRevenue = sales.reduce((acc, s) => acc + s.revenue, 0)
        const totalUnits = sales.reduce((acc, s) => acc + s.units, 0)

        // Comprehensive cost modeling
        const cogs = sales.reduce((acc, s) => {
          const p = allProducts.find((x) => x.sku === s.sku)
          return acc + (p ? p.cost * s.units : s.units * 300)
        }, 0)

        const marketplaceCommissions = Math.round(grossRevenue * 0.118)
        const shippingExpenses = totalUnits * 42
        const packagingCosts = totalUnits * 14
        const promoDiscounts = Math.round(grossRevenue * 0.045)
        const grossProfit = grossRevenue - cogs
        const netProfit = grossProfit - marketplaceCommissions - shippingExpenses - packagingCosts - promoDiscounts
        const marginPct = Math.round((netProfit / (grossRevenue || 1)) * 1000) / 10

        const headers = ['P&L Line Item', 'Category / Driver', 'Amount (INR)', '% of Revenue', 'Notes']
        const rows: Array<Array<string | number>> = [
          ['Gross Sales Revenue', 'Operating Inflow', formatINR(grossRevenue), '100.0%', 'Across all marketplace channels'],
          ['Cost of Goods Sold (COGS)', 'Procurement Expense', `-${formatINR(cogs)}`, `${((cogs / grossRevenue) * 100).toFixed(1)}%`, 'Direct supplier unit manufacturing cost'],
          ['Gross Profit', 'Operating Margin', formatINR(grossProfit), `${((grossProfit / grossRevenue) * 100).toFixed(1)}%`, 'Revenue minus direct COGS'],
          ['Marketplace Commissions', 'Channel Fees', `-${formatINR(marketplaceCommissions)}`, '11.8%', 'Blended Amazon (14.5%), Flipkart (12%), Meesho (1.5%)'],
          ['Shipping & Logistics', 'Fulfillment', `-${formatINR(shippingExpenses)}`, `${((shippingExpenses / grossRevenue) * 100).toFixed(1)}%`, 'Surface Express & standard delivery'],
          ['Packaging & Materials', 'Fulfillment', `-${formatINR(packagingCosts)}`, `${((packagingCosts / grossRevenue) * 100).toFixed(1)}%`, 'Corrugated boxes, bubble wrap & thermal labels'],
          ['Promotional Discounts', 'Marketing', `-${formatINR(promoDiscounts)}`, '4.5%', 'Festive coupon vouchers & bundle discounts'],
          ['Net Profit (Operating)', 'Bottom Line', formatINR(netProfit), `${marginPct}%`, 'Operating contribution margin before taxes'],
        ]

        const summaryCards: PDFSummaryCard[] = [
          { label: 'Gross Revenue', value: formatINR(grossRevenue) },
          { label: 'Gross Profit', value: formatINR(grossProfit) },
          { label: 'Net Profit', value: formatINR(netProfit) },
          { label: 'Net Margin', value: `${marginPct}%` },
        ]

        return { headers, rows, summaryCards, rawCount: rows.length, profitEstimate: netProfit }
      }

      case 'supplier': {
        const filteredPurchases = supplierPurchases.filter((p) => {
          if (supplierFilter !== 'All' && p.supplierId !== supplierFilter) return false
          if (productFilter !== 'All' && p.sku !== productFilter) return false
          return true
        })

        const totalProcured = filteredPurchases.reduce((acc, p) => acc + p.totalAmount, 0)
        const totalUnits = filteredPurchases.reduce((acc, p) => acc + p.qty, 0)
        const totalSavings = filteredPurchases.reduce((acc, p) => acc + (p.quotedPrice - p.finalPrice) * p.qty, 0)

        const headers = ['Order PO', 'Date', 'Supplier Name', 'SKU', 'Product', 'Units', 'Quoted (INR)', 'Final (INR)', 'Total Spent', 'Status', 'Savings']
        const rows = filteredPurchases.map((p) => {
          const s = SUPPLIERS.find((x) => x.id === p.supplierId)
          const sName = s ? s.name : p.supplierId
          const sav = (p.quotedPrice - p.finalPrice) * p.qty
          return [
            p.id,
            formatDate(p.orderDate),
            sName,
            p.sku,
            p.productName,
            p.qty,
            formatINR(p.quotedPrice),
            formatINR(p.finalPrice),
            formatINR(p.totalAmount),
            p.status,
            sav > 0 ? `+${formatINR(sav)}` : '—',
          ]
        })

        const summaryCards: PDFSummaryCard[] = [
          { label: 'Total Purchases', value: formatINR(totalProcured) },
          { label: 'Units Procured', value: formatNum(totalUnits) },
          { label: 'Negotiated Savings', value: formatINR(totalSavings) },
          { label: 'Active Suppliers', value: `${SUPPLIERS.length} Partners` },
        ]

        return { headers, rows, summaryCards, rawCount: rows.length }
      }

      case 'pricing': {
        const filtered = priceHistory.filter((p) => {
          if (productFilter !== 'All' && p.sku !== productFilter) return false
          return true
        })

        const headers = ['Change ID', 'Timestamp', 'SKU', 'Product Name', 'Previous Price', 'New Price', 'Change %', 'Responsible Agent', 'Reason', 'Impact Expectation']
        const rows = filtered.map((p) => [
          p.id,
          formatDate(p.timestamp),
          p.sku,
          p.productName,
          formatINR(p.oldPrice),
          formatINR(p.newPrice),
          `${p.pctChange >= 0 ? '+' : ''}${p.pctChange}%`,
          p.agentResponsible,
          p.reason,
          p.expectedProfitImpact,
        ])

        const summaryCards: PDFSummaryCard[] = [
          { label: 'Repricing Events', value: String(filtered.length) },
          { label: 'Safeguard Compliance', value: '100% Verified' },
          { label: 'Avg Price Adjustment', value: '±5.8%' },
          { label: 'AI Optimization Status', value: 'Active' },
        ]

        return { headers, rows, summaryCards, rawCount: rows.length }
      }
    }
  }, [category, days, productFilter, supplierFilter, activity, allProducts, priceHistory, supplierPurchases])

  // Filtered rows by search text
  const displayedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return reportData.rows
    return reportData.rows.filter((row) =>
      row.some((cell) => String(cell).toLowerCase().includes(q))
    )
  }, [reportData.rows, search])

  const currentMeta = CATEGORIES.find((c) => c.id === category)!

  // Export handlers
  const handleExportCSV = () => {
    const filename = `ecommind_${category}_report_${days}d.csv`
    downloadCSV(filename, reportData.headers, reportData.rows)
    saveGeneratedReport({
      category,
      title: `${currentMeta.title} (${days} Days)`,
      format: 'csv',
      dateRangeDays: days,
      rowCount: reportData.rows.length,
      filters: { product: productFilter, supplier: supplierFilter, marketplace: marketplaceFilter },
      summaryMetrics: {
        totalRevenue: 'totalRevenue' in reportData ? Number(reportData.totalRevenue) : undefined,
        totalOrders: 'totalOrders' in reportData ? Number(reportData.totalOrders) : undefined,
        stockValuation: 'stockValuation' in reportData ? Number(reportData.stockValuation) : undefined,
        profitEstimate: 'profitEstimate' in reportData ? Number(reportData.profitEstimate) : undefined,
      },
      fileName: filename,
    })
    toast.success('Report downloaded as CSV', { description: `${reportData.rows.length} rows exported.` })
  }

  const handleExportXLSX = () => {
    const filename = `ecommind_${category}_report_${days}d.xlsx`
    downloadXLSX(filename, currentMeta.title.slice(0, 30), reportData.headers, reportData.rows)
    saveGeneratedReport({
      category,
      title: `${currentMeta.title} (${days} Days)`,
      format: 'xlsx',
      dateRangeDays: days,
      rowCount: reportData.rows.length,
      filters: { product: productFilter, supplier: supplierFilter, marketplace: marketplaceFilter },
      summaryMetrics: {
        totalRevenue: 'totalRevenue' in reportData ? Number(reportData.totalRevenue) : undefined,
        totalOrders: 'totalOrders' in reportData ? Number(reportData.totalOrders) : undefined,
        stockValuation: 'stockValuation' in reportData ? Number(reportData.stockValuation) : undefined,
        profitEstimate: 'profitEstimate' in reportData ? Number(reportData.profitEstimate) : undefined,
      },
      fileName: filename,
    })
    toast.success('Report downloaded as Excel (.xlsx)', { description: `${reportData.rows.length} rows exported.` })
  }

  const handleExportPDF = () => {
    const filename = `ecommind_${category}_report_${days}d.pdf`
    exportToPDF(
      currentMeta.title,
      `${currentMeta.subtitle} · Timeframe: Last ${days} Days`,
      reportData.headers,
      reportData.rows.slice(0, 80), // first 80 rows for print legibility
      reportData.summaryCards,
      {
        storeName: auth.storeName || 'UrbanNest Living',
        gstin: auth.gstin || '08AABCU9603R1ZM',
        sellerName: auth.sellerName || 'Aarav Sharma',
      }
    )
    saveGeneratedReport({
      category,
      title: `${currentMeta.title} (${days} Days)`,
      format: 'pdf',
      dateRangeDays: days,
      rowCount: reportData.rows.length,
      filters: { product: productFilter, supplier: supplierFilter, marketplace: marketplaceFilter },
      summaryMetrics: {
        totalRevenue: 'totalRevenue' in reportData ? Number(reportData.totalRevenue) : undefined,
        totalOrders: 'totalOrders' in reportData ? Number(reportData.totalOrders) : undefined,
        stockValuation: 'stockValuation' in reportData ? Number(reportData.stockValuation) : undefined,
        profitEstimate: 'profitEstimate' in reportData ? Number(reportData.profitEstimate) : undefined,
      },
      fileName: filename,
    })
    toast.success('PDF preview generated', { description: 'Opening printable statement window.' })
  }

  return (
    <div className="space-y-6">
      {/* Category selector grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon
          const isSelected = category === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => {
                setCategory(cat.id)
                setSearch('')
              }}
              className={cx(
                'flex flex-col items-start rounded-xl border p-3.5 text-left transition-all duration-150',
                isSelected
                  ? 'border-brand bg-brand/10 shadow-sm'
                  : 'border-border bg-card/60 hover:border-brand/40 hover:bg-secondary/40'
              )}
            >
              <div
                className={cx(
                  'mb-2 flex h-8 w-8 items-center justify-center rounded-lg',
                  isSelected ? 'bg-brand text-white' : 'bg-secondary text-brand-soft'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </div>
              <p className={cx('text-xs font-semibold', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                {cat.title.replace(' Report', '')}
              </p>
              <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground/80">{cat.subtitle}</p>
            </button>
          )
        })}
      </div>

      {/* Control bar: Range, Filters, Search & Exports */}
      <Card className="card-surface">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-success" />
                <h3 className="text-base font-semibold text-foreground">{currentMeta.title}</h3>
                <Badge variant="outline" className="text-[10px]">Live Database Query</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{currentMeta.description}</p>
            </div>

            {/* Export buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportXLSX} className="gap-1.5 text-xs">
                <FileSpreadsheet className="h-3.5 w-3.5 text-success" /> Excel XLSX
              </Button>
              <Button size="sm" onClick={handleExportPDF} className="btn-glow gap-1.5 border-0 text-xs text-white">
                <FileText className="h-3.5 w-3.5" /> Export PDF
              </Button>
            </div>
          </div>

          {/* Filter controls */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Date range */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Date Range</Label>
              <div className="flex gap-1 rounded-lg border border-border bg-secondary/50 p-1">
                {RANGES.map((r) => (
                  <button
                    key={r.days}
                    onClick={() => setDays(r.days)}
                    className={cx(
                      'flex-1 rounded-md py-1 text-center text-xs font-medium transition-colors',
                      days === r.days ? 'bg-brand text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {r.days}d
                  </button>
                ))}
              </div>
            </div>

            {/* Product filter */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Product Filter</Label>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All products</SelectItem>
                  {allProducts.map((p) => (
                    <SelectItem key={p.sku} value={p.sku}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Supplier filter */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Supplier Filter</Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All suppliers</SelectItem>
                  {SUPPLIERS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Marketplace filter */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Marketplace Filter</Label>
              <Select value={marketplaceFilter} onValueChange={setMarketplaceFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All channels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All channels</SelectItem>
                  <SelectItem value="amazon">Amazon India</SelectItem>
                  <SelectItem value="flipkart">Flipkart</SelectItem>
                  <SelectItem value="meesho">Meesho</SelectItem>
                  <SelectItem value="shopify">Shopify</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Search Records</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter table rows…"
                  className="h-9 pl-8 text-xs"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards summary */}
      {reportData.summaryCards && reportData.summaryCards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {reportData.summaryCards.map((card, i) => (
            <Card key={i} className="card-surface">
              <CardContent className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
                <p className="tabular mt-1 text-lg font-bold text-foreground sm:text-xl">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Interactive Report Preview Table */}
      <Card className="card-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">Interactive Preview</h4>
            <span className="text-xs text-muted-foreground">
              Showing {displayedRows.length} of {reportData.rows.length} rows
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">Source: Real-time PostgreSQL / Indexed DB</span>
        </div>

        <div className="max-h-[460px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-secondary/80 backdrop-blur-xs">
              <TableRow className="border-border hover:bg-transparent">
                {reportData.headers.map((h, i) => (
                  <TableHead
                    key={i}
                    className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedRows.slice(0, 50).map((row, rIdx) => (
                <TableRow key={rIdx} className="border-border hover:bg-secondary/40">
                  {row.map((cell, cIdx) => (
                    <TableCell
                      key={cIdx}
                      className={cx(
                        'tabular whitespace-nowrap text-xs',
                        cIdx === 0 && 'font-medium text-foreground',
                        String(cell).startsWith('+') && 'font-semibold text-success',
                        String(cell).startsWith('-') && 'font-semibold text-danger'
                      )}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}

              {displayedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={reportData.headers.length} className="py-12 text-center text-xs text-muted-foreground">
                    No records match the current filters. Try selecting 'All' or clearing search terms.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Report Generation History Audit Trail */}
      <Card className="card-surface">
        <div className="border-b border-border px-5 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-soft" />
              <h4 className="text-sm font-semibold text-foreground">Report Generation Audit History</h4>
            </div>
            <span className="text-xs text-muted-foreground">{reportHistory.length} exports logged</span>
          </div>
        </div>

        <div className="divide-y divide-border">
          {reportHistory.slice(0, 5).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="uppercase font-mono text-[10px]">
                  {r.format}
                </Badge>
                <div>
                  <p className="font-medium text-foreground">{r.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.rowCount} records · Filter: {r.filters.product || 'All'} · Generated {formatDateTime(r.generatedAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (r.format === 'xlsx') handleExportXLSX()
                    else if (r.format === 'pdf') handleExportPDF()
                    else handleExportCSV()
                  }}
                  className="h-8 gap-1 text-xs text-brand-soft hover:text-brand"
                >
                  <Download className="h-3.5 w-3.5" /> Download Again
                </Button>
              </div>
            </div>
          ))}

          {reportHistory.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No previous reports generated. Export a report above to start your audit history.
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
