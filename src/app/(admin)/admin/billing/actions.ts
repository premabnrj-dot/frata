'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { monthOfYM } from '@/domains/time/month'
import { issueCreditNote, issueMonth, recordPayment, runDraftsNow } from '@/lib/admin/billing'
import { fromRupees } from '@/domains/money/paise'
import { errName } from '@/lib/log'
import { draftableMonths } from '@/lib/billing/run'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'

const Month = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })

export async function runDraftsAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin/billing')
  const p = Month.safeParse(Object.fromEntries(form))
  if (!p.success) redirect(`/admin/billing?error=${encodeURIComponent('Choose a month')}`)
  const month = monthOfYM(p.data.month)!
  // Only this month (until issued) and next: a draft for any other month would claim orders the real one should bill.
  if (!draftableMonths(new Date()).some((m) => m.getTime() === month.getTime())) redirect(`/admin/billing?month=${p.data.month}&error=${encodeURIComponent('Drafts are made for this month and next only.')}`)
  const r = await runDraftsNow(staff, month)
  revalidatePath('/admin/billing')
  const msg = `${r.drafted} drafted${r.issued ? `, ${r.issued} already issued` : ''}${r.failed ? `, ${r.failed} failed (see the logs)` : ''}${r.skipped ? `, ${r.skipped} not reached` : ''}.`
  redirect(`/admin/billing?month=${p.data.month}&${r.failed ? 'error' : 'ok'}=${encodeURIComponent(msg)}`)
}

// ── Billing B2: issue, record a payment, a credit note (ADMIN_ONLY; each audited in its own transaction) ──
const Issue = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), count: z.coerce.number().int().min(1).max(100_000), total: z.coerce.number().int().min(1), confirm: z.string().max(32) })
const reason = (e: unknown) => {
  const m = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : ''
  // The definer's own words (no data in them) are safe to show; anything else is generic.
  const own = /^(issue|payment|credit): .{1,160}$/.exec(m)
  return own ? own[0].replace(/^\w+: /, '') : 'Nothing was changed. Try again, or check the logs.'
}

export async function issueAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin/billing')
  const p = Issue.safeParse(Object.fromEntries(form))
  if (!p.success) redirect(`/admin/billing?error=${encodeURIComponent('Check the month and the figures')}`)
  const back = `/admin/billing?month=${p.data.month}`
  // The typed confirmation is checked here, on the server (finding 17): it names the number of invoices.
  if (p.data.confirm.trim().toUpperCase() !== `ISSUE ${p.data.count}`) redirect(`${back}&error=${encodeURIComponent(`Type ISSUE ${p.data.count} to issue.`)}`)
  let msg: string
  try {
    const r = await issueMonth(staff, monthOfYM(p.data.month)!, { count: p.data.count, total: p.data.total })
    msg = `${r.issued} invoice${r.issued === 1 ? '' : 's'} issued${r.closed ? `, ${r.closed} closed with nothing to pay` : ''}${r.test ? ' — test mode: not tax invoices, never collected' : ''}.`
  } catch (e) {
    console.error('[billing.issue]', errName(e))
    redirect(`${back}&error=${encodeURIComponent(reason(e))}`)
  }
  revalidatePath('/admin/billing')
  redirect(`${back}&ok=${encodeURIComponent(msg)}`)
}

const Pay = z.object({ invoice: z.string().uuid(), rupees: z.coerce.number().positive().max(10_00_00_000), method: z.enum(['bank_transfer', 'upi', 'card', 'paylink']), utr: z.string().trim().regex(/^[A-Za-z0-9-]{6,40}$/) })
export async function paymentAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin/billing')
  const p = Pay.safeParse(Object.fromEntries(form))
  const id = String(form.get('invoice') ?? '')
  const back = `/admin/billing/invoice/${/^[0-9a-f-]{36}$/.test(id) ? id : ''}`
  if (!p.success) redirect(`${back}?error=${encodeURIComponent('Amount, method and a reference (UTR, 6 to 40 letters and digits) are needed.')}`)
  try { await recordPayment(staff, p.data.invoice, { amount: fromRupees(p.data.rupees), method: p.data.method, utr: p.data.utr }) } catch (e) {
    console.error('[billing.payment]', errName(e))
    redirect(`${back}?error=${encodeURIComponent(/frrata_payments_utr/.test(String((e as { cause?: unknown })?.cause ?? e)) ? 'That reference was already recorded.' : reason(e))}`)
  }
  revalidatePath(back)
  redirect(`${back}?ok=${encodeURIComponent('Payment recorded.')}`)
}

const Credit = z.object({ invoice: z.string().uuid(), rupees: z.coerce.number().positive().max(10_00_00_000), reason: z.string().trim().min(3).max(240) })
export async function creditAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin/billing')
  const p = Credit.safeParse(Object.fromEntries(form))
  const id = String(form.get('invoice') ?? '')
  const back = `/admin/billing/invoice/${/^[0-9a-f-]{36}$/.test(id) ? id : ''}`
  if (!p.success) redirect(`${back}?error=${encodeURIComponent('An amount (taxable value) and a reason are needed.')}`)
  let n: string
  try { n = await issueCreditNote(staff, p.data.invoice, { taxable: fromRupees(p.data.rupees), reason: p.data.reason }) } catch (e) {
    console.error('[billing.credit]', errName(e))
    redirect(`${back}?error=${encodeURIComponent(reason(e))}`)
  }
  revalidatePath(back)
  redirect(`${back}?ok=${encodeURIComponent(`Credit note ${n} issued.`)}`)
}
