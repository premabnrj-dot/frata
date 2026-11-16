import { beforeEach, describe, expect, it, vi } from 'vitest'

// The bag's writer marker (one-address plan P0): each writer names its kind; `keep` leaves the marker; clear removes it.
const store = new Map<string, string>()
let full = false
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { if (full) throw new Error('QuotaExceededError'); store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
})
const { bag } = await import('../bag-store')
const A = 'a', B = 'b'

describe('the bag remembers who filled it', () => {
  beforeEach(() => { full = false; bag.clear() })
  it('a bag link marks it link; the shopper’s own writes mark it shop', () => {
    bag.replace([{ variantId: A, qty: 1 }])
    expect(bag.by()).toBe('link')
    bag.set(A, 2, 'shop')
    expect(bag.by()).toBe('shop')
  })
  it('checkout’s corrections and a join keep the marker', () => {
    bag.replace([{ variantId: A, qty: 1 }])
    bag.add(B, 1, 'keep')
    bag.reconcile([{ variantId: A, qty: 0 }], [])
    expect(bag.by()).toBe('link')
    expect(bag.get()).toEqual([{ variantId: B, qty: 1 }])
    bag.add(A, 1, 'shop'); bag.add(B, 1, 'keep')
    expect(bag.by()).toBe('shop')
  })
  it('clear removes the marker', () => {
    bag.add(A, 1, 'shop')
    bag.clear()
    expect(bag.by()).toBeNull()
    expect(store.has('frrata.bag.by.v1')).toBe(false)
  })
  it('a bag from before the marker reads as unknown', () => {
    store.set('frata.bag.v1', JSON.stringify([{ variantId: A, qty: 1 }]))
    store.delete('frrata.bag.by.v1')
    expect(bag.by()).toBeNull()
  })
})
