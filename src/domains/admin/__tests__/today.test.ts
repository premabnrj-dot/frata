import { describe, expect, it } from 'vitest'
import { countsOf, orderItems, sourcesFor, TODAY_SOURCES, type TodayItem } from '../today'

const item = (kind: TodayItem['kind'], since: string | null, key: string = kind): TodayItem => ({ kind, key, title: kind, line: '', action: 'Open', href: '/admin', since: since ? new Date(since) : null })

describe('Today sources by role (security review H3)', () => {
  it('support never sees money, trials read through billing, or passkey requests', () => {
    const kinds = sourcesFor('support').map((s) => s.kind)
    for (const k of ['overpaid', 'issue_run', 'trial_ending', 'partner_passkey', 'staff_passkey'] as const) expect(kinds).not.toContain(k)
    expect(kinds).toEqual(expect.arrayContaining(['partner_review', 'address_claim', 'owner_waiting', 'theme_new']))
  })
  it('a master admin sees every source', () => {
    expect(sourcesFor('admin')).toHaveLength(TODAY_SOURCES.length)
  })
})

describe('order and counts', () => {
  it('oldest first; undated last; a tie keeps the source order', () => {
    const out = orderItems([item('theme_new', null), item('partner_review', '2026-11-15T10:00:00Z'), item('overpaid', '2026-11-13T10:00:00Z'), item('partner_passkey', '2026-11-15T10:00:00Z')])
    expect(out.map((i) => i.kind)).toEqual(['overpaid', 'partner_passkey', 'partner_review', 'theme_new'])
  })
  it('counts by area, and all; nothing waiting counts nothing (not 0)', () => {
    expect(countsOf([item('overpaid', null, 'a'), item('issue_run', null, 'b'), item('partner_review', null)])).toEqual({ billing: 2, partners: 1, today: 3 })
    expect(countsOf([])).toEqual({})
  })
})
