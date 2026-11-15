import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'
import { errName } from '@/lib/log'
import { paise } from '@/domains/money/paise'
import type { Bill, Deal, DealKind, OpenBill } from '@/domains/partners/bills'
import type { ShareMonth } from '@/domains/partners/share'
import type { Caller } from './partners'

// =============================================================================
// FILE: src/lib/db/partner-bills.ts — a partner's OWN billing to its clients and the share's month (P2 Clients,
// docs/plans/2026-11-16-p2-clients.md). Every call is a definer in drizzle/0145 that takes the partner from the
// caller's own live membership and re-checks this session's passkey check; a link or bill id is matched on the caller's
// partner ('not_found' otherwise). Only the partner's owner gets rows; a Lead or Builder gets none or 'not_owner'.
// Errors are logged by name only (S10: a raw error carries its parameters, the step-up hash among them).
// =============================================================================

const CODES = ['not_owner', 'not_found', 'bad_input', 'too_many', 'too_many_bills', 'confirm_first', 'confirm_again'] as const
export type BillError = (typeof CODES)[number] | 'unknown'

function code(err: unknown, tag: string): BillError {
  const msg = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : '')
  const c = CODES.find((k) => msg === k || msg.includes(k))
  if (!c) console.error(`[${tag}]`, errName(err))
  return c ?? 'unknown'
}

export type Done = { ok: true } | { ok: false; error: BillError }

const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))

export type ClientShare = { linkId: string; bps: number; month: ShareMonth }

/** The previous IST month's invoice per link, inside each link's window (owner only; an empty list for anyone else). */
export async function clientShares(c: Caller): Promise<ClientShare[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`select * from app_partner_client_shares(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup})`)
  return rows.map((r) => ({
    linkId: r.link_id as string, bps: Number(r.share_bps),
    month: { issuedAt: r.issued_at ? new Date(r.issued_at as string) : null, hasNumber: r.has_number === true, total: Number(r.total),
      paid: Number(r.paid), credited: Number(r.credited), netTaxable: Number(r.net_taxable) },
  }))
}

export type ClientBilling = { tenantId: string; deal: Deal | null; open: OpenBill[]; bills: number }

/** Every client's deal and unpaid bills (owner only). */
export async function billSummary(c: Caller): Promise<ClientBilling[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`select * from app_partner_bill_summary(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup})`)
  return rows.map((r) => ({
    tenantId: r.tenant_id as string,
    deal: r.kind ? { kind: r.kind as DealKind, amount: paise(Number(r.amount)), renewsOn: r.renews_on ? day(r.renews_on) : null } : null,
    open: ((r.open_bills as [number, string][] | null) ?? []).map(([a, d]) => ({ amount: paise(Number(a)), dueOn: String(d) })),
    bills: Number(r.bills),
  }))
}

/** One client's bills for its page (owner only): the last 13 months and every unpaid one, newest first. */
export async function clientBills(c: Caller, linkId: string): Promise<Bill[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`select * from app_partner_client_bills(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}, ${linkId}::uuid)`)
  return rows.map((r) => ({ id: r.id as string, label: r.label as string, number: (r.number as string | null) ?? null, amount: paise(Number(r.amount)),
    dueOn: day(r.due_on), paidAt: r.paid_at ? new Date(r.paid_at as string) : null }))
}

/** Counted first, in its own statement: a refused write still counts (60 a person a minute). */
async function counted<T>(c: Caller, tag: string, run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: BillError }> {
  try {
    await db().execute(sql`select app_partner_bill_try(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup})`)
    return { ok: true, value: await run() }
  } catch (err) {
    return { ok: false, error: code(err, tag) }
  }
}

export async function setDeal(c: Caller, linkId: string, d: { kind: DealKind; amount: number; renewsOn: string | null }): Promise<Done> {
  const r = await counted(c, 'setDeal', () => db().execute(sql`select app_partner_deal_set(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}, ${linkId}::uuid, ${d.kind}, ${d.amount}::bigint, ${d.renewsOn}::date)`))
  return r.ok ? { ok: true } : r
}

export async function addBill(c: Caller, linkId: string, b: { label: string; number: string | null; amount: number; dueOn: string }): Promise<{ ok: true; id: string } | { ok: false; error: BillError }> {
  const r = await counted(c, 'addBill', () => db().execute<{ id: string }>(sql`select app_partner_bill_add(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}, ${linkId}::uuid, ${b.label}, ${b.number}, ${b.amount}::bigint, ${b.dueOn}::date) as id`))
  return r.ok ? { ok: true, id: r.value[0]!.id } : r
}

export async function markBill(c: Caller, billId: string, paid: boolean): Promise<Done> {
  const r = await counted(c, 'markBill', () => db().execute(sql`select app_partner_bill_paid(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}, ${billId}::uuid, ${paid})`))
  return r.ok ? { ok: true } : r
}

export async function deleteBill(c: Caller, billId: string): Promise<Done> {
  const r = await counted(c, 'deleteBill', () => db().execute(sql`select app_partner_bill_delete(${c.userId}::uuid, ${c.sessionId}::uuid, ${c.stepup}, ${billId}::uuid)`))
  return r.ok ? { ok: true } : r
}
