import { describe, expect, it } from 'vitest'
import { validateGmail, EMAIL_MESSAGES } from './email'
import { gstinChecksum, gstinLiveError, validateGstin } from './gstin'

// These cases mirror backend/tests/test_email_validation.py and
// test_gstin_business.py so browser and server rules can't drift apart.

describe('validateGmail', () => {
  it.each([
    ['asha.rao@gmail.com', 'asha.rao@gmail.com'],
    ['Asha.Rao@Gmail.COM', 'asha.rao@gmail.com'],
    ['  asharao99@gmail.com  ', 'asharao99@gmail.com'],
    ['asharao+shop@gmail.com', 'asharao+shop@gmail.com'],
  ])('accepts %s', (raw, email) => {
    const r = validateGmail(raw)
    expect(r.ok && r.email).toBe(email)
  })

  it('normalises dots and +tags for duplicate detection', () => {
    const a = validateGmail('a.s.h.a.rao+x@gmail.com'), b = validateGmail('asharao@gmail.com')
    expect(a.ok && b.ok && a.canonical === b.canonical).toBe(true)
  })

  it.each(['', '   ', 'plainaddress', '@gmail.com', 'asharao@', 'asha rao@gmail.com', 'asharao@@gmail.com', 'asharao@gmail',
    '.asharao@gmail.com', 'asharao.@gmail.com', 'asha..rao@gmail.com', 'abc@gmail.com', 'a'.repeat(31) + '@gmail.com', 'asha_rao@gmail.com'])(
    'rejects bad format %j', (raw) => {
      const r = validateGmail(raw)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.message).toBe('Please enter a valid email address.')
    })

  it.each(['asharao@yahoo.com', 'asharao@outlook.com', 'asharao@hotmail.com', 'asharao@urbannest.in', 'asharao@googlemail.com', 'ASHARAO@YAHOO.COM'])(
    'rejects other domains %s', (raw) => {
      const r = validateGmail(raw)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.message).toBe(EMAIL_MESSAGES.unsupported_email_domain)
    })
})

describe('validateGstin', () => {
  it.each(['27AAPFU0939F1ZV', '29AAGCB7383J1Z4', '33AAACH7409R1Z8', ' 27aapfu 0939f1zv '])('accepts %s', (g) => {
    expect(validateGstin(g).ok).toBe(true)
  })
  it.each([
    ['', 'gstin_required'], ['27AAPFU0939F1Z', 'gstin_length'], ['27AAPFU0939F1Z-', 'gstin_characters'],
    ['00AAPFU0939F1ZV', 'gstin_state_code'], ['271APFU0939F1ZV', 'gstin_pan'], ['27AAPXU0939F1ZV', 'gstin_pan_type'],
    ['27AAPFU0939F0ZV', 'gstin_entity_code'], ['27AAPFU0939F1YV', 'gstin_default_char'], ['27AAPFU0939F1ZA', 'gstin_checksum'],
  ])('rejects %s with %s', (g, code) => {
    const r = validateGstin(g)
    expect(r.ok ? 'ok' : r.code).toBe(code)
  })
  it('computes the check character', () => expect(gstinChecksum('27AAPFU0939F1Z')).toBe('V'))
  it('stays quiet while a valid prefix is being typed', () => {
    expect(gstinLiveError('27AAP')).toBeUndefined()
    expect(gstinLiveError('99')).toBeUndefined()
    expect(gstinLiveError('45')).toMatch(/state code/)
  })
})
