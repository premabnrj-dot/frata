import { describe, expect, it } from 'vitest'
import { hrefFor, listQuery } from '../list-query'

describe('the products list address (PR·1)', () => {
  it('reads filter, sort, search and page; anything unknown is the default', () => {
    expect(listQuery({})).toEqual({ filter: 'all', sort: 'edited', q: '', page: 1 })
    expect(listQuery({ status: 'low', sort: 'stock', q: '  linen   kurta ', page: '3' })).toEqual({ filter: 'low', sort: 'stock', q: 'linen kurta', page: 3 })
    expect(listQuery({ status: 'deleted', sort: 'price', page: '-2' })).toEqual({ filter: 'all', sort: 'edited', q: '', page: 1 })
    expect(listQuery({ status: ['draft', 'active'], page: '1e9' }).page).toBe(1000)
    expect(listQuery({ q: 'x'.repeat(200) }).q).toHaveLength(80)
  })
  it('writes it back without defaults; a change goes to page 1 unless it is the page', () => {
    const q = listQuery({ status: 'draft', q: 'kurta', page: '4' })
    expect(hrefFor(q)).toBe('/console/products?status=draft&q=kurta')
    expect(hrefFor(q, { page: 5 })).toBe('/console/products?status=draft&q=kurta&page=5')
    expect(hrefFor(q, { filter: 'all', q: '' })).toBe('/console/products')
    expect(hrefFor(q, { sort: 'name' })).toBe('/console/products?status=draft&q=kurta&sort=name')
  })
})
