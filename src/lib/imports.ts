import { ApiError } from '@/lib/api'

/** One imported dataset (a CSV file or one sheet of a workbook), as stored on the server. */
export interface ImportBatch {
  id: string
  dataset: 'products' | 'sales' | 'returns' | 'supplier_quotes' | 'logistics' | 'mandate'
  datasetLabel: string
  fileName: string
  sheet: string | null
  source: 'import_page' | 'onboarding'
  status: 'completed' | 'failed'
  rowsTotal: number
  created: number
  updated: number
  unchanged: number
  failed: number
  imported: number
  errors: { row: number | null; message: string }[]
  createdAt: string
  duplicate: boolean
}

/**
 * Upload a CSV or XLSX file to the import service. The Import Data page and
 * onboarding both use this, so there is one import pipeline: the server parses,
 * validates and stores the rows and returns a summary per dataset.
 */
export async function uploadImport(file: File, opts: { dataset?: string; source?: 'import_page' | 'onboarding' } = {}): Promise<ImportBatch[]> {
  const form = new FormData()
  form.append('file', file)
  if (opts.dataset) form.append('dataset', opts.dataset)
  form.append('source', opts.source ?? 'import_page')
  let res: Response
  try {
    res = await fetch('/api/imports', { method: 'POST', body: form, credentials: 'same-origin', headers: { Accept: 'application/json' } })
  } catch {
    throw new ApiError(0, 'network_error', 'Can’t reach the EcomMind server. Check that the backend is running and try again.')
  }
  const data = await res.json().catch(() => undefined) as { batches?: ImportBatch[]; error?: { code?: string; message?: string } } | undefined
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('ecommind:unauthorized'))
    throw new ApiError(res.status, data?.error?.code ?? 'http_error', data?.error?.message ?? (res.status === 413 ? 'Files can be at most 10 MB.' : 'Import failed.'))
  }
  return data?.batches ?? []
}

export function summarize(b: ImportBatch): string {
  if (b.duplicate) return `${b.fileName} was already imported on ${new Date(b.createdAt).toLocaleString('en-IN')}; nothing changed.`
  const parts = [`${b.created} new`, `${b.updated} updated`]
  if (b.unchanged) parts.push(`${b.unchanged} unchanged`)
  if (b.failed) parts.push(`${b.failed} skipped`)
  return `${b.datasetLabel}: ${parts.join(', ')} of ${b.rowsTotal} rows.`
}
