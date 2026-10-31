import { describe, expect, it } from 'vitest'
import { validateGmail, EMAIL_MESSAGES } from './email'
import { getExpectedCheckDigit, gstinChecksum, gstinLiveError, SAMPLE_GSTINS, validateGstin } from './gstin'
import { searchCities } from '@/data/indianCities'

// These cases mirror backend/tests/test_email_validation.py and
// test_gstin_business.py so browser and server rules can't drift apart.

describe('validateGmail', () => {
  it.each([
    ['asha.rao@gmail.com', 'asha.rao@gmail.com'],
    ['Asha.Rao@Gmail.COM', 'asha.rao@gmail.com'],
    ['  asharao99@gmail.com  ', 'asharao99@gmail.com'],
    ['asharao+shop@gmail.com', 'asharao+shop@gmail.com'],
    ['aryan@gmail.com', 'aryan@gmail.com'],
    ['aryan123@gmail.com', 'aryan123@gmail.com'],
    ['abc@gmail.com', 'abc@gmail.com'],
  ])('accepts %s', (raw, email) => {
    const r = validateGmail(raw)
    expect(r.ok && r.email).toBe(email)
  })

  it('normalises dots and +tags for duplicate detection', () => {
    const a = validateGmail('a.s.h.a.rao+x@gmail.com'), b = validateGmail('asharao@gmail.com')
    expect(a.ok && b.ok && a.canonical === b.canonical).toBe(true)
  })

  it.each(['', '   ', 'plainaddress', '@gmail.com', 'asharao@', 'asha rao@gmail.com', 'asharao@@gmail.com', 'asharao@gmail',
    '.asharao@gmail.com', 'asharao.@gmail.com', 'asha..rao@gmail.com', 'a'.repeat(31) + '@gmail.com', 'asha_rao@gmail.com'])(
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
    ['00AAPFU0939F1ZV', 'gstin_state_code'], ['271APFU0939F1ZV', 'gstin_pan'],
    ['27AAPFU0939F0ZV', 'gstin_entity_code'], ['27AAPFU0939F1YV', 'gstin_default_char'], ['27AAPFU0939F1ZA', 'gstin_checksum'],
  ])('rejects %s with %s', (g, code) => {
    const r = validateGstin(g)
    expect(r.ok ? 'ok' : r.code).toBe(code)
  })
  it('accepts any well-formed GSTIN with the right check digit, whatever the holder type or state', () => {
    for (const state of ['01', '08', '27', '38', '97', '99']) {
      for (const holder of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const first14 = `${state}AAB${holder}B1234D1Z`
        expect(validateGstin(first14 + gstinChecksum(first14)).ok).toBe(true)
      }
    }
  })
  it('accepts an LLP GSTIN (holder type E)', () => {
    const first14 = '27AABFE1234L1Z'
    expect(validateGstin(first14 + gstinChecksum(first14)).ok).toBe(true)
  })
  it('still rejects a number with a wrong check digit', () => {
    const r = validateGstin('27ABCDE1234F1Z5')
    expect(r.ok ? 'ok' : r.code).toBe('gstin_checksum')
  })
  it('computes the check character', () => expect(gstinChecksum('27AAPFU0939F1Z')).toBe('V'))
  it('stays quiet while a valid prefix is being typed', () => {
    expect(gstinLiveError('27AAP')).toBeUndefined()
    expect(gstinLiveError('99')).toBeUndefined()
    expect(gstinLiveError('45')).toMatch(/state code/)
  })
  it('calculates expected check digit for valid 14-character prefix', () => {
    expect(getExpectedCheckDigit('27AAPFU0939F1Z')).toBe('V')
    expect(getExpectedCheckDigit('27AAPFU0939F1ZA')).toBe('V')
    expect(getExpectedCheckDigit('29AAGCB7383J1Z')).toBe('4')
    expect(getExpectedCheckDigit('07AAAAA0000A1Z')).toBe('4')
    expect(getExpectedCheckDigit('123')).toBeUndefined()
  })
  it('all SAMPLE_GSTINS pass validation', () => {
    for (const sample of SAMPLE_GSTINS) {
      expect(validateGstin(sample.gstin).ok).toBe(true)
    }
  })
})

describe('searchCities', () => {
  it('lists every city starting with the letter', () => {
    const names = searchCities('b').map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['Bengaluru', 'Bhopal', 'Bhubaneswar', 'Bikaner', 'Bareilly']))
    expect(names.every((n) => n.toLowerCase().startsWith('b') || n === 'Mumbai' || n === 'Vadodara' || n === 'Varanasi')).toBe(true)
    expect(searchCities('m').map((c) => c.name)).toContain('Mumbai')
  })
  it('finds old city names', () => {
    expect(searchCities('bang').map((c) => c.name)).toContain('Bengaluru')
    expect(searchCities('bomb').map((c) => c.name)).toContain('Mumbai')
  })
  it('is empty until something is typed', () => expect(searchCities('  ')).toEqual([]))
})
