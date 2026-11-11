'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { asMember } from '@/lib/auth/as-member'
import { CAN_MANAGE } from '@/domains/tenancy/roles'
import { ORDER_MESSAGES } from '@/domains/messaging/events'
import { WORD_FIELDS, type EmailWords } from '@/domains/email/words'
import { checkWords, saveShopEmail } from '@/lib/queries/emails'
import { emailMessages } from '@/lib/db/schema-email'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { previewOrderEmail } from '@/lib/email/preview'
import { sendEmail } from '@/lib/email/ses'
import { cleanEmail } from '@/domains/email/shape'
import { fromHeader } from '@/domains/email/headers'
import { shopSettingsFor } from '@/lib/queries/storefront'
import { EMAIL_SHOP_DOMAIN, SES_CONFIG_SHOPS } from '@/lib/env'
import { tenantName } from '@/lib/email/ses'
import { ensureShopTenant } from '@/lib/email/order-sender'
import { errName } from '@/lib/log'

// Settings › Emails to shoppers (email plan E·2, task 13). Owners and admins change words and switches; a support
// visit reads and previews only (no saves, no sends). A test goes only to the signed-in member's own address.

type Result = { ok: true; message?: string } | { ok: false; error: string }
const Kind = z.enum(ORDER_MESSAGES)
const Words = z.object(Object.fromEntries(WORD_FIELDS.map((f) => [f, z.string().max(1000)])) as Record<(typeof WORD_FIELDS)[number], z.ZodString>)
const SUPPORT = 'A support visit can read and preview, not change or send.'

/** Words (null: back to Frrata's; undefined: the switch alone, words untouched) and the switch. */
export async function saveEmailAction(kind: string, words: EmailWords | null | undefined, on: boolean): Promise<Result> {
  const k = Kind.safeParse(kind)
  if (!k.success || typeof on !== 'boolean') return { ok: false, error: 'Unknown email.' }
  let clean: EmailWords | null | undefined = words === undefined ? undefined : null
  if (words) {
    const w = Words.safeParse(words)
    if (!w.success) return { ok: false, error: 'Check the fields.' }
    clean = Object.fromEntries(WORD_FIELDS.map((f) => [f, w.data[f].replace(/\r/g, '').trim()])) as EmailWords
    const bad = checkWords(clean)
    if (bad) return { ok: false, error: bad }
  }
  try {
    const r = await asMember(CAN_MANAGE, { action: 'emails.save', target: k.data, detail: { on, words: clean === undefined ? 'kept' : clean ? 'own' : 'frrata' } }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return SUPPORT
      if (on) { const shop = await shopSettingsFor(auth.membership.tenantId); if (!cleanEmail(shop?.supportEmail)) return 'Add a support email in Settings › Contact first.' }
      await saveShopEmail(tx, auth.membership.tenantId, auth.userId, k.data, clean, on)
      return null
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value) return { ok: false, error: r.value }
    revalidatePath('/console/settings/emails', 'layout')
    return { ok: true }
  } catch (err) { console.error('[emails] save', errName(err)); return { ok: false, error: 'We could not save that. Nothing was changed.' } }
}

export async function sendTestAction(kind: string, words: EmailWords): Promise<Result> {
  const k = Kind.safeParse(kind)
  const w = Words.safeParse(words)
  if (!k.success || !w.success) return { ok: false, error: 'Check the fields.' }
  const bad = checkWords(w.data)
  if (bad) return { ok: false, error: bad }
  if (!EMAIL_SHOP_DOMAIN) return { ok: false, error: 'Email is not set up yet.' }
  try {
    const r = await asMember(CAN_MANAGE, { action: 'emails.test', target: k.data }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return { error: SUPPORT }
      const to = cleanEmail(auth.email)
      if (!to) return { error: 'Your account has no email we can send to.' }
      if (!(await withinLimit(LIMITS.emailTestMember, `${auth.membership.tenantId}:${auth.userId}`, new Date(), true))) return { error: 'Five tests an hour. Try again later.' }
      const id = randomUUID()
      await tx.insert(emailMessages).values({ id, tenantId: auth.membership.tenantId, kind: 'test', userId: auth.userId, attemptedAt: new Date() })
      return { id, to, tenantId: auth.membership.tenantId }
    })
    if (!r.ok) return { ok: false, error: r.error }
    if ('error' in r.value) return { ok: false, error: r.value.error! }
    const { id, to, tenantId } = r.value
    const shop = await shopSettingsFor(tenantId)
    const p = await previewOrderEmail(tenantId, k.data, w.data)
    if (!shop || !p) return { ok: false, error: 'Email is not set up yet.' }
    // The shop's SES tenant first (an order email waits for it in the outbox; a test, clicked by a person, sets it up now).
    const t = await ensureShopTenant(tenantId)
    if (!t.ok) {
      await asMember(CAN_MANAGE, { action: 'emails.test.result' }, (tx) => tx.update(emailMessages).set({ failedAt: new Date(), failedCode: t.code.replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 48) })
        .where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.id, id))))
      return { ok: false, error: 'It could not be sent. Try again in a minute.' }
    }
    const sent = await sendEmail({ from: fromHeader(shop.shopName, `${shop.slug}@${EMAIL_SHOP_DOMAIN}`), to, replyTo: cleanEmail(shop.supportEmail), subject: `[Test] ${p.subject}`,
      html: p.mail.html, text: p.mail.text, configurationSet: SES_CONFIG_SHOPS, tenant: tenantName(tenantId), messageId: id, tenantTag: tenantId }, new Date())
    await asMember(CAN_MANAGE, { action: 'emails.test.result' }, (tx) => tx.update(emailMessages).set(sent.ok ? { sentAt: new Date(), providerId: sent.providerId } : { failedAt: new Date(), failedCode: sent.code.replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 48) })
      .where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.id, id))))
    return sent.ok ? { ok: true, message: `Sent to ${to}.` } : { ok: false, error: 'It could not be sent. Try again in a minute.' }
  } catch (err) { console.error('[emails] test', errName(err)); return { ok: false, error: 'It could not be sent. Try again in a minute.' } }
}
