import 'server-only'
import { and, desc, eq, inArray, isNull, ne, notExists, notInArray, or, sql } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant'
import { noticePrefs, noticeReads, notices } from '@/lib/db/schema-email'
import { billingNotices, frrataInvoices } from '@/lib/db/schema-billing'
import { shopSettings, supportSessions } from '@/lib/db/schema'
import { orderPrefix } from '@/domains/signup/slug'
import { orderEdits } from '@/lib/db/schema-edits'
import { orders } from '@/lib/db/schema-orders'
import { brandProposals } from '@/lib/db/schema-brand'
import { addonPrices, tenantAddons } from '@/lib/db/schema-modules'
import { isModuleKey, MODULES } from '@/domains/modules/registry'
import { noticeFallback, noticeWords, OPTIONAL_TYPES, DEFAULT_EMAIL, type NoticeSource, type NoticeType, type OptionalType } from '@/domains/email/notices'
import { askPageOf, seesAsks } from '@/domains/settings/owner-only'
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
export type ShownNotice = { id: string; type: NoticeType; title: string; body: string; href: string | null; required: boolean; at: Date; read: boolean
  /** A partner's waiting brand change (one-address P1): its id and where it stands, for Approve change and Decline. */
  brand?: { id: string; state: BrandNoticeState } }

/** The words for a set of notices, reading their sources in two queries (billing notices, support visits). */
export async function wordNotices(tx: Tx, rows: NoticeRow[], shopName: string, brandChanges?: Map<string, { summary: string; state: BrandNoticeState }>): Promise<Map<string, { title: string; body: string }>> {
  const billIds = rows.filter((n) => n.sourceKind === 'billing_notice' && n.sourceId).map((n) => n.sourceId!)
  const visitIds = rows.filter((n) => n.sourceKind === 'support_session' && n.sourceId).map((n) => n.sourceId!)
  const trialIds = rows.filter((n) => n.sourceKind === 'addon_trial' && n.sourceId).map((n) => n.sourceId!)
  const [bills, visits, trials] = await Promise.all([
    billIds.length ? tx.select({ id: billingNotices.id, kind: billingNotices.kind, amount: billingNotices.amount, debitAt: billingNotices.debitAt, number: frrataInvoices.number })
      .from(billingNotices).leftJoin(frrataInvoices, and(eq(frrataInvoices.tenantId, billingNotices.tenantId), eq(frrataInvoices.id, billingNotices.invoiceId)))
      .where(inArray(billingNotices.id, billIds)) : Promise.resolve([]),
    visitIds.length ? tx.select({ id: supportSessions.id, reason: supportSessions.reason, startedAt: supportSessions.startedAt, expiresAt: supportSessions.expiresAt })
      .from(supportSessions).where(inArray(supportSessions.id, visitIds)) : Promise.resolve([]),
    // A3: the trial row, and the price of the paid row that starts when it ends.
    trialIds.length ? tx.execute<{ id: string; module: string; ends: Date; monthly: string | null }>(sql`
      select t.id, t.module, t.trial_ends_at as ends, (select p.monthly_price from ${tenantAddons} a join ${addonPrices} p on p.id = a.addon_price_id
        where a.tenant_id = t.tenant_id and a.module = t.module and a.by_shop and a.addon_price_id is not null
        order by abs(extract(epoch from a.starts_at - t.trial_ends_at)) limit 1) as monthly
      from ${tenantAddons} t where t.tenant_id = ${rows[0]!.tenantId} and t.id in (select jsonb_array_elements_text(${JSON.stringify(trialIds)}::jsonb)::uuid)`) : Promise.resolve([]),
  ])
  // OE·2: a change still waiting for the shopper's payment, by its order's number and what it asks.
  const editIds = rows.filter((n) => n.sourceKind === 'edit_payment' && n.sourceId).map((n) => n.sourceId!)
  const edits = editIds.length ? await tx.select({ id: orderEdits.id, asked: orderEdits.asked, number: orders.number, prefix: shopSettings.orderPrefix }).from(orderEdits)
    .innerJoin(orders, and(eq(orders.tenantId, orderEdits.tenantId), eq(orders.id, orderEdits.orderId)))
    .leftJoin(shopSettings, eq(shopSettings.tenantId, orderEdits.tenantId)).where(and(eq(orderEdits.tenantId, rows[0]!.tenantId), inArray(orderEdits.id, editIds))) : []
  const edit = new Map(edits.map((e) => [e.id, e]))
  const brand = brandChanges ?? await brandChangesIn(tx, rows)
  const trial = new Map(trials.map((t) => [t.id, t]))
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
    } else if (n.sourceKind === 'addon_trial') {
      const t = n.sourceId ? trial.get(n.sourceId) : undefined
      if (t && t.monthly !== null && isModuleKey(t.module)) src = { kind: 'addon_trial', name: MODULES[t.module].name, monthly: formatInr(Number(t.monthly) as Paise), day: dayMonthIN(new Date(t.ends)) }
    } else if (n.sourceKind === 'edit_payment') {
      const e = n.sourceId ? edit.get(n.sourceId) : undefined
      if (e) src = { kind: 'edit_payment', number: `${orderPrefix(e.prefix ?? '', shopName)}-${e.number}`, amount: formatInr(Number(e.asked) as Paise) }
    } else if (n.sourceKind === 'ask_owner') {
      // PP1: worded from its fixed address alone (the definer stores no words).
      const page = askPageOf(n.href)
      if (page) src = { kind: 'ask_owner', page }
    } else if (n.sourceKind === 'brand') {
      // One-address P1: the waiting change's own line, kept with it ("4 logo files and 2 fonts.").
      const b = n.sourceId ? brand.get(n.sourceId) : undefined
      if (b) src = { kind: 'brand', summary: b.summary }
    } else if (n.title) src = { kind: 'admin', title: n.title, body: n.body }
    out.set(n.id, src ? noticeWords(src, shopName) : noticeFallback(n))
  }
  return out
}

