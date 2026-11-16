import { describe, expect, it } from 'vitest'
import { payloadOk, previewEntry, TOKEN_SHAPE } from '../preview'

describe('the preview token, its pure rules (ADR-0018 § 12)', () => {
  it('names one page or the FAQ', () => {
    expect(previewEntry('page', 'our-weavers')).toBe('page:our-weavers')
    expect(previewEntry('faq')).toBe('faq')
    expect(previewEntry('page', 'Bad_Page')).toBeNull()
    expect(previewEntry('page', 'a'.repeat(61))).toBeNull()
    expect(previewEntry('page', '')).toBeNull()
  })
  it('a payload is exactly e and x, this entry, unexpired, at most 10 minutes ahead', () => {
    const now = 1_800_000_000
    expect(payloadOk({ e: 'faq', x: now + 600 }, 'faq', now)).toBe(true)
    expect(payloadOk({ e: 'faq', x: now + 601 }, 'faq', now)).toBe(false)
    expect(payloadOk({ e: 'faq', x: now }, 'faq', now)).toBe(false)
    expect(payloadOk({ e: 'page:about', x: now + 60 }, 'faq', now)).toBe(false)
    expect(payloadOk({ e: 'faq', x: now + 60, t: 'x' }, 'faq', now)).toBe(false)
    expect(payloadOk({ e: 'faq', x: String(now + 60) }, 'faq', now)).toBe(false)
    expect(payloadOk(['faq', now + 60], 'faq', now)).toBe(false)
  })
  it('a token for the longest handle fits its shape (headroom under the cap)', () => {
    const payload = Buffer.from(JSON.stringify({ e: `page:${'a'.repeat(60)}`, x: 9_999_999_999 })).toString('base64url')
    expect(payload.length).toBeLessThanOrEqual(120)
    expect(TOKEN_SHAPE.test(`v1.${payload}.${'A'.repeat(43)}`)).toBe(true)
  })
})
