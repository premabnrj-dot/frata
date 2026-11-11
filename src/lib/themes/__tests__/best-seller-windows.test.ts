import { describe, expect, it, vi } from 'vitest'
import { resolveTheme } from '@/domains/themes/resolve'
import { signal_1_5_0 } from '@/domains/themes/catalogue/signal/1.5.0'

// The shop's reads this module makes are not called here; only the pure walk is.
vi.mock('@/lib/queries/storefront', () => ({ shopLook: vi.fn() }))
vi.mock('../manifests', () => ({ manifestsFor: vi.fn() }))
const { bestSellerWindows } = await import('../page-look')

// TS1b (architecture 7): the Best sellers windows a Home reads walk its designs as they resolve, a default
// best-sellers grid included, and skip a hidden design: still ≤ 2 windows, as today.
const look = (home: object[]) => resolveTheme(signal_1_5_0, { style: signal_1_5_0.styles[0]!.key, home })
const drop = (id: string, source: object | null, hidden = false) => ({ id, key: 'design', design: 'the-drop', hidden, fill: source ? { pieces: { kind: 'product_grid', source } } : {} })

describe('best sellers windows', () => {
  it('a design\'s grid with a best-sellers source counts; a hidden one doesn\'t; a newest grid reads nothing', () => {
    expect(bestSellerWindows(look([drop('a', { kind: 'best_sellers', days: 30 })]))).toEqual([30])
    expect(bestSellerWindows(look([drop('a', { kind: 'best_sellers', days: 30 }, true)]))).toEqual([])
    expect(bestSellerWindows(look([drop('a', null)]))).toEqual([])
  })
  it('with Products sections, each window once', () => {
    const products = { id: 'p', key: 'products', heading: 'Best', source: { kind: 'best_sellers', days: 90 }, count: 4 }
    expect(bestSellerWindows(look([products, drop('a', { kind: 'best_sellers', days: 90 }), drop('b', { kind: 'best_sellers', days: 30 })])).sort()).toEqual([30, 90])
  })
})
