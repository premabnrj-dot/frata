import { describe, expect, it } from 'vitest'
import { GROUPS, groupOf, groupsFor, movedTo, pageTitle, type PageKey } from '../groups'
import { SECTIONS } from '../sections'

const OTHER: PageKey[] = ['web-address', 'online-payments', 'shipping-costs', 'emails', 'notifications', 'people', 'billing']
const ALL: PageKey[] = [...SECTIONS.map((s) => s.key), ...OTHER]

describe('settings groups (owner, 2026-11-15)', () => {
  it('every page is in exactly one group, and every grouped page exists', () => {
    for (const k of ALL) expect(GROUPS.filter((g) => g.pages.includes(k)).map((g) => g.key)).toEqual([groupOf(k).key])
    expect(GROUPS.flatMap((g) => g.pages).sort()).toEqual([...ALL].sort())
    for (const k of ALL) expect(pageTitle(k)).toBeTruthy()
  })
  it('an old address goes to a page that exists; anything else, including object keys, goes nowhere', () => {
    for (const old of ['brand', 'taxes', 'documents', 'address']) expect(ALL).toContain(movedTo(old))
    for (const k of ['constructor', '__proto__', 'toString', 'store', 'nope']) expect(movedTo(k)).toBeNull()
  })
  it('who sees which pages', () => {
    const pages = (r: Parameters<typeof groupsFor>[0]) => groupsFor(r).flatMap((g) => g.pages)
    expect(pages('owner').sort()).toEqual([...ALL].sort())
    expect(pages('admin')).not.toContain('online-payments')
    expect(pages('partner')).toEqual(expect.arrayContaining(['store', 'payments', 'shipping-costs']))
    expect(pages('partner')).not.toContain('people')
    expect(pages('partner')).not.toContain('billing')
    expect(groupsFor('staff')).toEqual([])
    expect(groupsFor('accountant')).toEqual([])
  })
})
