import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { keyShape, looksLikeKey, newKey, shownPrefix, siteOriginProblem } from '../keys'

const rnd = (n: number) => new Uint8Array(randomBytes(n))

describe('storefront keys (ADR-0018 § 2)', () => {
  it('makes keys that pass their own check, of both kinds', () => {
    for (let i = 0; i < 200; i++) {
      const p = newKey('public', rnd), t = newKey('test', rnd)
      expect(p).toMatch(/^frs_pub_[0-9A-Za-z]{38}$/)
      expect(t).toMatch(/^frs_test_[0-9A-Za-z]{38}$/)
      expect(keyShape(p)).toEqual({ kind: 'public' })
      expect(keyShape(t)).toEqual({ kind: 'test' })
    }
  })
  it('refuses a flipped character, a wrong length and another prefix', () => {
    const k = newKey('public', rnd)
    const i = 12, c = k[i] === 'a' ? 'b' : 'a'
    expect(keyShape(k.slice(0, i) + c + k.slice(i + 1))).toBeNull()
    expect(keyShape(k.slice(0, -1))).toBeNull()
    expect(keyShape(k + 'a')).toBeNull()
    expect(keyShape(k.replace('frs_pub_', 'frs_live_'))).toBeNull()
    expect(keyShape(k.replace('frs_pub_', 'frs_test_'))).toBeNull()
    expect(keyShape('')).toBeNull()
  })
  it('draws every base62 character about equally (rejection sampling)', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 4000; i++) for (const ch of newKey('public', rnd).slice(8, 40)) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    expect(counts.size).toBe(62)
    const mean = (4000 * 32) / 62
    for (const n of counts.values()) expect(Math.abs(n - mean) / mean).toBeLessThan(0.1)
  })
  it('never takes a byte of 248 or more', () => {
    let first = true
    const biased = (n: number) => { if (first) { first = false; return new Uint8Array(n).fill(255) } return new Uint8Array(n).fill(61) }
    expect(newKey('public', biased).slice(8, 40)).toBe('z'.repeat(32))
  })
  it('shows only the kind and 6 characters', () => {
    const k = newKey('test', rnd)
    expect(shownPrefix(k)).toBe(k.slice(0, 15))
    expect(shownPrefix(newKey('public', rnd))).toHaveLength(14)
  })
  it('spots a key pasted as a name', () => {
    expect(looksLikeKey('Website')).toBe(false)
    expect(looksLikeKey('Arc Studio preview')).toBe(false)
    expect(looksLikeKey(newKey('public', rnd))).toBe(true)
    expect(looksLikeKey('my FRS_PUB_ key')).toBe(true)
  })
  it('allows a website on the picked domain or its www only', () => {
    expect(siteOriginProblem('https://kesarstudio.in', 'kesarstudio.in')).toBeNull()
    expect(siteOriginProblem('https://www.kesarstudio.in', 'kesarstudio.in')).toBeNull()
    expect(siteOriginProblem('https://shop.kesarstudio.in', 'kesarstudio.in')).toBe('not_this_domain')
    expect(siteOriginProblem('https://evil.in', 'kesarstudio.in')).toBe('not_this_domain')
    expect(siteOriginProblem('http://kesarstudio.in', 'kesarstudio.in')).toBe('shape')
    expect(siteOriginProblem('https://kesarstudio.in/', 'kesarstudio.in')).toBe('shape')
    expect(siteOriginProblem('https://kesarstudio.in:8443', 'kesarstudio.in')).toBe('shape')
    expect(siteOriginProblem('https://kesarstudio.in.evil.in', 'kesarstudio.in')).toBe('not_this_domain')
  })
})

