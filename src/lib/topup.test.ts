import { describe, expect, it } from 'vitest'
import { cleanAmountInput, parseTopUpAmount } from './topup'

describe('cleanAmountInput', () => {
  it.each([
    ['abc', ''],
    ['₹2,500', '2,500'],
    ['-100', '100'],
    ['1e5', '15'],
    ['12.5.0', '12.50'],
    ['1,234.5,6', '1,234.56'],
  ])('turns %s into %s', (raw, cleaned) => {
    expect(cleanAmountInput(raw)).toBe(cleaned)
  })
})

describe('parseTopUpAmount', () => {
  it.each([
    ['1', 100],
    ['2500', 250000],
    ['2500.50', 250050],
    ['1,234.5', 123450],
    ['19.99', 1999],
    ['1.10', 110],
    ['10,00,000', 100000000],
    ['2500.', 250000],
  ])('accepts %s as %i paise', (input, paise) => {
    expect(parseTopUpAmount(input)).toEqual({ ok: true, paise })
  })

  it.each([
    ['', 'Enter the amount'],
    ['   ', 'Enter the amount'],
    ['0', 'minimum'],
    ['0.99', 'minimum'],
    ['.', 'valid amount'],
    ['1.234', 'two decimal'],
    ['1000000.01', 'maximum'],
    ['99999999', 'maximum'],
  ])('rejects "%s"', (input, message) => {
    const result = parseTopUpAmount(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain(message)
  })
})
