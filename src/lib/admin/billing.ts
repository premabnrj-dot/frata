import 'server-only'
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { invoiceState, type InvoiceState } from '@/domains/billing/status'
import { frrataCreditNoteDoc, frrataInvoiceDoc, type FrrataDoc, type GstRow } from '@/domains/billing/document'
import { frrataSeller, testIssueAllowed } from '@/lib/billing/seller'
import { ADMIN_ONLY, type StaffOk } from '@/lib/auth/require-staff'
import { adminDb } from '@/lib/db/admin'
import { tenants } from '@/lib/db/schema'
import { frrataCreditNotes, frrataInvoiceLines, frrataInvoices, frrataPayments } from '@/lib/db/schema-billing'
import { runDrafts, type RunResult } from '@/lib/billing/run'
import { monthStartIST } from '@/domains/time/month'
import { auditStaff } from './audit'

// =============================================================================
// FILE: src/lib/admin/billing.ts — Admin › Billing (billing B0: read-only drafts). Reads every shop's invoice for a
// month through frata_admin (ADR-0007). The drafts themselves are written by the billing run as frata_app inside each
// shop (src/lib/billing/run.ts); Admin only starts a run. Issuing (B2) is a definer called from here, ADMIN_ONLY.
// =============================================================================

export type DraftRow = {
  id: string; tenantId: string; shop: string; taxable: number; gst: number; total: number; rolled: boolean; carryOut: number
  ordersBilled: number; includedOrders: number; draftedAt: Date; number: string | null; issuedAt: Date | null
  paid: number; credited: number; state: InvoiceState; due: number
  /** Paid over what was due and not yet sent back (Billing › Needs you; Record refund). */
  toRefund: number
}

/** Money across every shop: Frrata admins only (plan finding 17), checked here as well as on the page. */
const adminOnly = (staff: StaffOk) => { if (!(ADMIN_ONLY as readonly string[]).includes(staff.role)) throw new Error('billing is ADMIN_ONLY') }

export async function billingMonth(staff: StaffOk, monthStart: Date): Promise<DraftRow[]> {
  adminOnly(staff)
  const rows = await adminDb().select({
    id: frrataInvoices.id, tenantId: frrataInvoices.tenantId, shop: tenants.name, taxable: frrataInvoices.taxable, cgst: frrataInvoices.cgst, sgst: frrataInvoices.sgst, igst: frrataInvoices.igst,
    total: frrataInvoices.total, rolled: frrataInvoices.rolled, carryOut: frrataInvoices.carryOut, ordersBilled: frrataInvoices.ordersBilled, includedOrders: frrataInvoices.includedOrders,
    draftedAt: frrataInvoices.draftedAt, number: frrataInvoices.number, issuedAt: frrataInvoices.issuedAt, testMode: frrataInvoices.testMode,
  }).from(frrataInvoices).innerJoin(tenants, eq(tenants.id, frrataInvoices.tenantId)).where(eq(frrataInvoices.periodStart, monthStart)).orderBy(asc(tenants.name))
  const { paid, credited, toRefund } = await moneyIn(rows.map((r) => r.id))
  return rows.map(({ cgst, sgst, igst, testMode, ...r }) => {
    const p = paid.get(r.id) ?? 0, c = credited.get(r.id) ?? 0
    return { ...r, gst: cgst + sgst + igst, paid: p, credited: c, toRefund: refundable(testMode, toRefund.get(r.id)), ...invoiceState(r, p, c) }
  })
}

/** What waits to be refunded on an invoice: a test invoice never does (the definer refuses it; Today leaves it out). */
const refundable = (testMode: boolean, over: number | undefined) => (testMode ? 0 : over ?? 0)

