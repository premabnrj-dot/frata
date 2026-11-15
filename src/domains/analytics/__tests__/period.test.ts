import { describe, expect, it } from 'vitest'
import { compareWords, parsePeriod, periodQuery, windowFor } from '../period'

const now = new Date('2026-11-13T06:00:00Z') // 11:30 IST, Friday 13 November
const iso = (d: Date) => d.toISOString()

describe('parsePeriod', () => {
  it('presets, an old 90-day link, a custom range, and anything else', () => {
    expect(parsePeriod({ period: 'today' }, now)).toEqual({ kind: 'preset', preset: 'today' })
    expect(parsePeriod({ period: '90' }, now)).toEqual({ kind: 'custom', from: '2026-08-16', to: '2026-11-13' })
    expect(parsePeriod({ from: '2026-10-31', to: '2026-10-01' }, now)).toEqual({ kind: 'custom', from: '2026-10-01', to: '2026-10-31' })
    expect(parsePeriod({ period: 'all-time' }, now)).toEqual({ kind: 'preset', preset: '30' })
    expect(parsePeriod({ from: '2026-02-30', to: '2026-03-01' }, now)).toEqual({ kind: 'preset', preset: '30' })
  })
  it('a range ends today at the latest and is at most 92 days', () => {
    expect(parsePeriod({ from: '2026-11-01', to: '2027-01-01' }, now)).toEqual({ kind: 'custom', from: '2026-11-01', to: '2026-11-13' })
    expect(parsePeriod({ from: '2020-01-01', to: '2026-11-13' }, now)).toEqual({ kind: 'custom', from: '2026-08-14', to: '2026-11-13' }) // 92 days
  })
})

describe('windowFor', () => {
  it('30 days: today so far and the 30 whole days before', () => {
    const w = windowFor({ kind: 'preset', preset: '30' }, now)
    expect([iso(w.start), iso(w.end), iso(w.prevStart), w.days, w.toNow]).toEqual(['2026-10-14T18:30:00.000Z', iso(now), '2026-09-14T18:30:00.000Z', 30, true])
    expect(compareWords(w)).toBe('vs previous 30 days')
  })
  it('today against yesterday', () => {
    const w = windowFor({ kind: 'preset', preset: 'today' }, now)
    expect([iso(w.start), iso(w.prevStart), w.days]).toEqual(['2026-11-12T18:30:00.000Z', '2026-11-11T18:30:00.000Z', 1])
    expect(compareWords(w)).toBe('vs yesterday at this time')
    expect(iso(w.prevEnd)).toBe('2026-11-12T06:00:00.000Z') // yesterday up to this moment
  })
  it('this month against the same number of days before it', () => {
    const w = windowFor({ kind: 'preset', preset: 'month' }, now)
    expect([iso(w.start), w.days, iso(w.prevStart)]).toEqual(['2026-10-31T18:30:00.000Z', 13, '2026-10-18T18:30:00.000Z'])
    expect(compareWords(w)).toBe('vs the 13 days before')
  })
  it('a past custom range is whole days', () => {
    const w = windowFor({ kind: 'custom', from: '2026-10-01', to: '2026-10-31' }, now)
    expect([iso(w.start), iso(w.end), w.days, w.toNow, iso(w.prevEnd)]).toEqual(['2026-09-30T18:30:00.000Z', '2026-10-31T18:30:00.000Z', 31, false, '2026-09-30T18:30:00.000Z'])
  })
  it('a link per choice', () => {
    expect(periodQuery({ kind: 'preset', preset: '7' })).toBe('period=7')
    expect(periodQuery({ kind: 'custom', from: '2026-10-01', to: '2026-10-31' })).toBe('from=2026-10-01&to=2026-10-31')
  })
})
