import 'server-only'
import { sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { withTenant } from '@/lib/db/tenant'
import { isStudioConfigured, STUDIO_OPEN } from '@/lib/env'
import { requireMember } from '@/lib/auth/require-member'
import type { MemberRole } from '@/domains/tenancy/roles'
import { requirePartner } from '@/lib/auth/require-partner'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { accessOf, oncePerCall, partnerProof, passkeys, staffProof } from '@/lib/auth/session'
import { gateState } from '@/lib/admin/passkeys'

// =============================================================================
// FILE: src/lib/studio/with-studio.ts — STUDIO'S DOOR FOR A PERSON (plan docs/plans/2026-11-22-v3a-runtime.md ruling k;
// security review H2). Every Studio page, action and route starts with requireStudio() (check:studio):
//   Studio open to staff (STUDIO_OPEN=staff, the key and the agent configured), the person Frrata staff with a live
//   staff passkey check (requireStaff), a live partner person with their partner check (requirePartner), and the store
//   the switcher chose (requireMember: never a URL) one where they are the partner (role `partner`), not a support visit.
// withStudio opens that store's transaction and asks the database to bind the person (app_studio_partner: the REAL step-
// ups, the membership, the link, the assignment). Without a bind nothing is read: the partner lock is the database's.
// =============================================================================

export type StudioOk = {
  ok: true; userId: string; email: string; tenantId: string; tenantName: string
  /** The browser session and the two step-up cookies' hashes: what the database binds with (never sent anywhere else). */
  authSession: string; staffHash: string; partnerHash: string
}
export type StudioClosed = { ok: false; reason: 'closed' | 'not_staff' | 'not_partner' | 'no_store'; message: string }

export const STUDIO_CLOSED = 'Studio isn’t open yet'
/** The store role Studio runs as: the door's requireMember tuple, and the stores the entry state 1a offers. */
const STUDIO_ROLES = ['partner'] as const satisfies readonly MemberRole[]

/** One Supabase check and one access query for the whole door, in a page, an action or the poll (oncePerCall). */
export function requireStudio(): Promise<StudioOk | StudioClosed> {
  return oncePerCall(studioDoor)
}

async function studioDoor(): Promise<StudioOk | StudioClosed> {
  if (STUDIO_OPEN !== 'staff' || !isStudioConfigured()) return { ok: false, reason: 'closed', message: STUDIO_CLOSED }
  const [staff, partner] = await Promise.all([requireStaff(ANY_STAFF), requirePartner()])
  if (!staff.ok) return { ok: false, reason: 'not_staff', message: STUDIO_CLOSED }
  if (!partner.ok || partner.userId !== staff.userId) return { ok: false, reason: 'not_partner', message: STUDIO_CLOSED }
  const member = await requireMember(STUDIO_ROLES)
  if (!member.ok || member.userId !== staff.userId || member.membership.supportSessionId) return { ok: false, reason: 'no_store', message: STUDIO_CLOSED }
  const [sp, pp, pk] = await Promise.all([staffProof(staff.userId), partnerProof(staff.userId), passkeys()])
  const base = { ok: true as const, userId: staff.userId, email: staff.email, tenantId: member.membership.tenantId, tenantName: member.membership.tenantName }
  // Passkeys off for everyone (Admin › Staff, drizzle/0171): this sign-in alone; the database binds the person with no
  // step-up and re-checks them on every turn (the step-ups, if any, still go with it).
  if (pk.off) return { ...base, authSession: staff.sessionId, staffHash: sp?.sessionId === staff.sessionId ? sp.hash : '', partnerHash: pp?.sessionId === staff.sessionId ? pp.hash : '' }
  if (!sp || !pp || sp.sessionId !== pp.sessionId || sp.sessionId !== staff.sessionId) return { ok: false, reason: 'not_staff', message: STUDIO_CLOSED }
  return { ...base, authSession: sp.sessionId, staffHash: sp.hash, partnerHash: pp.hash }
}

/** What a person who is Frrata staff and a live partner person, as one user, still needs to open Studio (the entry
 *  states, owner 2026-11-23, docs/mockups/2026-11-23-studio-door.html): their other partner store(s) to open, their
 *  passkey checks on this sign-in, or a first staff passkey. Anyone else gets StudioClosed, word for word as before. */
export type StudioStep =
  | { kind: 'store'; stores: { tenantId: string; name: string }[] }
  | { kind: 'check'; staff: boolean; partner: boolean }
  | { kind: 'staff_passkey' }
export type StudioEntry = StudioOk | StudioClosed | { ok: false; reason: 'step'; step: StudioStep }

/** The Studio page's door: requireStudio, and when it refuses a person who is Frrata staff AND a live partner person
 *  (each signed in, at most missing their passkey check, the same user), the one step they miss. Nothing is read for
 *  anyone else, so their answer is today's card and tells them nothing (the no-oracle rule). */
export function studioEntry(): Promise<StudioEntry> {
  return oncePerCall(entry)
}

async function entry(): Promise<StudioEntry> {
  const door = await studioDoor()
  if (door.ok || door.reason === 'closed') return door
  const { staff, partner, s, p } = await theSamePerson()
  if (!s || !p || s.userId !== p.userId || !s.sessionId || s.sessionId !== p.sessionId) return door
  // Passkeys off (Admin › Staff, drizzle/0171): no step-up cookie is asked for, so both checks count as made.
  const [sp, pp, pk] = await Promise.all([staffProof(s.userId), partnerProof(s.userId), passkeys()])
  const staffDone = staff.ok && (pk.off || sp?.sessionId === s.sessionId)
  const partnerDone = partner.ok && (pk.off || pp?.sessionId === s.sessionId)
  if (!staffDone || !partnerDone) {
    if (!staffDone) {
      // The person's own staff passkeys only (app_staff_state on their own user and session).
      const g = await gateState({ kind: 'staff-identity', userId: s.userId, email: s.email, role: s.role, sessionId: s.sessionId }).catch(() => null)
      if (g && g.passkeys === 0) return { ok: false, reason: 'step', step: { kind: 'staff_passkey' } }
    }
    return { ok: false, reason: 'step', step: { kind: 'check', staff: staffDone, partner: partnerDone } }
  }
  // Both checks made: the switcher's store is not one where they are the partner. Their own partner stores, never a
  // support visit (app_access_for's list for this user; the switch re-checks it).
  const stores = await partnerStoresOf(s.userId)
  return stores.length ? { ok: false, reason: 'step', step: { kind: 'store', stores } } : door
}

/** Frrata staff and a partner person, each signed in (a passkey check still to make counts), as the entry reads them. */
async function theSamePerson() {
  const [staff, partner] = await Promise.all([requireStaff(ANY_STAFF), requirePartner()])
  const s = staff.ok ? staff : staff.reason === 'needs_passkey' ? staff.identity : null
  const p = partner.ok ? partner : partner.reason === 'needs_passkey' ? partner.identity : null
  return { staff, partner, s, p }
}

/** The person's own stores where they are the partner, never a support visit (app_access_for's list; a Lead's only
 *  while assigned, a Builder's are never here). The one list the entry's store step and the Clients buttons read. */
async function partnerStoresOf(userId: string) {
  return ((await accessOf(userId).catch(() => null))?.memberships ?? [])
    .filter((m) => (STUDIO_ROLES as readonly string[]).includes(m.role) && !m.supportSessionId).map((m) => ({ tenantId: m.tenantId, name: m.tenantName }))
}

/** The store ids Studio's door would let this person into after the step it asks (Partner workspace › Clients shows
 *  "Open Studio" only for these). Studio off, anyone not both Frrata staff and a live partner person, a Builder, a Lead
 *  not assigned, a removed link and a support visit each give an empty set, so a button never tells who is refused.
 *  It is wider than the door on purpose while a passkey check is pending: the entry then shows that person the step. */
export function studioStoreIds(): Promise<ReadonlySet<string>> {
  return oncePerCall(async () => {
    if (STUDIO_OPEN !== 'staff' || !isStudioConfigured()) return new Set<string>()
    const { s, p } = await theSamePerson()
    if (!s || !p || s.userId !== p.userId || !s.sessionId || s.sessionId !== p.sessionId) return new Set<string>()
    return new Set((await partnerStoresOf(s.userId)).map((m) => m.tenantId))
  })
}

export class StudioUnbound extends Error { override name = 'StudioUnbound' }

/** The person's store transaction with the person bound; refuses (StudioUnbound) when the database won't bind them. */
export function withStudio<T>(auth: StudioOk, work: (tx: Tx, partnerId: string) => Promise<T>): Promise<T> {
  return withTenant(auth.tenantId, async (tx) => {
    const rows = await tx.execute(sql`select app_studio_partner(${auth.userId}::uuid, ${auth.authSession}::uuid, ${auth.staffHash}, ${auth.partnerHash}) as p`)
    const p = (rows as unknown as { p: string | null }[])[0]?.p ?? null
    if (!p) throw new StudioUnbound('not bound')
    return work(tx, p)
  })
}
