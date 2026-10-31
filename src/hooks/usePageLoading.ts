import { useEffect, useState } from 'react'

/** Brief simulated fetch so skeleton loaders are visible, per design spec. */
export function usePageLoading(ms = 450): boolean {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(t)
  }, [ms])
  return loading
}
