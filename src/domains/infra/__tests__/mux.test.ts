import { describe, expect, it } from 'vitest'
import { muxAlerts, muxFacts, type VideoFact } from '../mux'

const now = new Date('2026-11-11T12:00:00Z')
const v = (o: Partial<VideoFact>): VideoFact => ({
  assetId: 'a1', tenantId: 't1', shop: 'Kesar Studio', plan: 'growth', onTrial: false, use: 'product', durationMs: 24_000,
  createdAt: new Date('2026-11-05T10:00:00Z'), uploaded: true, readyAt: new Date('2026-11-05T10:02:00Z'), mp4ReadyAt: new Date('2026-11-05T10:03:00Z'),
  erroredAt: null, error: null, removedAt: null, product: 'Chanderi kurta set', ...o,
})

describe('muxFacts', () => {
  it('counts live, stored and delivered; caps from the plan; top video with its share', () => {
    const vids = [v({}), v({ assetId: 'a2', use: 'loop', durationMs: 12_000, mp4ReadyAt: new Date('2026-11-06T00:00:00Z'), product: null }),
      v({ assetId: 'a3', removedAt: new Date('2026-11-08T00:00:00Z') }), v({ assetId: null, tenantId: 't2', shop: 'Neel & Co', plan: 'launch', uploaded: false, readyAt: null, mp4ReadyAt: null, createdAt: new Date('2026-11-11T11:59:00Z') })]
    const f = muxFacts([{ day: '2026-11-09', assetId: 'a1', minutes: 900 }, { day: '2026-11-10', assetId: 'a2', minutes: 100 }, { day: '2026-10-31', assetId: 'a1', minutes: 5000 }], vids, now)
    expect(f.deliveredMinutes).toBe(1000)
    expect(f.liveVideos).toBe(3) // a1, a2, and the new one still uploading
    expect(f.liveProduct).toBe(2)
    expect(f.storedMinutes).toBe(Math.round((24 + 12 + 24) / 60))
    expect(f.top[0]).toMatchObject({ assetId: 'a1', label: 'Chanderi kurta set', share: 0.9 })
    expect(f.top[1]?.label).toBe('Look loop')
    expect(f.shops.find((s) => s.tenantId === 't1')).toMatchObject({ plan: 'growth', cap: 1000, liveProduct: 1, minutes: 1000 })
    expect(f.uploadsToday).toBe(1)
    expect(f.estimateMicros).toBeGreaterThan(0)
  })
})

describe('muxAlerts', () => {
  it('pace past the free minutes, one video over a quarter, failed uploads', () => {
    const vids = Array.from({ length: 6 }, (_, i) => v({ assetId: `f${i}`, createdAt: new Date('2026-11-11T08:00:00Z'), erroredAt: i < 2 ? new Date('2026-11-11T09:00:00Z') : null, error: i < 2 ? 'too_long' : null }))
    const f = muxFacts([{ day: '2026-11-09', assetId: 'f3', minutes: 40_000 }, { day: '2026-11-10', assetId: 'f4', minutes: 5_000 }], vids, now)
    const a = muxAlerts(f)
    expect(a.map((x) => x.key)).toEqual(['mux.pace', 'mux.video', 'mux.failed'])
    expect(a[1]!.title).toBe('One video is 89% of delivery')
    expect(a[2]!.title).toBe('2 of 6 uploads didn’t work today')
  })
  it('a quiet month needs nothing', () => {
    expect(muxAlerts(muxFacts([{ day: '2026-11-09', assetId: 'a1', minutes: 50 }], [v({})], now))).toEqual([])
  })
})
