import 'server-only'
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { invites, members, shopSettings, supportSessions, tenantPlans, tenants } from '@/lib/db/schema'
import { shopHost } from '@/lib/public-env'
import type { StaffOk } from '@/lib/auth/require-staff'
import { currentPlan, usage, type PlanCode } from '@/domains/plans/entitlements'
import { nextMonthStartIST } from '@/domains/time/month'
import { frrataInvoices } from '@/lib/db/schema-billing'
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

/**
 * Delivered orders this month, per shop: the ONE "orders this month" (billing plan finding 4) — billable orders, as the
 * daily billing run counted them on the draft of next month's invoice (frrata_invoices.orders_billed), the same figure
 * the shop sees on Plan and billing. Not placed orders: a cancelled or returned order is not one. As fresh as the last
 * draft (the daily run, or Admin › Billing › Run drafts): `at` says when; no draft row → null, never a false 0.
 */
async function orderCounts(now: Date, only?: string): Promise<Map<string, { n: number; at: Date }>> {
  const next = eq(frrataInvoices.periodStart, nextMonthStartIST(now))
  const rows = await adminDb().select({ tenantId: frrataInvoices.tenantId, n: frrataInvoices.ordersBilled, at: frrataInvoices.draftedAt }).from(frrataInvoices)
    .where(only ? and(next, eq(frrataInvoices.tenantId, only)) : next)
  return new Map(rows.map((r) => [r.tenantId, { n: r.n, at: r.at }]))
}

export type MerchantRow = {
  /** The shop's frrata.shop address, from its name (never a stored row: shop addresses D·0). */
  id: string; name: string; slug: string; host: string; isInternal: boolean
  plan: { code: PlanCode; name: string; version: number; includedOrders: number; trialEndsAt: Date | null } | null
  /** Delivered orders this month as last drafted; null before the first draft. */
  ordersThisMonth: number | null; countedAt: Date | null; over: boolean
  owner: { email: string; lastSignInAt: Date | null } | null
  pendingInvite: string | null
}

/** A merchant's name, for the tab title of its Admin page (one indexed read by primary key). */
export async function merchantName(staff: StaffOk, id: string): Promise<string | null> {
  void staff
  const [t] = await adminDb().select({ name: tenants.name }).from(tenants).where(eq(tenants.id, id)).limit(1)
  return t?.name ?? null
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

  const [ms, inv, history, counts] = await Promise.all([
    db.select().from(members).where(inArray(members.tenantId, ids)),
    db.select().from(invites).where(inArray(invites.tenantId, ids)),
    tenantPlanHistory(db, ids),
  ]).then(async (r) => [...r, await orderCounts(opts.now)] as const)
  const dir = await directory(ms.filter((m) => m.role === 'owner').map((m) => m.userId))

  const rows = ts.map((t): MerchantRow => {
    const cur = currentPlan(history.filter((h) => h.tp.tenantId === t.id).map((h) => ({ ...h, startsAt: h.tp.startsAt })), opts.now)
    const owner = ms.find((m) => m.tenantId === t.id && m.role === 'owner')
    const open = inv.find((i) => i.tenantId === t.id && i.role === 'owner' && !i.acceptedAt && !i.revokedAt)
    const c = counts.get(t.id) ?? null
    const n = c?.n ?? 0
    return {
      id: t.id, name: t.name, slug: t.slug, isInternal: t.isInternal,
      host: shopHost(t.slug),
      plan: cur ? { code: cur.code as PlanCode, name: cur.name, version: cur.v.version, includedOrders: cur.v.includedOrders, trialEndsAt: cur.tp.trialEndsAt } : null,
      ordersThisMonth: c ? c.n : null, countedAt: c?.at ?? null, over: c && cur ? usage(n, cur.v.includedOrders).over : false,
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
  const [ms, inv, history, sessions, counts] = await Promise.all([
    db.select().from(members).where(eq(members.tenantId, id)),
    db.select().from(invites).where(eq(invites.tenantId, id)).orderBy(desc(invites.createdAt)),
    tenantPlanHistory(db, [id]),
  ]).then(async (r) => [...r,
    await db.select().from(supportSessions).where(eq(supportSessions.tenantId, id)).orderBy(desc(supportSessions.startedAt)).limit(20),
    await orderCounts(now, id),
  ] as const)
  const dir = await directory(ms.map((m) => m.userId))
  const cur = currentPlan(history.map((h) => ({ ...h, startsAt: h.tp.startsAt })), now)
  return {
    tenant: t, host: shopHost(t.slug),
    members: ms.map((m) => ({ ...m, email: dir.get(m.userId)?.email ?? null, lastSignInAt: dir.get(m.userId)?.lastSignInAt ?? null })),
    invites: inv, history, current: cur, sessions,
    ordersThisMonth: counts.get(id)?.n ?? null, countedAt: counts.get(id)?.at ?? null,
  }
}

/** Taken, retired by any shop, or blocked: the same check sign-up uses (app_name_check), so Admin never reuses a name. */
export async function slugTaken(staff: StaffOk, slug: string): Promise<boolean> {
  void staff
  const rows = await adminDb().execute<{ r: string }>(sql`select app_name_check(${slug}) as r`)
  return rows[0]?.r !== 'ok'
}

export async function createMerchant(
  staff: StaffOk,
  m: { name: string; slug: string; ownerEmail: string; planCode: PlanCode; trialEndsAt: Date | null; now: Date },
): Promise<{ id: string }> {
  return adminDb().transaction(async (tx) => {
    const [t] = await tx.insert(tenants).values({ name: m.name, slug: m.slug }).returning({ id: tenants.id })
    const id = t!.id
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
