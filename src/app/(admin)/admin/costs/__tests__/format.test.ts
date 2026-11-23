import { describe, expect, it } from 'vitest'
import { amountText, dayText, inputOf, monthShortName, whenOf } from '../format'
import type { DueState } from '@/domains/admin/costs'

const state = (o: Partial<DueState>): DueState => ({ unpaid: [], next: '2026-11-26', tone: 'later', overdueDays: 0, inDays: 21, ...o })

describe('amountText', () => {
  it('rupees show decimals only when there are paise; dollars show cents, whole dollars from $100', () => {
    expect(amountText(138_000, 'INR')).toBe('₹1,380')
    expect(amountText(129_950, 'INR')).toBe('₹1,299.50')
    expect(amountText(20_000_000, 'USD')).toBe('$20.00')
    expect(amountText(57_500_000, 'USD')).toBe('$57.50')
  })
})

describe('inputOf', () => {
  it('a form field starts with the amount as a person types it', () => {
    expect(inputOf(138_000, 'INR')).toBe('1380')
    expect(inputOf(129_950, 'INR')).toBe('1299.5')
    expect(inputOf(20_000_000, 'USD')).toBe('20.00')
    expect(inputOf(57_500_000, 'USD')).toBe('57.50')
    expect(inputOf(125, 'USD')).toBe('0.000125')
  })
})

describe('days and months', () => {
  it('say a day short, and a month in three letters', () => {
    expect(dayText('2026-11-26')).toBe('26 Nov')
    expect(monthShortName('2026-09')).toBe('Sep')
  })
})

describe('whenOf', () => {
  it('overdue, today, soon and later, with one day singular', () => {
    expect(whenOf(state({ tone: 'overdue', overdueDays: 3 }))).toEqual({ tone: 'danger', text: 'Overdue 3 days' })
    expect(whenOf(state({ tone: 'overdue', overdueDays: 1 }))).toEqual({ tone: 'danger', text: 'Overdue 1 day' })
    expect(whenOf(state({ tone: 'soon', inDays: 0 }))).toEqual({ tone: 'warn', text: 'Today' })
    expect(whenOf(state({ tone: 'soon', inDays: 1 }))).toEqual({ tone: 'warn', text: 'In 1 day' })
    expect(whenOf(state({ tone: 'later', inDays: 21 }))).toEqual({ tone: 'neutral', text: 'In 21 days' })
  })
  it('a one-time or finished cost has none', () => {
    expect(whenOf(state({ next: null, tone: null }))).toBeNull()
  })
})