/** Captured payments and credit-note totals per invoice. */
async function moneyIn(ids: string[]) {
  if (!ids.length) return { paid: new Map<string, number>(), credited: new Map<string, number>(), toRefund: new Map<string, number>() }
  const db = adminDb()
  const [p, c] = await Promise.all([
    db.select({ id: frrataPayments.invoiceId, n: sql<string>`sum(${frrataPayments.amount})`, r: sql<string>`coalesce(sum(${frrataPayments.overPaid}) filter (where ${frrataPayments.overPaid} > 0 and ${frrataPayments.refundedAt} is null), 0)` })
      .from(frrataPayments).where(and(inArray(frrataPayments.invoiceId, ids), isNotNull(frrataPayments.capturedAt))).groupBy(frrataPayments.invoiceId),
    db.select({ id: frrataCreditNotes.invoiceId, n: sql<string>`sum(${frrataCreditNotes.total})` }).from(frrataCreditNotes).where(inArray(frrataCreditNotes.invoiceId, ids)).groupBy(frrataCreditNotes.invoiceId),
  ])
  return { paid: new Map(p.map((r) => [r.id, Number(r.n)])), credited: new Map(c.map((r) => [r.id, Number(r.n)])), toRefund: new Map(p.map((r) => [r.id, Number(r.r)])) }
}

/** What "Issue" would do now: the invoices to number (not rolled, total > 0) and their total — Admin confirms these. */
export function toIssue(rows: DraftRow[], monthStart: Date) {
  const open = rows.filter((r) => !r.issuedAt)
  const ready = open.filter((r) => !r.rolled && r.total > 0)
  // A draft made before the 1st misses the month's last days: the definer refuses until drafts run again.
  return { count: ready.length, total: ready.reduce((t, r) => t + r.total, 0), open: open.length, stale: open.filter((r) => r.draftedAt < monthStart).length }
}

/**
 * Issue a month (ADMIN_ONLY): one definer numbers, freezes and closes every draft in one transaction, refusing unless
 * the count and total are exactly what Admin reviewed and each draft was redrafted on or after the 1st (finding 17).
 */
export async function issueMonth(staff: StaffOk, monthStart: Date, expected: { count: number; total: number }) {
  adminOnly(staff)
  const s = frrataSeller()
  // Without Frrata's GSTIN this would issue the REAL drafts as tests and freeze their fees for good (security review).
  if (s.test && !testIssueAllowed()) throw new Error('issue: test-mode issuing is off here — set Frrata’s GSTIN, legal name, address and SAC first')
  return adminDb().transaction(async (tx) => {
    const r = await issueWith(tx, monthStart, expected, { staff: staff.userId })
    await auditStaff(tx, staff, { action: 'billing.issue', target: monthStart.toISOString(), detail: { ...expected, issued: r.issued, closed: r.closed, test: s.test } })
    return r
  })
}

type AdminTx = Parameters<Parameters<ReturnType<typeof adminDb>['transaction']>[0]>[0]

/** The one call to the issue definer, for Admin (a staff member) and the 1st's run (the system). */
async function issueWith(tx: AdminTx, monthStart: Date, expected: { count: number; total: number }, by: { staff: string } | { system: true }) {
  const s = frrataSeller()
  const staff = 'staff' in by ? by.staff : null
  const [r] = await tx.execute<{ issued: number; closed: number }>(sql`select * from app_issue_frrata_invoices(${monthStart.toISOString()}::timestamptz, ${expected.count}, ${expected.total}, ${staff}::uuid,
    ${s.name}, ${s.gstin ?? ''}, ${s.address}, ${s.sac}, ${s.test}, ${s.prefix}, ${s.fy}, ${!('staff' in by)})`)
  return { issued: Number(r!.issued), closed: Number(r!.closed), test: s.test }
}

/**
 * Bills issued on the 1st without a person (billing rework R2; owner decision 3, 2026-11-15). Called by the daily cron
 * only after the run drafted THIS month for every shop. Skips — never throws for these — unless Frrata's seller details
 * are real (never test invoices), it is the 1st to 3rd IST, and the drafts are fresh. The count and total are read in
 * the same transaction as the issue, with toIssue's rule; the definer recounts under its row locks and audits itself.
 */
