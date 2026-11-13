import { describe, expect, it } from 'vitest'
import { chipsFor, filterQuery, parseFilters, placedRange, sameFilters } from '../filters'

describe('parseFilters', () => {
  it('keeps what it understands, in one canonical form', () => {
    const f = parseFilters({ pay: 'paid,cod,bogus,cod', st: '32,10,99', min: '2000', max: '500', x: 'y' })
    expect(f).toEqual({ pay: ['cod', 'paid'], states: ['Bihar', 'Kerala'], total: { min: 50000, max: 200000 } })
    expect(filterQuery(f)).toBe('pay=cod%2Cpaid&st=10%2C32&min=500&max=2000')
  })
  it('drops all three payments, a zero minimum, bad numbers and bad days', () => {
    expect(parseFilters({ pay: 'cod,paid,unpaid', min: '0', max: '1e9', from: '2026-02-30', to: 'x' })).toEqual({})
  })
  it('caps states at ten and swaps a backward range', () => {
    const codes = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
    expect(parseFilters({ st: codes.join(',') }).states).toHaveLength(10)
    expect(parseFilters({ from: '2026-11-10', to: '2026-11-01' }).placed).toEqual({ from: '2026-11-01', to: '2026-11-10' })
  })
  it('a preset wins over days', () => {
    expect(parseFilters({ placed: '7d', from: '2026-11-01' }).placed).toBe('7d')
  })
  it('a hostile value never survives', () => {
    expect(parseFilters({ st: "10';drop table orders;--", pay: '<script>' })).toEqual({})
  })
})

describe('placedRange', () => {
  const now = new Date('2026-11-13T06:00:00Z') // 11:30 IST
  it('today starts at IST midnight', () => expect(placedRange("today", now).from?.toISOString()).toBe('2026-11-12T18:30:00.000Z'))
  it('days are whole IST days, the end exclusive', () => {
    expect(placedRange({ from: '2026-11-01', to: '2026-11-01' }, now)).toEqual({ from: new Date('2026-10-31T18:30:00Z'), before: new Date('2026-11-01T18:30:00Z') })
  })
})

describe('chipsFor', () => {
  it('reads back as a sentence, and × leaves the rest', () => {
    const f = parseFilters({ pay: 'cod', st: '10', placed: 'today', min: '500', max: '2000' })
    const c = chipsFor(f)
    expect(c.map((x) => x.label)).toEqual(['Payment is COD', 'State is Bihar', 'Placed today', 'Total ₹500–₹2,000'])
    expect(sameFilters(c[0]!.without, parseFilters({ st: '10', placed: 'today', min: '500', max: '2000' }))).toBe(true)
  })
  it('one end of a range', () => {
    expect(chipsFor(parseFilters({ max: '1500' }))[0]!.label).toBe('Total up to ₹1,500')
    expect(chipsFor(parseFilters({ from: '2026-11-01' }))[0]!.label).toBe('Placed from 1 Nov')
  })
  it('many states fold', () => {
    expect(chipsFor(parseFilters({ st: '10,32,09,08' }))[0]!.label).toBe('State is Bihar, Kerala or 2 more')
  })
})
