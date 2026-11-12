import { describe, expect, it } from 'vitest'
import { arrivalRange } from '@/domains/checkout/quote'
import { arrival, dispatchDay, MON_TO_SAT, type Dispatch, type Line } from '../dates'

const inStock: Line = { kind: 'in_stock', shipsBy: null, leadMinDays: null, leadMaxDays: null }
const thu11 = new Date('2026-11-12T05:30:00Z') // Thu 12 Nov, 11:00 IST
const thu15 = new Date('2026-11-12T09:30:00Z') // Thu 12 Nov, 15:00 IST
const d: Dispatch = { days: 1, cutoff: '14:00', shipDays: MON_TO_SAT, holidays: [] }

describe('the floor: identical to today', () => {
  it('matches arrivalRange for in-stock, made-to-order and pre-order bags', () => {
    const r = { dispatchDays: 1, metroDays: 2, restDays: 5 }
    const bags: Line[][] = [[inStock], [inStock, { kind: 'made_to_order', shipsBy: null, leadMinDays: 3, leadMaxDays: 5 }], [{ kind: 'preorder', shipsBy: '2026-12-01', leadMinDays: null, leadMaxDays: null }], []]
    for (const b of bags) expect(arrival(b, [r.metroDays, r.restDays], { calendarDays: r.dispatchDays }, thu11)).toEqual(arrivalRange(b, r, thu11))
  })
})

describe('the app: working-day dispatch, cutoff, ship days, holidays', () => {
  it('before the cutoff today counts; after it, tomorrow', () => {
    expect(dispatchDay('2026-11-12', { ...d, days: 0 }, thu11)).toBe('2026-11-12')
    expect(dispatchDay('2026-11-12', { ...d, days: 0 }, thu15)).toBe('2026-11-13')
    expect(dispatchDay('2026-11-12', d, thu11)).toBe('2026-11-13') // one working day
  })
  it('Sunday is skipped (Mon–Sat), and so is a holiday', () => {
    expect(dispatchDay('2026-11-14', d, thu11)).toBe('2026-11-16') // Sat → +1 working day = Mon
    expect(dispatchDay('2026-11-12', { ...d, holidays: ['2026-11-13', '2026-11-14'] }, thu11)).toBe('2026-11-16')
  })
  it('no ship days set never loops', () => {
    expect(dispatchDay('2026-11-12', { ...d, shipDays: 0 }, thu11)).toBe('2026-11-13')
  })
  it('arrives = dispatch + the zone days; the latest line wins', () => {
    expect(arrival([inStock], [2, 3], d, thu11)).toEqual({ from: '2026-11-15', to: '2026-11-16' })
    expect(arrival([inStock], [2, 3], d, thu15)).toEqual({ from: '2026-11-16', to: '2026-11-17' }) // after cutoff: Fri→Sat dispatch
  })
})
