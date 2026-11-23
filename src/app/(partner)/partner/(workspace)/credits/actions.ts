'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePartner } from '@/lib/auth/require-partner'
import { budgets, changeSeat, setAlerts, setBudget, setDetails, setSiteBudget, type CreditError } from '@/lib/db/partner-credits'
import { confirmPurchase, startPurchase } from '@/lib/studio/purchase'
import { partnerCan } from '@/domains/partners/team'
import { CONFIRM_AGAIN, CONFIRM_FIRST } from '@/domains/partners/passkeys'
import { MAX_BUDGET, RAISE_STEP } from '@/domains/studio/credits'
import { TYPED_MAX, TYPED_MIN } from '@/domains/studio/prices'
import { GSTIN_SHAPE } from '@/domains/tax/gstin'
import { STATE_CODE, STATES } from '@/domains/checkout/states'

// =============================================================================
// FILE: src/app/(partner)/partner/(workspace)/credits/actions.ts — Credits and billing (C1·4). Who may: the partner OWNER
// (PARTNER_CAN.credits), checked here for the words and again inside every definer (drizzle/0164), which takes the
// partner from the caller's own membership; a link id from a form is matched on that partner ('not_found'). Writes are
// counted first. Money is never believed from here: confirm only asks the gateway about OUR order (src/lib/studio).
// =============================================================================

type Refusal = CreditError | 'not_configured' | 'test_keys' | 'seller' | 'gateway'
const SAYS: Record<Refusal, string> = {
  not_owner: 'Ask the partner owner to do this.',
  not_found: 'This client is no longer in your list. Refresh the page.',
  bad_input: 'Check the marked field.',
  bad_gstin: 'A GSTIN has 15 characters. Check it, or leave it empty.',
  too_many: 'Too many tries. Try again in an hour.',
  confirm_first: CONFIRM_FIRST,
  confirm_again: CONFIRM_AGAIN,
  details_first: 'Add a name and a state.',
  has_seat: 'You already have Studio.',
  no_seat: 'You have no Studio plan to change.',
  below_used: 'A budget can’t go below what the client has used.',
  gstin_locked: 'An invoice already carries this GSTIN. Contact Frrata to change it.',
  rate: 'Studio can’t start a turn right now. Try again in a few minutes.',
  platform_day: 'Studio is busy today. Try again tomorrow.',
  person_day: 'You’ve used 300 credits today. Try again tomorrow.',
  budget: 'This client’s budget is used up.',
  balance: 'Not enough credits. Buy credits to continue.',
  renewal_paying: 'Studio’s payment is with your bank. Try again once it’s paid.',
  start_open: 'A payment is still waiting. Try again in 10 minutes.',
  not_configured: 'Payments aren’t set up yet. Nothing was charged.',
  test_keys: 'Payments are in test mode. Nothing was charged.',
  seller: 'Frrata can’t take payments yet. Nothing was charged.',
  gateway: 'The payment page couldn’t start. Nothing was charged.',
  unknown: 'We couldn’t save that. Nothing was changed.',
}
const say = (e: Refusal) => SAYS[e] ?? SAYS.unknown

export type Done = { ok: true; text: string } | { ok: false; error: string; fields?: Record<string, string> }

async function as(cap: 'credits' | 'budgets') {
  const auth = await requirePartner()
  if (!auth.ok) return { ok: false as const, error: auth.message }
  if (!partnerCan(auth.partner.memberRole, cap)) return { ok: false as const, error: SAYS.not_owner }
  return { ok: true as const, auth }
}
const refresh = () => revalidatePath('/partner/credits')

// ── Buying ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const Buy = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pack') }),
  z.object({ kind: z.literal('credits'), credits: z.number().int().min(TYPED_MIN).max(TYPED_MAX) }),
  z.object({ kind: z.literal('seat'), plan: z.enum(['studio', 'plus']), method: z.enum(['upi', 'card']) }),
])
export type Opened = { ok: true; key: string; order: string; purchaseId: string; amount: number; customer: string | null; recurring: boolean } | { ok: false; error: string }

/** Opens a purchase: the attempt row and the gateway's order; Checkout opens on what comes back. */
export async function startBuyAction(input: unknown): Promise<Opened> {
  const o = await as('credits')
  if (!o.ok) return o
  const p = Buy.safeParse(input)
  if (!p.success) return { ok: false, error: `Enter ${TYPED_MIN} to ${TYPED_MAX.toLocaleString('en-IN')} credits.` }
  const b = p.data
  const r = b.kind === 'seat' ? await startPurchase(o.auth, { kind: 'seat', plan: b.plan }, b.method) : await startPurchase(o.auth, b)
  if (!r.ok) return { ok: false, error: say(r.error) }
  return r
}

export type Checked = { ok: true; state: 'added' | 'waiting' | 'declined' | 'refunding' } | { ok: false; error: string }
/** After Checkout: the server asks the gateway about OUR order for this attempt. */
export async function confirmBuyAction(purchaseId: unknown): Promise<Checked> {
  const o = await as('credits')
  if (!o.ok) return o
  const id = z.uuid().safeParse(purchaseId)
  if (!id.success) return { ok: false, error: SAYS.not_found }
  const r = await confirmPurchase(o.auth, id.data)
  if (!r.ok) return { ok: false, error: say(r.error) }
  if (r.state === 'added') refresh()
  return { ok: true, state: r.state }
}

// ── Budgets ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const Credits = z.number().int().min(1).max(MAX_BUDGET)

