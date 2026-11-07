import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ PAYMENT_KEYS_SECRET: 'dummy-for-tests' }))
let m: typeof import('../secret-box')
beforeAll(async () => { m = await import('../secret-box') })

describe('secret box', () => {
  it('derives its keys with the salt it always had (the rename to Frrata must not touch it: every stored key would stop opening)', () => {
    expect(m.orderToken('order-pin-1')).toBe('jMOPQ0Unjre44wFjKGZmFg')
  })
  it('opens what it sealed, for that shop and field only', () => {
    const s = m.seal('rzp_secret_123', 'shop-a', 'key_secret')
    expect(m.open(s, 'shop-a', 'key_secret')).toBe('rzp_secret_123')
    expect(m.open(s, 'shop-b', 'key_secret')).toBeNull()
    expect(m.open(s, 'shop-a', 'webhook_secret')).toBeNull()
    expect(m.open(s.slice(0, -2) + 'AA', 'shop-a', 'key_secret')).toBeNull()
    expect(m.seal('x', 'a', 'f')).not.toBe(m.seal('x', 'a', 'f')) // fresh IV each time
  })
  it('gives an order the same 128-bit link every time, and a different one per order', () => {
    expect(m.orderToken('o1')).toBe(m.orderToken('o1'))
    expect(m.orderToken('o1')).not.toBe(m.orderToken('o2'))
    expect(m.orderToken('o1')).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(m.tokenHash('t')).toHaveLength(64)
  })
})
