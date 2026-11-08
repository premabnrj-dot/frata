'use server'

import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { billingGatewayIsTest, billingKeyId, checkoutSigned, createCustomer, createMandateOrder, createOrder, fetchPayment, isBillingGatewayConfigured, type Method } from '@/lib/billing/gateway'
import { billingAttemptResult } from '@/lib/db/platform'
import { revalidatePath } from 'next/cache'
import { parseBillingDetails } from '@/domains/billing/details'
import { asMember } from '@/lib/auth/as-member'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { auditEvents } from '@/lib/db/schema'
import { billingAccounts } from '@/lib/db/schema-billing'
import { errName } from '@/lib/log'

// Billing details (billing B1; plan finding 10): owners and admins (a Frrata support visit may correct them, audited),
// through asMember. Only the detail columns: frata_app holds no grant on the gateway or mandate columns (0048), so the
// upsert names its columns rather than letting drizzle write DEFAULT into every one.
export async function saveBillingDetails(input: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string; errors?: Record<string, string> }> {
  // Who first, then the input (security review 2026-11-08): nobody outside owner and admin gets the parser's time.
  const me = await requireMember(CAN_MANAGE)
  if (!me.ok) return { ok: false, error: me.message }
  const p = parseBillingDetails(input && typeof input === 'object' ? input : {})
  if (!p.ok) return { ok: false, error: 'Some fields need a look before saving.', errors: p.errors }
  const v = p.value
  try {
    const r = await asMember(CAN_MANAGE, { action: 'billing.details', detail: { gstin: !!v.gstin, state: v.stateCode } }, async (tx, auth) => {
      const t = auth.membership.tenantId
      await tx.execute(sql`insert into ${billingAccounts} (tenant_id, legal_name, gstin, address, state_code, email, updated_at)
        values (${t}, ${v.legalName}, ${v.gstin}, ${v.address}, ${v.stateCode}, ${v.email}, now())
        on conflict (tenant_id) do update set legal_name = excluded.legal_name, gstin = excluded.gstin, address = excluded.address,
          state_code = excluded.state_code, email = excluded.email, updated_at = now()`)
      if (!auth.membership.supportSessionId) {
        await tx.insert(auditEvents).values({ tenantId: t, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'billing.details', detail: { gstin: !!v.gstin, state: v.stateCode } })
      }
    })
    if (!r.ok) return { ok: false, error: r.error }
    revalidatePath('/console/settings/billing')
    return { ok: true }
  } catch (err) {
    console.error('[billing.details]', errName(err))
    return { ok: false, error: 'We could not save. Nothing was changed. Try again in a minute.' }
  }
}

// ── Billing B3: autopay and Pay now (plan findings 10, 14). Owners and admins; NEVER a Frrata support visit. The browser
// is trusted for nothing: Checkout's signature is verified, the order matched to this shop's pending row, and the
// payment and its token read back from the gateway itself. ──
type Checkout = { order: string; payment: string; signature: string }
const CheckoutBody = z.object({ order: z.string().regex(/^order_[A-Za-z0-9]{6,30}$/), payment: z.string().regex(/^pay_[A-Za-z0-9]{6,30}$/), signature: z.string().regex(/^[a-f0-9]{64}$/) })
const MAX: Record<Method, number> = { upi: 1_500_000, card: 1_500_000, emandate: 10_000_000 } // ₹15,000 (RBI's no-approval limit); eNACH ₹1,00,000
type Started = { ok: true; key: string; order: string; customer?: string; amount: number } | { ok: false; error: string }

async function owner() {
  const me = await requireMember(CAN_MANAGE)
  if (!me.ok) return { ok: false as const, error: me.message }
  if (me.membership.supportSessionId) return { ok: false as const, error: 'A Frrata support visit cannot set up or make a payment.' }
  if (!isBillingGatewayConfigured()) return { ok: false as const, error: 'Payments to Frrata are not open yet.' }
  return { ok: true as const, me }
}

export async function startAutopay(method: string): Promise<Started> {
  const o = await owner(); if (!o.ok) return o
  if (method !== 'upi' && method !== 'card' && method !== 'emandate') return { ok: false, error: 'Choose UPI Autopay, a card or a bank mandate.' }
  try {
    const r = await asMember(CAN_MANAGE, { action: 'billing.autopay.start', detail: { method } }, async (tx, auth) => {
      const [d] = await tx.execute<{ name: string; email: string; phone: string }>(sql`select coalesce(nullif(b.legal_name, ''), t.name) as name, coalesce(nullif(b.email, ''), s.support_email) as email, s.support_phone as phone
        from tenants t left join billing_accounts b on b.tenant_id = t.id left join shop_settings s on s.tenant_id = t.id where t.id = ${auth.membership.tenantId}`)
      const customer = await createCustomer({ name: d?.name || 'Shop', email: d?.email || `shop-${auth.membership.tenantId.slice(0, 8)}@frrata.app`, contact: d?.phone || '9000000000' })
      const order = await createMandateOrder({ customer: customer.id, method, maxAmount: MAX[method], receipt: `mandate:${auth.membership.tenantId.slice(0, 8)}:${Date.now()}` })
      await tx.execute(sql`select app_begin_mandate(${customer.id}, ${order.id}, ${method}, ${MAX[method]}, ${auth.userId}::uuid)`)
      return { order: order.id, customer: customer.id, amount: order.amount }
    })
    return r.ok ? { ok: true, key: billingKeyId(), ...r.value } : { ok: false, error: r.error }
  } catch (e) {
    console.error('[billing.autopay.start]', errName(e))
    return { ok: false, error: 'We could not start the set-up. Nothing was changed. Try again in a minute.' }
  }
}

