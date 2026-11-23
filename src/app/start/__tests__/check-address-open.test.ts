import { beforeEach, describe, expect, it, vi } from 'vitest'

// The anonymous address check (O1·7) with its I/O stubbed: which buckets count, and what it answers.
const withinLimit = vi.fn()
const slugAvailable = vi.fn()
let ip = '203.0.113.9'
vi.mock('@/lib/db/rate-limit', () => ({
  LIMITS: { addressOpenIp: { action: 'address_open:ip' }, addressOpenNet: { action: 'address_open:net' }, addressOpenAll: { action: 'address_open:all' } },
  withinLimit: (...a: unknown[]) => withinLimit(...a),
}))
vi.mock('@/lib/db/platform', () => ({ slugAvailable: (s: string) => slugAvailable(s) }))
vi.mock('@/lib/http/client-ip', async () => {
  const real = await vi.importActual<typeof import('@/lib/http/client-ip')>('@/lib/http/client-ip')
  return { ...real, clientIp: async () => real.ipBucket(ip) }
})
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

const { checkAddressOpen } = await import('../check-address-open')
const counted = () => withinLimit.mock.calls.map((c) => [(c[0] as { action: string }).action, c[1], c[3]])

describe('checkAddressOpen', () => {
  beforeEach(() => { ip = '203.0.113.9'; withinLimit.mockReset().mockResolvedValue(true); slugAvailable.mockReset().mockResolvedValue(true) })

  it('a bad shape never touches the limiter or the database', async () => {
    for (const [slug, state] of [['ab', 'too_short'], ['-bad-', 'shape'], ['admin', 'reserved'], ['a'.repeat(31), 'shape'], [42, 'shape'], [null, 'shape']] as const) {
      expect(await checkAddressOpen(slug as string)).toEqual({ state })
    }
    expect(withinLimit).not.toHaveBeenCalled()
    expect(slugAvailable).not.toHaveBeenCalled()
  })
  it('free is ok, used is taken; upper case is lower-cased; every bucket fails closed', async () => {
    expect(await checkAddressOpen('Noor-Threads')).toEqual({ state: 'ok' })
    expect(slugAvailable).toHaveBeenCalledWith('noor-threads')
    expect(counted()).toEqual([['address_open:ip', '203.0.113.9', true], ['address_open:net', '203.0.113.9', true], ['address_open:all', 'all', true]])
    slugAvailable.mockResolvedValue(false)
    expect(await checkAddressOpen('kesar-studio')).toEqual({ state: 'taken' })
  })
  it('refused per network: limited, and the later buckets are not counted', async () => {
    withinLimit.mockResolvedValueOnce(false)
    expect(await checkAddressOpen('noor-threads')).toEqual({ state: 'limited' })
    expect(counted().map((c) => c[0])).toEqual(['address_open:ip'])
    expect(slugAvailable).not.toHaveBeenCalled()
  })
  it('refused per /48: limited, the global bucket not counted', async () => {
    withinLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await checkAddressOpen('noor-threads')).toEqual({ state: 'limited' })
    expect(counted().map((c) => c[0])).toEqual(['address_open:ip', 'address_open:net'])
  })
  it('refused globally: limited', async () => {
    withinLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await checkAddressOpen('noor-threads')).toEqual({ state: 'limited' })
    expect(slugAvailable).not.toHaveBeenCalled()
  })
  it('a database error is limited, never a false answer', async () => {
    slugAvailable.mockRejectedValue(new Error('boom'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await checkAddressOpen('noor-threads')).toEqual({ state: 'limited' })
    expect(JSON.stringify(log.mock.calls)).not.toContain('boom')
    log.mockRestore()
  })
  it('IPv6 is counted by its /64 and by its /48', async () => {
    ip = '2401:4900:1c2a:5d00:1:2:3:4'
    await checkAddressOpen('noor-threads')
    expect(counted().slice(0, 2)).toEqual([['address_open:ip', '2401:4900:1c2a:5d00::/64', true], ['address_open:net', '2401:4900:1c2a::/48', true]])
  })
})
