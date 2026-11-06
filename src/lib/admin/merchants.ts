import 'server-only'
import { asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { invites, members, shopSettings, supportSessions, tenantDomains, tenantPlans, tenants } from '@/lib/db/schema'
import type { StaffOk } from '@/lib/auth/require-staff'
import { currentPlan, usage, type PlanCode } from '@/domains/plans/entitlements'
import { monthStartIST } from '@/domains/time/month'
import { auditStaff } from './audit'
import { latestVersion, tenantPlanHistory } from './plans'

export const PAGE_SIZE = 50

type Directory = Map<string, { email: string; lastSignInAt: Date | null }>

async function directory(ids: string[]): Promise<Directory> {
  if (ids.length === 0) return new Map()
  const rows = await adminDb().execute<{ id: string; email: string; last_sign_in_at: string | null }>(
    sql`select id, email, last_sign_in_at from app_user_directory(${`{${ids.join(',')}}`}::uuid[])`,
  )
  return new Map(rows.map((r) => [r.id, { email: r.email, lastSignInAt: r.last_sign_in_at ? new Date(r.last_sign_in_at) : null }]))
}

async function orderCounts(since: Date): Promise<Map<string, number>> {
  const rows = await adminDb().execute<{ tenant_id: string; n: string }>(
    sql`select tenant_id, n from app_admin_order_counts(${since.toISOString()}::timestamptz)`,
  )
  return new Map(rows.map((r) => [r.tenant_id, Number(r.n)]))
}

export type MerchantRow = {
  id: string; name: string; slug: string; host: string | null; isInternal: boolean
  plan: { code: PlanCode; name: string; version: number; includedOrders: number; trialEndsAt: Date | null } | null
  ordersThisMonth: number; over: boolean
  owner: { email: string; lastSignInAt: Date | null } | null
  pendingInvite: string | null
}

export async function listMerchants(staff: StaffOk, opts: { page: number; q?: string; now: Date }): Promise<{ rows: MerchantRow[]; total: number }> {
  void staff
  const db = adminDb()
  const where = opts.q ? sql`(${tenants.name} ilike ${'%' + opts.q + '%'} or ${tenants.slug} ilike ${'%' + opts.q + '%'})` : undefined
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(tenants).where(where)
  const ts = await db.select().from(tenants).where(where).orderBy(asc(tenants.name))
    .limit(PAGE_SIZE).offset((Math.max(1, opts.page) - 1) * PAGE_SIZE)
  const ids = ts.map((t) => t.id)
  if (ids.length === 0) return { rows: [], total }

  const [domains, ms, inv, history, counts] = await Promise.all([
    db.select().from(tenantDomains).where(inArray(tenantDomains.tenantId, ids)),
    db.select().from(members).where(inArray(members.tenantId, ids)),
    db.select().from(invites).where(inArray(invites.tenantId, ids)),
    tenantPlanHistory(db, ids),
  ]).then(async (r) => [...r, await orderCounts(monthStartIST(opts.now))] as const)
  const dir = await directory(ms.filter((m) => m.role === 'owner').map((m) => m.userId))

  const rows = ts.map((t): MerchantRow => {
    const cur = currentPlan(history.filter((h) => h.tp.tenantId === t.id).map((h) => ({ ...h, startsAt: h.tp.startsAt })), opts.now)
    const owner = ms.find((m) => m.tenantId === t.id && m.role === 'owner')
    const open = inv.find((i) => i.tenantId === t.id && i.role === 'owner' && !i.acceptedAt && !i.revokedAt)
    const n = counts.get(t.id) ?? 0
    return {
      id: t.id, name: t.name, slug: t.slug, isInternal: t.isInternal,
      host: domains.find((d) => d.tenantId === t.id)?.host ?? null,
      plan: cur ? { code: cur.code as PlanCode, name: cur.name, version: cur.v.version, includedOrders: cur.v.includedOrders, trialEndsAt: cur.tp.trialEndsAt } : null,
      ordersThisMonth: n, over: cur ? usage(n, cur.v.includedOrders).over : false,
      owner: owner ? dir.get(owner.userId) ?? null : null,
      pendingInvite: owner ? null : open?.email ?? null,
    }
  })
  return { rows, total }
}

export async function getMerchant(staff: StaffOk, id: string, now: Date) {
  void staff
  const db = adminDb()
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
  if (!t) return null
  const [domains, ms, inv, history, sessions, counts] = await Promise.all([
    db.select().from(tenantDomains).where(eq(tenantDomains.tenantId, id)),
    db.select().from(members).where(eq(members.tenantId, id)),
    db.select().from(invites).where(eq(invites.tenantId, id)).orderBy(desc(invites.createdAt)),
    tenantPlanHistory(db, [id]),
  ]).then(async (r) => [...r,
    await db.select().from(supportSessions).where(eq(supportSessions.tenantId, id)).orderBy(desc(supportSessions.startedAt)).limit(20),
    await orderCounts(monthStartIST(now)),
  ] as const)
  const dir = await directory(ms.map((m) => m.userId))
  const cur = currentPlan(history.map((h) => ({ ...h, startsAt: h.tp.startsAt })), now)
  return {
    tenant: t, host: domains[0]?.host ?? null,
    members: ms.map((m) => ({ ...m, email: dir.get(m.userId)?.email ?? null, lastSignInAt: dir.get(m.userId)?.lastSignInAt ?? null })),
    invites: inv, history, current: cur, sessions,
    ordersThisMonth: counts.get(id) ?? 0,
  }
}

export async function slugTaken(staff: StaffOk, slug: string): Promise<boolean> {
  void staff
  const [row] = await adminDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1)
  return !!row
}

export async function createMerchant(
  staff: StaffOk,
  m: { name: string; slug: string; host: string; ownerEmail: string; planCode: PlanCode; trialEndsAt: Date | null; now: Date },
): Promise<{ id: string }> {
  return adminDb().transaction(async (tx) => {
    const [t] = await tx.insert(tenants).values({ name: m.name, slug: m.slug }).returning({ id: tenants.id })
    const id = t!.id
    await tx.insert(tenantDomains).values({ host: m.host, tenantId: id })
    await tx.insert(shopSettings).values({ tenantId: id, supportEmail: m.ownerEmail.toLowerCase() })
    await tx.insert(invites).values({ tenantId: id, email: m.ownerEmail.toLowerCase(), role: 'owner', createdBy: staff.userId })
    const version = await latestVersion(tx, m.planCode)
    await tx.insert(tenantPlans).values({
      tenantId: id, planVersionId: version.id, startsAt: m.now, trialEndsAt: m.trialEndsAt, createdBy: staff.userId,
    })
    await auditStaff(tx, staff, { tenantId: id, action: 'merchant.create', target: m.name, detail: { slug: m.slug, owner: m.ownerEmail, plan: `${m.planCode} v${version.version}` } })
    return { id }
  })
}

/** Open owner invite for a store, if the owner has not signed in yet. */
export async function openOwnerInvite(staff: StaffOk, tenantId: string) {
  void staff
  const [row] = await adminDb().select().from(invites)
    .where(sql`${invites.tenantId} = ${tenantId} and ${invites.role} = 'owner' and ${isNull(invites.acceptedAt)} and ${isNull(invites.revokedAt)}`)
    .orderBy(desc(invites.createdAt)).limit(1)
  return row ?? null
}