/** Each `brand` notice's change: its line and where it stands now (Needs you, Approved, Declined; replaced by a newer one). */
async function brandChangesIn(tx: Tx, rows: NoticeRow[]): Promise<Map<string, { summary: string; state: BrandNoticeState }>> {
  const ids = rows.filter((n) => n.sourceKind === 'brand' && n.sourceId).map((n) => n.sourceId!)
  if (!ids.length) return new Map()
  const got = await tx.select({ id: brandProposals.id, summary: brandProposals.summary, decision: brandProposals.decision }).from(brandProposals)
    .where(and(eq(brandProposals.tenantId, rows[0]!.tenantId), inArray(brandProposals.id, ids)))
  return new Map(got.map((p) => [p.id, { summary: p.summary, state: (p.decision ?? 'open') as BrandNoticeState }]))
}
export type BrandNoticeState = 'open' | 'approved' | 'declined' | 'replaced'

const notSelf = (userId: string) => or(isNull(notices.by), ne(notices.by, userId))
/** What this member may be shown: everything but their own changes, and a partner's ask only for owners and Managers
 *  (PP1; app_notice_members holds the same for email). */
const shownTo = (userId: string, role: string) => (seesAsks(role) ? notSelf(userId) : and(notSelf(userId), notInArray(notices.sourceKind, ['ask_owner', 'brand'])))

/** The latest notices for this member, newest first, with whether they read each. `role` is the member's (a support
 *  visit's is the owner's). */
export async function listNotices(tenantId: string, userId: string, role: string, shopName: string, limit = 50): Promise<ShownNotice[]> {
  return withTenant(tenantId, async (tx) => {
    // A person isn't shown a notice about their own change (a partner's Content save names its saver in `by`).
    const rows = await tx.select().from(notices).where(and(eq(notices.tenantId, tenantId), shownTo(userId, role))).orderBy(desc(notices.createdAt)).limit(limit)
    if (!rows.length) return []
    const brand = await brandChangesIn(tx, rows)
    const [reads, words] = await Promise.all([
      tx.select({ id: noticeReads.noticeId }).from(noticeReads).where(and(eq(noticeReads.tenantId, tenantId), eq(noticeReads.userId, userId), inArray(noticeReads.noticeId, rows.map((r) => r.id)))),
      wordNotices(tx, rows, shopName, brand),
    ])
    const read = new Set(reads.map((r) => r.id))
    return rows.map((n) => {
      const b = n.sourceKind === 'brand' && n.sourceId ? brand.get(n.sourceId) : undefined
      return { id: n.id, type: n.type as NoticeType, ...words.get(n.id)!, href: n.href, required: n.required, at: n.createdAt, read: read.has(n.id), ...(b ? { brand: { id: n.sourceId!, state: b.state } } : {}) }
    })
  })
}

/** Unread notices for this member, capped (the bell shows "9+"; speed review P8). Inside the caller's transaction. */
export async function unreadNotices(tx: Tx, tenantId: string, userId: string, role: string): Promise<number> {
  const rows = await tx.select({ id: notices.id }).from(notices)
    .where(and(eq(notices.tenantId, tenantId), shownTo(userId, role), notExists(tx.select({ x: sql`1` }).from(noticeReads).where(and(eq(noticeReads.noticeId, notices.id), eq(noticeReads.userId, userId))))))
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
