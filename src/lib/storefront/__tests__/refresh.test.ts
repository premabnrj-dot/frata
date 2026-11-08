import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag }))
const { refreshSoldOut } = await import('../refresh')

describe('refreshSoldOut (speed review P11)', () => {
  it('rebuilds a shop at most once every 30 s, each shop on its own', () => {
    expect(refreshSoldOut('a', 1_000_000)).toBe(true)
    expect(refreshSoldOut('a', 1_010_000)).toBe(false)
    expect(refreshSoldOut('b', 1_010_000)).toBe(true)
    expect(refreshSoldOut('a', 1_030_001)).toBe(true)
    expect(revalidateTag.mock.calls.map((c) => c[0])).toEqual(['shop:a:catalogue', 'shop:b:catalogue', 'shop:a:catalogue'])
  })
})
