import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { pagedSweep } from '../sweeps'

const ids = Array.from({ length: 1201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
const page = async (_s: Date, _u: Date, after: string | null) => ids.filter((x) => after === null || x > after).slice(0, 500)

describe('pagedSweep (SA1b D·6)', () => {
  it('reaches every shop in pages of 500, the window fixed', async () => {
    const seen: string[] = [], windows = new Set<string>()
    const r = await pagedSweep('t', async (s, u, a) => { windows.add(`${s.getTime()}-${u.getTime()}`); return page(s, u, a) }, new Date(1), new Date(2), Infinity, async (x) => { seen.push(...x) })
    expect(r).toEqual({ shops: 1201, done: true })
    expect(new Set(seen).size).toBe(1201)
    expect(windows.size).toBe(1)
  })
  it('stops at the deadline and says so', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    let t = 0
    const r = await pagedSweep('t', page, new Date(1), new Date(2), 1, async () => { t += 1 }, () => t)
    expect(r).toEqual({ shops: 1000, done: false })
    expect(err).toHaveBeenCalledWith(expect.stringContaining('deadline'))
    err.mockRestore()
  })
  it('a failing page stops the sweep, logged', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await pagedSweep('t', async () => { throw new Error('db') }, new Date(1), new Date(2), Infinity, async () => {})
    expect(r).toEqual({ shops: 0, done: false })
    err.mockRestore()
  })
})
