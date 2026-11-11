import 'server-only'
import { and, desc, eq, inArray, notExists, sql } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant'
import { noticePrefs, noticeReads, notices } from '@/lib/db/schema-email'
import { billingNotices, frrataInvoices } from '@/lib/db/schema-billing'
import { supportSessions } from '@/lib/db/schema'
import { noticeWords, OPTIONAL_TYPES, DEFAULT_EMAIL, type NoticeSource, type NoticeType, type OptionalType } from '@/domains/email/notices'
import { formatInr } from '@/lib/format'
import { dayMonthIN } from '@/lib/format-date'
import type { Paise } from '@/domains/money/paise'

// =============================================================================
// FILE: src/lib/queries/notices.ts — FRRATA'S NOTICES IN THE CONSOLE (email plan E·1, tasks 8–9). A shop reads its own
// notices; reads and email preferences are the signed-in member's own (the caller passes the session's user id, never
// a form's). Notices are worded here from their source rows (src/domains/email/notices.ts), never stored twice.
// =============================================================================

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0]
export type NoticeRow = typeof notices.$inferSelect
export type ShownNotice = { id: string; type: NoticeType; title: string; body: string; href: string | null; required: boolean; at: Date; read: boolean }

/** The words for a set of notices, reading their sources in two queries (billing notices, support visits). */
export async function wordNotices(tx: Tx, rows: NoticeRow[], shopName: string): Promise<Map<string, { title: string; body: string }>> {
  const billIds = rows.filter((n) => n.sourceKind === 'billing_notice' && n.sourceId).map((n) => n.sourceId!)
  const visitIds = rows.filter((n) => n.sourceKind === 'support_session' && n.sourceId).map((n) => n.sourceId!)
  const [bills, visits] = await Promise.all([
    billIds.length ? tx.select({ id: billingNotices.id, kind: billingNotices.kind, amount: billingNotices.amount, debitAt: billingNotices.debitAt, number: frrataInvoices.number })
      .from(billingNotices).leftJoin(frrataInvoices, and(eq(frrataInvoices.tenantId, billingNotices.tenantId), eq(frrataInvoices.id, billingNotices.invoiceId)))
      .where(inArray(billingNotices.id, billIds)) : Promise.resolve([]),
    visitIds.length ? tx.select({ id: supportSessions.id, reason: supportSessions.reason, startedAt: supportSessions.startedAt, expiresAt: supportSessions.expiresAt })
      .from(supportSessions).where(inArray(supportSessions.id, visitIds)) : Promise.resolve([]),
  ])
  const bill = new Map(bills.map((b) => [b.id, b])), visit = new Map(visits.map((v) => [v.id, v]))
  const out = new Map<string, { title: string; body: string }>()
  for (const n of rows) {
    let src: NoticeSource | null = null
    if (n.sourceKind === 'billing_notice') {
      const b = n.sourceId ? bill.get(n.sourceId) : undefined
      if (b) src = { kind: 'billing_notice', billingKind: b.kind, amount: formatInr(b.amount as Paise), debitAt: b.debitAt ? dayMonthIN(b.debitAt) : null, invoiceNumber: b.number ? String(b.number) : null }
    } else if (n.sourceKind === 'support_session') {
      const v = n.sourceId ? visit.get(n.sourceId) : undefined
      if (v) src = { kind: 'support_session', reason: v.reason, minutes: Math.round((v.expiresAt.getTime() - v.startedAt.getTime()) / 60_000) }
    } else if (n.title) src = { kind: 'admin', title: n.title, body: n.body }
    out.set(n.id, src ? noticeWords(src, shopName) : { title: n.title ?? 'Notice', body: n.body ?? '' })
  }
  return out
}

/** The latest notices for this member, newest first, with whether they read each. */
export async function listNotices(tenantId: string, userId: string, shopName: string, limit = 50): Promise<ShownNotice[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select().from(notices).where(eq(notices.tenantId, tenantId)).orderBy(desc(notices.createdAt)).limit(limit)
    if (!rows.length) return []
    const [reads, words] = await Promise.all([
      tx.select({ id: noticeReads.noticeId }).from(noticeReads).where(and(eq(noticeReads.tenantId, tenantId), eq(noticeReads.userId, userId), inArray(noticeReads.noticeId, rows.map((r) => r.id)))),
      wordNotices(tx, rows, shopName),
    ])
    const read = new Set(reads.map((r) => r.id))
    return rows.map((n) => ({ id: n.id, type: n.type as NoticeType, ...words.get(n.id)!, href: n.href, required: n.required, at: n.createdAt, read: read.has(n.id) }))
  })
}

/** Unread notices for this member, capped (the bell shows "9+"; speed review P8). Inside the caller's transaction. */
export async function unreadNotices(tx: Tx, tenantId: string, userId: string): Promise<number> {
  const rows = await tx.select({ id: notices.id }).from(notices)
    .where(and(eq(notices.tenantId, tenantId), notExists(tx.select({ x: sql`1` }).from(noticeReads).where(and(eq(noticeReads.noticeId, notices.id), eq(noticeReads.userId, userId))))))
    .orderBy(desc(notices.createdAt)).limit(10)
  return rows.length
}

/** Marks these notices read for this member, in the action's transaction (never during a support visit: the caller
 *  refuses). Only this shop's notices can be marked. */
export async function markNoticesRead(tx: Tx, tenantId: string, userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  const own = await tx.select({ id: notices.id }).from(notices).where(and(eq(notices.tenantId, tenantId), inArray(notices.id, ids.slice(0, 100))))
  if (own.length) await tx.insert(noticeReads).values(own.map((n) => ({ tenantId, noticeId: n.id, userId }))).onConflictDoNothing()
}

/** This member's email choices for the optional types (absent → the default). */
export async function noticePrefsFor(tenantId: string, userId: string): Promise<Record<OptionalType, boolean>> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select({ type: noticePrefs.type, email: noticePrefs.email }).from(noticePrefs).where(and(eq(noticePrefs.tenantId, tenantId), eq(noticePrefs.userId, userId)))
    const got = new Map(rows.map((r) => [r.type, r.email]))
    return Object.fromEntries(OPTIONAL_TYPES.map((t) => [t, got.get(t) ?? DEFAULT_EMAIL[t]])) as Record<OptionalType, boolean>
  })
}

/** Sets one optional type's email switch for this member, in the action's transaction. Required types are refused
 *  before this is called (they are not in OPTIONAL_TYPES). */
export async function setNoticePref(tx: Tx, tenantId: string, userId: string, type: OptionalType, email: boolean): Promise<void> {
  await tx.insert(noticePrefs).values({ tenantId, userId, type, email })
    .onConflictDoUpdate({ target: [noticePrefs.tenantId, noticePrefs.userId, noticePrefs.type], set: { email } })
}
