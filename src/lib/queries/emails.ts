import 'server-only'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant'
import { emailDaily, emailMessages, shopEmails } from '@/lib/db/schema-email'
import { ORDER_MESSAGES, type OrderMessage } from '@/domains/messaging/events'
import { DEFAULT_WORDS, WORD_FIELDS, WORD_LIMITS, type EmailWords } from '@/domains/email/words'
import { stateWords, messageState, type MessageMoments } from '@/domains/email/state'
import { unknownPlaceholders } from '@/domains/messaging/placeholders'

// =============================================================================
// FILE: src/lib/queries/emails.ts — A SHOP'S EMAILS TO ITS SHOPPERS (email plan E·2, tasks 13–14): its switches and
// words (overrides of Frrata's), the last 7 days from the roll-up (never a count over email_messages: speed P6), and one
// order's emails in words. Writes run in the caller's asMember transaction.
// =============================================================================

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0]
export type ShopEmailRow = { kind: OrderMessage; on: boolean; edited: boolean; words: EmailWords }

export async function shopEmailSettings(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const since = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10)
    const [rows, [week]] = await Promise.all([
      tx.select().from(shopEmails).where(eq(shopEmails.tenantId, tenantId)),
      tx.select({ sent: sql<number>`coalesce(sum(${emailDaily.sent}),0)::int`, delivered: sql<number>`coalesce(sum(${emailDaily.delivered}),0)::int`,
        bounced: sql<number>`coalesce(sum(${emailDaily.bounced}),0)::int`, complained: sql<number>`coalesce(sum(${emailDaily.complained}),0)::int` })
        .from(emailDaily).where(and(eq(emailDaily.tenantId, tenantId), gte(emailDaily.day, since))),
    ])
    const own = new Map(rows.map((r) => [r.kind, r]))
    const list: ShopEmailRow[] = ORDER_MESSAGES.map((k) => {
      const r = own.get(k)
      const words = Object.fromEntries(WORD_FIELDS.map((f) => [f, r?.[f] ?? DEFAULT_WORDS[k][f]])) as EmailWords
      return { kind: k, on: !r?.offAt, edited: !!r && WORD_FIELDS.some((f) => r[f] !== null), words }
    })
    return { list, week: week ?? { sent: 0, delivered: 0, bounced: 0, complained: 0 } }
  })
}

/** A save's words, checked: within limits, placeholders from the menu only, plain text (links are the button's). */
export function checkWords(w: EmailWords): string | null {
  for (const f of WORD_FIELDS) {
    if (w[f].length > WORD_LIMITS[f]) return `Too long: ${f} (up to ${WORD_LIMITS[f]} characters).`
    if (unknownPlaceholders(w[f]).length) return `Use the Insert menu: [${unknownPlaceholders(w[f])[0]}] is not one of them.`
    if (/<[a-z/!]|https?:\/\//i.test(w[f])) return 'Text only. The button links to the order.'
  }
  return w.subject.trim() && w.heading.trim() ? null : 'A subject and a heading are needed.'
}

/** Saves the words (Frrata's words stored as null, so a later change to them reaches this shop) and the switch. */
export async function saveShopEmail(tx: Tx, tenantId: string, userId: string, kind: OrderMessage, words: EmailWords | null, on: boolean) {
  const set = {
    offAt: on ? null : new Date(), updatedBy: userId, updatedAt: new Date(),
    ...Object.fromEntries(WORD_FIELDS.map((f) => [f, words && words[f] !== DEFAULT_WORDS[kind][f] ? words[f] : null])),
  }
  await tx.insert(shopEmails).values({ tenantId, kind, ...set }).onConflictDoUpdate({ target: [shopEmails.tenantId, shopEmails.kind], set })
}

export type OrderEmail = { id: string; kind: string; at: Date; state: ReturnType<typeof messageState>; words: string }

/** One order's emails for the order page's Emails card. Inside the order page's own read (one transaction). */
export async function orderEmailsIn(tx: Tx, tenantId: string, orderId: string): Promise<OrderEmail[]> {
  const rows = await tx.select().from(emailMessages).where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.orderId, orderId)))
    .orderBy(desc(emailMessages.createdAt)).limit(30)
  return rows.map((r) => { const m = r as unknown as MessageMoments & { id: string; kind: string; createdAt: Date }; return { id: r.id, kind: r.kind, at: r.sentAt ?? r.createdAt, state: messageState(m), words: stateWords(m) } })
}
