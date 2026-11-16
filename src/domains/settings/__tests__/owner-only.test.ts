import { describe, expect, it } from 'vitest'
import { ASK_PAGES, OWNER_ONLY_FIELDS, OWNER_ONLY_PAGES, askPageOf, lockOf, lockedFor, mayAskOwner, refusalFor, seesAsks } from '../owner-only'
import { SECTIONS } from '../sections'
import { CAPABILITIES, MEMBER_ROLES } from '../../tenancy/roles'

// PP1 (docs/specs/2026-11-16-partner-publishing.md § PP1 plan, owner decisions 1–5): every role × hasOwner × support visit.
const ALL = { pages: ['policies', 'business'], fields: { contact: ['grievanceName', 'grievanceRole', 'grievanceEmail', 'grievancePhone'], invoices: ['docSignatory', 'invoiceSeries'] } }
const NONE = { pages: [], fields: {} }

describe('owner-only settings (PP1)', () => {
  // The whole table, written out: a change to who is locked fails here on purpose.
  const expected: Record<string, [noOwner: boolean, hasOwner: boolean]> = {
    owner: [false, false], admin: [false, false], staff: [false, true], partner: [false, true], accountant: [false, true],
  }
  for (const role of MEMBER_ROLES) {
    for (const hasOwner of [false, true]) {
      it(`${role}, ${hasOwner ? 'a store with an owner' : 'no owner yet'}, in person: ${expected[role]![hasOwner ? 1 : 0] ? 'locked' : 'not locked'}`, () => {
        expect(lockedFor(role, hasOwner, false)).toEqual(expected[role]![hasOwner ? 1 : 0] ? ALL : NONE)
      })
      it(`${role}, ${hasOwner ? 'a store with an owner' : 'no owner yet'}, on a support visit: always locked, never asks`, () => {
        expect(lockedFor(role, hasOwner, true)).toEqual(ALL)
        expect(mayAskOwner(role, hasOwner, true)).toBe(false)
      })
    }
  }
  it('a partner after handover is the one in person who is locked and may ask (staff and accountants never open these pages)', () => {
    expect(mayAskOwner('partner', true, false)).toBe(true)
    expect(mayAskOwner('partner', false, false)).toBe(false)
    expect(mayAskOwner('owner', true, false)).toBe(false)
    expect(mayAskOwner('admin', true, false)).toBe(false)
  })
  it('the list is exactly the drawn one: Policies and Business and GST whole; the grievance officer; the signatory and series', () => {
    expect(OWNER_ONLY_PAGES).toEqual(['policies', 'business'])
    expect(OWNER_ONLY_FIELDS.contact).toEqual(['grievanceName', 'grievanceRole', 'grievanceEmail', 'grievancePhone'])
    expect(OWNER_ONLY_FIELDS.invoices).toEqual(['docSignatory', 'invoiceSeries'])
    // Customer care, WhatsApp, Instagram, the order prefix, the invoice note and the slip size stay the partner's.
    for (const k of ['supportEmail', 'supportPhone', 'whatsapp', 'instagram']) expect(OWNER_ONLY_FIELDS.contact).not.toContain(k)
    for (const k of ['orderPrefix', 'docNote', 'slipSize']) expect(OWNER_ONLY_FIELDS.invoices).not.toContain(k)
  })
  it('every locked field is a field of its section (a renamed field fails here, not silently in a save)', () => {
    for (const [page, keys] of Object.entries(OWNER_ONLY_FIELDS)) {
      const fields = SECTIONS.find((s) => s.key === page)!.blocks.flatMap((b) => b.fields.map((f) => f.key))
      for (const k of keys) expect(fields).toContain(k)
    }
    // The grievance block is locked whole: every one of its fields is in the list.
    const g = SECTIONS.find((s) => s.key === 'contact')!.blocks.find((b) => b.title === 'Grievance officer')!
    expect(g.fields.map((f) => f.key)).toEqual(OWNER_ONLY_FIELDS.contact)
  })
  it('lockOf: whole, by fields, or nothing', () => {
    const all = lockedFor('partner', true, false)
    expect(lockOf(all, 'policies')).toEqual({ whole: true })
    expect(lockOf(all, 'business')).toEqual({ whole: true })
    expect(lockOf(all, 'contact')).toEqual({ whole: false, fields: OWNER_ONLY_FIELDS.contact })
    expect(lockOf(all, 'invoices', { invoiceSeries: 'AY/' })).toEqual({ whole: false, fields: OWNER_ONLY_FIELDS.invoices })
    // Saved values unknown: the prefix is locked too (fails closed).
    expect(lockOf(all, 'invoices')).toEqual({ whole: false, fields: [...OWNER_ONLY_FIELDS.invoices, 'orderPrefix'] })
    for (const k of ['store', 'payments', 'shipping'] as const) expect(lockOf(all, k)).toBeNull()
    for (const k of ['policies', 'business', 'contact', 'invoices'] as const) expect(lockOf(lockedFor('owner', true, false), k)).toBeNull()
  })
  it('asks are seen by owners and Managers only', () => {
    expect(MEMBER_ROLES.filter(seesAsks)).toEqual(['owner', 'admin'])
  })
  it('the ask names its page from its fixed address only', () => {
    for (const p of ASK_PAGES) expect(askPageOf(`/console/settings/${p}`)).toBe(p)
    for (const h of [null, '/console/settings/store', '/console/settings/contact?x=1', '/console/content', '/console/settings/contact/']) expect(askPageOf(h)).toBeNull()
  })
  it('a refused save says what it touched', () => {
    expect(refusalFor('contact')).toBe('Only the owner or a Manager can change the grievance officer now.')
    expect(refusalFor('invoices')).toBe('Only the owner or a Manager can change these invoice details now.')
    expect(refusalFor('business')).toBe('Only the owner or a Manager can change this now.')
    expect(refusalFor('policies')).toBe('Only the owner or a Manager can change this now.')
  })

  // app_notice_members (drizzle/0150, re-made in 0155 with brand lines) hand-copies who sees an ask as ('owner','admin'); this pins that list to
  // seesAsks' source, so the two can't drift apart (tenancy audit 2026-11-16 L4).
  it('the roles that see an ask are exactly the SQL list in app_notice_members', () => {
    expect([...CAPABILITIES['shop.manage']].sort()).toEqual(['admin', 'owner'])
    for (const r of MEMBER_ROLES) expect(seesAsks(r)).toBe(r === 'owner' || r === 'admin')
  })

  // Security review 2026-11-16 MED-1: while the series is blank, invoice numbers come from the order prefix.
  it('locks the order prefix too while the invoice series is blank', () => {
    const partner = lockedFor('partner', true, false)
    expect(lockOf(partner, 'invoices', { invoiceSeries: '' })).toEqual({ whole: false, fields: ['docSignatory', 'invoiceSeries', 'orderPrefix'] })
    expect(lockOf(partner, 'invoices', { invoiceSeries: '  ' })).toEqual({ whole: false, fields: ['docSignatory', 'invoiceSeries', 'orderPrefix'] })
    expect(lockOf(partner, 'invoices', { invoiceSeries: 'AY/' })).toEqual({ whole: false, fields: ['docSignatory', 'invoiceSeries'] })
    expect(lockOf(lockedFor('owner', true, false), 'invoices', { invoiceSeries: '' })).toBeNull()
    expect(lockOf(lockedFor('partner', false, false), 'invoices', { invoiceSeries: '' })).toBeNull()
  })
})