export async function issueMonthAuto(now = new Date()): Promise<{ issued: number; closed: number } | { skipped: 'seller' | 'day' | 'nothing' | 'stale' }> {
  const s = frrataSeller(now)
  if (s.test) return { skipped: 'seller' }
  const month = monthStartIST(now)
  // The IST day of the month: days since the IST 1st, plus one.
  if (Math.floor((now.getTime() - month.getTime()) / 86_400_000) + 1 > 3) return { skipped: 'day' }
  return adminDb().transaction(async (tx) => {
    const rows = await tx.select({ issuedAt: frrataInvoices.issuedAt, rolled: frrataInvoices.rolled, total: frrataInvoices.total, draftedAt: frrataInvoices.draftedAt })
      .from(frrataInvoices).where(eq(frrataInvoices.periodStart, month))
    const t = toIssue(rows as DraftRow[], month)
    if (t.open === 0) return { skipped: 'nothing' as const }
    if (t.stale > 0) return { skipped: 'stale' as const }
    const r = await issueWith(tx, month, { count: t.count, total: t.total }, { system: true })
    return { issued: r.issued, closed: r.closed }
  })
}

export type InvoiceDetail = {
  invoice: DraftRow & { periodStart: Date; testMode: boolean; buyerName: string | null }
  lines: { description: string; quantity: number; taxable: number }[]
  payments: { id: string; refundAmount: number | null; refundUtr: string | null; refundedAt: Date | null; method: string; amount: number; utr: string | null; capturedAt: Date | null; failedAt: Date | null; failureReason: string | null; overPaid: number; createdAt: Date }[]
  credits: { number: string; total: number; reason: string; issuedAt: Date }[]
}

export async function invoiceDetail(staff: StaffOk, id: string): Promise<InvoiceDetail | null> {
  adminOnly(staff)
  const db = adminDb()
  const [i] = await db.select({
    id: frrataInvoices.id, tenantId: frrataInvoices.tenantId, shop: tenants.name, taxable: frrataInvoices.taxable, cgst: frrataInvoices.cgst, sgst: frrataInvoices.sgst, igst: frrataInvoices.igst,
    total: frrataInvoices.total, rolled: frrataInvoices.rolled, carryOut: frrataInvoices.carryOut, ordersBilled: frrataInvoices.ordersBilled, includedOrders: frrataInvoices.includedOrders,
    draftedAt: frrataInvoices.draftedAt, number: frrataInvoices.number, issuedAt: frrataInvoices.issuedAt, periodStart: frrataInvoices.periodStart, testMode: frrataInvoices.testMode, buyerName: frrataInvoices.buyerName,
  }).from(frrataInvoices).innerJoin(tenants, eq(tenants.id, frrataInvoices.tenantId)).where(eq(frrataInvoices.id, id))
  if (!i) return null
  const [lines, payments, credits, money] = await Promise.all([
    db.select({ description: frrataInvoiceLines.description, quantity: frrataInvoiceLines.quantity, taxable: frrataInvoiceLines.taxable }).from(frrataInvoiceLines).where(eq(frrataInvoiceLines.invoiceId, id)).orderBy(asc(frrataInvoiceLines.position)),
    db.select({ id: frrataPayments.id, refundAmount: frrataPayments.refundAmount, refundUtr: frrataPayments.refundUtr, refundedAt: frrataPayments.refundedAt, method: frrataPayments.method, amount: frrataPayments.amount, utr: frrataPayments.utr, capturedAt: frrataPayments.capturedAt, failedAt: frrataPayments.failedAt, failureReason: frrataPayments.failureReason, overPaid: frrataPayments.overPaid, createdAt: frrataPayments.createdAt })
      .from(frrataPayments).where(eq(frrataPayments.invoiceId, id)).orderBy(asc(frrataPayments.createdAt)),
    db.select({ number: frrataCreditNotes.number, total: frrataCreditNotes.total, reason: frrataCreditNotes.reason, issuedAt: frrataCreditNotes.issuedAt }).from(frrataCreditNotes).where(eq(frrataCreditNotes.invoiceId, id)).orderBy(asc(frrataCreditNotes.issuedAt)),
    moneyIn([id]),
  ])
  const { cgst, sgst, igst, ...r } = i
  const p = money.paid.get(id) ?? 0, c = money.credited.get(id) ?? 0
  return { invoice: { ...r, gst: cgst + sgst + igst, paid: p, credited: c, toRefund: refundable(r.testMode, money.toRefund.get(id)), ...invoiceState(r, p, c) }, lines, payments, credits }
}

