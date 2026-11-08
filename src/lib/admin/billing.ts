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
}

/** Money across every shop: Frrata admins only (plan finding 17), checked here as well as on the page. */
const adminOnly = (staff: StaffOk) => { if (!(ADMIN_ONLY as readonly string[]).includes(staff.role)) throw new Error('billing is ADMIN_ONLY') }

export async function billingMonth(staff: StaffOk, monthStart: Date): Promise<DraftRow[]> {
  adminOnly(staff)
  const rows = await adminDb().select({
    id: frrataInvoices.id, tenantId: frrataInvoices.tenantId, shop: tenants.name, taxable: frrataInvoices.taxable, cgst: frrataInvoices.cgst, sgst: frrataInvoices.sgst, igst: frrataInvoices.igst,
    total: frrataInvoices.total, rolled: frrataInvoices.rolled, carryOut: frrataInvoices.carryOut, ordersBilled: frrataInvoices.ordersBilled, includedOrders: frrataInvoices.includedOrders,
    draftedAt: frrataInvoices.draftedAt, number: frrataInvoices.number, issuedAt: frrataInvoices.issuedAt,
  }).from(frrataInvoices).innerJoin(tenants, eq(tenants.id, frrataInvoices.tenantId)).where(eq(frrataInvoices.periodStart, monthStart)).orderBy(asc(tenants.name))
  const { paid, credited } = await moneyIn(rows.map((r) => r.id))
  return rows.map(({ cgst, sgst, igst, ...r }) => {
    const p = paid.get(r.id) ?? 0, c = credited.get(r.id) ?? 0
    return { ...r, gst: cgst + sgst + igst, paid: p, credited: c, ...invoiceState(r, p, c) }
  })
}

/** Captured payments and credit-note totals per invoice. */
async function moneyIn(ids: string[]) {
  if (!ids.length) return { paid: new Map<string, number>(), credited: new Map<string, number>() }
  const db = adminDb()
  const [p, c] = await Promise.all([
    db.select({ id: frrataPayments.invoiceId, n: sql<string>`sum(${frrataPayments.amount})` }).from(frrataPayments).where(and(inArray(frrataPayments.invoiceId, ids), isNotNull(frrataPayments.capturedAt))).groupBy(frrataPayments.invoiceId),
    db.select({ id: frrataCreditNotes.invoiceId, n: sql<string>`sum(${frrataCreditNotes.total})` }).from(frrataCreditNotes).where(inArray(frrataCreditNotes.invoiceId, ids)).groupBy(frrataCreditNotes.invoiceId),
  ])
  return { paid: new Map(p.map((r) => [r.id, Number(r.n)])), credited: new Map(c.map((r) => [r.id, Number(r.n)])) }
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
    const [r] = await tx.execute<{ issued: number; closed: number }>(sql`select * from app_issue_frrata_invoices(${monthStart.toISOString()}::timestamptz, ${expected.count}, ${expected.total}, ${staff.userId}::uuid,
      ${s.name}, ${s.gstin ?? ''}, ${s.address}, ${s.sac}, ${s.test}, ${s.prefix}, ${s.fy})`)
    await auditStaff(tx, staff, { action: 'billing.issue', target: monthStart.toISOString(), detail: { ...expected, issued: r!.issued, closed: r!.closed, test: s.test } })
    return { issued: Number(r!.issued), closed: Number(r!.closed), test: s.test }
  })
}

export type InvoiceDetail = {
  invoice: DraftRow & { periodStart: Date; testMode: boolean; buyerName: string | null }
  lines: { description: string; quantity: number; taxable: number }[]
  payments: { method: string; amount: number; utr: string | null; capturedAt: Date | null; failedAt: Date | null; failureReason: string | null; createdAt: Date }[]
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
    db.select({ method: frrataPayments.method, amount: frrataPayments.amount, utr: frrataPayments.utr, capturedAt: frrataPayments.capturedAt, failedAt: frrataPayments.failedAt, failureReason: frrataPayments.failureReason, createdAt: frrataPayments.createdAt })
      .from(frrataPayments).where(eq(frrataPayments.invoiceId, id)).orderBy(asc(frrataPayments.createdAt)),
    db.select({ number: frrataCreditNotes.number, total: frrataCreditNotes.total, reason: frrataCreditNotes.reason, issuedAt: frrataCreditNotes.issuedAt }).from(frrataCreditNotes).where(eq(frrataCreditNotes.invoiceId, id)).orderBy(asc(frrataCreditNotes.issuedAt)),
    moneyIn([id]),
  ])
  const { cgst, sgst, igst, ...r } = i
  const p = money.paid.get(id) ?? 0, c = money.credited.get(id) ?? 0
  return { invoice: { ...r, gst: cgst + sgst + igst, paid: p, credited: c, ...invoiceState(r, p, c) }, lines, payments, credits }
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
  const [inv, cns] = await Promise.all([
    // Test-mode documents are never supplies: they stay out of the CA's export (security review 2026-11-08).
    db.select().from(frrataInvoices).where(and(isNotNull(frrataInvoices.number), eq(frrataInvoices.testMode, false), range(frrataInvoices.issuedAt))).orderBy(asc(frrataInvoices.number)),
    db.select({ cn: frrataCreditNotes, inv: { number: frrataInvoices.number, buyerName: frrataInvoices.buyerName, buyerGstin: frrataInvoices.buyerGstin, placeOfSupply: frrataInvoices.placeOfSupply } })
      .from(frrataCreditNotes).innerJoin(frrataInvoices, eq(frrataInvoices.id, frrataCreditNotes.invoiceId)).where(and(eq(frrataCreditNotes.testMode, false), range(frrataCreditNotes.issuedAt))).orderBy(asc(frrataCreditNotes.number)),
  ])
  return [
    ...inv.map((i): GstRow => ({ type: 'Invoice', number: i.number!, date: i.issuedAt!, against: '', buyer: i.buyerName ?? '', gstin: i.buyerGstin ?? '', placeOfSupply: i.placeOfSupply ?? '', taxable: i.taxable, cgst: i.cgst, sgst: i.sgst, igst: i.igst, total: i.total })),
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
