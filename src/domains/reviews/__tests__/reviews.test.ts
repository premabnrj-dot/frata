import { describe, expect, it } from 'vitest'
import { AUTO_PUBLISH_MS, publishesAt, reviewState } from '../state'
import { screen } from '../moderation'
import { cleanText, displayName, LIMITS } from '../text'
import { fitPosition, sizeLine, summarize } from '../summary'
import { askable, askWindow, DEFAULT_ASK, linkValid, reminderDue } from '../schedule'

const now = new Date('2026-11-09T10:00:00Z')
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000)
const base = { createdAt: ago(1), heldAt: null, heldReason: null, approvedAt: null, hiddenAt: null, authorDeletedAt: null }

describe('reviewState', () => {
  it('published unless held, hidden or removed; a held review goes live by itself after 72 h', () => {
    expect(reviewState(base, now)).toBe('published')
    expect(reviewState({ ...base, heldAt: ago(1), heldReason: 'language' }, now)).toBe('held')
    for (const heldReason of ['language', 'spam', 'approve_each']) expect(reviewState({ ...base, createdAt: ago(73), heldAt: ago(73), heldReason }, now)).toBe('published')
    // Photos wait for the shop, however long (security review M5).
    expect(reviewState({ ...base, createdAt: ago(500), heldAt: ago(500), heldReason: 'photos' }, now)).toBe('held')
    expect(publishesAt({ ...base, heldAt: ago(1), heldReason: 'photos' }, now)).toBeNull()
    expect(reviewState({ ...base, heldAt: ago(1), heldReason: 'photos', approvedAt: ago(0.5) }, now)).toBe('published')
    expect(publishesAt({ ...base, heldAt: ago(1), heldReason: 'spam' }, now)?.getTime()).toBe(ago(1).getTime() + AUTO_PUBLISH_MS)
  })
  it('hidden never publishes by itself; the author’s delete wins', () => {
    expect(reviewState({ ...base, createdAt: ago(500), hiddenAt: ago(499) }, now)).toBe('hidden')
    expect(reviewState({ ...base, hiddenAt: ago(1), authorDeletedAt: ago(0.1) }, now)).toBe('removed')
  })
})

describe('screen (the same for every review: never by rating)', () => {
  const o = { approveEach: false, photos: 0 }
  it('a link or an Indian mobile number is hidden as contact', () => {
    expect(screen('order from www.cheapkurta.in', o).hide).toBe('contact')
    expect(screen('call me on +91 98765 43210', o).hide).toBe('contact')
    expect(screen('WhatsApp 9876543210 for more', o).hide).toBe('contact')
  })
  it('bad words and spam are held; Approve each holds all; photos are held', () => {
    expect(screen('total shit quality', o)).toEqual({ hide: null, hold: 'language' })
    expect(screen('niceeeeeeeeeee', o).hold).toBe('spam')
    expect(screen('Lovely fabric', { approveEach: true, photos: 0 }).hold).toBe('approve_each')
    expect(screen('Lovely fabric', { approveEach: false, photos: 2 }).hold).toBe('photos')
    expect(screen('Lovely fabric, fits true to size', o)).toEqual({ hide: null, hold: null })
  })
  it('sizes, prices and missing spaces are not contact details', () => {
    expect(screen('Bought size 32, paid 2490 for it', o).hide).toBeNull()
    for (const t of ['Loved it.In short, perfect', 'Fits well.Me and my sister', 'Nice fabric.Co-ord set', 'Size M.In love', 'Great.com fort'])
      expect(screen(t, o).hide).toBeNull()
    expect(screen('see kesar.in for more', o).hide).toBe('contact')
  })
})

describe('text', () => {
  it('strips bidi, zero-width and control characters, keeps newlines, caps', () => {
    expect(cleanText('Nice‮txt.exe​ kurta\u0007', LIMITS.body)).toBe('Nicetxt.exe kurta')
    expect(cleanText('line one\n\n\n\nline two', LIMITS.body)).toBe('line one\n\nline two')
    expect(cleanText('x'.repeat(300), LIMITS.title)).toHaveLength(100)
  })
  it('the name a review shows is a choice, never typed', () => {
    expect(displayName('ananya rao', 'initial')).toBe('Ananya R.')
    expect(displayName('Ananya Rao', 'first')).toBe('Ananya')
    expect(displayName('Ananya Rao', 'anon')).toBe('Anonymous')
    expect(displayName('  ', 'initial')).toBe('Anonymous')
  })
})

describe('summary', () => {
  it('average to 1 decimal, bars 5★ first, fit counts', () => {
    const s = summarize([{ rating: 5, fit: 'true' }, { rating: 5, fit: 'small' }, { rating: 4, fit: null }, { rating: 2, fit: 'small' }])
    expect(s).toMatchObject({ count: 4, average: 4, fit: { answers: 3, small: 2, true: 1, large: 0 } })
    expect(s.bars.map((b) => b.n)).toEqual([2, 1, 0, 1, 0])
    expect(s.bars[0]!.pct).toBe(50)
    expect(summarize([])).toMatchObject({ count: 0, average: 0, fit: null })
  })
  it('the fit marker needs 3 answers; 0.5 is true to size', () => {
    expect(fitPosition({ answers: 2, small: 2, true: 0, large: 0 })).toBeNull()
    expect(fitPosition({ answers: 4, small: 0, true: 4, large: 0 })).toBe(0.5)
    expect(fitPosition({ answers: 4, small: 4, true: 0, large: 0 })).toBe(0)
  })
  it('a size line only for a size with 5 answers leaning one way', () => {
    const m = (fit: 'small' | 'true') => ({ size: 'M', fit })
    expect(sizeLine([m('small'), m('small'), m('small'), m('true'), m('true')])).toBe('Size M runs small for 60% of buyers')
    expect(sizeLine([m('small'), m('small'), m('true')])).toBeNull()
  })
})

describe('schedule', () => {
  const d = (days: number) => new Date(now.getTime() - days * 86_400_000)
  it('asks in a fixed window, never re-reading old orders', () => {
    const w = askWindow(DEFAULT_ASK, now)
    expect([w.from.getTime(), w.to.getTime()]).toEqual([d(7).getTime(), d(5).getTime()])
  })
  it('delivered (or returned) with an opt-in; never RTO, cancelled, unopted or opted out', () => {
    const moments = { placedAt: d(9), paymentMethod: 'cod', payBy: null, paidAt: null, switchedToCodAt: null, confirmedAt: d(9), heldAt: null, packedAt: d(8), shippedAt: d(8), ndrAt: null, deliveredAt: d(5), rtoInitiatedAt: null, rtoDeliveredAt: null, lostAt: null, cancelledAt: null }
    const ok = { ...moments, waOptInAt: d(9), optedOut: false } as Parameters<typeof askable>[0]
    expect(askable(ok, now)).toBe(true)
    expect(askable({ ...ok, rtoInitiatedAt: d(4) }, now)).toBe(false)
    expect(askable({ ...ok, waOptInAt: null }, now)).toBe(false)
    expect(askable({ ...ok, optedOut: true }, now)).toBe(false)
  })
  it('one reminder after the set days, none when off; links last 60 days', () => {
    expect(reminderDue(d(3), DEFAULT_ASK, now)).toBe(true)
    expect(reminderDue(d(2), DEFAULT_ASK, now)).toBe(false)
    expect(reminderDue(d(9), { askAfterDays: 5, remindAfterDays: 0 }, now)).toBe(false)
    expect([linkValid(d(59), now), linkValid(d(61), now)]).toEqual([true, false])
  })
})
