import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { hashes, needsReseal, openRing, parseRing, sealRing } from '../key-ring'

const A = 'k1:' + 'a'.repeat(44)
const B = 'k2:' + 'b'.repeat(44)

describe('key ring', () => {
  it('parses newest first and drops unusable entries', () => {
    expect(parseRing(`${B},${A}`).map((k) => k.id)).toEqual(['k2', 'k1'])
    expect(parseRing('bad,k3:short,K4:' + 'c'.repeat(44))).toEqual([])
    expect(parseRing('')).toEqual([])
  })
  it('seals under the newest key, opens after a rotation, and says when to reseal', () => {
    const old = parseRing(A)
    const sealed = sealRing(old, '14 Lavelle Rd', 'ekcode_addresses:sealed:r1')
    const rotated = parseRing(`${B},${A}`)
    expect(openRing(rotated, sealed, 'ekcode_addresses:sealed:r1')).toBe('14 Lavelle Rd')
    expect(needsReseal(rotated, sealed)).toBe(true)
    expect(needsReseal(rotated, sealRing(rotated, 'x', 'a'))).toBe(false)
  })
  it('refuses another row, a removed key and tampering', () => {
    const ring = parseRing(A)
    const sealed = sealRing(ring, 'Ananya', 'ekcode_accounts:name:r1')
    expect(openRing(ring, sealed, 'ekcode_accounts:name:r2')).toBeNull()
    expect(openRing(parseRing(B), sealed, 'ekcode_accounts:name:r1')).toBeNull()
    expect(openRing(ring, sealed.slice(0, -2) + 'AA', 'ekcode_accounts:name:r1')).toBeNull()
    expect(openRing(ring, 'v1.x.y', 'a')).toBeNull()
  })
  it('hashes: write with the newest, look up with every live key; purposes differ', () => {
    const ring = parseRing(`${B},${A}`)
    const h = hashes(ring, 'phone', '9845012345')
    expect(h.write.startsWith('k2:')).toBe(true)
    expect(h.lookup).toHaveLength(2)
    expect(h.lookup[1]).toBe(hashes(parseRing(A), 'phone', '9845012345').write)
    expect(hashes(ring, 'ip', '9845012345').write).not.toBe(h.write)
  })
})
