import { z } from 'zod'
import { requirePartner } from '@/lib/auth/require-partner'
import { partnerCan } from '@/domains/partners/team'
import { SEAT_PLANS } from '@/domains/studio/prices'
import type { FrrataDoc } from '@/domains/billing/document'
import { pdfResponse } from '@/lib/documents/file'
import { frrataFile } from '@/lib/documents/frrata'
import { invoice } from '@/lib/db/partner-credits'
import { errName } from '@/lib/log'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// Frrata's tax invoice to a partner for Studio credits, as a PDF (C1·4; security L3): the partner owner only, the
// invoice matched on the caller's partner inside the definer ('not_found' otherwise), counted, rendered from the row
// frozen at issue on every download by billing's own document. Never cached.
export const dynamic = 'force-dynamic'
const text = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })

const WHAT = { pack: 'Studio credits, pack of 100', credits: 'Studio credits', seat_start: 'Studio plan, one month', seat_renewal: 'Studio plan, one month' } as const

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartner()
  if (!auth.ok) return text(403, auth.message)
  if (!partnerCan(auth.partner.memberRole, 'credits')) return text(403, 'Only the partner owner can open invoices.')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return text(404, 'We couldn’t find that invoice.')
  try {
    const r = await invoice(auth, id)
    if (!r.ok) return r.error === 'too_many' ? text(429, 'Too many downloads. Try again in an hour.') : text(404, 'We couldn’t find that invoice.')
    const i = r.value
    const what = i.plan ? `${SEAT_PLANS[i.plan].name}, one month · ${i.credits} credits` : `${WHAT[i.kind]} · ${i.credits} credits`
    const doc: FrrataDoc = {
      kind: 'invoice', number: i.number, date: i.issuedAt, testMode: i.test,
      seller: { name: i.sellerName, gstin: i.sellerGstin, address: i.sellerAddress },
      buyer: { name: i.buyerName, gstin: i.buyerGstin, address: i.buyerAddress, placeOfSupply: i.placeOfSupply },
      sac: i.sac, period: null, lines: [{ description: what, quantity: 1, taxable: i.taxable }],
      totals: { taxable: i.taxable, cgst: i.cgst, sgst: i.sgst, igst: i.igst, total: i.total }, against: null,
    }
    return pdfResponse(await frrataFile(doc))
  } catch (e) {
    console.error('[credits invoice pdf]', errName(e))
    return text(500, 'We couldn’t make the PDF. Try again in a minute.')
  }
}