/** A bank transfer, UPI or pay-link payment recorded by hand (ADMIN_ONLY), under its unique reference; audited. */
export async function recordPayment(staff: StaffOk, invoiceId: string, p: { amount: number; method: 'bank_transfer' | 'upi' | 'card' | 'paylink'; utr: string }) {
  adminOnly(staff)
  return adminDb().transaction(async (tx) => {
    const [r] = await tx.execute<{ id: string }>(sql`select app_record_frrata_payment(${invoiceId}::uuid, ${p.amount}, ${p.method}, ${p.utr}, ${staff.userId}::uuid) as id`)
    await auditStaff(tx, staff, { action: 'billing.payment', target: invoiceId, detail: { amount: p.amount, method: p.method } })
    return r!.id
  })
}

/** An over-payment Frrata sent back from its bank, recorded once (ADMIN_ONLY): app_record_frrata_refund (0138) is the
 *  one writer of the refund columns and checks the role again; audited in the same transaction. */
export async function recordRefund(staff: StaffOk, paymentId: string, r: { utr: string; sentOn: string }) {
  adminOnly(staff)
  return adminDb().transaction(async (tx) => {
    const [x] = await tx.execute<{ amount: string }>(sql`select app_record_frrata_refund(${paymentId}::uuid, ${r.utr}, ${r.sentOn}::date, ${staff.userId}::uuid) as amount`)
    // The store and the bank's reference on the audit row (security review on the diff): its Activity shows the refund.
    const [p] = await tx.select({ tenantId: frrataPayments.tenantId, utr: frrataPayments.refundUtr }).from(frrataPayments).where(eq(frrataPayments.id, paymentId))
    await auditStaff(tx, staff, { tenantId: p?.tenantId, action: 'billing.refund', target: paymentId, detail: { amount: Number(x!.amount), utr: p?.utr } })
    return Number(x!.amount)
  })
}

/** A credit note against an issued invoice (ADMIN_ONLY): capped at what the invoice holds; audited; final. */
export async function issueCreditNote(staff: StaffOk, invoiceId: string, c: { taxable: number; reason: string }) {
  adminOnly(staff)
  const s = frrataSeller()
  return adminDb().transaction(async (tx) => {
    const [r] = await tx.execute<{ n: string }>(sql`select app_issue_frrata_credit_note(${invoiceId}::uuid, ${c.taxable}, ${c.reason}, ${staff.userId}::uuid, ${s.prefix}, ${s.fy}) as n`)
    await auditStaff(tx, staff, { action: 'billing.credit_note', target: invoiceId, detail: { taxable: c.taxable, number: r!.n } })
    return r!.n
  })
}

