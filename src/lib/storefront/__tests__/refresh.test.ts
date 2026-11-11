import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag }))
// The cross-instance limiter (one row per shop per 30 s window), as another instance would see it.
const windows = new Set<string>()
vi.mock('@/lib/db/rate-limit', () => ({
  LIMITS: { soldOutPurge: { action: 'sold_out_purge:shop', max: 1, windowSeconds: 30 } },
  withinLimit: vi.fn(async (_l: unknown, subject: string, now: Date) => { const k = `${subject}:${Math.floor(now.getTime() / 30_000)}`; if (windows.has(k)) return false; windows.add(k); return true }),
}))
const { refreshSoldOut } = await import('../refresh')

describe('refreshSoldOut (speed review P11, 2026-11-11)', () => {
  it('rebuilds a shop at most once every 30 s, each shop on its own', async () => {
    expect(await refreshSoldOut('a', 1_020_000)).toBe(true)
    expect(await refreshSoldOut('a', 1_030_000)).toBe(false)
    expect(await refreshSoldOut('b', 1_030_000)).toBe(true)
    expect(await refreshSoldOut('a', 1_050_001)).toBe(true)
    expect(revalidateTag.mock.calls.map((c) => c[0])).toEqual(['shop:a:catalogue', 'shop:b:catalogue', 'shop:a:catalogue'])
  })
  it('across instances too: a window another instance already used purges nothing', async () => {
    revalidateTag.mockClear()
    windows.add(`c:${Math.floor(2_000_000 / 30_000)}`) // another instance purged shop c in this window
    expect(await refreshSoldOut('c', 2_000_000)).toBe(false)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
