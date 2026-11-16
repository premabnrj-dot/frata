import { describe, expect, it } from 'vitest'
import { paise } from '@/domains/money/paise'
import { billState, isDay, parseRupees, summarise, unpaidTotal, type Deal } from '../bills'
import { clientNext, type NextFacts } from '../next'
import { monthShare, SHARE_IN_RUPEES, shareOf, shareTotal, visibleShare, type ShareMonth } from '../share'
import { clean, remindText } from '../remind'
import { waText } from '@/domains/settings/whatsapp'

const today = '2026-11-16'
const p = paise

describe('billState', () => {
  it('reads paid, overdue, due within 7 days, later', () => {
    expect(billState({ dueOn: '2026-11-05', paidAt: new Date() }, today)).toBe('paid')
    expect(billState({ dueOn: '2026-11-15' }, today)).toBe('overdue')
    expect(billState({ dueOn: '2026-11-16' }, today)).toBe('due')
    expect(billState({ dueOn: '2026-11-23' }, today)).toBe('due')
    expect(billState({ dueOn: '2026-11-24' }, today)).toBe('later')
  })
  it('crosses a month and a year by calendar days', () => {
    expect(billState({ dueOn: '2027-01-01' }, '2026-12-31')).toBe('due')
    expect(billState({ dueOn: '2026-12-31' }, '2027-01-01')).toBe('overdue')
  })
})

describe('summarise and totals', () => {
  const s = summarise([{ amount: p(1_200_000), dueOn: '2026-11-05' }, { amount: p(600_000), dueOn: '2026-10-02' }, { amount: p(2_250_000), dueOn: '2026-11-20' }, { amount: p(100), dueOn: '2027-01-05' }], today)
  it('sums by state and keeps the oldest overdue day', () => {
    expect(s.unpaid).toBe(4_050_100)
    expect(s.overdue).toBe(1_800_000)
    expect(s.oldestOverdueOn).toBe('2026-10-02')
    expect(s.dueSoon).toBe(2_250_000)
    expect(s.nextDueOn).toBe('2026-11-20')
  })
  it('totals every unpaid bill', () => {
    expect(unpaidTotal([s, s])).toBe(8_100_200)
  })
  it('reads typed rupees and days', () => {
    expect(parseRupees('12,000')).toBe(1_200_000)
    expect(parseRupees('₹1,00,000.50')).toBe(10_000_050)
    expect(parseRupees('0.99')).toBeNull()
    expect(parseRupees('1')).toBe(100)
    expect(parseRupees('100000001')).toBeNull() // over ₹10 crore
    expect(parseRupees('12k')).toBeNull()
    expect(isDay('2026-02-28')).toBe(true)
    expect(isDay('2026-02-31')).toBe(false)
    expect(isDay('2019-12-31')).toBe(false)
  })
})

describe('clientNext', () => {
  const base: NextFacts = { stage: 'open', bills: null, deal: null, ownerSince: '2026-04-03', inviteSentOn: '2026-04-02' }
  const overdue = summarise([{ amount: p(1_200_000), dueOn: '2026-11-05' }], today)
  it('puts an overdue bill first for the owner, even on a removed client', () => {
    expect(clientNext({ ...base, bills: overdue }, 'owner', today)).toEqual({ who: 'you', reason: 'overdue', action: 'remind', days: 11 })
    expect(clientNext({ ...base, stage: 'ended', bills: overdue }, 'owner', today)?.reason).toBe('overdue')
    expect(clientNext({ ...base, stage: 'ended' }, 'owner', today)).toEqual({ who: 'nobody', reason: 'removed', action: null })
  })
  it('follows the stage', () => {
    expect(clientNext({ ...base, stage: 'building' }, 'owner', today)).toEqual({ who: 'you', reason: 'building', action: 'handOver' })
    expect(clientNext({ ...base, stage: 'invited', inviteSentOn: '2026-11-12' }, 'owner', today)).toEqual({ who: 'client', reason: 'invited', action: 'remind', days: 4 })
    expect(clientNext({ ...base, stage: 'with_owner', ownerSince: '2026-11-10' }, 'owner', today)).toEqual({ who: 'client', reason: 'notOpen', action: 'remind', days: 6 })
  })
  it('asks for a bill when a retainer renews within 14 days, then waits on a bill due soon', () => {
    const deal: Deal = { kind: 'retainer', amount: p(1_500_000), renewsOn: '2026-12-01' }
    expect(clientNext({ ...base, deal }, 'owner', today)?.reason).toBe('open') // 15 days away
    const near: Deal = { ...deal, renewsOn: '2026-11-30' }
    expect(clientNext({ ...base, deal: near }, 'owner', today)).toEqual({ who: 'you', reason: 'renews', action: 'recordBill', days: 14 })
    const due = summarise([{ amount: p(2_250_000), dueOn: '2026-11-20' }], today)
    expect(clientNext({ ...base, bills: due }, 'owner', today)).toEqual({ who: 'client', reason: 'dueSoon', action: null })
    expect(clientNext(base, 'owner', today)).toEqual({ who: 'nobody', reason: 'open', action: null })
  })
  it('gives a Lead the stage only, without actions or money; a Builder nothing', () => {
    expect(clientNext({ ...base, stage: 'building', bills: overdue }, 'lead', today)).toEqual({ who: 'you', reason: 'building', action: null })
    expect(clientNext({ ...base, stage: 'invited' }, 'lead', today)?.action).toBeNull()
    expect(clientNext({ ...base, bills: overdue }, 'lead', today)?.reason).toBe('open')
    expect(clientNext(base, 'builder', today)).toBeNull()
  })
})

