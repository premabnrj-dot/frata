import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, pageOf, pageParam } from '../listing'

describe('list paging (speed review P2)', () => {
  it('cuts a list into pages of PAGE_SIZE', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i)
    expect(pageOf(xs, 1)).toMatchObject({ page: 1, pages: 3 })
    expect(pageOf(xs, 1).items).toHaveLength(PAGE_SIZE)
    expect(pageOf(xs, 3).items).toEqual([96, 97, 98, 99])
    expect(pageOf([], 1).pages).toBe(1)
  })
  it('reads only 2 and up from the address (page 1 is the list itself)', () => {
    expect(pageParam('2')).toBe(2)
    for (const bad of ['1', '0', '01', '-2', '2.5', 'x', '99999', undefined]) expect(pageParam(bad)).toBeNull()
  })
})
