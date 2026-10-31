/**
 * GSTIN format validation — rule-for-rule the same as
 * backend/app/validation/gstin.py. Checks structure, state code, PAN, holder
 * type, entity code, the default "Z" and the Luhn mod-36 check character.
 *
 * A pass means the number is WELL FORMED only. It doesn't prove the GSTIN is
 * registered or active; that needs the GST portal or an authorised GSP.
 */

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const STATE_CODES = new Set([...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')), '97', '99'])
const PAN_HOLDER_TYPES = new Set('PCHFATBLJG'.split(''))
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export const GSTIN_MESSAGES = {
  gstin_required: 'Enter your 15-character GSTIN.',
  gstin_length: 'GSTIN must be exactly 15 characters.',
  gstin_characters: 'GSTIN can contain only letters A-Z and digits 0-9.',
  gstin_state_code: 'The first two digits must be a valid GST state code (01-38, 97 or 99).',
  gstin_pan: 'Characters 3-12 must be a valid PAN (5 letters, 4 digits, 1 letter).',
  gstin_pan_type: 'The 6th character must be a valid PAN holder type (P, C, H, F, A, T, B, L, J or G).',
  gstin_entity_code: 'The 13th character must be 1-9 or A-Z.',
  gstin_default_char: 'The 14th character must be Z.',
  gstin_checksum: 'The last character doesn’t match the GSTIN check digit. Please re-check the number.',
} as const

export type GstinErrorCode = keyof typeof GSTIN_MESSAGES
export type GstinCheck = { ok: true; gstin: string } | { ok: false; code: GstinErrorCode; message: string }

export function normalizeGstin(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

export function gstinChecksum(first14: string): string {
  let total = 0
  for (let i = 0; i < first14.length; i++) {
    const product = CHARSET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2)
    total += Math.floor(product / 36) + (product % 36)
  }
  return CHARSET[(36 - (total % 36)) % 36]
}

const fail = (code: GstinErrorCode): GstinCheck => ({ ok: false, code, message: GSTIN_MESSAGES[code] })

export function validateGstin(raw: string): GstinCheck {
  const v = normalizeGstin(raw)
  if (!v) return fail('gstin_required')
  if (v.length !== 15) return fail('gstin_length')
  if ([...v].some((ch) => !CHARSET.includes(ch))) return fail('gstin_characters')
  if (!STATE_CODES.has(v.slice(0, 2))) return fail('gstin_state_code')
  const pan = v.slice(2, 12)
  if (!PAN_RE.test(pan)) return fail('gstin_pan')
  if (!PAN_HOLDER_TYPES.has(pan[3])) return fail('gstin_pan_type')
  if (v[12] === '0') return fail('gstin_entity_code')
  if (v[13] !== 'Z') return fail('gstin_default_char')
  if (gstinChecksum(v.slice(0, 14)) !== v[14]) return fail('gstin_checksum')
  return { ok: true, gstin: v }
}

/**
 * Live feedback while typing: stay quiet until the value is complete enough to
 * judge, but flag characters that can never be valid straight away.
 */
export function gstinLiveError(raw: string): string | undefined {
  const v = normalizeGstin(raw)
  if (!v) return undefined
  if ([...v].some((ch) => !CHARSET.includes(ch))) return GSTIN_MESSAGES.gstin_characters
  if (v.length > 15) return GSTIN_MESSAGES.gstin_length
  if (v.length >= 2 && !STATE_CODES.has(v.slice(0, 2))) return GSTIN_MESSAGES.gstin_state_code
  if (v.length < 15) return undefined
  const r = validateGstin(v)
  return r.ok ? undefined : r.message
}
