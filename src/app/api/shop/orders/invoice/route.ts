import { z } from 'zod'
import { LIMITS } from '@/lib/db/rate-limit'
import { tokenHash } from '@/lib/crypto/secret-box'
import { reply, shopRequest, Token } from '@/lib/http/shop-api'
import { shopperInvoice } from '@/lib/queries/checkout'
import { brandFor, invoiceLogos } from '@/lib/documents/brand'
import { documentFile, pdfResponse, requestFor } from '@/lib/documents/file'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/app/api/shop/orders/invoice/route.ts — THE SHOPPER'S COPY of their invoice (Documents D2; plan finding 7).
// POST { token }: the order token from the order page's #fragment (never in a URL). The shop comes from the Host
// (shopRequest checks Origin), limited per shop and IP and failing closed. The same PDF the shop downloads, from the
// same frozen rows and logo. Not packed yet, a wrong shop and a wrong token all answer the same 404.
// =============================================================================

export const dynamic = 'force-dynamic'
const Body = z.object({ token: Token })

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.invoiceIp, true)
  if (!r.ok) return r.response
  try {
    const found = await shopperInvoice(r.tenantId, tokenHash(r.body.token))
    if (!found?.orders.length) return reply({ error: 'Not found' }, 404)
    const [brand, logos] = await Promise.all([brandFor(r.tenantId, found.paper), invoiceLogos(r.tenantId, found.orders.map((o) => o.logo))])
    if (!brand) return reply({ error: 'Not found' }, 404)
    const docs = found.orders.map((o) => ({ ...o, logo: o.logo ? logos.get(o.logo) ?? null : null }))
    const file = await documentFile(requestFor('invoice', 'A4', docs, found.shop), brand.brand, brand.contact)
    if (!file) return reply({ error: 'Not found' }, 404)
    return pdfResponse(file)
  } catch (err) {
    console.error('[shop/invoice]', errName(err))
    return reply({ error: 'We could not make the invoice. Try again in a minute.' }, 500)
  }
}
