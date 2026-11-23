import 'server-only'
import type { ClaimKey } from '@/lib/trials/claims'
import { sql } from 'drizzle-orm'
import { db, type Tx } from './index'
import { withTenant } from './tenant'
import { PARTNER_TERMS } from '@/domains/partners/terms'
import { errName } from '@/lib/log'
import { partnerRoleOf, type GivenRole, type PartnerRole } from '@/domains/partners/team'

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
  memberId: string; memberRole: PartnerRole; suspendedAt: Date | null
}

const d = (v: string | Date | null) => (v ? new Date(v) : null)

/** Who is asking in the workspace (a PartnerOk from requirePartner): the user, this browser's session and the partner
 *  step-up's hash. Every workspace definer re-checks the step-up (app_partner_need, drizzle/0129, T1b). */
export type Caller = { userId: string; sessionId: string; stepup: string }
/** The two refusals any workspace write can give: no live check, or none in the last 5 minutes. */
const CHECKS = ['confirm_first', 'confirm_again'] as const

export async function myPartner(uid: string): Promise<MyPartner | null> {
  const rows = await db().execute<Record<string, string | string[] | null>>(sql`select * from app_my_partner(${uid}::uuid)`)
  const r = rows[0]
  if (!r) return null
  // A role read by name; an unknown one is no partner at all (security review H2: it once read as the owner).
  const memberRole = partnerRoleOf(r.member_role)
  if (!memberRole) return null
  return {
    id: r.id as string, email: r.email as string, name: r.name as string, businessName: r.business_name as string,
    phone: r.phone as string, city: r.city as string, services: (r.services as string[]) ?? [], workUrl: r.work_url as string,
    brandsNow: r.brands_now as string, appliedAt: new Date(r.applied_at as string), approvedAt: d(r.approved_at as string | null),
    declinedAt: d(r.declined_at as string | null), declineReason: (r.decline_reason as string | null) ?? null,
    memberId: r.member_id as string, memberRole, suspendedAt: d(r.suspended_at as string | null),
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

/** app_partner_create_shop_v2 (0166): no pickup PIN code (it is asked in Settings › Store). */
export async function createClientStore(c: Caller, p: { name: string; slug: string }):
  Promise<{ ok: true; tenantId: string } | { ok: false; error: string }> {
  try {
    const t = PARTNER_TERMS
    const rows = await db().execute<{ id: string }>(sql`select app_partner_create_shop_v2(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}, ${p.name}, ${p.slug},
      ${t.shareBps}, ${t.shareMonths}, ${t.noticeDays}, ${t.maxUnopened}) as id`)
    return { ok: true, tenantId: rows[0]!.id }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['not_partner', 'too_many', 'bad_name', 'bad_slug', 'slug_taken', 'no_launch_plan', ...CHECKS], 'createClientStore') }
  }
}

export type ClientRow = {
  tenantId: string; name: string; slug: string | null; linkedAt: Date; firstOpenedAt: Date | null; removedAt: Date | null
  /** The partner's terms, the owner's email, the invite's email and the plan reach the partner's OWNER only (T1c, owner
   *  question 6): null for a Lead or a Builder. The stage's facts (first opening, invite end, `hasOwner`) reach all. */
  shareMonths: number | null; noticeDays: number | null; ownerEmail: string | null; inviteEmail: string | null; inviteExpiresAt: Date | null; planName: string | null
  hasOwner: boolean
  /** The link's id: a client page's key (a store relinked to the same partner has two rows). */
  linkId: string
  /** The store owner's join and the open invite's day: null for a Builder and once removed (P2, drizzle/0147). */
  ownerSince: Date | null; inviteSentAt: Date | null
}

export async function partnerClients(c: Caller): Promise<ClientRow[]> {
  const rows = await db().execute<Record<string, string | number | null>>(sql`select * from app_partner_clients(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup})`)
  return rows.map((r) => ({
    tenantId: r.tenant_id as string, name: r.name as string, slug: (r.slug as string | null) ?? null, linkedAt: new Date(r.linked_at as string),
    firstOpenedAt: d(r.share_starts_at as string | null), removedAt: d(r.removed_at as string | null),
    shareMonths: r.share_months === null ? null : Number(r.share_months), noticeDays: r.notice_days === null ? null : Number(r.notice_days), ownerEmail: (r.owner_email as string | null) ?? null,
    inviteEmail: (r.invite_email as string | null) ?? null, inviteExpiresAt: d(r.invite_expires_at as string | null), planName: (r.plan_name as string | null) ?? null,
    hasOwner: (r.has_owner as unknown) === true,
    linkId: r.link_id as string, ownerSince: d(r.owner_since as string | null), inviteSentAt: d(r.invite_sent_at as string | null),
  }))
}

/** Hand over from the workspace's Clients (T1b): the store id comes from the form, but the function accepts only a
 * *  store linked to the caller's own partner, from its owner, with a passkey check in the
 *  last 5 minutes. */
