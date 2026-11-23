import 'server-only'
import { sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { withTenant } from '@/lib/db/tenant'
import { isStudioConfigured, STUDIO_OPEN } from '@/lib/env'
import { requireMember } from '@/lib/auth/require-member'
import { requirePartner } from '@/lib/auth/require-partner'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { oncePerCall, partnerProof, staffProof } from '@/lib/auth/session'

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

/** One Supabase check and one access query for the whole door, in a page, an action or the poll (oncePerCall). */
export function requireStudio(): Promise<StudioOk | StudioClosed> {
  return oncePerCall(studioDoor)
}

async function studioDoor(): Promise<StudioOk | StudioClosed> {
  if (STUDIO_OPEN !== 'staff' || !isStudioConfigured()) return { ok: false, reason: 'closed', message: STUDIO_CLOSED }
  const [staff, partner] = await Promise.all([requireStaff(ANY_STAFF), requirePartner()])
  if (!staff.ok) return { ok: false, reason: 'not_staff', message: STUDIO_CLOSED }
  if (!partner.ok || partner.userId !== staff.userId) return { ok: false, reason: 'not_partner', message: STUDIO_CLOSED }
  const member = await requireMember(['partner'])
  if (!member.ok || member.userId !== staff.userId || member.membership.supportSessionId) return { ok: false, reason: 'no_store', message: STUDIO_CLOSED }
  const [sp, pp] = await Promise.all([staffProof(staff.userId), partnerProof(staff.userId)])
  if (!sp || !pp || sp.sessionId !== pp.sessionId || sp.sessionId !== staff.sessionId) return { ok: false, reason: 'not_staff', message: STUDIO_CLOSED }
  return { ok: true, userId: staff.userId, email: staff.email, tenantId: member.membership.tenantId, tenantName: member.membership.tenantName,
    authSession: sp.sessionId, staffHash: sp.hash, partnerHash: pp.hash }
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
