import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, MapPin } from 'lucide-react'
import { cityLabel, searchCities } from '@/data/indianCities'
import { api, ApiError } from '@/lib/api'
import { cx } from '@/lib/format'
import type { PlaceValue } from '@/lib/place'

/**
 * Business Location field with Google Places autocomplete, proxied through
 * /api/places so the API key stays on the server.
 *
 * - 300 ms debounce, stale requests aborted, so typing fast sends one request.
 * - Arrow keys / Enter / Escape and mouse selection (WAI-ARIA combobox).
 * - Selecting a suggestion fetches its details (address, lat/lng, city,
 *   state, country, place id).
 * - If location search isn't configured, or `cityListOnly` is set (the server's
 *   places API needs a session, so sign-up can't call it), it suggests from a
 *   built-in city list. Typing a town that isn't listed is fine too: it's saved
 *   as "unverified", unless the server says verification is required.
 */

interface Suggestion { placeId: string; primary: string; secondary: string; description: string }
interface Details { placeId: string; formattedAddress: string; lat: number | null; lng: number | null; city: string | null; state: string | null; country: string | null }
interface PlacesConfig { enabled: boolean; verificationRequired: boolean }

const DEBOUNCE_MS = 300

const newSessionToken = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function LocationAutocomplete({
  id, value, onChange, error, placeholder = 'Start typing your city or area', cityListOnly = false,
}: {
  id: string
  value: PlaceValue
  onChange: (v: PlaceValue) => void
  error?: string
  placeholder?: string
  cityListOnly?: boolean
}) {
  const listId = useId()
  const [config, setConfig] = useState<PlacesConfig | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(-1)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [searched, setSearched] = useState('')
  const session = useRef<string>(newSessionToken())
  const abort = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const skipNext = useRef(false)

  useEffect(() => {
    if (cityListOnly) { setConfig({ enabled: false, verificationRequired: false }); return }
    api<PlacesConfig>('/api/places/config').then(setConfig).catch(() => setConfig({ enabled: false, verificationRequired: false }))
  }, [cityListOnly])

  const enabled = !!config?.enabled
  const query = value.text
  const useCityList = !!config && !enabled && !config.verificationRequired
  const cityMatches = useMemo(() => (useCityList && !value.city ? searchCities(query) : []), [useCityList, value.city, query])
  const items: Suggestion[] = useCityList
    ? cityMatches.map((c) => ({ placeId: `${c.name}|${c.state}`, primary: c.name, secondary: c.state, description: cityLabel(c) }))
    : suggestions

  useEffect(() => {
    if (useCityList) setActive(cityMatches.length ? 0 : -1)
  }, [useCityList, cityMatches])

  useEffect(() => {
    if (!enabled) return
    if (skipNext.current) { skipNext.current = false; return }
    clearTimeout(timer.current)
    abort.current?.abort()
    const q = query.trim()
    if (q.length < 2 || value.verified) { setSuggestions([]); setLoading(false); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      const ctrl = new AbortController()
      abort.current = ctrl
      try {
        const res = await api<{ suggestions: Suggestion[] }>('/api/places/autocomplete', {
          query: { q, sessionToken: session.current }, signal: ctrl.signal,
        })
        setSuggestions(res.suggestions)
        setActive(res.suggestions.length ? 0 : -1)
        setProviderError(null)
        setSearched(q)
        setOpen(true)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setSuggestions([])
        setProviderError(e instanceof ApiError ? e.message : 'Location search is unavailable right now.')
        setOpen(true)
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer.current)
  }, [query, enabled, value.verified])

  useEffect(() => () => { abort.current?.abort(); clearTimeout(timer.current) }, [])

  const select = async (s: Suggestion) => {
    setOpen(false)
    if (useCityList) {
      onChange({ text: s.description, placeId: null, sessionToken: null, city: s.primary, state: s.secondary, country: 'India', verified: false })
      return
    }
    setSuggestions([])
    skipNext.current = true
    setResolving(true)
    const token = session.current
    try {
      const d = await api<Details>(`/api/places/details/${encodeURIComponent(s.placeId)}`, { query: { sessionToken: token } })
      onChange({ text: d.formattedAddress || s.description, placeId: d.placeId, sessionToken: token, formattedAddress: d.formattedAddress,
        lat: d.lat, lng: d.lng, city: d.city, state: d.state, country: d.country, verified: true })
    } catch {
      // Keep the chosen suggestion; the server re-checks the place id on save.
      onChange({ text: s.description, placeId: s.placeId, sessionToken: token, verified: true })
    } finally {
      setResolving(false)
      session.current = newSessionToken() // a selection ends the billing session
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) {
      if (e.key === 'ArrowDown' && items.length) { setOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % items.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)) }
    else if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); void select(items[active]) } }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  const status = useMemo(() => {
    if (resolving) return { tone: 'muted', text: 'Confirming location…' }
    if (value.verified && value.placeId) return { tone: 'ok', text: [value.city, value.state, value.country].filter(Boolean).join(', ') || 'Location confirmed' }
    if (config && !enabled && config.verificationRequired) return { tone: 'muted', text: 'Location search is unavailable, and this server requires a verified location.' }
    if (config && !enabled) return value.city ? null : { tone: 'muted', text: 'Type a letter to see cities, or enter your town if it isn’t listed.' }
    if (providerError && value.text.trim().length >= 2) return { tone: 'warn', text: config?.verificationRequired ? providerError : `${providerError} You can continue; this location will be saved as unverified.` }
    if (value.text.trim().length >= 2 && !value.verified && enabled) return { tone: 'muted', text: 'Pick a suggestion to confirm your location.' }
    return null
  }, [resolving, value, config, enabled, providerError])

  const showList = useCityList
    ? open && cityMatches.length > 0
    : open && enabled && value.text.trim().length >= 2 && !value.verified

  return (
    <div className="relative">
      <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={!!error}
        aria-describedby={`${id}-status`}
        autoComplete="off"
        placeholder={placeholder}
        value={value.text}
        onChange={(e) => {
          onChange({ text: e.target.value, placeId: null, sessionToken: null, verified: false })
          setOpen(true)
        }}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        className={cx(
          'h-10 w-full rounded-lg border bg-card pl-9 pr-9 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          error ? 'border-danger' : 'border-input',
        )}
      />
      <span className="absolute right-3 top-3" aria-hidden>
        {loading || resolving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          : value.verified && value.placeId ? <CheckCircle2 className="h-4 w-4 text-success" /> : null}
      </span>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-xl"
        >
          {!useCityList && loading && suggestions.length === 0 && <li className="px-3 py-2.5 text-xs text-muted-foreground">Searching…</li>}
          {!loading && providerError && <li className="flex items-center gap-2 px-3 py-2.5 text-xs text-warning"><AlertCircle className="h-3.5 w-3.5" aria-hidden />{providerError}</li>}
          {!loading && !providerError && suggestions.length === 0 && searched && (
            <li className="px-3 py-2.5 text-xs text-muted-foreground">No places match “{searched}”. Try a nearby city or area name.</li>
          )}
          {items.map((s, i) => (
            <li
              key={s.placeId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); void select(s) }}
              onMouseEnter={() => setActive(i)}
              className={cx('cursor-pointer px-3 py-2 text-sm', i === active ? 'bg-secondary' : 'hover:bg-secondary/60')}
            >
              <span className="font-medium">{s.primary}</span>
              {s.secondary && <span className="block truncate text-xs text-muted-foreground">{s.secondary}</span>}
            </li>
          ))}
          {!useCityList && suggestions.length > 0 && <li className="px-3 pt-1.5 text-right text-[10px] text-muted-foreground/70">Powered by Google</li>}
        </ul>
      )}

      <p id={`${id}-status`} className={cx('mt-1 text-xs', error ? 'text-danger' : status?.tone === 'ok' ? 'text-success' : status?.tone === 'warn' ? 'text-warning' : 'text-muted-foreground')}>
        {error ?? status?.text ?? ''}
      </p>
    </div>
  )
}
