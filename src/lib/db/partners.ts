import 'server-only'
import type { ClaimKey } from '@/lib/trials/claims'
import { sql } from 'drizzle-orm'
import { db, type Tx } from './index'
import { withTenant } from './tenant'
import { PARTNER_TERMS } from '@/domains/partners/terms'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/db/partners.ts — the partner questions, each a SECURITY DEFINER
// function in drizzle/0023_partners_access.sql that re-checks who is asking.
// `uid` is ALWAYS from getUser() (requireUser / requireMember), never input;
// `tenantId` is ALWAYS from requireMember. The partners table itself is not
// readable by frata_app at all. Sibling of platform.ts (architecture review).
// =============================================================================

function dbCode(err: unknown, codes: readonly string[], tag: string): string {
  const msg = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : '')
  const code = codes.find((c) => msg === c || msg.includes(c))
  if (!code) console.error(`[${tag}]`, errName(err))
  return code ?? 'unknown'
}

export type MyPartner = {
  id: string; email: string; name: string; businessName: string; phone: string; city: string; services: string[]
  workUrl: string; brandsNow: string; appliedAt: Date; approvedAt: Date | null; declinedAt: Date | null; declineReason: string | null
  /** The caller's own place in the partner (T1a): their partner_members row and role, and a Frrata suspension. */
  memberId: string; memberRole: 'owner' | 'lead'; suspendedAt: Date | null
}

const d = (v: string | Date | null) => (v ? new Date(v) : null)

export async function myPartner(uid: string): Promise<MyPartner | null> {
  const rows = await db().execute<Record<string, string | string[] | null>>(sql`select * from app_my_partner(${uid}::uuid)`)
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id as string, email: r.email as string, name: r.name as string, businessName: r.business_name as string,
    phone: r.phone as string, city: r.city as string, services: (r.services as string[]) ?? [], workUrl: r.work_url as string,
    brandsNow: r.brands_now as string, appliedAt: new Date(r.applied_at as string), approvedAt: d(r.approved_at as string | null),
    declinedAt: d(r.declined_at as string | null), declineReason: (r.decline_reason as string | null) ?? null,
    memberId: r.member_id as string, memberRole: r.member_role === 'lead' ? 'lead' : 'owner', suspendedAt: d(r.suspended_at as string | null),
  }
}

export type Application = { name: string; businessName: string; phone: string; city: string; services: string[]; workUrl: string; brandsNow: string }

/** `services` must already be checked against PARTNER_SERVICES: it is sent as one array literal. */
export async function applyAsPartner(uid: string, a: Application): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db().execute(sql`select app_partner_apply(${uid}::uuid, ${a.name}, ${a.businessName}, ${a.phone}, ${a.city},
      ${`{${a.services.join(',')}}`}::text[], ${a.workUrl}, ${a.brandsNow}, ${PARTNER_TERMS.version})`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['email_unconfirmed', 'bad_input', 'decided', 'in_team'], 'applyAsPartner') }
  }
}

export async function createClientStore(uid: string, p: { name: string; slug: string; pickup: string }):
  Promise<{ ok: true; tenantId: string } | { ok: false; error: string }> {
  try {
    const t = PARTNER_TERMS
    const rows = await db().execute<{ id: string }>(sql`select app_partner_create_shop(${uid}::uuid, ${p.name}, ${p.slug}, ${p.pickup},
      ${t.shareBps}, ${t.shareMonths}, ${t.noticeDays}, ${t.maxUnopened}) as id`)
    return { ok: true, tenantId: rows[0]!.id }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['not_partner', 'too_many', 'bad_name', 'bad_slug', 'bad_pincode', 'slug_taken', 'no_launch_plan'], 'createClientStore') }
  }
}

export type ClientRow = {
  tenantId: string; name: string; slug: string | null; linkedAt: Date; firstOpenedAt: Date | null; removedAt: Date | null
  shareMonths: number; noticeDays: number; ownerEmail: string | null; inviteEmail: string | null; inviteExpiresAt: Date | null; planName: string | null
}

export async function partnerClients(uid: string): Promise<ClientRow[]> {
  const rows = await db().execute<Record<string, string | number | null>>(sql`select * from app_partner_clients(${uid}::uuid)`)
  return rows.map((r) => ({
    tenantId: r.tenant_id as string, name: r.name as string, slug: (r.slug as string | null) ?? null, linkedAt: new Date(r.linked_at as string),
    firstOpenedAt: d(r.share_starts_at as string | null), removedAt: d(r.removed_at as string | null),
    shareMonths: Number(r.share_months), noticeDays: Number(r.notice_days), ownerEmail: (r.owner_email as string | null) ?? null,
    inviteEmail: (r.invite_email as string | null) ?? null, inviteExpiresAt: d(r.invite_expires_at as string | null), planName: (r.plan_name as string | null) ?? null,
  }))
}

/** Inside the console action's tenant transaction (asMember): the function re-checks the partner, the link and the owner. */
export async function sendHandover(tx: Tx, tenantId: string, uid: string, email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await tx.execute(sql`savepoint handover`)
    await tx.execute(sql`select app_handover_invite(${tenantId}::uuid, ${uid}::uuid, ${email})`)
    return { ok: true }
  } catch (err) {
    await tx.execute(sql`rollback to savepoint handover`)
    return { ok: false, error: dbCode(err, ['not_partner', 'has_owner', 'bad_email', 'member_email'], 'sendHandover') }
  }
}

export type Handover = { inviteId: string; tenantId: string; tenantName: string; partnerName: string; expiresAt: Date }

