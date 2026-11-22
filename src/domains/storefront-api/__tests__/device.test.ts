import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { deviceCodeOf, deviceKeyName, isDeviceSecret, isStoreSlug, newDeviceCode, newDeviceSecret } from '../device'

const rnd = (n: number) => new Uint8Array(randomBytes(n))

describe('G·3: the device sign-in’s shapes', () => {
  it('a code is XXXX-XXXX from an alphabet with no vowels or look-alikes, typed any way', () => {
    for (let i = 0; i < 200; i++) expect(newDeviceCode(rnd)).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ2-9]{4}-[BCDFGHJKLMNPQRSTVWXZ2-9]{4}$/)
    expect(deviceCodeOf('bcdf ghjk')).toBe('BCDF-GHJK')
    expect(deviceCodeOf('BCDF-GHJ')).toBeNull()
    expect(deviceCodeOf('BCDF-GHJ0')).toBeNull() // 0 is not in the alphabet
    expect(deviceCodeOf('ABCD-EFGH')).toBeNull() // vowels are not
  })
  it('a device secret is 43 base64url characters', () => {
    const s = newDeviceSecret(rnd)
    expect(isDeviceSecret(s)).toBe(true)
    expect(isDeviceSecret('x'.repeat(42))).toBe(false)
    expect(newDeviceSecret(() => new Uint8Array(32))).toBe('A'.repeat(43))
  })
  it('a store slug, and the key’s name from the email', () => {
    expect(isStoreSlug('house-of-ayuda')).toBe(true)
    expect(isStoreSlug('-x')).toBe(false)
    expect(deviceKeyName('kabir@neelstudio.in')).toBe('kabir’s computer')
    expect(deviceKeyName('')).toBe('Developer’s computer')
    expect(deviceKeyName(`${'k'.repeat(60)}@x.in`).length).toBeLessThanOrEqual(40)
  })
})
