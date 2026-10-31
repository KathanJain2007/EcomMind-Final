import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { AlertTriangle, ArrowRight, Check, Download, FileSpreadsheet, FileWarning, Loader2, Play, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useDataStore, useApiQuery } from '@/store/DataStore'
import { ApiError } from '@/lib/api'
import { summarize, uploadImport, type ImportBatch } from '@/lib/imports'
import { downloadSampleRows } from './importSampleData'
import { cx, downloadCSV, formatDateTime, formatNum } from '@/lib/format'
import { PageHeader, PanelError, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/* ------------------------------------------------------------------ */
/* Files are parsed, validated and stored by the server's import       */
/* service (the same one onboarding uses). This page uploads, shows    */
/* the per-row summary and the import history.                         */
/* ------------------------------------------------------------------ */

type DatasetKey = ImportBatch['dataset']

interface SlotDef {
  key: DatasetKey
  sampleKey: string
  label: string
  desc: string
  cols: string[]
  optional: string[]
}

const SLOTS: SlotDef[] = [
  { key: 'products', sampleKey: 'products', label: 'Products.csv', desc: 'Your catalogue with prices, cost and stock. Updates existing SKUs.', cols: ['sku', 'name', 'price', 'cost', 'stock'], optional: ['category', 'avg_daily_sales'] },
  { key: 'sales', sampleKey: 'sales', label: 'Sales_History.csv', desc: 'Daily units sold per SKU. Feeds analytics and forecasts.', cols: ['date', 'sku', 'units'], optional: ['orders', 'revenue'] },
  { key: 'returns', sampleKey: 'returns', label: 'Returns_By_Pincode.csv', desc: 'Orders and returns per pincode. Feeds return risk.', cols: ['pincode', 'sku', 'orders', 'returns'], optional: ['city'] },
  { key: 'supplier_quotes', sampleKey: 'suppliers', label: 'Supplier_Quotes.csv', desc: 'Your suppliers’ unit prices. Used for supplier recommendations.', cols: ['supplier', 'sku', 'unit_price', 'delivery_days'], optional: ['moq', 'available_qty', 'valid_until'] },
  { key: 'logistics', sampleKey: 'logistics', label: 'Logistics_Quotes.csv', desc: 'Courier costs and delivery times.', cols: ['courier', 'cost_per_500g', 'eta_days'], optional: ['service', 'rating', 'cod'] },
  { key: 'mandate', sampleKey: 'mandate', label: 'Seller_Mandate.csv', desc: 'Your autonomous spending limits (₹).', cols: ['daily_budget', 'max_order_value', 'max_per_call_cost'], optional: [] },
]

export default function ImportData() {
  const store = useDataStore()
  const navigate = useNavigate()
  const historyQ = useApiQuery<{ batches: ImportBatch[] }>('/api/imports?limit=100', ['products'])
  const history = useMemo(() => historyQ.data?.batches ?? [], [historyQ.data])
  const [target, setTarget] = useState<DatasetKey>('products')
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ImportBatch[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const lastBy = useMemo(() => {
    const m: Partial<Record<DatasetKey, ImportBatch>> = {}
    for (const b of history) if (b.status === 'completed' && !m[b.dataset]) m[b.dataset] = b
    return m
  }, [history])
  const importedCount = SLOTS.filter((s) => lastBy[s.key]).length

  const afterImport = (batches: ImportBatch[]) => {
    setResults((prev) => [...batches, ...prev].slice(0, 12))
    store.invalidate('products', 'analytics', 'orders', 'mandate', 'suppliers', 'activity')
    historyQ.reload()
    for (const b of batches) {
      const fn = b.duplicate ? toast.info : b.status === 'failed' ? toast.error : b.failed ? toast.warning : toast.success
      fn(b.duplicate ? 'Already imported' : b.status === 'failed' ? `${b.datasetLabel}: nothing imported` : `${b.datasetLabel} imported`, {
        description: b.status === 'failed' ? (b.errors[0]?.message ?? 'No valid rows.') : summarize(b),
      })
    }
  }

  const handleFiles = async (files: FileList | File[]) => {
    if (busy) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} exceeds the 10 MB limit`); continue }
        const lower = file.name.toLowerCase()
        if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx')) { toast.error(`${file.name}: upload CSV or XLSX files only`); continue }
        try {
          afterImport(await uploadImport(file, { dataset: target }))
        } catch (e) {
          toast.error(`${file.name} wasn’t imported`, { description: e instanceof ApiError ? e.message : undefined })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
  }

  const sampleFile = (s: SlotDef) => {
    const rows = downloadSampleRows(s.sampleKey)
    const cols = Object.keys(rows[0] ?? {})
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const text = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(String(r[c] ?? ''))).join(','))].join('\n')
    return new File([text], s.label, { type: 'text/csv' })
  }

  const loadSamples = async () => {
    // Real imports of the sample files, through the same service as any upload.
    await handleFiles(SLOTS.map(sampleFile))
  }

  return (
    <div>
      <PageHeader
        title="Import Business Data"
        subtitle="Upload CSV or Excel files. The server validates every row, saves the valid ones to your account and tells you exactly what was skipped."
        actions={
          <Button variant="outline" size="sm" onClick={loadSamples} disabled={busy}>
            <Play className="h-3.5 w-3.5" aria-hidden /> Import sample data for all
          </Button>
        }
      />
      {historyQ.error && <div className="mb-4"><PanelError message={historyQ.error.message} onRetry={historyQ.reload} /></div>}

      {/* Dataset slots: last stored import for each */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SLOTS.map((s) => {
          const last = lastBy[s.key]
          return (
            <button
              key={s.key}
              onClick={() => setTarget(s.key)}
              className={cx('rounded-xl border p-4 text-left transition-all', target === s.key ? 'border-brand/60 bg-brand/8' : 'border-border bg-card hover:border-brand/30')}
              aria-pressed={target === s.key}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className={cx('h-4.5 w-4.5', last ? 'text-success' : 'text-muted-foreground')} aria-hidden />
                  <span className="text-sm font-medium">{s.label}</span>
                </div>
                {last ? <StatusBadge label={`${formatNum(last.imported)} rows saved`} tone="success" /> : <StatusBadge label={s.key === 'products' ? 'Start here' : 'Optional'} tone="neutral" />}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{s.desc}</p>
              <p className="mt-2 font-mono text-[10px] text-muted-foreground/70">{s.cols.join(' · ')}{s.optional.length ? ` · (${s.optional.join(', ')})` : ''}</p>
              {last && <p className="mt-1.5 text-[11px] text-muted-foreground">Last import {formatDateTime(last.createdAt)} · {last.fileName}</p>}
            </button>
          )
        })}
      </div>

      {/* Upload zone */}
      <Card className="card-surface mb-5">
        <CardContent className="p-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cx('flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors', dragOver ? 'border-brand bg-brand/10' : 'border-border bg-secondary/30')}
          >
            {busy ? <Loader2 className="mb-3 h-7 w-7 animate-spin text-brand-soft" aria-hidden /> : <Upload className="mb-3 h-7 w-7 text-muted-foreground" aria-hidden />}
            <p className="text-sm font-medium">{busy ? 'Importing…' : 'Drag & drop files here'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Uploading to: <span className="font-medium text-brand-soft">{SLOTS.find((s) => s.key === target)?.label}</span> — filenames auto-match the right dataset.
              One XLSX workbook with sheets named Products, Sales, Returns, Supplier Quotes, Logistics or Mandate works too.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">CSV or XLSX · max 10 MB per file · re-uploading the same file changes nothing</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" className="btn-glow border-0 text-white" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload className="h-3.5 w-3.5" aria-hidden /> Browse files
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => {
                  const s = SLOTS.find((x) => x.key === target)!
                  const rows = downloadSampleRows(s.sampleKey)
                  const cols = Object.keys(rows[0] ?? {})
                  downloadCSV(`sample_${s.label}`, cols, rows.map((r) => cols.map((c) => r[c] ?? '')))
                  toast.success(`Sample ${s.label} downloaded`)
                }}
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> Download sample
              </Button>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx" multiple className="sr-only" aria-label="Upload data files" onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = '' }} />
          </div>
        </CardContent>
      </Card>

      {/* Results of this session's uploads */}
      {results.length > 0 && (
        <Card className="card-surface mb-5">
          <CardContent className="p-0">
            <div className="border-b border-border px-5 py-3.5"><h2 className="text-sm font-semibold">Import results</h2></div>
            <ul className="divide-y divide-border">
              {results.map((b) => (
                <li key={`${b.id}-${b.duplicate}`} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {b.status === 'failed' ? <FileWarning className="h-4 w-4 text-danger" aria-hidden /> : b.failed ? <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> : <Check className="h-4 w-4 text-success" aria-hidden />}
                      <span className="text-sm font-medium">{b.fileName}{b.sheet ? ` · ${b.sheet}` : ''}</span>
                      <span className="text-xs text-muted-foreground">→ {b.datasetLabel}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {b.duplicate ? <StatusBadge label="Already imported" tone="neutral" /> : (
                        <>
                          <StatusBadge label={`${b.created} new`} tone="success" />
                          <StatusBadge label={`${b.updated} updated`} tone="info" />
                          {b.unchanged > 0 && <StatusBadge label={`${b.unchanged} unchanged`} tone="neutral" />}
                          {b.failed > 0 && <StatusBadge label={`${b.failed} skipped`} tone="danger" />}
                        </>
                      )}
                    </div>
                  </div>
                  {b.errors.length > 0 && !b.duplicate && (
                    <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-2.5">
                      {b.errors.map((e, i) => <li key={i} className="text-[11px] text-danger">{e.row ? `Row ${e.row}: ` : ''}{e.message}</li>)}
                      {b.failed > b.errors.length && <li className="text-[11px] text-muted-foreground">…and {b.failed - b.errors.length} more</li>}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card className="card-surface mb-5">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold">Import history</h2>
            <span className="text-xs text-muted-foreground">Stored with your account</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {['When', 'File', 'Dataset', 'From', 'Rows', 'New', 'Updated', 'Skipped', 'Status'].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((b) => (
                  <TableRow key={b.id} className="border-border">
                    <TableCell className="tabular whitespace-nowrap text-muted-foreground">{formatDateTime(b.createdAt)}</TableCell>
                    <TableCell className="max-w-56 truncate">{b.fileName}{b.sheet ? ` · ${b.sheet}` : ''}</TableCell>
                    <TableCell className="whitespace-nowrap">{b.datasetLabel}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{b.source === 'onboarding' ? 'Onboarding' : 'Import page'}</TableCell>
                    <TableCell className="tabular">{formatNum(b.rowsTotal)}</TableCell>
                    <TableCell className="tabular text-success">{formatNum(b.created)}</TableCell>
                    <TableCell className="tabular">{formatNum(b.updated)}</TableCell>
                    <TableCell className={cx('tabular', b.failed ? 'text-danger' : 'text-muted-foreground')}>{formatNum(b.failed)}</TableCell>
                    <TableCell><StatusBadge label={b.status === 'completed' ? 'Saved' : 'Nothing saved'} tone={b.status === 'completed' ? (b.failed ? 'warning' : 'success') : 'danger'} /></TableCell>
                  </TableRow>
                ))}
                {historyQ.data && history.length === 0 && (
                  <TableRow className="hover:bg-transparent"><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No imports yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className={cx('card-surface overflow-hidden', lastBy.products && 'border-success/40')}>
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
          <div className="flex flex-1 items-center gap-4">
            <div className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', lastBy.products ? 'bg-success/15 text-success' : 'bg-secondary text-muted-foreground')}>
              <Check className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold">{importedCount} of {SLOTS.length} datasets imported</h2>
              <p className="text-xs text-muted-foreground">Analytics, inventory, return risk and supplier recommendations read your imported data straight away.</p>
            </div>
          </div>
          <Button className="btn-glow border-0 text-white" onClick={() => navigate('/')}>
            Open my dashboard <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
