// =============================================================================
// FILE: src/domains/settings/owner-only.ts — WHAT ONLY THE OWNER OR A MANAGER CHANGES ONCE A STORE HAS AN OWNER (partner
// publishing PP1, docs/specs/2026-11-16-partner-publishing.md § PP1 plan; owner decisions 1–5, 2026-11-16).
//
// The one list. The Settings pages read it to draw locked values as facts with Ask the owner; `saveSection` and
// `savePolicyText` read it again inside the save's transaction, after `hasOwnerIn` (failing closed), and refuse in words.
// A partner is locked out only once the store has an owner (before handover it built them); a Frrata support visit is
// always read-only here (decision 5); an owner or a Manager never is. Pure.
// =============================================================================

import { holds, type MemberRole } from '../tenancy/roles'
import type { SectionKey } from './sections'

/** Pages locked whole: their fields, and on Policies every policy page's own text (edit and reset). */
export const OWNER_ONLY_PAGES = ['policies', 'business'] as const satisfies readonly SectionKey[]
/** Fields locked inside pages that otherwise stay the partner's (decision 2: the grievance officer; decision 5: invoices). */
export const OWNER_ONLY_FIELDS = {
  contact: ['grievanceName', 'grievanceRole', 'grievanceEmail', 'grievancePhone'],
  invoices: ['docSignatory', 'invoiceSeries'],
} as const satisfies Partial<Record<SectionKey, readonly string[]>>

/** The pages a partner may ask the owner about: the Ask the owner action's input and the notice's page. */
export const ASK_PAGES = ['policies', 'business', 'contact', 'invoices'] as const
export type AskPage = (typeof ASK_PAGES)[number]

export type Locked = { pages: readonly SectionKey[]; fields: Partial<Record<SectionKey, readonly string[]>> }
const NONE: Locked = { pages: [], fields: {} }
const ALL: Locked = { pages: OWNER_ONLY_PAGES, fields: OWNER_ONLY_FIELDS }

/**
 * What this caller may not change. `hasOwner` comes from `hasOwnerIn` (no context reads as "has an owner"); `support`
 * is a Frrata support visit (its role is the owner's). Never `role === 'partner'`: whoever does not hold `shop.manage`
 * is locked once there is an owner (check:capabilities).
 */
export function lockedFor(role: MemberRole, hasOwner: boolean, support: boolean): Locked {
  if (support) return ALL
  return hasOwner && !holds(role, 'shop.manage') ? ALL : NONE
}

/**
 * A field that stands in for a locked one while that one is blank: invoice numbers are built from the order prefix
 * while the series is empty (`src/domains/orders/work.ts`), so the prefix is locked too until a series is set
 * (security review 2026-11-16 MED-1).
 */
const STANDS_IN: Partial<Record<SectionKey, readonly { field: string; whileBlank: string }[]>> = {
  invoices: [{ field: 'orderPrefix', whileBlank: 'invoiceSeries' }],
}

/** How a page is locked for this caller: whole, by these fields, or not at all. `stored` is the page's saved values. */
export function lockOf(locked: Locked, page: SectionKey, stored?: Readonly<Record<string, unknown>>): { whole: true } | { whole: false; fields: readonly string[] } | null {
  if (locked.pages.includes(page)) return { whole: true }
  const own = locked.fields[page]
  if (!own?.length) return null
  const extra = (STANDS_IN[page] ?? []).filter((x) => !String(stored?.[x.whileBlank] ?? '').trim()).map((x) => x.field)
  return { whole: false, fields: [...own, ...extra] }
}

/** Whether this caller is offered Ask the owner: locked, and not a support visit (the definer is the lock: a live partner). */
export const mayAskOwner = (role: MemberRole, hasOwner: boolean, support: boolean): boolean => !support && hasOwner && !holds(role, 'shop.manage')

/** Who is shown, and emailed, a partner's ask (`ask_owner` notices) and a partner's waiting brand change (`brand`,
 *  one-address P1): owners and Managers (app_notice_members is its SQL twin). */
export const seesAsks = (role: string): boolean => holds(role, 'shop.manage')

/** The page an `ask_owner` notice names, from its fixed address (`/console/settings/<page>`, written by app_ask_owner). */
export function askPageOf(href: string | null): AskPage | null {
  const m = /^\/console\/settings\/([a-z]+)$/.exec(href ?? '')
  return m && (ASK_PAGES as readonly string[]).includes(m[1]!) ? (m[1] as AskPage) : null
}

/** Every word these screens add (the approved mockup's words table; the invoice refusal is ours, not drawn). */
export const OWNER_ONLY_WORDS = {
  chip: 'Only the owner or a Manager can edit',
  ask: 'Ask the owner',
  asked: 'Asked the owner.',
  askedToday: 'Asked today',
  refused: 'Only the owner or a Manager can change this now.',
  refusedContact: 'Only the owner or a Manager can change the grievance officer now.',
  refusedInvoices: 'Only the owner or a Manager can change these invoice details now.',
  nothingChanged: 'Nothing was changed.',
} as const

/** The refusal for a save that touched what is locked on this page. */
export const refusalFor = (page: SectionKey): string =>
  page === 'contact' ? OWNER_ONLY_WORDS.refusedContact : page === 'invoices' ? OWNER_ONLY_WORDS.refusedInvoices : OWNER_ONLY_WORDS.refused
