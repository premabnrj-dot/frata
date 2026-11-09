import { beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

beforeAll(() => {
  process.env.EKCODE_PHONE_PEPPERS = 'p1:' + 'q'.repeat(44)
  process.env.EKCODE_SEAL_KEYS = 'k1:' + 'z'.repeat(44)
})

describe('EkCode keys', async () => {
  it('phone hashes carry their key id, differ from code hashes, and seal by row', async () => {
    vi.resetModules()
    const k = await import('../keys')
    const p = k.phoneKeys('9845012345')
    expect(p.write).toMatch(/^p1:[0-9a-f]{64}$/)
    expect(p.lookup).toEqual([p.write])
    expect(k.codeKeys('c1', '482913').write).not.toBe(k.codeKeys('c2', '482913').write)
    const sealed = k.ekSeal('Ananya Rao', 'ekcode_accounts:name:a1')
    expect(k.ekOpen(sealed, 'ekcode_accounts:name:a1')).toBe('Ananya Rao')
    expect(k.ekOpen(sealed, 'ekcode_accounts:name:a2')).toBeNull()
  })
  it('network buckets from ipBucket: /24 and /16, /64 and /48; junk shares one bucket', async () => {
    const { networkBuckets } = await import('../keys')
    const { ipBucket } = await import('@/lib/http/client-ip')
    expect(networkBuckets(ipBucket('203.0.113.77'))).toEqual({ narrow: '4:203.0.113', wide: '4:203.0' })
    expect(networkBuckets(ipBucket('::ffff:203.0.113.77')).narrow).toBe('4:203.0.113')
    expect(networkBuckets(ipBucket('2001:db8:abcd:12:1::5'))).toEqual({ narrow: '6:2001:db8:abcd:12', wide: '6:2001:db8:abcd' })
    expect(networkBuckets('nonsense')).toEqual({ narrow: 'x:unknown', wide: 'x:unknown' })
  })
  it('S256, random tokens, six-digit codes, timing-safe compare', async () => {
    const k = await import('../keys')
    // RFC 7636 appendix B
    expect(k.s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    expect(k.randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(k.newCode()).toMatch(/^\d{6}$/)
    expect(k.sameToken('abc', 'abc')).toBe(true)
    expect(k.sameToken('abc', 'abd')).toBe(false)
    expect(k.sameToken('abc', 'ab')).toBe(false)
  })
})
