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
