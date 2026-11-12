import 'server-only'
import { and, asc, count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { partnerAssignments, partnerLinks, partnerMembers, partners } from '@/lib/db/schema-partners'
import type { StaffOk } from '@/lib/auth/require-staff'
import { auditStaff } from './audit'

// Admin › Partners: the review queue (docs/specs/2026-11-07-partner-foundations.md, screen 4). frata_admin may
// select partners and links, and update only the decision columns (drizzle/0023). Every decision is audited.

export type PartnerView = 'review' | 'approved' | 'declined'
export type AdminPartner = typeof partners.$inferSelect & { stores: number }

const WHERE = {
  review: and(isNull(partners.approvedAt), isNull(partners.declinedAt)),
  approved: isNotNull(partners.approvedAt),
  declined: isNotNull(partners.declinedAt),
}

export async function partnerCounts(staff: StaffOk): Promise<Record<PartnerView, number>> {
  void staff
  const db = adminDb()
  const [r, a, d] = await Promise.all((['review', 'approved', 'declined'] as const).map((v) => db.select({ n: count() }).from(partners).where(WHERE[v])))
  return { review: r?.[0]?.n ?? 0, approved: a?.[0]?.n ?? 0, declined: d?.[0]?.n ?? 0 }
}

export async function listPartners(staff: StaffOk, view: PartnerView): Promise<AdminPartner[]> {
  void staff
  const db = adminDb()
  const rows = await db.select().from(partners).where(WHERE[view]).orderBy(view === 'review' ? asc(partners.appliedAt) : desc(partners.appliedAt)).limit(100)
  if (!rows.length) return []
  const links = await db.select({ partnerId: partnerLinks.partnerId, n: count() }).from(partnerLinks).where(isNull(partnerLinks.removedAt)).groupBy(partnerLinks.partnerId)
  const by = new Map(links.map((l) => [l.partnerId, l.n]))
  return rows.map((p) => ({ ...p, stores: by.get(p.id) ?? 0 }))
}

/** Approve or decline once: a decided partner is not changed again here. */
export async function decidePartner(staff: StaffOk, id: string, d: { approve: true } | { approve: false; reason: string }): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  return adminDb().transaction(async (tx) => {
    const now = new Date()
    const [row] = await tx.update(partners)
      .set(d.approve ? { approvedAt: now, approvedBy: staff.userId } : { declinedAt: now, declinedBy: staff.userId, declineReason: d.reason })
      .where(and(eq(partners.id, id), isNull(partners.approvedAt), isNull(partners.declinedAt)))
      .returning({ email: partners.email, name: partners.name })
    if (!row) return { ok: false as const, error: 'Someone has already decided this application.' }
    await auditStaff(tx, staff, { action: d.approve ? 'partner.approved' : 'partner.declined', target: id })
    return { ok: true as const, email: row.email }
  })
}

// ════════ Teams and suspension (T1a; drizzle/0123). frata_admin reads the team; suspend and reinstate only through the
// admin_* definers, which re-check the admin, end or rebuild every partner person's access, audit and tell the shops. ════════

export type AdminTeamPerson = { id: string; email: string; role: string; acceptedAt: Date | null; inviteExpiresAt: Date | null; stores: number }

export async function partnerTeamForAdmin(staff: StaffOk, partnerId: string): Promise<AdminTeamPerson[]> {
  void staff
  const db = adminDb()
  const rows = await db.select({ id: partnerMembers.id, email: partnerMembers.email, role: partnerMembers.role, acceptedAt: partnerMembers.acceptedAt,
    inviteExpiresAt: partnerMembers.inviteExpiresAt, stores: count(partnerLinks.tenantId) })
    // Stores on live links only, as app_partner_team counts them (impact review).
    .from(partnerMembers).leftJoin(partnerAssignments, eq(partnerAssignments.partnerMemberId, partnerMembers.id))
    .leftJoin(partnerLinks, and(eq(partnerLinks.tenantId, partnerAssignments.tenantId), eq(partnerLinks.partnerId, partnerMembers.partnerId), isNull(partnerLinks.removedAt)))
    .where(and(eq(partnerMembers.partnerId, partnerId), isNull(partnerMembers.removedAt)))
    .groupBy(partnerMembers.id).orderBy(asc(partnerMembers.invitedAt)).limit(60)
  return rows.map((r) => ({ ...r, stores: Number(r.stores) }))
}

const code = (err: unknown, codes: string[]) => {
  const msg = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : '')
  return codes.find((c) => msg.includes(c)) ?? 'unknown'
}

export async function suspendPartner(staff: StaffOk, partnerId: string, reason: string): Promise<{ ok: true; shops: number } | { ok: false; error: string }> {
  try {
    const rows = await adminDb().execute<{ n: number }>(sql`select admin_end_partner(${staff.userId}::uuid, ${partnerId}::uuid, ${reason}) as n`)
    return { ok: true, shops: Number(rows[0]?.n ?? 0) }
  } catch (err) {
    return { ok: false, error: code(err, ['not_admin', 'bad_reason', 'not_active']) }
  }
}

export async function reinstatePartner(staff: StaffOk, partnerId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminDb().execute(sql`select admin_reinstate_partner(${staff.userId}::uuid, ${partnerId}::uuid)`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: code(err, ['not_admin', 'not_suspended']) }
  }
}
