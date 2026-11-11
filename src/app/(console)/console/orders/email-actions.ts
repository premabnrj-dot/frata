'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { asMember } from '@/lib/auth/as-member'
import { orders } from '@/lib/db/schema-orders'
import { enqueue } from '@/lib/outbox'
import { drainSoon } from '@/lib/outbox/drain'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { ORDER_MESSAGES } from '@/domains/messaging/events'
import { cleanEmail } from '@/domains/email/shape'
import { errName } from '@/lib/log'

// The order page's Emails card (email plan E·2, task 14). Owners and admins fix the address (until the order is
// erased: a bounced Shipped email can be fixed after packing) and send an email again (once in 10 minutes, three a
// day per kind, failing closed). The audit row names the field, never the address. A support visit can't send.

type Result = { ok: true } | { ok: false; error: string }
const ROLES = ['owner', 'admin'] as const

export async function setOrderEmailAction(orderId: string, email: string): Promise<Result> {
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: 'Order not found.' }
  const clean = email.trim() ? cleanEmail(email) : null
  if (email.trim() && !clean) return { ok: false, error: 'An email like name@example.com, or leave it empty.' }
  try {
    const r = await asMember(ROLES, { action: 'order.email', target: orderId, detail: { fields: ['email'] } }, async (tx, auth) => {
      const set = await tx.update(orders).set({ email: clean })
        .where(and(eq(orders.tenantId, auth.membership.tenantId), eq(orders.id, orderId), isNull(orders.erasedAt))).returning({ id: orders.id })
      return set.length > 0
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value) return { ok: false, error: 'Order not found.' }
    revalidatePath('/console/orders', 'layout')
    return { ok: true }
  } catch (err) { console.error('[order.email]', errName(err)); return { ok: false, error: 'We could not save that. Nothing was changed.' } }
}

export async function resendOrderEmailAction(orderId: string, kind: string): Promise<Result> {
  const k = z.enum(ORDER_MESSAGES).safeParse(kind)
  if (!z.uuid().safeParse(orderId).success || !k.success) return { ok: false, error: 'Order not found.' }
  try {
    const r = await asMember(ROLES, { action: 'order.email_resend', target: orderId, detail: { kind: k.data } }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return 'A support visit can’t send emails to shoppers.'
      const t = auth.membership.tenantId
      const [o] = await tx.select({ email: orders.email }).from(orders).where(and(eq(orders.tenantId, t), eq(orders.id, orderId), isNull(orders.erasedAt))).limit(1)
      if (!o) return 'Order not found.'
      if (!o.email) return 'Add the shopper’s email first.'
      const key = `${t}:${orderId}:${k.data}`
      if (!(await withinLimit(LIMITS.emailResendShort, key, new Date(), true))) return 'Sent a moment ago. Try again in 10 minutes.'
      if (!(await withinLimit(LIMITS.emailResendDay, key, new Date(), true))) return 'Three times today already.'
      await enqueue(tx, { tenantId: t, kind: 'email.order', dedupeKey: `email:${k.data}:again:${randomUUID()}`, payload: { orderId, eventId: null, kind: k.data } })
      return null
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value) return { ok: false, error: r.value }
    drainSoon()
    revalidatePath('/console/orders', 'layout')
    return { ok: true }
  } catch (err) { console.error('[order.email_resend]', errName(err)); return { ok: false, error: 'We could not send it. Nothing was sent.' } }
}