/** An issued invoice or one of its credit notes as document data (Admin's download). */
export async function frrataDocument(staff: StaffOk, invoiceId: string, creditNumber?: string): Promise<FrrataDoc | null> {
  adminOnly(staff)
  const db = adminDb()
  const [i] = await db.select().from(frrataInvoices).where(eq(frrataInvoices.id, invoiceId))
  if (!i) return null
  const lines = await db.select({ description: frrataInvoiceLines.description, quantity: frrataInvoiceLines.quantity, taxable: frrataInvoiceLines.taxable }).from(frrataInvoiceLines)
    .where(eq(frrataInvoiceLines.invoiceId, invoiceId)).orderBy(asc(frrataInvoiceLines.position))
  const doc = frrataInvoiceDoc(i, lines)
  if (!doc || !creditNumber) return doc
  const [cn] = await db.select().from(frrataCreditNotes).where(and(eq(frrataCreditNotes.invoiceId, invoiceId), eq(frrataCreditNotes.number, creditNumber)))
  return cn ? frrataCreditNoteDoc(doc, cn) : null
}

/** The month's GST rows (GSTR-1 style): its issued invoices and the credit notes issued in it (ADMIN_ONLY). */
export async function gstRows(staff: StaffOk, monthStart: Date, nextMonthStart: Date): Promise<GstRow[]> {
  adminOnly(staff)
  const db = adminDb()
  const range = (col: typeof frrataInvoices.issuedAt | typeof frrataCreditNotes.issuedAt) => sql`${col} >= ${monthStart.toISOString()}::timestamptz and ${col} < ${nextMonthStart.toISOString()}::timestamptz`
  const [inv, cns, partnerInv] = await Promise.all([
    // Test-mode documents are never supplies: they stay out of the CA's export (security review 2026-11-08).
    db.select().from(frrataInvoices).where(and(isNotNull(frrataInvoices.number), eq(frrataInvoices.testMode, false), range(frrataInvoices.issuedAt))).orderBy(asc(frrataInvoices.number)),
    db.select({ cn: frrataCreditNotes, inv: { number: frrataInvoices.number, buyerName: frrataInvoices.buyerName, buyerGstin: frrataInvoices.buyerGstin, placeOfSupply: frrataInvoices.placeOfSupply } })
      .from(frrataCreditNotes).innerJoin(frrataInvoices, eq(frrataInvoices.id, frrataCreditNotes.invoiceId)).where(and(eq(frrataCreditNotes.testMode, false), range(frrataCreditNotes.issuedAt))).orderBy(asc(frrataCreditNotes.number)),
    // Studio credit invoices share the FRR series (C1, drizzle/0164): through their one Admin definer, real ones only.
    db.execute<{ number: string; issued_at: string; buyer_name: string; buyer_gstin: string | null; place_of_supply: string; taxable: string; cgst: string; sgst: string; igst: string; total: string }>(
      sql`select * from admin_partner_gst_rows(${monthStart.toISOString()}::timestamptz, ${nextMonthStart.toISOString()}::timestamptz)`),
  ])
  const invoices = [
    ...inv.map((i): GstRow => ({ type: 'Invoice', number: i.number!, date: i.issuedAt!, against: '', buyer: i.buyerName ?? '', gstin: i.buyerGstin ?? '', placeOfSupply: i.placeOfSupply ?? '', taxable: i.taxable, cgst: i.cgst, sgst: i.sgst, igst: i.igst, total: i.total })),
    ...partnerInv.map((i): GstRow => ({ type: 'Invoice', number: i.number, date: new Date(i.issued_at), against: '', buyer: i.buyer_name, gstin: i.buyer_gstin ?? '', placeOfSupply: i.place_of_supply,
      taxable: Number(i.taxable), cgst: Number(i.cgst), sgst: Number(i.sgst), igst: Number(i.igst), total: Number(i.total) })),
  ].sort((a, b) => a.number.localeCompare(b.number))
  return [
    ...invoices,
    ...cns.map(({ cn, inv: i }): GstRow => ({ type: 'Credit note', number: cn.number, date: cn.issuedAt, against: i.number ?? '', buyer: i.buyerName ?? '', gstin: i.buyerGstin ?? '', placeOfSupply: i.placeOfSupply ?? '', taxable: cn.taxable, cgst: cn.cgst, sgst: cn.sgst, igst: cn.igst, total: cn.total })),
  ]
}