export async function myHandovers(uid: string): Promise<Handover[]> {
  const rows = await db().execute<Record<string, string>>(sql`select * from app_my_handovers(${uid}::uuid)`)
  return rows.map((r) => ({ inviteId: r.invite_id!, tenantId: r.tenant_id!, tenantName: r.tenant_name!, partnerName: r.partner_name!, expiresAt: new Date(r.expires_at!) }))
}

/** The invite id comes from the form, but the function accepts only an invite to THIS user's confirmed email. */
export async function acceptHandover(uid: string, inviteId: string, email: ClaimKey | null): Promise<{ ok: true; tenantId: string } | { ok: false; error: string }> {
  try {
    // Trials TR1·10 (drizzle/0066): the owner's verified email is claimed for the shop's trial at handover.
    const rows = await db().execute<{ t: string }>(sql`select app_accept_handover_v2(${uid}::uuid, ${inviteId}::uuid, ${email?.hmac ?? null}, ${email?.version ?? 1}::smallint) as t`)
    return { ok: true, tenantId: rows[0]!.t }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['email_unconfirmed', 'no_invite', 'has_owner', 'already_member', 'partner_member'], 'acceptHandover') }
  }
}

/** Inside the console action's tenant transaction (asMember(['owner'])): the function requires a members row with role owner. */
export async function removePartner(tx: Tx, tenantId: string, uid: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await tx.execute(sql`savepoint remove_partner`)
    await tx.execute(sql`select app_remove_partner(${tenantId}::uuid, ${uid}::uuid)`)
    return { ok: true }
  } catch (err) {
    await tx.execute(sql`rollback to savepoint remove_partner`)
    return { ok: false, error: dbCode(err, ['not_owner', 'no_partner'], 'removePartner') }
  }
}

export type Person = { userId: string; email: string | null; role: string; since: Date; partnerName: string | null; partnerRole: string | null; partnerPaused: boolean }

/** Settings › People. The shop is the transaction's tenant (app_current_tenant), never a parameter. */
export async function shopPeople(tenantId: string): Promise<Person[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute<Record<string, string | null> & { since: string | Date; partner_paused: boolean | null }>(sql`select * from app_shop_people()`)
    return rows.map((r) => ({ userId: r.user_id!, email: r.email ?? null, role: r.role!, since: new Date(r.since), partnerName: r.partner_name ?? null,
      partnerRole: r.partner_role ?? null, partnerPaused: r.partner_paused === true }))
  })
}

// ════════ The team (T1a; drizzle/0124). Every function re-checks the caller is the partner's owner (or the invitee). ════════

export type TeamStore = { tenantId: string; name: string }
export type TeamPerson = {
  memberId: string; email: string; role: 'owner' | 'lead' | 'builder'; invitedAt: Date; inviteExpiresAt: Date | null
  acceptedAt: Date | null; isYou: boolean; stores: TeamStore[]
}

export async function partnerTeam(uid: string): Promise<TeamPerson[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`select * from app_partner_team(${uid}::uuid)`)
  return rows.map((r) => ({
    memberId: r.member_id as string, email: r.email as string, role: r.role as TeamPerson['role'], invitedAt: new Date(r.invited_at as string),
    inviteExpiresAt: d(r.invite_expires_at as string | null), acceptedAt: d(r.accepted_at as string | null), isYou: r.is_you === true,
    stores: ((r.stores as { tenantId: string; name: string }[]) ?? []).map((x) => ({ tenantId: x.tenantId, name: x.name })),
  }))
}

type Done = { ok: true } | { ok: false; error: string }

/** `stores` are tenant ids the owner chose; the function accepts only the partner's own active links. */
export async function invitePartnerPerson(uid: string, email: string, stores: string[]): Promise<Done> {
  try {
    await db().execute(sql`select app_partner_invite(${uid}::uuid, ${email}, 'lead', ${`{${stores.join(',')}}`}::uuid[])`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['not_owner', 'bad_role', 'bad_email', 'bad_store', 'too_many', 'already_invited'], 'invitePartnerPerson') }
  }
}

export type PartnerInvite = { memberId: string; partnerName: string; invitedBy: string | null; role: string; expiresAt: Date; stores: string[] }

export async function myPartnerInvites(uid: string): Promise<PartnerInvite[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`select * from app_partner_my_invites(${uid}::uuid)`)
  return rows.map((r) => ({
    memberId: r.member_id as string, partnerName: r.partner_name as string, invitedBy: (r.invited_by as string | null) ?? null,
    role: r.role as string, expiresAt: new Date(r.expires_at as string), stores: (r.stores as string[]) ?? [],
  }))
}

/** The member id comes from the form; the function accepts only an invite to THIS user's confirmed email. */
export async function acceptPartnerInvite(uid: string, memberId: string): Promise<{ ok: true; skipped: string[] } | { ok: false; error: string }> {
  try {
    const rows = await db().execute<{ r: { skipped: string[] } }>(sql`select app_partner_accept(${uid}::uuid, ${memberId}::uuid) as r`)
    return { ok: true, skipped: rows[0]?.r?.skipped ?? [] }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['email_unconfirmed', 'no_invite', 'bad_role', 'in_team', 'own_partner'], 'acceptPartnerInvite') }
  }
}

export async function assignPartnerPerson(uid: string, memberId: string, tenantId: string, on: boolean): Promise<Done> {
  try {
    await db().execute(sql`select app_partner_assign(${uid}::uuid, ${memberId}::uuid, ${tenantId}::uuid, ${on})`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['not_owner', 'no_person', 'bad_store', 'already_member'], 'assignPartnerPerson') }
  }
}

export async function removePartnerPerson(uid: string, memberId: string): Promise<Done> {
  try {
    await db().execute(sql`select app_partner_remove_member(${uid}::uuid, ${memberId}::uuid)`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['not_owner', 'no_person', 'is_owner'], 'removePartnerPerson') }
  }
}