export async function sendHandover(c: Caller, tenantId: string, email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db().execute(sql`select app_handover_invite(${tenantId}::uuid, ${c.userId}::uuid, ${email}, ${c.sessionId}::uuid, ${c.stepup})`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['not_partner', 'has_owner', 'bad_email', 'member_email', ...CHECKS], 'sendHandover') }
  }
}

export type Handover = { inviteId: string; tenantId: string; tenantName: string; partnerName: string; expiresAt: Date }

export async function myHandovers(uid: string): Promise<Handover[]> {
  const rows = await db().execute<Record<string, string>>(sql`select * from app_my_handovers(${uid}::uuid)`)
  return rows.map((r) => ({ inviteId: r.invite_id!, tenantId: r.tenant_id!, tenantName: r.tenant_name!, partnerName: r.partner_name!, expiresAt: new Date(r.expires_at!) }))
}

/** The Accept screen's key list (SA1b D·7): per invite the store's website and its live keys, names and kinds only,
 *  through app_my_handover_keys (built over app_my_handovers, so exactly the invites this person sees). `host` is null while
 *  the store has no Website: its test keys still answer then (0149), so they are listed (security review MED-2). */
export type HandoverSite = { host: string | null; keys: { name: string; kind: 'public' | 'test' }[] }
export async function myHandoverKeys(uid: string): Promise<Map<string, HandoverSite>> {
  const rows = await db().execute<{ invite_id: string; site_host: string | null; name: string; kind: 'public' | 'test' }>(
    sql`select invite_id, site_host, name, kind from app_my_handover_keys(${uid}::uuid)`)
  const out = new Map<string, HandoverSite>()
  for (const r of rows) {
    const s = out.get(r.invite_id) ?? { host: r.site_host, keys: [] }
    s.keys.push({ name: r.name, kind: r.kind })
    out.set(r.invite_id, s)
  }
  return out
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
/** An open passkey request waiting for the owner's approval, with its context (mockup screen 10). */
export type OpenRequest = { createdAt: Date; expiresAt: Date; device: string | null; city: string | null }
export type TeamPerson = {
  memberId: string; email: string; role: 'owner' | 'lead' | 'builder'; invitedAt: Date; inviteExpiresAt: Date | null
  acceptedAt: Date | null; isYou: boolean; stores: TeamStore[]; passkeys: number; request: OpenRequest | null
}

export async function partnerTeam(c: Caller): Promise<TeamPerson[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`select * from app_partner_team(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup})`)
  return rows.map((r) => {
    const q = r.request as { createdAt: string; expiresAt: string; device: string | null; city: string | null } | null
    return {
      memberId: r.member_id as string, email: r.email as string, role: r.role as TeamPerson['role'], invitedAt: new Date(r.invited_at as string),
      inviteExpiresAt: d(r.invite_expires_at as string | null), acceptedAt: d(r.accepted_at as string | null), isYou: r.is_you === true,
      stores: ((r.stores as { tenantId: string; name: string }[]) ?? []).map((x) => ({ tenantId: x.tenantId, name: x.name })),
      passkeys: Number(r.passkeys ?? 0),
      request: q ? { createdAt: new Date(q.createdAt), expiresAt: new Date(q.expiresAt), device: q.device ?? null, city: q.city ?? null } : null,
    }
  })
}

type Done = { ok: true } | { ok: false; error: string }

/** `stores` are tenant ids the owner chose; the function accepts only the partner's own active links. */
export async function invitePartnerPerson(c: Caller, email: string, role: GivenRole, stores: string[]): Promise<Done> {
  try {
    await db().execute(sql`select app_partner_invite(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}, ${email}, ${role}, ${`{${stores.join(',')}}`}::uuid[])`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['not_owner', 'bad_role', 'bad_email', 'bad_store', 'too_many', 'already_invited', ...CHECKS], 'invitePartnerPerson') }
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

export async function assignPartnerPerson(c: Caller, memberId: string, tenantId: string, on: boolean): Promise<Done> {
  try {
    await db().execute(sql`select app_partner_assign(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}, ${memberId}::uuid, ${tenantId}::uuid, ${on})`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['not_owner', 'no_person', 'bad_store', 'already_member', ...CHECKS], 'assignPartnerPerson') }
  }
}

/** Lead ↔ Builder (T1c): the owner only, a check in the last 5 minutes, never the owner's row or one's own; the
 *  person's store rows follow in the same transaction (drizzle/0131's trigger). */
export async function setPartnerPersonRole(c: Caller, memberId: string, role: GivenRole): Promise<Done> {
  try {
    await db().execute(sql`select app_partner_set_role(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}, ${memberId}::uuid, ${role})`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['not_owner', 'no_person', 'is_owner', 'bad_role', ...CHECKS], 'setPartnerPersonRole') }
  }
}

export async function removePartnerPerson(c: Caller, memberId: string): Promise<Done> {
  try {
    await db().execute(sql`select app_partner_remove_member(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}, ${memberId}::uuid)`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: dbCode(err, ['not_owner', 'no_person', 'is_owner', ...CHECKS], 'removePartnerPerson') }
  }
}
