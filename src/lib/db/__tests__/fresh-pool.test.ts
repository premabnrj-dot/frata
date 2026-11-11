import { describe, expect, it } from 'vitest'
import { withFreshPool } from '../index'

describe('withFreshPool', () => {
  it('answers as usual when the pool answers', async () => {
    expect(await withFreshPool(async () => 'ok', 50)).toBe('ok')
  })
  it('a query that never answers is tried once more on a fresh pool, within the deadline', async () => {
    let calls = 0
    const t0 = Date.now()
    const r = await withFreshPool(() => (++calls === 1 ? new Promise<string>(() => {}) : Promise.resolve('fresh')), 50)
    expect(r).toBe('fresh')
    expect(calls).toBe(2)
    expect(Date.now() - t0).toBeLessThan(1000)
  })
  it('an error is not retried', async () => {
    let calls = 0
    await expect(withFreshPool(async () => { calls++; throw new Error('refused') }, 50)).rejects.toThrow('refused')
    expect(calls).toBe(1)
  })
})
