import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { ADMIN_ONLY, type StaffOk } from '@/lib/auth/require-staff'
import { adminDb } from '@/lib/db/admin'
import { tenants } from '@/lib/db/schema'
import { frrataInvoices } from '@/lib/db/schema-billing'
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
  return rows.map(({ cgst, sgst, igst, ...r }) => ({ ...r, gst: cgst + sgst + igst }))
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
