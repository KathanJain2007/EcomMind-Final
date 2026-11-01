/** Rules for a typed wallet top-up. The maximum matches the limit on POST /api/wallet/topups. */

export const TOP_UP_MIN_RUPEES = 1
export const TOP_UP_MAX_RUPEES = 10_00_000

/** Keeps only what a rupee amount can contain, so stray keys never reach the field. */
export function cleanAmountInput(raw: string): string {
  const kept = raw.replace(/[^\d.,]/g, '')
  const firstDot = kept.indexOf('.')
  if (firstDot === -1) return kept
  return kept.slice(0, firstDot + 1) + kept.slice(firstDot + 1).replace(/[.,]/g, '')
}

export type TopUpAmount = { ok: true; paise: number } | { ok: false; message: string }

export function parseTopUpAmount(input: string): TopUpAmount {
  const value = input.replace(/,/g, '').trim()
  if (!value) return { ok: false, message: 'Enter the amount you want to add.' }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(value)) return { ok: false, message: 'Enter a valid amount, like 2500 or 2500.50.' }
  if (/\.\d{3,}$/.test(value)) return { ok: false, message: 'Use at most two decimal places.' }
  const rupees = Number(value)
  if (rupees < TOP_UP_MIN_RUPEES) return { ok: false, message: 'The minimum top-up is ₹1.' }
  if (rupees > TOP_UP_MAX_RUPEES) return { ok: false, message: 'The maximum top-up is ₹10,00,000.' }
  return { ok: true, paise: Math.round(rupees * 100) }
}
