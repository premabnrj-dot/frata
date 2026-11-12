// =============================================================================
// FILE: src/domains/catalogue/list-query.ts
//
// THE PRODUCTS LIST'S ADDRESS, read once (products PR·1): which filter, sort, search and page a URL asks for, with
// anything unknown falling back to the default. Filters are links, so the back button and a shared link both work;
// `hrefFor` writes the address back, leaving defaults out.
// =============================================================================

export const LIST_FILTERS = ['all', 'active', 'draft', 'unlisted', 'archived', 'low'] as const
export const LIST_SORTS = ['edited', 'name', 'stock'] as const
export type ListFilter = (typeof LIST_FILTERS)[number]
export type ListSort = (typeof LIST_SORTS)[number]
export type ListQuery = { filter: ListFilter; sort: ListSort; q: string; page: number }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export function listQuery(sp: Record<string, string | string[] | undefined>): ListQuery {
  const f = one(sp.status) || (one(sp.low) === '1' ? 'low' : '')
  const filter = (LIST_FILTERS as readonly string[]).includes(f) ? (f as ListFilter) : 'all'
  const s = one(sp.sort)
  const sort = (LIST_SORTS as readonly string[]).includes(s) ? (s as ListSort) : 'edited'
  const q = one(sp.q).trim().replace(/\s+/g, ' ').slice(0, 80)
  const n = Math.floor(Number(one(sp.page)))
  return { filter, sort, q, page: Number.isFinite(n) && n >= 1 ? Math.min(n, 1000) : 1 }
}

export function hrefFor(q: ListQuery, change: Partial<ListQuery> = {}): string {
  const next = { ...q, page: 1, ...change }
  const p = new URLSearchParams()
  if (next.filter !== 'all') p.set('status', next.filter)
  if (next.q) p.set('q', next.q)
  if (next.sort !== 'edited') p.set('sort', next.sort)
  if (next.page > 1) p.set('page', String(next.page))
  const s = p.toString()
  return `/console/products${s ? `?${s}` : ''}`
}
