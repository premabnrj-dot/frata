import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db, type Tx } from './index'
import { withTenant } from './tenant'
import { partnerRequests } from './schema-partners'
import { errName } from '@/lib/log'
import type { Caller } from './partners'

// =============================================================================
// FILE: src/lib/db/people.ts — Settings › People's writes and reads, each a definer in drizzle/0174 that takes the
// store from app_current_tenant() and the caller from their own members row. `uid` is ALWAYS getUser()'s; the tenant
// ALWAYS requireMember's (inside its transaction). The partner side matches the caller's confirmed sign-in email.
// =============================================================================

const CODES = ['not_manager', 'not_allowed', 'not_owner', 'not_partner', 'bad_email', 'own_email', 'already_member', 'partner_person',
  'invited', 'at_limit', 'no_invite', 'no_person', 'has_partner', 'has_request', 'no_request', 'no_owner', 'too_many',
  'confirm_first', 'confirm_again'] as const
export type PeopleError = (typeof CODES)[number] | 'unknown'
type Done = { ok: true } | { ok: false; error: PeopleError }

function code(err: unknown, tag: string): PeopleError {
  const msg = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : '')
  const c = CODES.find((x) => msg === x || msg.includes(x))
  if (!c) console.error(`[${tag}]`, errName(err))
  return c ?? 'unknown'
}
async function savepointed(tx: Tx, q: ReturnType<typeof sql>, tag: string): Promise<Done> {
  // A nested transaction is a savepoint: a refusal rolls back to it and the caller's transaction (and its audit) goes on.
  try {
    await tx.transaction((sp) => sp.execute(q))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: code(err, tag) }
  }
}

export const invitePerson = (tx: Tx, uid: string, email: string, role: string) =>
  savepointed(tx, sql`select app_invite_person(${uid}::uuid, ${email}, ${role})`, 'invitePerson')
export const cancelPersonInvite = (tx: Tx, uid: string, invite: string) =>
  savepointed(tx, sql`select app_cancel_person_invite(${uid}::uuid, ${invite}::uuid)`, 'cancelPersonInvite')
export const removePerson = (tx: Tx, uid: string, member: string) =>
  savepointed(tx, sql`select app_remove_person(${uid}::uuid, ${member}::uuid)`, 'removePerson')
export const sendPartnerRequest = (tx: Tx, uid: string, email: string) =>
  savepointed(tx, sql`select app_partner_request_send(${uid}::uuid, ${email})`, 'sendPartnerRequest')
export const cancelPartnerRequest = (tx: Tx, uid: string) =>
  savepointed(tx, sql`select app_partner_request_cancel(${uid}::uuid)`, 'cancelPartnerRequest')

export type PersonInvite = { id: string; email: string; role: string; expiresAt: Date }
export type ShopPartnerRequest = { email: string; createdAt: Date; expiresAt: Date; acceptedAt: Date | null; declinedAt: Date | null; cancelledAt: Date | null }
export type PeopleView = { invites: PersonInvite[]; used: number; limit: number; planName: string | null; request: ShopPartnerRequest | null }

/** People's reads in one transaction: open invitations, the limit, and the store's latest partner request (30 days). */
export async function peopleView(tenantId: string, uid: string): Promise<PeopleView> {
  return withTenant(tenantId, async (tx) => {
    const [inv, room, req] = await Promise.all([
      tx.execute<{ id: string; email: string; role: string; expires_at: string }>(sql`select * from app_person_invites(${uid}::uuid)`),
      tx.execute<{ used: number; people_limit: number; plan_name: string | null }>(sql`select * from app_people_room(${uid}::uuid)`),
      tx.select({ email: partnerRequests.email, createdAt: partnerRequests.createdAt, expiresAt: partnerRequests.expiresAt, acceptedAt: partnerRequests.acceptedAt,
        declinedAt: partnerRequests.declinedAt, cancelledAt: partnerRequests.cancelledAt })
        .from(partnerRequests).where(and(eq(partnerRequests.tenantId, tenantId), sql`${partnerRequests.createdAt} > now() - interval '30 days'`)).orderBy(desc(partnerRequests.createdAt)).limit(1),
    ])
    const r = room[0]
    return {
      invites: inv.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: new Date(i.expires_at) })),
      used: Number(r?.used ?? 0), limit: Number(r?.people_limit ?? 0), planName: r?.plan_name ?? null, request: req[0] ?? null,
    }
  })
}

export type PartnerInvitation = { id: string; storeName: string; createdAt: Date; expiresAt: Date }

/** The partner owner's open invitations (empty for anyone else). */
export async function myPartnerRequests(c: Caller): Promise<PartnerInvitation[]> {
  const rows = await db().execute<{ id: string; store_name: string; created_at: string; expires_at: string }>(sql`select * from app_partner_requests(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup})`)
  return rows.map((r) => ({ id: r.id, storeName: r.store_name, createdAt: new Date(r.created_at), expiresAt: new Date(r.expires_at) }))
}

export async function answerPartnerRequest(c: Caller, id: string, yes: boolean): Promise<{ ok: true; tenantId: string | null } | { ok: false; error: PeopleError }> {
  try {
    const rows = await db().execute<{ t: string | null }>(sql`select app_partner_answer_request(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}, ${id}::uuid, ${yes}) as t`)
    return { ok: true, tenantId: rows[0]?.t ?? null }
  } catch (err) {
    return { ok: false, error: code(err, 'answerPartnerRequest') }
  }
}