describe('who manages keys, and what a key shows', async () => {
  const { mayManageApi, keyState, keyAnswers, lastUsed } = await import('../keys')
  it('a partner only while the store has no owner; never without the capability', () => {
    expect(mayManageApi('owner', true)).toBe(true)
    expect(mayManageApi('admin', true)).toBe(true)
    expect(mayManageApi('partner', false)).toBe(true)
    expect(mayManageApi('partner', true)).toBe(false)
    expect(mayManageApi('staff', false)).toBe(false)
    expect(mayManageApi('accountant', false)).toBe(false)
    expect(mayManageApi('builder', false)).toBe(false)
  })
  const now = new Date('2026-11-15T06:00:00Z')
  const store = { firstOpenedAt: null, partnerLinks: [{ partnerId: 'p', removedAt: null }] }
  it('derives the state as the definer does', () => {
    expect(keyState({ kind: 'public', expiresAt: null, revokedAt: null, partnerId: null }, store, now)).toEqual({ kind: 'live' })
    expect(keyState({ kind: 'public', expiresAt: null, revokedAt: '2026-11-02T00:00:00Z', partnerId: null }, store, now).kind).toBe('deleted')
    expect(keyState({ kind: 'test', expiresAt: '2026-12-01T00:00:00Z', revokedAt: null, partnerId: null }, store, now).kind).toBe('test')
    expect(keyState({ kind: 'test', expiresAt: '2026-11-01T00:00:00Z', revokedAt: null, partnerId: null }, store, now)).toMatchObject({ kind: 'ended', why: 'expired' })
    expect(keyState({ kind: 'test', expiresAt: '2026-12-01T00:00:00Z', revokedAt: null, partnerId: null }, { ...store, firstOpenedAt: '2026-11-14T00:00:00Z' }, now)).toMatchObject({ kind: 'ended', why: 'opened' })
    expect(keyState({ kind: 'public', expiresAt: null, revokedAt: null, partnerId: 'p' }, { firstOpenedAt: null, partnerLinks: [{ partnerId: 'p', removedAt: '2026-11-10T00:00:00Z' }] }, now).kind).toBe('partner_gone')
  })
  it('derives a build key’s state as the definer does (G·2)', () => {
    const b = { kind: 'build' as const, expiresAt: '2026-11-16T00:00:00Z', revokedAt: null, partnerId: 'p' }
    const opened = { ...store, firstOpenedAt: '2026-11-14T00:00:00Z' }
    expect(keyState(b, store, now, { live: true, leftAt: null })).toEqual({ kind: 'build', endsAt: '2026-11-16T00:00:00Z' })
    // a partner's outlives the opening; the store's own does not
    expect(keyState(b, opened, now, { live: true, leftAt: null }).kind).toBe('build')
    expect(keyState({ ...b, partnerId: null }, opened, now)).toMatchObject({ kind: 'ended', key: 'build', why: 'opened' })
    expect(keyState({ ...b, expiresAt: '2026-11-15T05:00:00Z' }, store, now)).toMatchObject({ kind: 'ended', key: 'build', why: 'expired' })
    expect(keyState(b, store, now, { live: false, leftAt: '2026-11-14T09:00:00Z' })).toEqual({ kind: 'maker_gone', at: '2026-11-14T09:00:00Z' })
    expect(keyState(b, { firstOpenedAt: null, partnerLinks: [{ partnerId: 'p', removedAt: '2026-11-10T00:00:00Z' }] }, now).kind).toBe('partner_gone')
    expect(keyState({ ...b, revokedAt: '2026-11-15T01:00:00Z' }, store, now).kind).toBe('deleted')
    expect(keyAnswers(keyState(b, store, now, { live: true, leftAt: null }))).toBe(true)
    expect(keyAnswers(keyState(b, store, now, { live: false, leftAt: null }))).toBe(false)
  })
  it('D0·2: a Test key’s days left, from day 7 down', async () => {
    const { daysLeft } = await import('../keys')
    const at = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString()
    expect(daysLeft(at(24 * 8), now)).toBeNull()
    expect(daysLeft(at(24 * 7), now)).toBe(7)
    expect(daysLeft(at(24 * 6 - 1), now)).toBe(6)
    expect(daysLeft(at(2), now)).toBe(1)
    expect(daysLeft(at(-1), now)).toBeNull()
  })
  it('says when a key was last used in India’s days', () => {
    const dm = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
    expect(lastUsed(null, now, dm)).toBe('Never used')
    expect(lastUsed('2026-11-15', now, dm)).toBe('Used today')
    expect(lastUsed('2026-11-14', now, dm)).toBe('Used yesterday')
    expect(lastUsed('2026-11-02', now, dm)).toBe('Used 2 Nov')
  })
})
