import 'server-only'
import { scheme } from '@/lib/ekcode/cookie-name'
import { formatInr } from '@/lib/format'
import { dayMonthIN } from '@/lib/format-date'
import type { OrderMessage } from '@/domains/messaging/events'
import { fill, firstName, type Values } from '@/domains/messaging/placeholders'
import { currentMethod, type OrderMoments } from '@/domains/orders/order-state'
import { DEFAULT_WORDS, WORD_FIELDS, type EmailWords } from '@/domains/email/words'
import { shopEmail, type Rendered } from '@/domains/email/layouts'
import { cleanSubject } from '@/domains/email/headers'
import type { Paise } from '@/domains/money/paise'
import { emailLinkToken } from './drops'
import { orderPrefix } from '@/domains/signup/slug'

// =============================================================================
// FILE: src/lib/email/compose.ts — ONE ORDER EMAIL, BUILT ONE WAY: the sender and the Settings preview both call this,
// so what a merchant previews is what a shopper gets.
// =============================================================================

type Words = Partial<Record<(typeof WORD_FIELDS)[number], string | null>>
export type ComposeInput = {
  kind: OrderMessage
  shop: { shopName: string; host: string; logoUrl?: string | null; orderPrefix?: string | null; legalName?: string | null; address?: string | null; grievanceName?: string | null; grievanceEmail?: string | null }
  accent: string
  order: OrderMoments & { id: string; number: number; total: number | bigint | string; customerName: string }
  lines: { title: string; values: string[] | null; qty: number }[]
  ship: { courier: string | null; tracking: string | null } | null | undefined
  own: Words | null | undefined
  to: string
  replyTo: string
  /** An `edited` email of a paid order (OE·2): the refund on its way, or the payment asked for and the total it makes. */
  edit?: { refund: number | null; ask: number | null; total: number } | null
}

export function composeOrderEmail(c: ComposeInput): { mail: Rendered; subject: string; words: EmailWords } {
  const { kind, shop, order: o } = c
  const number = `${orderPrefix(shop.orderPrefix ?? '', shop.shopName)}-${o.number}`
  const cod = currentMethod(o) === 'cod'
  const ask = c.edit?.ask ? formatInr(c.edit.ask as Paise) : null
  // A change waiting for payment has not changed the order yet: its total is the one it makes once paid.
  const total = formatInr((ask ? c.edit!.total : Number(o.total)) as Paise)
  const refund = c.edit?.refund ? formatInr(c.edit.refund as Paise) : null
  const values: Values = {
    'First name': firstName(o.customerName), 'Order number': number, Total: total, 'Shop name': shop.shopName,
    'Pay on delivery': cod ? total : undefined, Courier: c.ship?.courier ?? undefined, 'Tracking number': c.ship?.tracking ?? undefined,
  }
  const words = Object.fromEntries(WORD_FIELDS.map((f) => [f, fill(c.own?.[f] || DEFAULT_WORDS[kind][f], values)])) as EmailWords
  const origin = `${scheme()}://${shop.host}`
  // Links bound to this address (src/lib/email/drops.ts): they die when the shop fixes a mistyped one.
  const link = emailLinkToken('order', o.id, c.to)
  const orderLink = link ? `${origin}/orders#o=${o.id}&e=${encodeURIComponent(link)}` : `${origin}/orders`
  const drops = emailLinkToken('drops', o.id, c.to)
  const mail = shopEmail({
    preview: words.preview,
    shop: { name: shop.shopName, logoUrl: shop.logoUrl ?? null, accent: c.accent },
    heading: words.heading, message: words.message,
    button: ask ? { label: `Pay ${ask} for the changes`, href: orderLink } : words.button ? { label: words.button, href: orderLink } : null,
    order: { number, date: dayMonthIN(o.placedAt), items: c.lines.map((l) => ({ title: l.title, detail: [...(l.values ?? []), `Qty ${l.qty}`].join(' · ') })), total,
      payLine: o.cancelledAt ? null : ask ? `Pay ${ask} for the changes · nothing changes until then` : refund ? `Refund of ${refund} on its way · 5–10 working days`
        : cod ? `Pay ${total} on delivery, in cash or UPI` : o.paidAt ? 'Paid online' : null },
    footer: { legalName: shop.legalName || shop.shopName, address: shop.address || '', supportEmail: c.replyTo,
      grievance: shop.grievanceName ? [shop.grievanceName, shop.grievanceEmail].filter(Boolean).join(', ') : null,
      newDropsHref: drops ? `${origin}/email/drops#o=${o.id}&t=${encodeURIComponent(drops)}` : null },
  })
  return { mail, subject: cleanSubject(words.subject), words }
}
