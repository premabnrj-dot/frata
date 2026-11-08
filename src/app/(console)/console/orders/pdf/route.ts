import { asMember } from '@/lib/auth/as-member'
import { ROLES } from '@/domains/orders/work'
import { documentsFor, MAX_DOCUMENTS } from '@/lib/orders/documents'
import { documentFile, pdfResponse, requestFor } from '@/lib/documents/file'
import { brandFor, invoiceLogos } from '@/lib/documents/brand'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/app/(console)/console/orders/pdf/route.ts — a packing slip or an invoice as a PDF (Documents D1).
// GET ?kind=slip|invoice&size=a4|label&n=1043,1044 — up to 50, resolved inside the member's own shop (another shop's
// number is silently left out, as the print page does). Read through asMember (a Frrata support visit is audited:
// documents carry the shopper's address). Limited per member and per shop, failing closed. Never cached.
// =============================================================================

export const dynamic = 'force-dynamic'

const text = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const kind = sp.get('kind') === 'invoice' ? 'invoice' : 'slip'
  const size = sp.get('size') === 'label' ? 'label' : 'A4'
  const numbers = [...new Set((sp.get('n') ?? '').split(',').map((x) => Number(x.trim())).filter((x) => Number.isSafeInteger(x) && x > 0))]
  if (!numbers.length) return text(400, 'Which orders? Pick one or more.')
  if (numbers.length > MAX_DOCUMENTS) return text(400, `Up to ${MAX_DOCUMENTS} orders in one PDF.`)
  try {
    const r = await asMember(ROLES.print, { action: kind === 'invoice' ? 'order.pdf_invoice' : 'order.pdf_slip', detail: { count: numbers.length, size } }, async (tx, auth) => {
      const ok = await withinLimit(LIMITS.pdfMember, auth.userId, new Date(), true) && await withinLimit(LIMITS.pdfShop, auth.membership.tenantId, new Date(), true)
      return ok ? { tenantId: auth.membership.tenantId, docs: await documentsFor(tx, auth.membership.tenantId, numbers, kind) } : null
    })
    if (!r.ok) return text(403, r.error)
    if (!r.value) return text(429, 'Too many PDFs in the last few minutes. Try again shortly.')
    const { shop, paper, orders } = r.value.docs
    const [shopBrand, logos] = await Promise.all([brandFor(r.value.tenantId, paper), kind === 'invoice' ? invoiceLogos(r.value.tenantId, orders.map((o) => o.logo)) : null])
    if (!shopBrand) return text(404, 'This shop has no settings yet.')
    // An invoice shows the logo frozen at packing (none if it had none); a slip shows today's.
    const docs = logos ? orders.map((o) => ({ ...o, logo: o.logo ? logos.get(o.logo) ?? null : null })) : orders.map(({ logo: _l, ...o }) => o)
    const file = await documentFile(requestFor(kind, size, docs, shop), shopBrand.brand, shopBrand.contact)
    if (!file) return text(404, kind === 'invoice' ? 'No invoice yet: an invoice is issued when the order is marked packed.' : 'None of these orders has a packing slip now.')
    return pdfResponse(file)
  } catch (err) {
    console.error('[orders/pdf]', errName(err))
    return text(500, 'We could not make the PDF. Print it instead.')
  }
}
