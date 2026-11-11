import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ after: () => {} }))
vi.mock('@/lib/queries/modules', () => ({ shopModules: async () => ({ access: {} }) }))
// The drain runs only in production or e2e (security review H4): this test is the production case.
let env = { VERCEL_ENV: 'production', E2E_FIXTURES: false }
vi.mock('@/lib/env', () => ({ get VERCEL_ENV() { return env.VERCEL_ENV }, get E2E_FIXTURES() { return env.E2E_FIXTURES } }))
vi.mock('@/lib/modules/reviews/sender', () => ({ sendReviewAsk: vi.fn() }))
vi.mock('@/lib/domains/senders', () => ({ sendDomainAdd: vi.fn(), sendDomainRemove: vi.fn() }))
vi.mock('@/lib/billing/debit', () => ({ sendBillAttempt: vi.fn() }))
vi.mock('../index', () => ({ GiveUp: class GiveUp extends Error {}, Later: class Later extends Error {}, claimDue: vi.fn(), deferRow: vi.fn(), markDead: vi.fn(), markFailed: vi.fn(), markSent: vi.fn() }))
const { eachLimited, drainOutbox } = await import('../drain')
const idx = await import('../index')

describe('eachLimited', () => {
  it('runs every item, never more than the limit at once', async () => {
    let live = 0, most = 0; const done: number[] = []
    await eachLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => { live++; most = Math.max(most, live); await new Promise((r) => setTimeout(r, 2)); done.push(n); live-- })
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]); expect(most).toBe(3)
  })
})

describe('drainOutbox (speed review P5)', () => {
  it('claims batch after batch until the queue is short of a batch', async () => {
    const row = (i: number) => ({ id: `r${i}`, kind: 'nothing.registered', tenantId: 't', attempts: 1 })
    vi.mocked(idx.claimDue).mockReset().mockResolvedValueOnce(Array.from({ length: 25 }, (_, i) => row(i)) as never).mockResolvedValueOnce(Array.from({ length: 25 }, (_, i) => row(25 + i)) as never).mockResolvedValueOnce([row(50)] as never)
    const r = await drainOutbox(Date.now() + 10_000)
    expect(r.claimed).toBe(51)
    expect(idx.claimDue).toHaveBeenCalledTimes(3)
  })
  it('a preview build never drains (it may share production’s database)', async () => {
    env = { VERCEL_ENV: 'preview', E2E_FIXTURES: false }
    vi.mocked(idx.claimDue).mockReset().mockResolvedValue([{ id: 'r', kind: 'x', tenantId: 't', attempts: 1 }] as never)
    expect((await drainOutbox(Date.now() + 10_000)).claimed).toBe(0)
    expect(idx.claimDue).not.toHaveBeenCalled()
    env = { VERCEL_ENV: 'production', E2E_FIXTURES: false }
  })
  it('a sender that gives up stops its row at once, never retried', async () => {
    const drain = await import('../drain')
    const { GiveUp } = await import('../index')
    drain.SENDERS['test:giveup'] = async () => { throw new (GiveUp as unknown as new (m: string) => Error)('malformed') }
    vi.mocked(idx.claimDue).mockReset().mockResolvedValueOnce([{ id: 'g', kind: 'test:giveup', tenantId: 't', attempts: 1 }] as never)
    vi.mocked(idx.markDead).mockReset(); vi.mocked(idx.markFailed).mockReset()
    await drainOutbox(Date.now() + 10_000)
    expect(idx.markDead).toHaveBeenCalledWith('g', 'malformed'); expect(idx.markFailed).not.toHaveBeenCalled()
    delete drain.SENDERS['test:giveup']
  })
  it('stops at the deadline', async () => {
    vi.mocked(idx.claimDue).mockReset().mockResolvedValue([] as never)
    expect((await drainOutbox(Date.now() - 1)).claimed).toBe(0)
    expect(idx.claimDue).not.toHaveBeenCalled()
  })
})
