import 'server-only'
import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm'
import { creditNote, invoice, type Invoice } from '@/domains/orders/documents'
import { gstinValid } from '@/domains/tax/gstin'
import { gstr1, periodKeyAt, periodOf, seriesGaps, type GstDoc, type Gstr1, type Period } from '@/domains/tax/gstr1'
import { hsnDigitsFor, type TurnoverBand } from '@/domains/tax/rates'
import type { Tx } from '@/lib/db'
import { shopSettings, tenants } from '@/lib/db/schema'
import { creditNotes, orders } from '@/lib/db/schema-orders'
import { gstConnections, gstFilings } from '@/lib/db/schema-gst'
import type { Liability } from '@/domains/tax/gsp'
import { withTenant } from '@/lib/db/tenant'
import { documentsFor } from '@/lib/orders/documents'

// =============================================================================
// FILE: src/lib/queries/gst.ts — A GST PERIOD (GST app G1, plan docs/plans/2026-11-09-gst-core-and-categories.md § 3).
// One tenant transaction: the shop's GST facts, the invoices dated in the period and the credit notes issued in it, read
// through documentsFor and rendered by the same invoice()/creditNote() the shop prints (never recomputed), then
// GSTR-1 (domains/tax/gstr1.ts) and the Fix list. Never cached: an export must be today's documents.
// =============================================================================

export type GstShop = { name: string; legalName: string; gstin: string | null; scheme: string; band: TurnoverBand; filing: 'monthly' | 'quarterly'; homeState: string | null }
export type Fix = { kind: 'no_hsn' | 'hsn_digits' | 'bad_gstin' | 'gap' | 'came_back' | 'bad_note'; count: number; examples: string[] }
/** Filing from Frrata (G2): the shop's portal session and this period's filing row. */
export type GstFiling = { connected: boolean; username: string | null; pushedAt: Date | null; pushed: Liability | null; portal: Liability | null; filedAt: Date | null; arn: string | null }
export type GstPeriod = { shop: GstShop; period: Period; prev: string; next: string | null; invoices: Invoice[]; notes: GstDoc[]; gstr: Gstr1; fixes: Fix[]; filing: GstFiling }

const BATCH = 1000

/** The previous period's key (the month or quarter before `key`). */
function shift(key: string, by: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (m) { const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
  const q = /^(\d{4})-Q([1-4])$/.exec(key)!
  let y = Number(q[1]), n = Number(q[2]) + by
  while (n < 1) { n += 4; y -= 1 }
  while (n > 4) { n -= 4; y += 1 }
  return `${y}-Q${n}`
}

async function shopOf(tx: Tx, tenantId: string): Promise<GstShop | null> {
  const [s] = await tx.select({ name: tenants.name, legalName: shopSettings.legalName, gstin: shopSettings.gstin, scheme: shopSettings.gstScheme, band: shopSettings.turnoverBand, filing: shopSettings.gstFiling, homeState: shopSettings.homeState })
    .from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId))
  return s ? { ...s, band: s.band as TurnoverBand, filing: s.filing as GstShop['filing'] } : null
}

/**
 * A period (`key` "2026-10" or "2026-Q3"; null: the one before now, the period being filed). Null when the shop is
 * missing or the key isn't a period.
 */
export async function gstPeriod(tenantId: string, key: string | null, now = new Date()): Promise<GstPeriod | null> {
  return withTenant(tenantId, (tx) => gstPeriodIn(tx, tenantId, key, now))
}

/** gstPeriod inside a transaction the caller already holds for this tenant (the export route's asMember). */
export async function gstPeriodIn(tx: Tx, tenantId: string, key: string | null, now: Date): Promise<GstPeriod | null> {
  const shop = await shopOf(tx, tenantId)
  if (!shop) return null
  const current = periodKeyAt(now, shop.filing)
  const k = key && periodOf(key) && (/-Q/.test(key) === (shop.filing === 'quarterly')) ? key : shift(current, -1)
  const period = periodOf(k)!
  if (period.from > now) return null
  const inPeriod = (col: typeof orders.packedAt | typeof creditNotes.issuedAt) => and(gte(col, period.from), lt(col, period.to))
  const [invoiced, credited] = await Promise.all([
    tx.select({ n: orders.number }).from(orders).where(and(eq(orders.tenantId, tenantId), isNotNull(orders.invoiceNumber), inPeriod(orders.packedAt))),
    tx.select({ n: orders.number }).from(creditNotes).innerJoin(orders, and(eq(orders.tenantId, creditNotes.tenantId), eq(orders.id, creditNotes.orderId)))
      .where(and(eq(creditNotes.tenantId, tenantId), inPeriod(creditNotes.issuedAt))),
  ])
  const numbers = [...new Set([...invoiced, ...credited].map((r) => r.n))]
  const invoices: Invoice[] = [], notes: GstDoc[] = [], broken: string[] = []
  for (let i = 0; i < numbers.length; i += BATCH) {
    const docs = await documentsFor(tx, tenantId, numbers.slice(i, i + BATCH), 'credit', now, BATCH)
    for (const d of docs.orders) {
      const inv = invoice(d.o, d.lines, docs.shop)
      if (!inv) continue
      if (inv.date >= period.from && inv.date < period.to) invoices.push(inv)
      for (const c of d.credits) {
        if (c.issuedAt < period.from || c.issuedAt >= period.to) continue
        // One note that no longer renders (its stored total disagrees) must not take the period down: it is a Fix.
        let cn: Invoice | null = null
        try { cn = creditNote(d.o, d.lines, docs.shop, c) } catch { broken.push(c.number); continue }
        if (cn) notes.push({ doc: cn, of: inv })
      }
    }
  }
  invoices.sort((a, b) => a.number.localeCompare(b.number))
  notes.sort((a, b) => a.doc.number.localeCompare(b.doc.number))
  const fixes = await fixesFor(tx, tenantId, shop, period, invoices)
  if (broken.length) fixes.push({ kind: 'bad_note', count: broken.length, examples: broken.slice(0, 5) })
  const nextKey = shift(k, 1)
  const filing = await filingOf(tx, tenantId, shop.gstin, k, now)
  return { shop, period, prev: shift(k, -1), next: periodOf(nextKey)!.from <= now ? nextKey : null, invoices, notes, gstr: gstr1(invoices, notes), fixes, filing }
}

