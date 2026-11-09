import { describe, expect, it } from 'vitest'
import config from '../../../next.config'

// Framing (themes plan T1·4, architecture + tenancy review): every path may not be framed, except the customizer's
// look preview on the console host. Next applies every matching entry; a later one cannot remove a header.
describe('framing headers', () => {
  it('DENY everywhere; SAMEORIGIN + frame-ancestors self only for the look preview on the console host', async () => {
    const rules = await config.headers!()
    const frameOf = (r: (typeof rules)[number]) => r.headers.find((h) => h.key === 'X-Frame-Options')?.value
    const global = rules.find((r) => r.source.startsWith('/:path'))!
    expect(frameOf(global)).toBe('DENY')
    const re = new RegExp(`^${global.source.replace('/:path(', '/(')}$`)
    expect(re.test('/console/orders')).toBe(true)
    expect(re.test('/s/kesar.frata.test/products/x')).toBe(true)
    expect(re.test('/console/theme-preview/abc')).toBe(false)
    const preview = rules.filter((r) => r.source === '/console/theme-preview/:path*')
    expect(preview.map(frameOf).sort()).toEqual(['DENY', 'SAMEORIGIN'])
    const framed = preview.find((r) => frameOf(r) === 'SAMEORIGIN')!
    expect(framed.has?.[0]).toMatchObject({ type: 'host' })
    // A dot in the console host is literal: frata-vercel.app is not frata.vercel.app (security review D·2 L4).
    const { CONSOLE_HOST } = await import('../public-env')
    const hostRe = new RegExp(`^${framed.has![0]!.value}$`)
    expect(hostRe.test(CONSOLE_HOST)).toBe(true)
    expect(hostRe.test(CONSOLE_HOST.replace('.', '-'))).toBe(false)
    expect(framed.headers.find((h) => h.key === 'Content-Security-Policy')?.value).toMatch(/frame-ancestors 'self'; object-src 'none'; base-uri 'self'/)
    expect(preview.find((r) => frameOf(r) === 'DENY')!.missing?.[0]).toMatchObject({ type: 'host' })
  })
})

import { isSignedInPath, sessionCookieOptions, signedInCsp } from '../security-headers'

// Security review S2/S3 (2026-11-08): the signed-in pages' policy carries the global one (a middleware header
// replaces next.config's), the nonce, and form-action; the look preview alone may be framed by the console.
describe('signed-in policy', () => {
  it('keeps the global directives and adds the nonce and form-action', () => {
    const p = signedInCsp('abc', false)
    expect(p).toMatch(/frame-ancestors 'none'; object-src 'none'; base-uri 'self'/)
    expect(p).toMatch(/script-src 'nonce-abc' 'strict-dynamic'; form-action 'self'$/)
    expect(p).not.toMatch(/unsafe-eval/)
    expect(signedInCsp('abc', false, true)).toMatch(/frame-ancestors 'self'/)
  })
  it('covers the signed-in paths and not the public ones', () => {
    for (const p of ['/console', '/console/orders', '/admin/merchants', '/partner', '/login', '/start']) expect(isSignedInPath(p)).toBe(true)
    for (const p of ['/', '/partners', '/partners/apply', '/frrata-icon']) expect(isSignedInPath(p)).toBe(false)
  })
  it('session cookies are httpOnly, lax, 30 days, Secure outside development', () => {
    expect(sessionCookieOptions(false)).toEqual({ httpOnly: true, sameSite: 'lax', maxAge: 2592000, path: '/', secure: true })
    expect(sessionCookieOptions(true).secure).toBe(false)
  })
})

// Shop addresses D2·1: includeSubDomains only on our own hosts; a merchant's own domain gets a year without it.
describe('HSTS by host', () => {
  it('own domains get max-age=31536000; the console host and *.SHOP_DOMAIN get includeSubDomains, last', async () => {
    const { CONSOLE_HOST, SHOP_DOMAIN } = await import('../public-env')
    const rules = await config.headers!()
    const hsts = (r: (typeof rules)[number]) => r.headers.find((h) => h.key === 'Strict-Transport-Security')?.value
    expect(hsts(rules[0]!)).toBe('max-age=31536000')
    const last = rules[rules.length - 1]!
    expect(hsts(last)).toBe('max-age=63072000; includeSubDomains')
    // Next anchors the value and matches the lowercased host without its port.
    const re = new RegExp(`^${last.has![0]!.value}$`)
    for (const h of [CONSOLE_HOST, SHOP_DOMAIN, `kesar-studio.${SHOP_DOMAIN}`]) expect(re.test(h)).toBe(true)
    for (const h of ['kesarstudio.in', `www.kesarstudio.in`, `kesar.${SHOP_DOMAIN}.evil.in`, `a.b.${SHOP_DOMAIN}`, `x${SHOP_DOMAIN}`]) expect(re.test(h)).toBe(false)
  })
})
