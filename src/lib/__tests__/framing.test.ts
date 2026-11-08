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
    expect(framed.headers.find((h) => h.key === 'Content-Security-Policy')?.value).toMatch(/frame-ancestors 'self'; object-src 'none'; base-uri 'self'/)
    expect(preview.find((r) => frameOf(r) === 'DENY')!.missing?.[0]).toMatchObject({ type: 'host' })
  })
})