async function filingOf(tx: Tx, tenantId: string, gstin: string | null, key: string, now: Date): Promise<GstFiling> {
  if (!gstin) return { connected: false, username: null, pushedAt: null, pushed: null, portal: null, filedAt: null, arn: null }
  const [[c], [f]] = await Promise.all([
    tx.select({ username: gstConnections.username, live: sql<boolean>`${gstConnections.tokenEnc} is not null and ${gstConnections.expiresAt} > ${now.toISOString()}::timestamptz` }).from(gstConnections).where(and(eq(gstConnections.tenantId, tenantId), eq(gstConnections.gstin, gstin))),
    tx.select().from(gstFilings).where(and(eq(gstFilings.tenantId, tenantId), eq(gstFilings.gstin, gstin), eq(gstFilings.period, key))),
  ])
  return { connected: !!c?.live, username: c?.username ?? null, pushedAt: f?.pushedAt ?? null, pushed: (f?.ours as Liability | undefined) ?? null, portal: (f?.portal as Liability | null | undefined) ?? null, filedAt: f?.filedAt ?? null, arn: f?.arn ?? null }
}

/** What stops a clean return, each with up to five examples (invoice or order numbers). */
async function fixesFor(tx: Tx, tenantId: string, shop: GstShop, period: Period, invoices: Invoice[]): Promise<Fix[]> {
  const out: Fix[] = []
  const lines = invoices.flatMap((i) => i.lines.map((l) => ({ inv: i.number, b2b: !!i.buyer.gstin, hsn: l.hsn })))
  const noHsn = [...new Set(lines.filter((l) => !l.hsn).map((l) => l.inv))]
  if (noHsn.length) out.push({ kind: 'no_hsn', count: noHsn.length, examples: noHsn.slice(0, 5) })
  const digits = hsnDigitsFor(shop.band)
  const short = [...new Set(lines.filter((l) => l.hsn && (shop.band === 'under_5cr' ? l.b2b : true) && l.hsn.replace(/\D/g, '').length < digits).map((l) => l.inv))]
  if (short.length) out.push({ kind: 'hsn_digits', count: short.length, examples: short.slice(0, 5) })
  const bad = invoices.filter((i) => i.buyer.gstin && !gstinValid(i.buyer.gstin)).map((i) => i.number)
  if (bad.length) out.push({ kind: 'bad_gstin', count: bad.length, examples: bad.slice(0, 5) })
  // Gaps in the financial year's invoice series up to this period's end (a gap needs a word for the CA).
  const ist = new Date(period.from.getTime() + 5.5 * 3_600_000)
  const fyStart = new Date(Date.UTC(ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1, 3, 1) - 5.5 * 3_600_000)
  const fy = await tx.select({ n: orders.invoiceNumber }).from(orders).where(and(eq(orders.tenantId, tenantId), isNotNull(orders.invoiceNumber), gte(orders.packedAt, fyStart), lt(orders.packedAt, period.to)))
  const gaps = seriesGaps(fy.map((r) => r.n!).filter((n) => !/B\d+$/.test(n)))
  if (gaps.length) out.push({ kind: 'gap', count: gaps.length, examples: gaps.slice(0, 5) })
  // Parcels that came back with an invoice and no credit note (an RTO reverses the sale: CA rules on the treatment).
  const back = await tx.select({ n: orders.number }).from(orders).where(and(eq(orders.tenantId, tenantId), isNotNull(orders.invoiceNumber), isNotNull(orders.rtoDeliveredAt), lt(orders.rtoDeliveredAt, period.to),
    sql`not exists (select 1 from ${creditNotes} cn where cn.tenant_id = ${orders.tenantId} and cn.order_id = ${orders.id})`)).limit(200)
  if (back.length) out.push({ kind: 'came_back', count: back.length, examples: back.slice(0, 5).map((r) => String(r.n)) })
  return out
}
