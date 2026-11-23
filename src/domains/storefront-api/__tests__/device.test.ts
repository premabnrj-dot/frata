import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { DEVICE_TERMINAL, deviceCodeOf, endsInWords, startedWords, deviceKeyName, isDeviceSecret, isStoreSlug, networkOf, newDeviceCode, newDeviceSecret } from '../device'

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
    expect(deviceKeyName('Kabir@NeelStudio.in')).toBe('kabir@neelstudio.in’s computer') // four screens § 2
    expect(deviceKeyName('')).toBe('Developer’s computer')
    const long = deviceKeyName(`${'k'.repeat(30)}@neelstudio.in`) // too long whole: the part before the @
    expect(long).toBe(`${'k'.repeat(28)}’s computer`)
    expect(deviceKeyName(`${'k'.repeat(60)}@x.in`).length).toBeLessThanOrEqual(40)
  })
  it('the network a code started from: IPv6 its /64 (ipBucket’s answer), IPv4 its /24, else none', () => {
    expect(networkOf('2405:201:abcd:12::/64')).toBe('2405:201:abcd:12::/64')
    expect(networkOf('49.36.12.200')).toBe('49.36.12.0/24')
    expect(networkOf('49.36.12.300')).toBeNull()
    expect(networkOf('unknown')).toBeNull()
  })
  it('the terminal’s words, as drawn', () => {
    expect(DEVICE_TERMINAL.open('https://frata.vercel.app/partner/developer')).toBe('Open frata.vercel.app/partner/developer')
    expect(DEVICE_TERMINAL.code('HXKT-7P2M')).toBe('Code HXKT-7P2M ends in 10 minutes')
    expect(DEVICE_TERMINAL.done).toBe('Signed in. This computer has a key for 24 hours.')
  })
  it('the dialog’s Started words and a computer’s end, as drawn', () => {
    const now = new Date('2026-11-22T10:00:00Z')
    expect(startedWords(new Date(now.getTime() - 30_000), now)).toBe('just now')
    expect(startedWords(new Date(now.getTime() - 60_000), now)).toBe('1 minute ago')
    expect(startedWords(new Date(now.getTime() - 150_000), now)).toBe('2 minutes ago')
    expect(endsInWords(new Date(now.getTime() + 21 * 3_600_000 + 5 * 60_000), now)).toBe('ends in 21 hours')
    expect(endsInWords(new Date(now.getTime() + 40 * 60_000), now)).toBe('ends in 40 minutes')
  })
})
