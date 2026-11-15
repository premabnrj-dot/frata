'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePartner } from '@/lib/auth/require-partner'
import { addBill, deleteBill, markBill, setDeal, type BillError } from '@/lib/db/partner-bills'
import { partnerCan } from '@/domains/partners/team'
import { CONFIRM_AGAIN, CONFIRM_FIRST } from '@/domains/partners/passkeys'
import { isDay, MAX_BILLS_PER_CLIENT, parseRupees } from '@/domains/partners/bills'
import { paise } from '@/domains/money/paise'
import { formatInr } from '@/lib/format'

// =============================================================================
// FILE: src/app/(partner)/partner/(workspace)/clients/actions.ts — the partner's own bills to its clients (P2 Clients).
// Who may: the partner's OWNER (PARTNER_CAN.billing), checked here for the words and again inside every definer
// (drizzle/0145), which takes the partner from the caller's own membership. The link and bill ids come from the form;
// the definers accept only the caller's partner's own ('not_found'). Each write is counted first (60 a minute).
// =============================================================================

const SENTENCES: Record<BillError, string> = {
  not_owner: 'Only the partner owner keeps the billing.',
  not_found: 'That client or bill isn’t yours any more. Refresh and try again.',
  bad_input: 'Check the amount and the date.',
  too_many: 'Too many changes in a minute. Try again in a minute.',
  too_many_bills: `A client holds at most ${MAX_BILLS_PER_CLIENT} bills. Delete old ones first.`,
  confirm_first: CONFIRM_FIRST,
  confirm_again: CONFIRM_AGAIN,
  unknown: 'We couldn’t save that. Nothing was changed.',
}

export type BillResult = { ok: true; text: string } | { ok: false; error?: string; fields?: Partial<Record<'label' | 'number' | 'amount' | 'dueOn', string>> }

const Rupees = z.string().max(20).transform((v, ctx) => { const p = parseRupees(v); if (p === null) { ctx.addIssue({ code: 'custom', message: 'amount' }); return z.NEVER } return p as number })
const Day = z.string().refine(isDay)
const Id = z.uuid()

async function owner() {
  const auth = await requirePartner()
  if (!auth.ok) return { ok: false as const, error: auth.message }
  if (!partnerCan(auth.partner.memberRole, 'billing')) return { ok: false as const, error: SENTENCES.not_owner }
  return { ok: true as const, auth }
}

const refresh = (linkId: string) => { revalidatePath('/partner'); revalidatePath(`/partner/clients/${linkId}`) }

const BillInput = z.object({
  linkId: Id,
  label: z.string().trim().min(1).max(60),
  number: z.string().trim().max(20).regex(/^[A-Za-z0-9/-]*$/).transform((v) => v || null),
  amount: Rupees,
  dueOn: Day,
})

export async function recordBillAction(input: { linkId: string; label: string; number: string; amount: string; dueOn: string }): Promise<BillResult> {
  const o = await owner()
  if (!o.ok) return o
  const p = BillInput.safeParse(input ?? {})
  if (!p.success) {
    const bad = new Set(p.error.issues.map((i) => String(i.path[0])))
    if (bad.has('linkId')) return { ok: false, error: SENTENCES.not_found }
    const fields: NonNullable<Extract<BillResult, { ok: false }>['fields']> = {}
    if (bad.has('label')) fields.label = String(input?.label ?? '').trim() ? 'Keep it to 60 characters.' : 'Say what the bill is for.'
    if (bad.has('number')) fields.number = 'Use letters, digits, / or -.'
    if (bad.has('amount')) fields.amount = String(input?.amount ?? '').trim() ? 'Enter an amount from ₹1 to ₹10 crore.' : 'Enter the amount.'
    if (bad.has('dueOn')) fields.dueOn = 'Pick the day it’s due.'
    return { ok: false, fields }
  }
  const r = await addBill(o.auth, p.data.linkId, { label: p.data.label, number: p.data.number, amount: p.data.amount, dueOn: p.data.dueOn })
  if (!r.ok) return { ok: false, error: SENTENCES[r.error] }
  refresh(p.data.linkId)
  return { ok: true, text: `Recorded ${p.data.number ?? p.data.label} · ${formatInr(paise(p.data.amount))}` }
}

const DealInput = z.discriminatedUnion('kind', [
  z.object({ linkId: Id, kind: z.literal('retainer'), amount: Rupees, renewsOn: Day.nullable() }),
  z.object({ linkId: Id, kind: z.literal('project'), amount: Rupees }),
])

export async function setBillingAction(input: { linkId: string; kind: string; amount: string; renewsOn?: string | null }): Promise<BillResult> {
  const o = await owner()
  if (!o.ok) return o
  const p = DealInput.safeParse({ ...input, renewsOn: input?.renewsOn || null })
  if (!p.success) {
    const bad = new Set(p.error.issues.map((i) => String(i.path[0])))
    if (bad.has('amount')) return { ok: false, fields: { amount: String(input?.amount ?? '').trim() ? 'Enter an amount from ₹1 to ₹10 crore.' : 'Enter the amount.' } }
    if (bad.has('renewsOn')) return { ok: false, fields: { dueOn: 'Pick the day of the next bill.' } }
    return { ok: false, error: SENTENCES.not_found }
  }
  const d = p.data
  const r = await setDeal(o.auth, d.linkId, { kind: d.kind, amount: d.amount, renewsOn: d.kind === 'retainer' ? d.renewsOn : null })
  if (!r.ok) return { ok: false, error: SENTENCES[r.error] }
  refresh(d.linkId)
  return { ok: true, text: 'Billing saved' }
}

const Mark = z.object({ linkId: Id, billId: Id, paid: z.boolean(), name: z.string().max(80), amount: z.string().max(24) })

/** Mark paid or unpaid: the toast's Undo calls it again with the other value. */
export async function markBillAction(input: { linkId: string; billId: string; paid: boolean; name: string; amount: string }): Promise<BillResult> {
  const o = await owner()
  if (!o.ok) return o
  const p = Mark.safeParse(input ?? {})
  if (!p.success) return { ok: false, error: SENTENCES.not_found }
  const r = await markBill(o.auth, p.data.billId, p.data.paid)
  if (!r.ok) return { ok: false, error: SENTENCES[r.error] }
  refresh(p.data.linkId)
  return { ok: true, text: `Marked ${p.data.name} ${p.data.paid ? 'paid' : 'unpaid'} · ${p.data.amount}` }
}

const Del = z.object({ linkId: Id, billId: Id })

export async function deleteBillAction(input: { linkId: string; billId: string }): Promise<BillResult> {
  const o = await owner()
  if (!o.ok) return o
  const p = Del.safeParse(input ?? {})
  if (!p.success) return { ok: false, error: SENTENCES.not_found }
  const r = await deleteBill(o.auth, p.data.billId)
  if (!r.ok) return { ok: false, error: SENTENCES[r.error] }
  refresh(p.data.linkId)
  return { ok: true, text: 'Bill deleted' }
}
