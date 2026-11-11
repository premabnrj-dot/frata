import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant'
import { emailMessages, noticePrefs, noticeReads, notices } from '@/lib/db/schema-email'
import { GiveUp, Later, type OutboxRow } from '@/lib/outbox'
import { shopSettingsFor } from '@/lib/queries/storefront'
import { wordNotices } from '@/lib/queries/notices'
import { DEFAULT_EMAIL, REQUIRED_TYPES, type NoticeType, type OptionalType } from '@/domains/email/notices'
import { frrataEmail } from '@/domains/email/layouts'
import { cleanEmail } from '@/domains/email/shape'
import { CONSOLE_HOST } from '@/lib/public-env'
import { EMAIL_NOTICES_FROM, SES_CONFIG_NOTICES } from '@/lib/env'
import { sendEmail } from './ses'

// =============================================================================
// FILE: src/lib/email/notice-sender.ts — THE `email.notice` SENDER (email plan E·1, task 8). One outbox row per notice;
// recipients are worked out when it sends, inside the shop: required types (billing, security, Frrata acted) go to
// owners and admins, always; optional types to members whose choice says email, who haven't read it in the console
// (it waited 10 minutes). Each recipient gets one attempt row (unique per notice and person) committed before SES is
// called; an address is read only for a current member (app_member_email) and never stored.
// =============================================================================

const UUID = /^[0-9a-f-]{36}$/

export async function sendNoticeEmail(row: OutboxRow): Promise<void> {
  const noticeId = (row.payload as { noticeId?: unknown })?.noticeId
  if (typeof noticeId !== 'string' || !UUID.test(noticeId)) throw new GiveUp('bad payload')
  if (!EMAIL_NOTICES_FROM) return // no notices sender yet: the notice stays in the console
  const tenantId = row.tenantId
  const shop = await shopSettingsFor(tenantId) // cached; outside the transaction (speed review P9)
  const plan = await withTenant(tenantId, async (tx) => {
    const [n] = await tx.select().from(notices).where(and(eq(notices.tenantId, tenantId), eq(notices.id, noticeId))).limit(1)
    if (!n || !n.email) return null
    const required = (REQUIRED_TYPES as readonly string[]).includes(n.type)
    const members = await tx.execute<{ user_id: string; role: string }>(sql`select user_id, role from app_notice_members()`)
    const [prefs, reads, done, words] = await Promise.all([
      tx.select({ userId: noticePrefs.userId, email: noticePrefs.email }).from(noticePrefs).where(and(eq(noticePrefs.tenantId, tenantId), eq(noticePrefs.type, n.type))),
      tx.select({ userId: noticeReads.userId }).from(noticeReads).where(and(eq(noticeReads.tenantId, tenantId), eq(noticeReads.noticeId, n.id))),
      tx.select({ userId: emailMessages.userId, id: emailMessages.id, done: sql<boolean>`${emailMessages.sentAt} is not null or ${emailMessages.failedAt} is not null or ${emailMessages.skippedAt} is not null` })
        .from(emailMessages).where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.noticeId, n.id))),
      wordNotices(tx, [n], shop?.shopName ?? 'your shop'),
    ])
    const pref = new Map(prefs.map((p) => [p.userId, p.email])), read = new Set(reads.map((r) => r.userId))
    const sent = new Set(done.filter((d) => d.done).map((d) => d.userId)), waiting = new Map(done.filter((d) => !d.done).map((d) => [d.userId, d.id]))
    const who = [...members].filter((m) => {
      if (sent.has(m.user_id)) return false
      if (required) return m.role === 'owner' || m.role === 'admin'
      if (read.has(m.user_id)) return false
      return pref.get(m.user_id) ?? DEFAULT_EMAIL[n.type as OptionalType] ?? false
    })
    // One attempt row per person, committed before any request (ADR-0006/0008); the address is read, not stored.
    const out: { messageId: string; to: string }[] = []
    for (const m of who) {
      const [a] = await tx.execute<{ email: string | null }>(sql`select app_member_email(${m.user_id}::uuid, ${required}) as email`)
      const to = cleanEmail(a?.email)
      const again = waiting.get(m.user_id)
      const messageId = again ?? randomUUID()
      const mark = { attemptedAt: new Date(), ...(to ? {} : { skippedAt: new Date(), skipCode: 'no_email' }) }
      if (again) await tx.update(emailMessages).set(mark).where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.id, again)))
      else await tx.insert(emailMessages).values({ id: messageId, tenantId, kind: 'notice', noticeId: n.id, userId: m.user_id, ...mark }).onConflictDoNothing()
      if (to) out.push({ messageId, to })
    }
    return { out, words: words.get(n.id)!, href: n.href, type: n.type as NoticeType, required }
  })
  if (!plan) return
  const href = `https://${CONSOLE_HOST}${plan.href ?? '/console/notices'}`
  let retry: string | null = null
  for (const r of plan.out) {
    const mail = frrataEmail({ preview: plan.words.title, heading: plan.words.title, message: plan.words.body, button: { label: 'Open in Frrata', href },
      footer: plan.required ? 'Billing and security emails always reach owners and admins.' : 'Change which emails you get in Settings › Your notifications.' })
    const s = await sendEmail({ from: EMAIL_NOTICES_FROM, to: r.to, replyTo: null, subject: plan.words.title.slice(0, 150), html: mail.html, text: mail.text,
      configurationSet: SES_CONFIG_NOTICES, tenant: 'frrata', messageId: r.messageId, tenantTag: tenantId }, new Date())
    await withTenant(tenantId, (tx) => tx.update(emailMessages).set(s.ok ? { sentAt: new Date(), providerId: s.providerId }
      : s.retry ? { attemptedAt: null } : { failedAt: new Date(), failedCode: s.code.replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 48) })
      .where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.id, r.messageId))))
    if (!s.ok && s.retry) retry = s.code
  }
  // A throttled or unreachable SES: the rows wait (no attempt spent); recipients already sent are not sent again.
  if (retry) {
    throw new Later(retry, 5)
  }
}
