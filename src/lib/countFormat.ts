export type CountFormat = 'inr' | 'number' | 'percent' | 'decimal'

export function formatCount(v: number, format: CountFormat = 'number', decimals?: number): string {
  switch (format) {
    case 'inr':
      return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR',
        maximumFractionDigits: decimals ?? 0, minimumFractionDigits: decimals ?? 0,
      }).format(v)
    case 'percent':
      return `${v.toFixed(decimals ?? 1)}%`
    case 'decimal':
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals ?? 2, minimumFractionDigits: decimals ?? 2 }).format(v)
    default:
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals ?? 0 }).format(v)
  }
}

