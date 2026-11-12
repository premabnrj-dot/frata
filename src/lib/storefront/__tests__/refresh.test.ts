import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('next/server', () => ({ after: () => { throw new Error('outside a request') } }))
// The cross-instance limiters (one row per shop per 30 s window, per action), as another instance would see them.
const windows = new Set<string>()
vi.mock('@/lib/db/rate-limit', () => ({
  LIMITS: { soldOutPurge: { action: 'sold_out_purge:shop', max: 1, windowSeconds: 30 }, soldOutTrail: { action: 'sold_out_trail:shop', max: 1, windowSeconds: 30 } },
  withinLimit: vi.fn(async (l: { action: string }, subject: string, now: Date) => { const k = `${l.action}:${subject}:${Math.floor(now.getTime() / 30_000)}`; if (windows.has(k)) return false; windows.add(k); return true }),
}))
const { refreshSoldOut } = await import('../refresh')

/** A fake clock: `later` keeps the work, `wait` moves the clock, `run` fires what was queued. */
function timing(start: number) {
  let clock = start
  const queued: (() => Promise<void>)[] = []
  return {
    t: { later: (w: () => Promise<void>) => { queued.push(w) }, wait: async (ms: number) => { clock += ms }, clock: () => clock },
    run: async () => { while (queued.length) await queued.shift()!() },
    set: (ms: number) => { clock = ms },
  }
}
const purged = () => revalidateTag.mock.calls.map((c) => c[0])

describe('refreshSoldOut (speed review P11, 2026-11-11; trailing purge 2026-11-12)', () => {
  it('rebuilds a shop at most once every 30 s, each shop on its own', async () => {
    const f = timing(1_020_000)
    expect(await refreshSoldOut('a', 1_020_000, f.t)).toBe('now')
    expect(await refreshSoldOut('b', 1_030_000, f.t)).toBe('now')
    expect(purged()).toEqual(['shop:a:catalogue', 'shop:b:catalogue'])
  })
  it('a second sell-out inside the window is not dropped: one trailing purge at the window end, however many come', async () => {
    revalidateTag.mockClear()
    const f = timing(1_030_000)
    expect(await refreshSoldOut('a', 1_030_000, f.t)).toBe('trailing')
    expect(await refreshSoldOut('a', 1_040_000, f.t)).toBe('covered') // the same trailer carries it
    expect(purged()).toEqual([])
    await f.run()
    expect(purged()).toEqual(['shop:a:catalogue']) // once, at 1_050_000 (this instance's 30 s and the shared window)
    expect(f.t.clock()).toBe(1_050_000)
    // The trailer counted as the new window's purge: the next sell-out in it trails again, never two purges in a window.
    expect(await refreshSoldOut('a', 1_055_000, f.t)).toBe('trailing')
  })
  it('across instances too: a window another instance already used queues one trailer, and only one instance holds it', async () => {
    revalidateTag.mockClear()
    const f = timing(2_000_000)
    windows.add(`sold_out_purge:shop:c:${Math.floor(2_000_000 / 30_000)}`) // another instance purged shop c in this window
    windows.add(`sold_out_trail:shop:d:${Math.floor(2_000_000 / 30_000)}`) // and holds shop d's trailer
    windows.add(`sold_out_purge:shop:d:${Math.floor(2_000_000 / 30_000)}`)
    expect(await refreshSoldOut('c', 2_000_000, f.t)).toBe('trailing')
    expect(await refreshSoldOut('d', 2_000_000, f.t)).toBe('covered')
    expect(revalidateTag).not.toHaveBeenCalled()
    // Someone purged c in the next window before our trailer fired: it covers our sell-out, so ours purges nothing.
    windows.add(`sold_out_purge:shop:c:${Math.floor(2_010_000 / 30_000)}`)
    await f.run()
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
