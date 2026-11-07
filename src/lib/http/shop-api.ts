import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Quote } from '@/domains/checkout/quote'
import { requireShop } from '@/lib/auth/require-shop'
import { clientIp } from '@/lib/http/client-ip'
import { withinLimit, type Limit } from '@/lib/db/rate-limit'

// The shop API's shared edges: the shop from the Host (requireShop), a Zod body,
// per-shop limits, no caching, and replies that never carry more than the shopper's own.

export const noStore = { 'cache-control': 'private, no-store' }
export const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: noStore })

export async function shopRequest<T extends z.ZodTypeAny>(request: Request, schema: T, limit: Limit, failClosed = false):
  Promise<{ ok: true; tenantId: string; body: z.output<T>; ip: string } | { ok: false; response: NextResponse }> {
  const shop = await requireShop(request)
  if (!shop.ok) return { ok: false, response: reply({ error: shop.error }, shop.status) }
  const ip = await clientIp()
  if (!(await withinLimit(limit, `${shop.tenantId}:${ip}`, new Date(), failClosed))) return { ok: false, response: reply({ error: 'Too many tries from here. Wait a few minutes and try again.' }, 429) }
  let json: unknown
  try { json = await request.json() } catch { return { ok: false, response: reply({ error: 'Bad request' }, 400) } }
  const parsed = schema.safeParse(json)
  if (!parsed.success) return { ok: false, response: reply({ error: 'Bad request', fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path.join('.')), i.message])) }, 400) }
  return { ok: true, tenantId: shop.tenantId, body: parsed.data, ip }
}

export const Bag = z.array(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(10) })).min(1).max(20)
export const Token = z.string().regex(/^[A-Za-z0-9_-]{22}$/)

/** A quote as the shopper's browser receives it (never stock numbers beyond the low-stock clamp; never a cost). */
export function publicQuote(q: Quote) {
  return {
    lines: q.lines.map((l) => ({ variantId: l.variantId, handle: l.handle, title: l.title, options: l.options, values: l.values, image: l.image, unitPrice: l.unitPrice,
      compareAt: l.compareAt, requested: l.requested, qty: l.qty, kind: l.kind, shipsBy: l.shipsBy, leadMinDays: l.leadMinDays, leadMaxDays: l.leadMaxDays, problem: l.problem })),
    subtotal: q.subtotal, shipping: q.shipping, prepaid: q.prepaid.total, gstPrepaid: q.prepaid.gst,
    cod: q.cod.offer.offered ? { total: q.cod.total, charge: q.cod.codCharge, gst: q.cod.gst } : null,
    codWhyNot: q.cod.offer.offered ? null : q.cod.offer, arrives: q.arrives, empty: q.empty, missing: q.missing,
  }
}
export type PublicQuote = ReturnType<typeof publicQuote>