export async function setBudgetAction(input: { linkId: string; credits: number; client: string }): Promise<Done> {
  const o = await as('credits')
  if (!o.ok) return o
  const p = z.object({ linkId: z.uuid(), credits: Credits, client: z.string().max(80) }).safeParse(input)
  if (!p.success) return { ok: false, error: SAYS.bad_input, fields: { credits: `Enter 1 to ${MAX_BUDGET.toLocaleString('en-IN')} credits.` } }
  const r = await setBudget(o.auth, p.data.linkId, p.data.credits)
  if (!r.ok) return r.error === 'below_used' ? { ok: false, error: SAYS.below_used, fields: { credits: SAYS.below_used } } : { ok: false, error: say(r.error) }
  refresh()
  return { ok: true, text: `${p.data.client}’s budget is now ${p.data.credits.toLocaleString('en-IN')} credits.` }
}

/** Raise by 50 (22 Nov page): read the budget now, add the step. */
export async function raiseBudgetAction(input: { linkId: string }): Promise<Done> {
  const o = await as('credits')
  if (!o.ok) return o
  const id = z.uuid().safeParse(input?.linkId)
  if (!id.success) return { ok: false, error: SAYS.not_found }
  const rows = await budgets(o.auth)
  if (!rows.ok) return { ok: false, error: say(rows.error) }
  const row = rows.value.find((r) => r.linkId === id.data)
  if (!row) return { ok: false, error: SAYS.not_found }
  const next = Math.max(row.budget ?? 0, row.used) + RAISE_STEP
  const r = await setBudget(o.auth, id.data, next)
  if (!r.ok) return { ok: false, error: say(r.error) }
  refresh()
  return { ok: true, text: `${row.client}’s budget is now ${next.toLocaleString('en-IN')} credits.` }
}

export async function setSiteBudgetAction(credits: unknown): Promise<Done> {
  const o = await as('credits')
  if (!o.ok) return o
  const p = Credits.safeParse(credits)
  if (!p.success) return { ok: false, error: SAYS.bad_input, fields: { credits: `Enter 1 to ${MAX_BUDGET.toLocaleString('en-IN')} credits.` } }
  const r = await setSiteBudget(o.auth, p.data)
  if (!r.ok) return { ok: false, error: say(r.error) }
  refresh()
  return { ok: true, text: `New websites start at ${p.data.toLocaleString('en-IN')} credits.` }
}

// ── Alerts, details, the plan ───────────────────────────────────────────────────────────────────────────────────────

export async function setAlertsAction(input: { low: boolean; budget: boolean }): Promise<Done> {
  const o = await as('credits')
  if (!o.ok) return o
  const p = z.object({ low: z.boolean(), budget: z.boolean() }).safeParse(input)
  if (!p.success) return { ok: false, error: SAYS.bad_input }
  const r = await setAlerts(o.auth, p.data.low, p.data.budget)
  if (!r.ok) return { ok: false, error: say(r.error) }
  refresh()
  return { ok: true, text: 'Saved.' }
}

const Details = z.object({
  legalName: z.string().trim().min(1).max(120),
  gstin: z.string().trim().toUpperCase().max(15).transform((v) => v || null),
  state: z.string().max(40),
  address: z.string().trim().min(1).max(300),
  email: z.string().trim().max(254).transform((v) => v || null),
})

export async function setDetailsAction(input: Record<string, unknown>): Promise<Done> {
  const o = await as('credits')
  if (!o.ok) return o
  const p = Details.safeParse(input ?? {})
  const fields: Record<string, string> = {}
  if (!p.success) {
    for (const i of p.error.issues) {
      const f = String(i.path[0])
      fields[f] = f === 'legalName' ? 'Enter the legal name.' : f === 'address' ? 'Enter the address.' : f === 'gstin' ? SAYS.bad_gstin : f === 'email' ? 'Enter an email address.' : 'Pick the state.'
    }
    return { ok: false, error: SAYS.bad_input, fields }
  }
  const d = p.data
  if (d.gstin && !GSTIN_SHAPE.test(d.gstin)) return { ok: false, error: SAYS.bad_gstin, fields: { gstin: SAYS.bad_gstin } }
  const state = (STATES as readonly string[]).includes(d.state) ? STATE_CODE[d.state as keyof typeof STATE_CODE] : null
  if (!d.gstin && !state) return { ok: false, error: SAYS.details_first, fields: { state: 'Pick the state.' } }
  if (d.email && !/^[^@\s]+@[^@\s]+$/.test(d.email)) return { ok: false, error: SAYS.bad_input, fields: { email: 'Enter an email address.' } }
  const r = await setDetails(o.auth, { legalName: d.legalName, gstin: d.gstin, stateCode: d.gstin ? null : state, address: d.address, email: d.email })
  if (!r.ok) return r.error === 'bad_gstin' || r.error === 'gstin_locked' ? { ok: false, error: say(r.error), fields: { gstin: say(r.error) } } : { ok: false, error: say(r.error) }
  refresh()
  return { ok: true, text: 'Saved.' }
}

const Seat = z.discriminatedUnion('action', [
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('keep') }),
  z.object({ action: z.literal('plan'), plan: z.enum(['studio', 'plus']) }),
])
export async function seatAction(input: unknown): Promise<Done> {
  const o = await as('credits')
  if (!o.ok) return o
  const p = Seat.safeParse(input)
  if (!p.success) return { ok: false, error: SAYS.bad_input }
  const r = await changeSeat(o.auth, p.data.action, p.data.action === 'plan' ? p.data.plan : null)
  if (!r.ok) return { ok: false, error: say(r.error) }
  refresh()
  return { ok: true, text: 'Saved.' } // the dialog says it with its date (credits-parts useSeat)
}
