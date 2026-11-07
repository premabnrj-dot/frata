import { describe, expect, it } from 'vitest'
import { addMonths, clientStage, shareWindow } from '../stage'
import { shareExample } from '../example'
import { PARTNER_TERMS } from '../terms'

const now = new Date('2026-11-07T10:00:00Z')
const base = { removedAt: null, openInviteExpiresAt: null, hasOwner: false, firstOpenedAt: null }

describe('clientStage', () => {
  it('follows removed > open > owner > invite > building', () => {
    expect(clientStage(base, now)).toBe('building')
    expect(clientStage({ ...base, openInviteExpiresAt: new Date('2026-11-10') }, now)).toBe('invited')
    expect(clientStage({ ...base, openInviteExpiresAt: new Date('2026-11-01') }, now)).toBe('building') // expired
    expect(clientStage({ ...base, hasOwner: true, openInviteExpiresAt: new Date('2026-11-10') }, now)).toBe('with_owner')
    expect(clientStage({ ...base, hasOwner: true, firstOpenedAt: new Date('2026-10-01') }, now)).toBe('open')
    expect(clientStage({ ...base, hasOwner: true, firstOpenedAt: new Date('2026-10-01'), removedAt: now }, now)).toBe('ended')
  })
})

describe('shareWindow', () => {
  const t = { shareMonths: 24, noticeDays: 90 }
  it('has not started before the shop opens', () => {
    expect(shareWindow(t, null, null)).toBe('not_started')
    expect(shareWindow(t, new Date('2026-12-01'), new Date('2026-11-20'))).toBe('not_started')
  })
  it('runs 24 months from the first opening', () => {
    const w = shareWindow(t, new Date('2026-08-12T00:00:00Z'), null)
    expect(w !== 'not_started' && w.endsAt.toISOString()).toBe('2028-08-12T00:00:00.000Z')
  })
  it('ends 90 days after a removal, never after the 24 months', () => {
    const early = shareWindow(t, new Date('2026-08-12T00:00:00Z'), new Date('2026-11-01T00:00:00Z'))
    expect(early !== 'not_started' && early.endsAt.toISOString()).toBe('2027-01-30T00:00:00.000Z')
    const late = shareWindow(t, new Date('2026-08-12T00:00:00Z'), new Date('2028-07-01T00:00:00Z'))
    expect(late !== 'not_started' && late.endsAt.toISOString()).toBe('2028-08-12T00:00:00.000Z')
  })
  it('rolls the 31st to the month’s last day', () => {
    expect(addMonths(new Date('2027-01-31T00:00:00Z'), 1).toISOString()).toBe('2027-02-28T00:00:00.000Z')
  })
})

describe('shareExample', () => {
  it('is 20% of the plan fee plus the delivered-order fee, in paise', () => {
    const e = shareExample({ name: 'Launch', monthlyPrice: 149_900, feeBps: 200 })
    expect(e.orderFee).toBe(288_000)
    expect(e.frataCollects).toBe(437_900)
    expect(e.share).toBe(87_580) // ₹875.80
    expect(PARTNER_TERMS.shareBps).toBe(2000)
  })
})