describe('the share (golden months)', () => {
  const issued = new Date('2026-11-01T00:00:00Z')
  const m = (o: Partial<ShareMonth>): ShareMonth => ({ issuedAt: issued, hasNumber: true, total: 2_704_560, paid: 2_704_560, credited: 0, netTaxable: 2_292_000, ...o })
  it('is the floored share of the net taxable', () => {
    expect(shareOf(2_292_000, 2000)).toBe(458_400)
    expect(shareOf(1_999, 2000)).toBe(399) // 399.8 floors
    expect(shareOf(-500, 2000)).toBe(0)
  })
  it('subtracts a partial credit note (net taxable) and counts only paid months', () => {
    expect(monthShare(m({ credited: 236_000, paid: 2_468_560, netTaxable: 2_092_000 }), 2000)).toEqual({ kind: 'paid', amount: 418_400 })
    expect(monthShare(m({ paid: 0 }), 2000)).toEqual({ kind: 'due' })
    expect(monthShare(m({ paid: 0, credited: 2_704_560, netTaxable: 0 }), 2000)).toEqual({ kind: 'none' }) // credited in full
    expect(monthShare(m({ hasNumber: false, total: 0, paid: 0 }), 2000)).toEqual({ kind: 'none' }) // rolled: in the next carry-in
    expect(monthShare(null, 2000)).toEqual({ kind: 'none' })
  })
  it('reads the link snapshot rate, not today’s terms', () => {
    expect(monthShare(m({}), 1500)).toEqual({ kind: 'paid', amount: 343_800 })
  })
  it('shows rupees only when SHARE_IN_RUPEES is on (owner, 2026-11-15: off until the merchant terms carry it)', () => {
    expect(SHARE_IN_RUPEES).toBe(false)
    const paid = monthShare(m({}), 2000)
    expect(visibleShare(paid, true)).toEqual({ kind: 'paid', amount: 458_400 })
    expect(visibleShare(paid, false)).toEqual({ kind: 'none' })
    expect(shareTotal([visibleShare(paid, false)])).toBe(0)
    expect(shareTotal([visibleShare(paid, true)])).toBe(458_400)
  })
  it('totals paid months only', () => {
    expect(shareTotal([{ kind: 'paid', amount: p(70_480) }, { kind: 'due' }, { kind: 'none' }, { kind: 'paid', amount: p(387_980) }])).toBe(458_460)
  })
})

describe('remind', () => {
  it('strips direction marks and controls, and caps', () => {
    expect(clean('Noor‮ Threads\u0007')).toBe('Noor Threads')
    expect(clean('x'.repeat(90))).toHaveLength(60)
  })
  it('drafts one line without a number and encodes it', () => {
    const t = remindText({ kind: 'bill', number: 'PT-0412', label: 'November retainer', amountText: '₹12,000', dueText: '5 Nov' }, 'Noor Threads', { person: 'Ananya', business: 'Pixel & Thread' })
    expect(t).toBe('Hi, Bill PT-0412 for ₹12,000 was due on 5 Nov. Thank you. Ananya, Pixel & Thread')
    expect(waText(t)).toMatch(/^https:\/\/wa\.me\/\?text=Hi%2C%20Bill/)
    expect(waText('a&b')).not.toContain('&b')
  })
})
