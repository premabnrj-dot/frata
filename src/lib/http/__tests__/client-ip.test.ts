import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
const { ipBucket } = await import('../client-ip')

describe('ipBucket (security review S8)', () => {
  it('keeps an IPv4 address whole', () => { expect(ipBucket('203.0.113.9')).toBe('203.0.113.9') })
  it('cuts IPv6 to its /64, however it is written', () => {
    expect(ipBucket('2401:4900:1c2a:5d00:1:2:3:4')).toBe('2401:4900:1c2a:5d00::/64')
    expect(ipBucket('2401:4900:1c2a:5d00:ffff::9')).toBe('2401:4900:1c2a:5d00::/64')
    expect(ipBucket('2401:4900:0:0::1')).toBe('2401:4900:0:0::/64')
    expect(ipBucket('[2401:4900:1c2a:5d00::1]:443')).toBe('2401:4900:1c2a:5d00::/64')
  })
  it('reads an IPv4-mapped address as IPv4', () => { expect(ipBucket('::ffff:203.0.113.9')).toBe('203.0.113.9') })
  it('leaves something unparseable as it was', () => { expect(ipBucket('not:an:ip')).toBe('not:an:ip') })
})
