import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { BrainCircuit, Check, Download, FileSpreadsheet, FileWarning, Loader2, Play, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { PRODUCTS } from '@/data/demo'
import { downloadSampleRows } from './importSampleData'
import { cx, downloadCSV, formatNum } from '@/lib/format'
import { PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/* ------------------------------------------------------------------ */

interface SlotDef {
  key: string
  label: string
  desc: string
  match: string[]
  cols: string[]
  numeric: string[]
  positive?: string[]
  date?: string[]
  skuCols?: string[]
}

const SLOTS: SlotDef[] = [
  { key: 'products', label: 'Products.csv', desc: 'Your catalogue with prices, cost and stock.', match: ['product'], cols: ['sku', 'name', 'category', 'price', 'cost', 'stock', 'avg_daily_sales'], numeric: ['price', 'cost', 'stock', 'avg_daily_sales'], positive: ['price'] },
  { key: 'sales', label: 'Sales_History.csv', desc: 'Daily units sold per SKU.', match: ['sales'], cols: ['date', 'sku', 'units'], numeric: ['units'], date: ['date'], skuCols: ['sku'] },
  { key: 'returns', label: 'Returns_By_Pincode.csv', desc: 'Orders and returns per pincode.', match: ['return'], cols: ['pincode', 'sku', 'orders', 'returns'], numeric: ['orders', 'returns'], skuCols: ['sku'] },
  { key: 'suppliers', label: 'Supplier_Quotes.csv', desc: 'Supplier agents and unit prices.', match: ['supplier'], cols: ['supplier', 'sku', 'unit_price', 'delivery_days'], numeric: ['unit_price', 'delivery_days'], positive: ['unit_price'], skuCols: ['sku'] },
  { key: 'logistics', label: 'Logistics_Quotes.csv', desc: 'Courier costs and delivery times.', match: ['logistic'], cols: ['courier', 'cost_per_500g', 'eta_days'], numeric: ['cost_per_500g', 'eta_days'], positive: ['cost_per_500g'] },
  { key: 'mandate', label: 'Seller_Mandate.csv', desc: 'Your autonomous spending limits.', match: ['mandate'], cols: ['daily_budget', 'max_order_value', 'max_per_call_cost'], numeric: ['daily_budget', 'max_order_value', 'max_per_call_cost'], positive: ['daily_budget'] },
]

interface SlotState {
  status: 'empty' | 'valid' | 'error'
  fileName?: string
  rows: Record<string, string>[]
  errors: string[]
}

const emptySlot = (): SlotState => ({ status: 'empty', rows: [], errors: [] })

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return []
  const split = (line: string) => {
    const out: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
      else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }
  const headers = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).map((line) => {
    const vals = split(line)
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

function validate(slot: SlotDef, rows: Record<string, string>[], knownSkus: Set<string>): string[] {
  const errors: string[] = []
  if (rows.length === 0) { errors.push('File contains no data rows.'); return errors }
  const cols = Object.keys(rows[0])
  const missing = slot.cols.filter((c) => !cols.includes(c))
  if (missing.length) errors.push(`Missing required columns: ${missing.join(', ')}`)
  rows.forEach((row, i) => {
    const rn = i + 2 // account for header
    for (const c of slot.cols) {
      if (cols.includes(c) && (row[c] ?? '') === '') errors.push(`Row ${rn}: missing value in "${c}"`)
    }
    for (const c of slot.numeric) {
      const v = Number(row[c])
      if (row[c] !== undefined && row[c] !== '' && !Number.isFinite(v)) errors.push(`Row ${rn}: "${c}" must be a number (got "${row[c]}")`)
      else if (slot.positive?.includes(c) && v <= 0) errors.push(`Row ${rn}: invalid ${c.replace('_', ' ')} — must be greater than 0`)
    }
    for (const c of slot.date ?? []) {
      if (row[c] && Number.isNaN(Date.parse(row[c]))) errors.push(`Row ${rn}: invalid date "${row[c]}"`)
    }
    for (const c of slot.skuCols ?? []) {
      if (row[c] && knownSkus.size > 0 && !knownSkus.has(row[c])) errors.push(`Row ${rn}: unknown product SKU "${row[c]}"`)
    }
  })
  return errors.slice(0, 8)
}

const ANALYSIS_STEPS = [
  'Validating imported datasets',
  'Discovering agents on the network',
  'Running demand forecasting',
  'Checking market prices',
  'Scoring return risk',
  'Analysing logistics options',
  'Making autonomous decisions',
  'Preparing recommendations',
]

export default function ImportData() {
  const { markDatasetImported, setAnalysisRun, resetImported } = useApp()
  const [slots, setSlots] = useState<Record<string, SlotState>>(() => Object.fromEntries(SLOTS.map((s) => [s.key, emptySlot()])))
  const [target, setTarget] = useState<string>('products')
  const [preview, setPreview] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [stepIdx, setStepIdx] = useState(-1)
  const fileRef = useRef<HTMLInputElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const navigate = useNavigate()

  const validCount = SLOTS.filter((s) => slots[s.key].status === 'valid').length
  const allValid = validCount === SLOTS.length
  const totalRows = SLOTS.reduce((sum, s) => sum + slots[s.key].rows.length, 0)

  const knownSkus = useMemo(() => {
    const p = slots.products
    if (p.status === 'valid' && p.rows.length) return new Set(p.rows.map((r) => r.sku))
    return new Set(PRODUCTS.map((x) => x.sku))
  }, [slots.products])

  const applyRows = (slotKey: string, fileName: string, rows: Record<string, string>[]) => {
    const slot = SLOTS.find((s) => s.key === slotKey)!
    const errors = validate(slot, rows, slotKey === 'products' ? new Set() : knownSkus)
    setSlots((prev) => ({ ...prev, [slotKey]: { status: errors.length ? 'error' : 'valid', fileName, rows, errors } }))
    if (errors.length) {
      toast.error(`${slot.label}: ${errors.length} validation issue${errors.length > 1 ? 's' : ''}`, { description: errors[0] })
    } else {
      markDatasetImported(slotKey)
      setPreview(slotKey)
      toast.success(`${slot.label} imported`, { description: `${formatNum(rows.length)} records validated.` })
    }
  }

  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} exceeds the 10 MB limit`); continue }
      const name = file.name.toLowerCase()
      try {
        if (name.endsWith('.xlsx')) {
          const XLSX = await import('xlsx')
          const wb = XLSX.read(await file.arrayBuffer())
          let matched = 0
          for (const sheetName of wb.SheetNames) {
            const slot = SLOTS.find((s) => s.match.some((m) => sheetName.toLowerCase().includes(m)))
            if (!slot) continue
            const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: '' })
            const rows = raw.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), String(v)])))
            applyRows(slot.key, file.name, rows)
            matched++
          }
          if (!matched) toast.warning(`No sheets in ${file.name} matched a required dataset`, { description: 'Sheet names should contain: products, sales, returns, supplier, logistics, mandate.' })
        } else if (name.endsWith('.csv')) {
          const text = await file.text()
          const slot = SLOTS.find((s) => s.match.some((m) => name.includes(m))) ?? SLOTS.find((s) => s.key === target)!
          applyRows(slot.key, file.name, parseCSV(text))
        } else {
          toast.error(`${file.name}: unsupported format`, { description: 'Upload CSV or XLSX files only.' })
        }
      } catch {
        toast.error(`Could not read ${file.name}`)
      }
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
  }

  const loadSamples = () => {
    resetImported()
    for (const slot of SLOTS) {
      const rows = downloadSampleRows(slot.key)
      setSlots((prev) => ({ ...prev, [slot.key]: { status: 'valid', fileName: `${slot.label} (sample)`, rows, errors: [] } }))
      markDatasetImported(slot.key)
    }
    setPreview('products')
    toast.success('Sample datasets loaded', { description: 'All 6 datasets are valid and ready for analysis.' })
  }

  const runAnalysis = () => {
    setAnalysing(true)
    setStepIdx(0)
    ANALYSIS_STEPS.forEach((_, i) => timers.current.push(setTimeout(() => setStepIdx(i), i * 550)))
    timers.current.push(setTimeout(() => {
      setAnalysing(false)
      setAnalysisRun()
      toast.success('Analysis complete', { description: 'EcomMind has prepared your recommendations on the dashboard.' })
      navigate('/')
    }, ANALYSIS_STEPS.length * 550 + 500))
  }

  const previewSlot = preview ? SLOTS.find((s) => s.key === preview)! : null
  const previewRows = preview ? slots[preview].rows.slice(0, 6) : []

  return (
    <div>
      <PageHeader
        title="Import Business Data"
        subtitle="Upload your files once — EcomMind validates everything before agents touch it."
        actions={
          <Button variant="outline" size="sm" onClick={loadSamples}>
            <Play className="h-3.5 w-3.5" aria-hidden /> Use sample data for all
          </Button>
        }
      />

      {/* Dataset slots */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SLOTS.map((s) => {
          const st = slots[s.key]
          return (
            <button
              key={s.key}
              onClick={() => { setTarget(s.key); if (st.rows.length) setPreview(s.key) }}
              className={cx(
                'rounded-xl border p-4 text-left transition-all',
                target === s.key ? 'border-brand/60 bg-brand/8' : 'border-border bg-card hover:border-brand/30',
              )}
              aria-pressed={target === s.key}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {st.status === 'valid'
                    ? <FileSpreadsheet className="h-4.5 w-4.5 text-success" aria-hidden />
                    : st.status === 'error'
                      ? <FileWarning className="h-4.5 w-4.5 text-danger" aria-hidden />
                      : <FileSpreadsheet className="h-4.5 w-4.5 text-muted-foreground" aria-hidden />}
                  <span className="text-sm font-medium">{s.label}</span>
                </div>
                {st.status === 'valid' && <StatusBadge label={`${formatNum(st.rows.length)} rows`} tone="success" />}
                {st.status === 'error' && <StatusBadge label={`${st.errors.length} issues`} tone="danger" />}
                {st.status === 'empty' && <StatusBadge label="Required" tone="neutral" />}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{s.desc}</p>
              <p className="mt-2 font-mono text-[10px] text-muted-foreground/70">{s.cols.join(' · ')}</p>
              {st.status === 'error' && (
                <ul className="mt-2 space-y-0.5">
                  {st.errors.slice(0, 3).map((e) => <li key={e} className="text-[11px] text-danger">{e}</li>)}
                </ul>
              )}
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
            className={cx(
              'flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors',
              dragOver ? 'border-brand bg-brand/10' : 'border-border bg-secondary/30',
            )}
          >
            <Upload className="mb-3 h-7 w-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Drag & drop files here</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Uploading to: <span className="font-medium text-brand-soft">{SLOTS.find((s) => s.key === target)?.label}</span> — filenames auto-match the right dataset.
              One XLSX workbook with matching sheet names works too.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">CSV or XLSX · max 10 MB per file</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" className="btn-glow border-0 text-white" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" aria-hidden /> Browse files
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => {
                  const s = SLOTS.find((x) => x.key === target)!
                  const rows = downloadSampleRows(s.key)
                  downloadCSV(`sample_${s.label}`, s.cols, rows.map((r) => s.cols.map((c) => r[c] ?? '')))
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

      {/* Preview */}
      {previewSlot && slots[previewSlot.key].rows.length > 0 && (
        <Card className="card-surface mb-5">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Preview — {previewSlot.label}</h2>
              <div className="flex items-center gap-2">
                <StatusBadge label={slots[previewSlot.key].status === 'valid' ? 'Valid' : 'Has issues'} tone={slots[previewSlot.key].status === 'valid' ? 'success' : 'danger'} />
                <button onClick={() => setPreview(null)} className="text-muted-foreground hover:text-foreground" aria-label="Close preview"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    {previewSlot.cols.map((c) => <TableHead key={c} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{c.replaceAll('_', ' ')}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i} className="border-border">
                      {previewSlot.cols.map((c) => <TableCell key={c} className="tabular whitespace-nowrap text-muted-foreground">{row[c] ?? '—'}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="px-5 py-3 text-xs text-muted-foreground">Showing {previewRows.length} of {formatNum(slots[previewSlot.key].rows.length)} records.</p>
          </CardContent>
        </Card>
      )}

      {/* Analysis CTA */}
      <Card className={cx('card-surface overflow-hidden', allValid && 'border-success/40')}>
        {allValid && <div className="h-0.5 w-full bg-gradient-to-r from-success via-brand to-brand-soft" aria-hidden />}
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-4">
              <div className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', allValid ? 'bg-success/15 text-success' : 'bg-secondary text-muted-foreground')}>
                {allValid ? <Check className="h-5.5 w-5.5" aria-hidden /> : <BrainCircuit className="h-5.5 w-5.5" aria-hidden />}
              </div>
              <div>
                <h2 className="text-base font-semibold">{allValid ? 'Your business data is ready.' : `${validCount} of ${SLOTS.length} datasets imported`}</h2>
                <p className="text-xs text-muted-foreground">
                  {allValid ? `${formatNum(totalRows)} records validated across all datasets.` : 'Import all six datasets to unlock the full EcomMind analysis.'}
                </p>
              </div>
            </div>
            <Button className="btn-glow border-0 text-white" disabled={!allValid || analysing} onClick={runAnalysis}>
              {analysing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BrainCircuit className="h-4 w-4" aria-hidden />}
              {analysing ? 'Analysing…' : 'Analyze My Business with EcomMind'}
            </Button>
          </div>

          {analysing && (
            <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ANALYSIS_STEPS.map((s, i) => (
                <li key={s} className={cx(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
                  i < stepIdx ? 'border-success/30 bg-success/8 text-success' : i === stepIdx ? 'border-brand/40 bg-brand/10 text-brand-soft' : 'border-border text-muted-foreground',
                )}>
                  {i < stepIdx ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : i === stepIdx ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" aria-hidden />}
                  {s}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
