import { describe, expect, it } from 'vitest'
import { paise } from '@/domains/money/paise'
import { formatInr, formatPercent, formatPhone } from '../format'

describe('format', () => {
  it('groups in lakhs and crores', () => {
    expect(formatInr(paise(3_15_00_000_00))).toBe('₹3,15,00,000') // ₹3.15 crore
  })
  it('signs a loss with a real minus', () => {
    expect(formatInr(paise(-43000))).toBe('−₹430')
  })
  it('shows paise only when asked', () => {
    expect(formatInr(paise(149950), { decimals: true })).toBe('₹1,499.50')
  })
  it('reads an Indian mobile', () => {
    expect(formatPhone('919845012345')).toBe('+91 98450 12345')
  })
  it('reads a share', () => {
    expect(formatPercent(0.165)).toBe('16.5%')
  })
})
