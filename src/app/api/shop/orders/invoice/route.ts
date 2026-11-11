import { LIMITS } from '@/lib/db/rate-limit'
import { OrderRef, orderRefHash } from '@/lib/http/order-ref'
import { reply, shopRequest } from '@/lib/http/shop-api'
import { shopperInvoice } from '@/lib/queries/checkout'
import { brandFor, frozenPaper } from '@/lib/documents/brand'
import { documentFile, pdfResponse, requestFor } from '@/lib/documents/file'
import { errName } from '@/lib/log'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// =============================================================================
// FILE: src/app/api/shop/orders/invoice/route.ts — THE SHOPPER'S COPY of their invoice (Documents D2; plan finding 7).
// POST { token } or an email's { o, e } (src/lib/http/order-ref.ts): the order token from the order page's #fragment (never in a URL). The shop comes from the Host
// (shopRequest checks Origin), limited per shop and IP and failing closed. The same PDF the shop downloads, from the
// same frozen rows and logo. Not packed yet, a wrong shop and a wrong token all answer the same 404.
// =============================================================================

export const dynamic = 'force-dynamic'
const Body = OrderRef

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.invoiceIp, true)
  if (!r.ok) return r.response
  try {
    const hash = await orderRefHash(r.tenantId, r.body)
    const found = hash ? await shopperInvoice(r.tenantId, hash) : null
    if (!found?.orders.length) return reply({ error: 'Not found' }, 404)
    const [brand, frozen] = await Promise.all([brandFor(r.tenantId, null), frozenPaper(r.tenantId, found.orders.map((o) => o.frozen))])
    if (!brand) return reply({ error: 'Not found' }, 404)
    const docs = found.orders.map(({ frozen: _f, ...o }, i) => ({ ...o, paper: frozen[i] }))
    const file = await documentFile(requestFor('invoice', 'A4', docs, found.shop), brand.brand, brand.contact)
    if (!file) return reply({ error: 'Not found' }, 404)
    return pdfResponse(file)
  } catch (err) {
    console.error('[shop/invoice]', errName(err))
    return reply({ error: 'We could not make the invoice. Try again in a minute.' }, 500)
  }
}
