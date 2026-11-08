import { describe, expect, it } from 'vitest'
import { attributionOf, cleanAttribution, isTagged, landingParams, reduceHost } from '../attribution'
import { judgeable } from '../judge'
import { campaignTag, shopLink } from '../link'
import { classifySource } from '../source'

const rules = { ownHosts: ['kesar.in', 'www.kesar.in'], shopDomain: 'frrata.in', consoleHost: 'frrata.app' }

describe('reduceHost: the referring site, or nothing', () => {
  it('keeps a hostname from a URL or a bare host, lowercase', () => {
    expect(reduceHost('https://L.Instagram.com/?u=https%3A%2F%2Fkesar.in', rules)).toBe('l.instagram.com')
    expect(reduceHost('www.google.com', rules)).toBe('www.google.com')
    expect(reduceHost('android-app://com.instagram.android', rules)).toBe('com.instagram.android')
  })
  it('never our own hosts, any shop on the shop domain, the console, a payment page, an IP or localhost', () => {
    for (const v of ['https://kesar.in/products/x', 'kesar-studio.frrata.in', 'other-shop.frrata.in', 'frrata.in', 'https://frrata.app/console', 'checkout.razorpay.com', 'http://10.0.0.1/', 'localhost', 'a.localhost'])
      expect(reduceHost(v, rules)).toBeNull()
  })
  it('refuses hostile and malformed values', () => {
    for (const v of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.com', 'no-dot', '<img src=x onerror=1>.com', 'a'.repeat(300) + '.com', 42, null, '', '   '])
      expect(reduceHost(v, rules)).toBeNull()
  })
})

describe('cleanAttribution and attributionOf', () => {
  it('keeps the listed keys only, cleaned (NFKC, no control or bidi characters, ≤ 200)', () => {
    const a = cleanAttribution({ utm_source: ' Instagram‮ ', utm_campaign: 'ｄｉｗａｌｉ', fbc: 'fb.1.2.3', igsh: 'x', evil: '1', gclid: 'g'.repeat(300), ref_host: 'https://l.instagram.com/x?y' }, rules)
    expect(a).toEqual({ utm_source: 'Instagram', utm_campaign: 'diwali', gclid: 'g'.repeat(200), ref_host: 'l.instagram.com' })
  })
  it('reads null, {} or junk checkout as nothing', () => {
    expect(attributionOf(null)).toEqual({})
    expect(attributionOf({})).toEqual({})
    expect(attributionOf({ attribution: ['x'] })).toEqual({})
    expect(attributionOf({ attribution: { utm_source: 'ig', other: 'x', fbclid: 7 } })).toEqual({ utm_source: 'ig' })
  })
  it('a landing keeps its query keys; a tagged one replaces the last touch', () => {
    expect(landingParams('?utm_source=instagram&utm_medium=bio&code=RIYA&ref_host=evil.com')).toEqual({ utm_source: 'instagram', utm_medium: 'bio' })
    expect(isTagged({ utm_source: 'x' })).toBe(true)
    expect(isTagged({ ref_host: 'google.com' })).toBe(false)
  })
})

describe('classifySource: one rule, strongest evidence first', () => {
  const s = (a: Parameters<typeof classifySource>[0], creator: string | null = null) => { const r = classifySource(a, creator); return [r.channel, r.label, r.slug, r.campaign] }
  it('a creator code beats every tag', () => {
    expect(s({ utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'diwali-drop' }, 'Riya')).toEqual(['creator', 'Creator · Riya', 'creator-riya', 'diwali-drop'])
  })
  it('the link\'s own tags, in the merchant\'s words', () => {
    expect(s({ utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'diwali-drop' })).toEqual(['instagram', 'Instagram bio', 'instagram-bio', 'diwali-drop'])
    expect(s({ utm_source: 'IG', utm_medium: 'Story' })).toEqual(['instagram', 'Instagram story', 'instagram-story', null])
    expect(s({ utm_source: 'whatsapp', utm_medium: 'broadcast' })).toEqual(['whatsapp', 'WhatsApp broadcast', 'whatsapp-broadcast', null])
    expect(s({ utm_source: 'meta', utm_medium: 'paid_social' })[1]).toBe('Instagram or Facebook ads')
    expect(s({ utm_source: 'facebook', utm_medium: 'cpc' })[1]).toBe('Facebook ads')
    expect(s({ utm_source: 'google', utm_medium: 'cpc' })).toEqual(['google_ads', 'Google ads', 'google-ads', null])
    expect(s({ utm_source: 'google', utm_medium: 'organic' })[1]).toBe('Google')
    expect(s({ utm_source: 'Newsletter-X' })).toEqual(['other', 'Other · newsletter-x', 'other-newsletter-x', null])
  })
  it('click ids when there are no tags: Google ads, Google free listings, Meta (never "ads" by itself)', () => {
    for (const k of ['gclid', 'gbraid', 'wbraid', 'gad_source'] as const) expect(s({ [k]: 'x' })[0]).toBe('google_ads')
    expect(s({ srsltid: 'x' })).toEqual(['google', 'Google', 'google', null])
    expect(s({ fbclid: 'x' })).toEqual(['meta', 'Instagram or Facebook', 'instagram-or-facebook', null])
    expect(s({ gclid: 'x', fbclid: 'y' })[0]).toBe('google_ads')
  })
  it('the referring site is a hint; nothing at all is "Direct or unknown"', () => {
    expect(s({ ref_host: 'l.instagram.com' })[0]).toBe('instagram')
    expect(s({ ref_host: 'lm.facebook.com' })[0]).toBe('facebook')
    expect(s({ ref_host: 'www.google.co.in' })[0]).toBe('google')
    expect(s({ ref_host: 'com.google.android.youtube' })[0]).toBe('youtube')
    expect(s({ ref_host: 'www.fashionblog.in' })).toEqual(['website', 'fashionblog.in', 'fashionblog-in', null])
    expect(s({})).toEqual(['direct', 'Direct or unknown', 'direct-or-unknown', null])
  })
  it('a hostile typed value is only ever a label and a [a-z0-9-] slug', () => {
    const r = classifySource({ utm_source: '<img src=x onerror=alert(1)>' }, null)
    expect(r.slug).toMatch(/^[a-z0-9-]{1,64}$/)
    expect(r.channel).toBe('other')
  })
})

describe('shopLink: one builder, never another site', () => {
  it('tags from a preset, the campaign normalised', () => {
    expect(shopLink('https://kesar.in', '/products/chanderi-kurta', { preset: 'instagram_bio', campaign: 'Diwali Drop!' }))
      .toBe('https://kesar.in/products/chanderi-kurta?utm_source=instagram&utm_medium=bio&utm_campaign=diwali-drop')
    expect(shopLink('https://kesar.in', '/', { code: 'RIYA10' })).toBe('https://kesar.in/?code=RIYA10')
  })
  it('a name cannot smuggle a code or a parameter in', () => {
    const u = new URL(shopLink('https://kesar.in', '/', { preset: 'whatsapp_broadcast', campaign: 'x&code=RIYA10' }))
    expect(u.searchParams.get('code')).toBeNull()
    expect(u.searchParams.get('utm_campaign')).toBe('x-code-riya10')
    expect(campaignTag('!!!')).toBeNull()
  })
  it('refuses another site, a protocol-relative path or a script', () => {
    expect(() => shopLink('https://kesar.in', '//evil.com/x', {})).toThrow()
    expect(() => shopLink('https://kesar.in', 'https://evil.com', {})).toThrow()
    expect(() => shopLink('javascript:alert(1)', '/', {})).toThrow()
    expect(() => shopLink('https://kesar.in', '/\\evil.com', {})).toThrow()
  })
})

describe('judgeable', () => {
  it('a rate from 30', () => { expect(judgeable(29)).toBe(false); expect(judgeable(30)).toBe(true) })
})