/** "Run drafts" (ADMIN_ONLY at the action): redraft every shop's invoice for `monthStart`, audited. */
// The run writes as frata_app inside each shop (withTenant, plan finding 8), shop ids from app_shops_to_bill, never
// from the form: the one place Admin starts tenant writes, recorded with issue in the ADR-0007 amendment.
export async function runDraftsNow(staff: StaffOk, monthStart: Date): Promise<RunResult> {
  adminOnly(staff)
  const r = await runDrafts(new Date(), [monthStart])
  await adminDb().transaction((tx) => auditStaff(tx, staff, { action: 'billing.drafts.run', target: monthStart.toISOString(), detail: r }))
  return r
}

/** "Run collection now" (ADMIN_ONLY): the daily collection, then the queued debits sent; audited. */
export async function runCollectionNow(staff: StaffOk) {
  adminOnly(staff)
  const { collectDue } = await import('@/lib/billing/collect')
  const { drainOutbox } = await import('@/lib/outbox/drain')
  const r = await collectDue(new Date(), Date.now() + 20_000)
  const sent = await drainOutbox(Date.now() + 20_000)
  await adminDb().transaction((tx) => auditStaff(tx, staff, { action: 'billing.collect.run', detail: { ...r, sent: sent.sent } }))
  return { ...r, sent: sent.sent }
}

// ── Admin › Cashflow: money in, as sums only (plan docs/plans/2026-11-23-admin-cashflow.md task 4; tenancy and speed reviews) ──────────
// Captured payments of non-test invoices, less over-payments sent back (by the month or day the refund was made). Only two sums leave here:
// never a UTR, a gateway id, a failure reason or who recorded it. Bounds are VALUES (half-open IST days), never an expression on the column, so
// the partial indexes on `captured_at` and `refunded_at` are used; the test-invoice exclusion is an anti-join on the tiny test-invoice index.

export type MoneyBy = 'month' | 'day' | 'total'
const istStart = (day: string) => `${day}T00:00:00+05:30`

/** Net money in between two IST days (`from` inclusive, `to` exclusive), by month, by day, or as one total (key ''). */
export async function billingIn(staff: StaffOk, from: string, to: string, by: MoneyBy): Promise<Record<string, number>> {
  adminOnly(staff)
  const key = (col: string) => by === 'total' ? sql.raw(`'total'::text`) : by === 'day' ? sql.raw(`((${col} at time zone 'Asia/Kolkata')::date)::text`) : sql.raw(`(date_trunc('month', ${col} at time zone 'Asia/Kolkata')::date)::text`)
  const noTest = sql`not exists (select 1 from frrata_invoices i where i.tenant_id = p.tenant_id and i.id = p.invoice_id and i.test_mode)`
  const db = adminDb()
  const [got, back] = await Promise.all([
    db.execute<{ k: string; n: string }>(sql`select ${key('p.captured_at')} as k, coalesce(sum(p.amount), 0)::text as n from frrata_payments p
      where p.captured_at >= ${istStart(from)}::timestamptz and p.captured_at < ${istStart(to)}::timestamptz and ${noTest} group by 1`),
    db.execute<{ k: string; n: string }>(sql`select ${key('p.refunded_at')} as k, coalesce(sum(p.refund_amount), 0)::text as n from frrata_payments p
      where p.refunded_at >= ${istStart(from)}::timestamptz and p.refunded_at < ${istStart(to)}::timestamptz and ${noTest} group by 1`),
  ])
  const out: Record<string, number> = {}
  const slice = (k: string) => (by === 'month' ? k.slice(0, 7) : by === 'total' ? '' : k)
  for (const r of got) out[slice(r.k)] = (out[slice(r.k)] ?? 0) + Number(r.n)
  for (const r of back) out[slice(r.k)] = (out[slice(r.k)] ?? 0) - Number(r.n)
  return out
}
