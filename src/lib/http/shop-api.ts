import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Quote } from '@/domains/checkout/quote'
import { requireShop } from '@/lib/auth/require-shop'
import { clientIp } from '@/lib/http/client-ip'
import { LIMITS, overLimit, withinLimit, type Limit } from '@/lib/db/rate-limit'

// The shop API's shared edges: the shop from the Host (requireShop), a Zod body,
// per-shop limits, no caching, and replies that never carry more than the shopper's own.

export const noStore = { 'cache-control': 'private, no-store' }
const MAX_BODY = 32 * 1024
export const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: noStore })

export async function shopRequest<T extends z.ZodTypeAny>(request: Request, schema: T, limit: Limit, failClosed = false):
  Promise<{ ok: true; tenantId: string; body: z.output<T>; ip: string } | { ok: false; response: NextResponse }> {
  const shop = await requireShop(request)
  if (!shop.ok) return { ok: false, response: reply({ error: shop.error }, shop.status) }
  const ip = await clientIp()
  if (!(await withinLimit(limit, `${shop.tenantId}:${ip}`, new Date(), failClosed))) return { ok: false, response: reply({ error: 'Too many tries from here. Wait a few minutes and try again.' }, 429) }
  // A shop request is small (a bag, an address, a few tags): over 32 kB is refused before it is parsed (security review).
  let json: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_BODY) return { ok: false, response: reply({ error: 'Too large' }, 413) }
    json = JSON.parse(text)
  } catch { return { ok: false, response: reply({ error: 'Bad request' }, 400) } }
  const parsed = schema.safeParse(json)
  if (!parsed.success) return { ok: false, response: reply({ error: 'Bad request', fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path.join('.')), i.message])) }, 400) }
  return { ok: true, tenantId: shop.tenantId, body: parsed.data, ip }
}

export const Bag = z.array(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(10) })).min(1).max(20)
export const Token = z.string().regex(/^[A-Za-z0-9_-]{22}$/)
/** An offer code as typed (one per order). Anything else is not a code: it never reaches a query. */
export const Code = z.string().trim().regex(/^[A-Za-z0-9]{1,20}$/)

/**
 * The code to try, or null once this IP has guessed too many at this shop (every code then reads "doesn't work").
 * After pricing, `codeTried` counts a code that did not apply. Fail closed: a guesser never slips through a hiccup.
 */
export async function codeToTry(tenantId: string, ip: string, code: string | null | undefined): Promise<string | null> {
  if (!code) return null
  return (await overLimit(LIMITS.codeIp, `${tenantId}:${ip}`, new Date(), true)) ? null : code
}
export async function codeTried(tenantId: string, ip: string, typed: string | null | undefined, result: 'applied' | 'not_applied' | null) {
  if (!typed || result === 'applied') return
  // Distinct codes, not calls: a code already counted in this window (the bag re-pricing) is not counted again.
  if (await withinLimit(LIMITS.codeSeen, `${tenantId}:${ip}:${typed.trim().toUpperCase()}`, new Date(), true)) await withinLimit(LIMITS.codeIp, `${tenantId}:${ip}`, new Date(), true)
}

/** An offer as the shopper sees it: its title, what it saved, and its class — never an id, a limit, a budget or a count. */
const publicApplied = (a: Quote['prepaid']['applied']) => a.map((x) => ({ title: x.title, amount: x.amount, class: x.class }))

/**
 * A quote as the shopper's browser receives it (never stock numbers beyond the low-stock clamp; never a cost; of the
 * offers, only named public fields: ADR-0003, offers tenancy review 4).
 */
export function publicQuote(q: Quote) {
  return {
    lines: q.lines.map((l) => ({ variantId: l.variantId, handle: l.handle, title: l.title, options: l.options, values: l.values, image: l.image, unitPrice: l.unitPrice,
      compareAt: l.compareAt, requested: l.requested, qty: l.qty, kind: l.kind, shipsBy: l.shipsBy, leadMinDays: l.leadMinDays, leadMaxDays: l.leadMaxDays, problem: l.problem })),
    subtotal: q.subtotal, shipping: q.shipping, prepaid: q.prepaid.total, gstPrepaid: q.prepaid.gst,
    discountPrepaid: q.prepaid.discount, appliedPrepaid: publicApplied(q.prepaid.applied),
    cod: q.cod.offer.offered ? { total: q.cod.total, charge: q.cod.codCharge, gst: q.cod.gst, discount: q.cod.discount, applied: publicApplied(q.cod.applied) } : null,
    offers: { listed: q.offers.listed.map((l) => ({ title: l.title, code: l.code, style: l.style, applied: l.applied, need: l.need })), code: q.offers.code },
    codWhyNot: q.cod.offer.offered ? null : q.cod.offer, arrives: q.arrives, empty: q.empty, missing: q.missing,
  }
}
export type PublicQuote = ReturnType<typeof publicQuote>
