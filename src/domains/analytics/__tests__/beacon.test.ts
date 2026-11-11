import { describe, expect, it } from 'vitest'
import { agentOf, isBot } from '../device'
import { BeaconZ, cityOf, looksPersonal, MAX_EVENTS, pathShape, toBatch } from '../event'
import { networkOf, visitorInput } from '../visitor'

const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const INSTAGRAM = 'Mozilla/5.0 (Linux; Android 13; RMX3511 Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Instagram 352.0.0.40.104 Android'
const FB_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.98;FBBV/123]'
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const MAC_EDGE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'

describe('device.ts', () => {
  it('reads phones, tablets, computers and the browser', () => {
    expect(agentOf(ANDROID_CHROME)).toEqual({ device: 'phone', browser: 'chrome', inApp: '' })
    expect(agentOf(IPHONE_SAFARI)).toEqual({ device: 'phone', browser: 'safari', inApp: '' })
    expect(agentOf(IPAD)).toEqual({ device: 'tablet', browser: 'safari', inApp: '' })
    expect(agentOf(MAC_EDGE)).toEqual({ device: 'computer', browser: 'edge', inApp: '' })
  })
  it('names the in-app browsers shops care about', () => {
    expect(agentOf(INSTAGRAM).inApp).toBe('instagram')
    expect(agentOf(FB_IOS)).toEqual({ device: 'phone', browser: 'safari', inApp: 'facebook' })
  })
  it('a crawler, a preview, a script or no User-Agent is a bot; shoppers are not', () => {
    for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'facebookexternalhit/1.1',
      'WhatsApp/2.24.1 A', 'curl/8.5.0', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36', '', null]) {
      expect(isBot(ua), String(ua)).toBe(true)
    }
    for (const ua of [ANDROID_CHROME, IPHONE_SAFARI, INSTAGRAM, FB_IOS, IPAD, MAC_EDGE]) expect(isBot(ua), ua).toBe(false)
  })
})

describe('visitor.ts', () => {
  it('keeps the /24 of IPv4 and the /48 of IPv6, never the address', () => {
    expect(networkOf('49.36.112.7')).toBe('49.36.112')
    expect(networkOf('::ffff:49.36.112.7')).toBe('49.36.112')
    expect(networkOf('2405:201:3002:8a1f::1')).toBe('2405:201:3002')
    expect(networkOf('2405:201::1')).toBe('2405:201:0')
    expect(networkOf('999.1.1.1')).toBe('')
    expect(networkOf('not an ip')).toBe('')
    expect(networkOf('1::2::3')).toBe('')
  })
  it('one network is one input; parts are length-prefixed', () => {
    expect(visitorInput('49.36.112.7', 'UA')).toBe(visitorInput('49.36.112.200', 'UA'))
    expect(visitorInput('49.36.112.7', 'UA')).toBe('9:49.36.112|2:UA')
    expect(visitorInput('49.36.112.7', 'x'.repeat(500)).length).toBeLessThan(330)
  })
})

describe('event.ts', () => {
  const pid = '6f1f4a2e-9d7b-4c1e-8a3f-2b5c7d9e0a11'
  it('takes a landing, a product view, a bag add and a vital', () => {
    const b = BeaconZ.parse({ e: [
      { k: 'page_view', l: true, p: '/products/kurta', us: 'instagram', um: 'bio', rh: 'l.instagram.com', fb: true, cc: 'RIYA10' },
      { k: 'view_item', pid }, { k: 'add_to_cart', pid }, { k: 'web_vital', m: 'lcp', v: 2100 },
    ] })
    const batch = toBatch(b, agentOf(ANDROID_CHROME), cityOf('Pune'))
    expect(batch).toMatchObject({ d: 'phone', b: 'chrome', a: '', c: 'Pune' })
    expect(batch.e).toHaveLength(4)
  })
  it('refuses a query or fragment in a path, a URL as the referrer, unknown keys or kinds, and too many events', () => {
    for (const e of [
      { k: 'page_view', p: '/orders/view#t=abc' }, { k: 'page_view', p: '/x?y=1' }, { k: 'page_view', p: 'products' },
      { k: 'page_view', rh: 'https://instagram.com/x' }, { k: 'page_view', extra: 1 }, { k: 'login' },
      { k: 'view_item', pid: 'not-a-uuid' }, { k: 'web_vital', m: 'lcp' }, { k: 'page_view', m: 'lcp', v: 1 },
      { k: 'page_view', us: 'a‮b' }, { k: 'page_view', cc: 'RIYA-10' }, { k: 'web_vital', m: 'lcp', v: 700_000 },
    ]) expect(BeaconZ.safeParse({ e: [e] }).success, JSON.stringify(e)).toBe(false)
    expect(BeaconZ.safeParse({ e: Array(MAX_EVENTS + 1).fill({ k: 'page_view' }) }).success).toBe(false)
    expect(BeaconZ.safeParse({ e: [] }).success).toBe(false)
    expect(BeaconZ.safeParse({ e: [{ k: 'page_view' }], tenant: 'x' }).success).toBe(false)
  })
  it('the city header is decoded, cleaned and capped', () => {
    expect(cityOf('New%20Delhi')).toBe('New Delhi')
    expect(cityOf(null)).toBe('')
    expect(cityOf('%E0%A4')).toBe('')
    expect(cityOf('x'.repeat(61))).toBe('')
  })
  it('keeps the shop\'s own path shapes only', () => {
    expect(pathShape('/')).toBe('/')
    expect(pathShape('/products/chanderi-kurta-set')).toBe('/products/chanderi-kurta-set')
    expect(pathShape('/collections/festive/page/2')).toBe('/collections/festive')
    expect(pathShape('/products/page/3')).toBe('/products/page')
    expect(pathShape('/policies/returns')).toBe('/policies/returns')
    expect(pathShape('/bag/')).toBe('/bag')
    for (const p of ['/9876543210', '/priya%40gmail.com', '/products/Kurta', '/products/a/b', '/x']) expect(pathShape(p), p).toBe('other')
  })
  it('drops a tag that looks like an email or a phone, and keeps the event', () => {
    expect(looksPersonal('priya@gmail.com')).toBe(true)
    expect(looksPersonal('98450 12345')).toBe(true)
    expect(looksPersonal('+91-98450-12345')).toBe(true)
    expect(looksPersonal('diwali-2026')).toBe(false)
    const b = BeaconZ.parse({ e: [{ k: 'page_view', l: true, us: 'whatsapp', uc: 'priya@gmail.com' }] })
    expect(b.e[0]).toMatchObject({ us: 'whatsapp' })
    expect(b.e[0]!.uc).toBeUndefined()
  })
})
