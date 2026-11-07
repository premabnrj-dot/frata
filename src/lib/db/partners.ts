import 'server-only'
import { sql } from 'drizzle-orm'
import { db, type Tx } from './index'
import { withTenant } from './tenant'
import { PARTNER_TERMS } from '@/domains/partners/terms'

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
  if (!code) console.error(`[${tag}]`, msg)
  return code ?? 'unknown'
}

export type MyPartner = {
  id: string; email: string; name: string; businessName: string; phone: string; city: string; services: string[]
  workUrl: string; brandsNow: string; appliedAt: Date; approvedAt: Date | null; declinedAt: Date | null; declineReason: string | null
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
    return { ok: false, error: dbCode(err, ['email_unconfirmed', 'bad_input', 'decided'], 'applyAsPartner') }
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
export async function acceptHandover(uid: string, inviteId: string): Promise<{ ok: true; tenantId: string } | { ok: false; error: string }> {
  try {
    const rows = await db().execute<{ t: string }>(sql`select app_accept_handover(${uid}::uuid, ${inviteId}::uuid) as t`)
    return { ok: true, tenantId: rows[0]!.t }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['email_unconfirmed', 'no_invite', 'has_owner', 'already_member'], 'acceptHandover') }
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

export type Person = { userId: string; email: string | null; role: string; since: Date; partnerName: string | null }

/** Settings › People. The shop is the transaction's tenant (app_current_tenant), never a parameter. */
export async function shopPeople(tenantId: string): Promise<Person[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute<Record<string, string | null>>(sql`select * from app_shop_people()`)
    return rows.map((r) => ({ userId: r.user_id!, email: r.email ?? null, role: r.role!, since: new Date(r.since!), partnerName: r.partner_name ?? null }))
  })
}
