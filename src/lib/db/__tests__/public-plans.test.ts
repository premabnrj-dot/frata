import { afterEach, describe, expect, it, vi } from 'vitest'

// The public pages' plans read (website spec W·1): a failure falls back only while Next builds; at runtime it throws,
// so the last good cached page stays instead of an hour of "no prices".
vi.mock('@/lib/db/index', () => ({ db: () => ({ execute: () => Promise.reject(new Error('connection refused')) }) }))
vi.mock('../index', () => ({ db: () => ({ execute: () => Promise.reject(new Error('connection refused')) }) }))

describe('publicPlansForPage', () => {
  afterEach(() => { delete process.env.NEXT_PHASE })
  it('falls back to no plans during the build', async () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    const { publicPlansForPage } = await import('../platform')
    expect(await publicPlansForPage('home')).toEqual([])
  })
  it('throws at runtime, so the cached page stays', async () => {
    const { publicPlansForPage } = await import('../platform')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(publicPlansForPage('home')).rejects.toThrow('connection refused')
  })
})
