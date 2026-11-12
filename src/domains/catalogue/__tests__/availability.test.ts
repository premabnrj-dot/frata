import { describe, expect, it } from 'vitest'
import { availability, bestOffer, statusLabel, visibility, type VariantFacts } from '../availability'

const now = new Date('2026-11-06T12:00:00+05:30')
const v = (p: Partial<VariantFacts>): VariantFacts => ({ stock: 0, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null, ...p })

describe('availability', () => {
  it('in stock, low stock from real stock only, sold out', () => {
    expect(availability(v({ stock: 12 }), now).kind).toBe('in_stock')
    expect(availability(v({ stock: 2 }), now)).toMatchObject({ kind: 'low_stock', label: 'Only 2 left' })
    expect(availability(v({ stock: 0 }), now)).toMatchObject({ kind: 'sold_out', canBuy: false, google: 'out_of_stock' })
  })
  it('pre-order with a future date, until the cap; then sold out', () => {
    const p = availability(v({ whenOut: 'preorder', shipsBy: '2026-12-12' }), now)
    expect(p).toMatchObject({ kind: 'preorder', label: 'Pre-order · ships by 12 Dec', google: 'preorder', availabilityDate: '2026-12-12T00:00:00+05:30' })
    expect(availability(v({ whenOut: 'preorder', shipsBy: '2026-12-12', preorderCap: 20, preordered: 20 }), now).kind).toBe('sold_out')
    expect(availability(v({ whenOut: 'preorder', shipsBy: '2026-11-01' }), now).kind).toBe('sold_out')
  })
  it('stock first: a pre-order variant with stock sells from stock', () => expect(availability(v({ stock: 5, whenOut: 'preorder', shipsBy: '2026-12-12' }), now).kind).toBe('in_stock'))
  it('made to order', () => expect(availability(v({ whenOut: 'made_to_order', leadMinDays: 10, leadMaxDays: 14 }), now).label).toBe('Made to order · ships in 10–14 days'))
})

describe('visibility', () => {
  it('draft is not found; archived redirects; unlisted opens but is not listed', () => {
    expect(visibility('draft', null, now)).toMatchObject({ reachable: false, http: 404 })
    expect(visibility('archived', null, now)).toMatchObject({ reachable: false, http: 404, gone: true })
    expect(visibility('unlisted', null, now)).toMatchObject({ reachable: true, listed: false, indexable: false, canBuy: true })
    expect(visibility('active', null, now)).toMatchObject({ reachable: true, listed: true, indexable: true })
  })
  it('a scheduled drop is hidden until its minute', () => {
    const at = new Date('2026-11-14T10:00:00+05:30')
    expect(visibility('active', at, now)).toMatchObject({ scheduled: true, reachable: false, http: 404 })
    expect(visibility('active', at, new Date('2026-11-14T10:00:01+05:30')).listed).toBe(true)
    expect(statusLabel('active', at, now)).toBe('Scheduled')
  })
})

describe('bestOffer: the list badge is what shoppers see (PR·0)', () => {
  const now = new Date('2026-11-13T06:00:00Z')
  const v = (x: Partial<VariantFacts>): VariantFacts => ({ stock: 0, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null, ...x })
  it('in stock first, then what sells at 0, then sold out; none is null', () => {
    expect(bestOffer([v({}), v({ stock: 5 })], now)?.kind).toBe('in_stock')
    expect(bestOffer([v({}), v({ whenOut: 'made_to_order', leadMinDays: 7, leadMaxDays: 10 })], now)?.kind).toBe('made_to_order')
    expect(bestOffer([v({})], now)?.canBuy).toBe(false)
    expect(bestOffer([], now)).toBeNull()
  })
})