export async function completeAutopay(input: Checkout): Promise<{ ok: true } | { ok: false; error: string }> {
  const o = await owner(); if (!o.ok) return o
  const p = CheckoutBody.safeParse(input)
  if (!p.success || !checkoutSigned(p.data.order, p.data.payment, p.data.signature)) return { ok: false, error: 'That did not come from the payment page. Try again.' }
  try {
    const pay = await fetchPayment(p.data.payment)
    if (pay.order_id !== p.data.order || !pay.token_id) return { ok: false, error: 'The bank did not confirm the mandate. Try again.' }
    const r = await asMember(CAN_MANAGE, { action: 'billing.autopay.done' }, async (tx) => {
      const [x] = await tx.execute<{ ok: boolean }>(sql`select app_complete_mandate(${p.data.order}, ${pay.token_id!}) as ok`)
      return !!x?.ok
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value) return { ok: false, error: 'That set-up is not this shop’s, or it is already done.' }
    revalidatePath('/console/settings/billing')
    return { ok: true }
  } catch (e) {
    console.error('[billing.autopay.done]', errName(e))
    return { ok: false, error: 'We could not confirm the mandate. Try again in a minute.' }
  }
}

export async function stopAutopay(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireMember(CAN_MANAGE)
  if (!me.ok) return { ok: false, error: me.message }
  if (me.membership.supportSessionId) return { ok: false, error: 'A Frrata support visit cannot change how the shop pays.' }
  const r = await asMember(CAN_MANAGE, { action: 'billing.autopay.stop' }, async (tx) => { await tx.execute(sql`select app_revoke_mandate()`) })
  if (!r.ok) return { ok: false, error: r.error }
  revalidatePath('/console/settings/billing')
  return { ok: true }
}

export async function startPayNow(invoiceId: string): Promise<Started> {
  const o = await owner(); if (!o.ok) return o
  if (!/^[0-9a-f-]{36}$/.test(invoiceId)) return { ok: false, error: 'Not found.' }
  try {
    const r = await asMember(CAN_MANAGE, { action: 'billing.paynow.start', target: invoiceId }, async (tx, auth) => {
      const [i] = await tx.execute<{ number: string; due: string; test_mode: boolean }>(sql`select i.number, i.test_mode,
          i.total - coalesce((select sum(amount) from frrata_payments p where p.invoice_id = i.id and p.captured_at is not null), 0)
                  - coalesce((select sum(total) from frrata_credit_notes c where c.invoice_id = i.id), 0) as due
        from frrata_invoices i where i.id = ${invoiceId}::uuid and i.tenant_id = ${auth.membership.tenantId} and i.number is not null`)
      if (!i || Number(i.due) <= 0) return { error: 'Nothing is due on that invoice.' }
      if (i.test_mode !== billingGatewayIsTest()) return { error: 'This invoice cannot be paid here.' }
      const order = await createOrder({ amount: Number(i.due), receipt: `${i.number}:pay${Date.now() % 1_000_000}` })
      await tx.execute(sql`select app_billing_checkout_begin(${invoiceId}::uuid, ${order.id}, ${Number(i.due)})`)
      return { order: order.id, amount: Number(i.due) }
    })
    if (!r.ok) return { ok: false, error: r.error }
    if ('error' in r.value) return { ok: false, error: r.value.error! }
    return { ok: true, key: billingKeyId(), order: r.value.order, amount: r.value.amount }
  } catch (e) {
    console.error('[billing.paynow.start]', errName(e))
    return { ok: false, error: 'We could not open the payment. Try again in a minute.' }
  }
}

export async function completePayNow(input: Checkout): Promise<{ ok: true } | { ok: false; error: string }> {
  const o = await owner(); if (!o.ok) return o
  const p = CheckoutBody.safeParse(input)
  if (!p.success || !checkoutSigned(p.data.order, p.data.payment, p.data.signature)) return { ok: false, error: 'That did not come from the payment page.' }
  try {
    const pay = await fetchPayment(p.data.payment)
    if (pay.order_id !== p.data.order) return { ok: false, error: 'That payment is not for this invoice.' }
    // Captured now, or the webhook records it when the bank confirms.
    if (pay.status === 'captured') await billingAttemptResult(p.data.order, p.data.payment, true, null)
    revalidatePath('/console/settings/billing')
    return { ok: true }
  } catch (e) {
    console.error('[billing.paynow.done]', errName(e))
    return { ok: false, error: 'We could not confirm the payment yet. If money left your account, it will show here soon.' }
  }
}
