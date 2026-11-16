import { describe, expect, it } from 'vitest'
import { apiShopState, sortApiShops, versionRows, type ApiShopRow } from '../admin-view'

const row = (o: Partial<ApiShopRow>): ApiShopRow => ({ tenantId: 't', name: 'A', slug: 'a', siteHost: 'a.in', mainHost: null, published: true, openedAt: null, liveKeys: 1, testKeys: 0, lastRead: '2026-11-16', lastVersion: '2026-12', partner: null, ...o })

describe('Admin › Storefront API (SA1b D·8)', () => {
  it('an open store with a website and no read today or yesterday is waiting', () => {
    expect(apiShopState(row({ lastRead: '2026-11-16' }), '2026-11-16')).toBe('reading')
    expect(apiShopState(row({ lastRead: '2026-11-15' }), '2026-11-16')).toBe('reading')
    expect(apiShopState(row({ lastRead: '2026-11-14' }), '2026-11-16')).toBe('no_reads')
    expect(apiShopState(row({ lastRead: null }), '2026-11-16')).toBe('no_reads')
    expect(apiShopState(row({ lastRead: null, published: false }), '2026-11-16')).toBe('not_open')
    expect(apiShopState(row({ lastRead: null, siteHost: null }), '2026-11-16')).toBe('reading')
  })
  it('waiting stores first, then by name', () => {
    const got = sortApiShops([row({ name: 'B' }), row({ name: 'Z', lastRead: null }), row({ name: 'A' })], '2026-11-16').map((r) => r.name)
    expect(got).toEqual(['Z', 'A', 'B'])
  })
  it('a version counts the stores that read it in the last 7 days', () => {
    expect(versionRows([row({}), row({ lastRead: '2026-11-10' }), row({ lastRead: '2026-11-09' }), row({ lastVersion: null })], '2026-11-16')).toEqual([{ version: '2026-12', stores: 2 }])
  })
})
