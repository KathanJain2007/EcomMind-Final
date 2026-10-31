/**
 * Shared data layer for backend reads.
 *
 * One cache per URL means a metric (wallet balance, agent counts, revenue) is
 * the same value on every page. Writes call `invalidate('wallet', 'analytics')`
 * and every mounted query tagged with those names refetches, so charts and KPI
 * cards refresh after agent calls, product edits and negotiations without
 * polling or fake "live" updates.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError } from '@/lib/api'

export type Tag =
  | 'auth' | 'products' | 'analytics' | 'wallet' | 'agents' | 'activity'
  | 'mandate' | 'suppliers' | 'negotiations' | 'profile' | 'escrow' | 'orders' | 'approvals'

interface Entry {
  data?: unknown
  error?: ApiError
  promise?: Promise<unknown>
  fetchedAt?: number
  tags: Tag[]
}

interface Store {
  cache: Map<string, Entry>
  versions: Record<string, number>
  invalidate: (...tags: Tag[]) => void
  setData: (url: string, data: unknown) => void
  clear: () => void
  subscribe: (fn: () => void) => () => void
}

const DataContext = createContext<Store | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new Map<string, Entry>())
  const [listeners] = useState(() => new Set<() => void>())
  const [versions, setVersions] = useState<Record<string, number>>({})

  const notify = useCallback(() => listeners.forEach((fn) => fn()), [listeners])

  const invalidate = useCallback((...tags: Tag[]) => {
    for (const [url, e] of cache) if (e.tags.some((t) => tags.includes(t))) cache.set(url, { ...e, promise: undefined, fetchedAt: 0 })
    setVersions((v) => {
      const next = { ...v }
      for (const t of tags) next[t] = (next[t] ?? 0) + 1
      return next
    })
  }, [cache])

  const setData = useCallback((url: string, data: unknown) => {
    const e = cache.get(url)
    cache.set(url, { tags: e?.tags ?? [], data, fetchedAt: Date.now() })
    notify()
  }, [cache, notify])

  const clear = useCallback(() => { cache.clear(); setVersions({}); notify() }, [cache, notify])
  const subscribe = useCallback((fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }, [listeners])

  const value = useMemo(() => ({ cache, versions, invalidate, setData, clear, subscribe }), [cache, versions, invalidate, setData, clear, subscribe])
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useDataStore() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useDataStore must be used inside DataProvider')
  return ctx
}

export function buildUrl(path: string, query?: Record<string, string | number | boolean | null | undefined>) {
  if (!query) return path
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const qs = p.toString()
  return qs ? `${path}?${qs}` : path
}

export interface QueryState<T> {
  data: T | undefined
  error: ApiError | undefined
  /** True only while there is nothing to show yet. */
  loading: boolean
  /** True whenever a request is in flight (including background refreshes). */
  fetching: boolean
  reload: () => void
}

const STALE_MS = 30_000

/**
 * Read a backend resource. `url` = null skips the request (e.g. while a
 * dependency isn't ready). Previous data stays visible while a new filter
 * loads, so charts don't flash empty.
 */
export function useApiQuery<T>(url: string | null, tags: Tag[]): QueryState<T> {
  const store = useDataStore()
  const tagKey = tags.join(',')
  const version = tags.reduce((s, t) => s + (store.versions[t] ?? 0), 0)
  const [, force] = useState(0)
  const [fetching, setFetching] = useState(false)
  const lastData = useRef<T | undefined>(undefined)
  const [localReload, setLocalReload] = useState(0)

  useEffect(() => store.subscribe(() => force((n) => n + 1)), [store])

  useEffect(() => {
    if (!url) return
    const entry = store.cache.get(url)
    const fresh = entry?.fetchedAt && Date.now() - entry.fetchedAt < STALE_MS && localReload === 0
    if (fresh && !entry?.error) return
    let cancelled = false
    let promise = entry?.promise as Promise<T> | undefined
    if (!promise) {
      promise = api<T>(url)
      store.cache.set(url, { ...entry, tags: tagKey.split(',') as Tag[], promise })
    }
    setFetching(true)
    promise
      .then((data) => {
        store.cache.set(url, { tags: tagKey.split(',') as Tag[], data, fetchedAt: Date.now() })
      })
      .catch((error: ApiError) => {
        store.cache.set(url, { tags: tagKey.split(',') as Tag[], data: store.cache.get(url)?.data, error, fetchedAt: Date.now() })
      })
      .finally(() => {
        if (!cancelled) { setFetching(false); force((n) => n + 1) }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, version, tagKey, localReload])

  const entry = url ? store.cache.get(url) : undefined
  if (entry?.data !== undefined) lastData.current = entry.data as T
  const data = (entry?.data as T | undefined) ?? lastData.current

  return {
    data,
    error: entry?.error,
    loading: data === undefined && !entry?.error && !!url,
    fetching,
    reload: () => setLocalReload((n) => n + 1),
  }
}
