import { z } from 'zod'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { pdfResponse } from '@/lib/documents/file'
import { frrataFile } from '@/lib/documents/frrata'
import { errName } from '@/lib/log'
import { shopFrrataDocument } from '@/lib/queries/billing'

// Frrata's invoice to this shop, or a credit note against it, as a PDF (billing B2): owners and admins only, the shop
// from the membership, rendered from the frozen rows on every download (finding 16). Never cached.
export const dynamic = 'force-dynamic'
const Id = z.string().uuid()
const Credit = z.string().regex(/^[A-Z0-9/-]{1,24}$/)
const text = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return text(403, auth.message)
  const { id } = await params
  const credit = new URL(request.url).searchParams.get('credit') ?? undefined
  if (!Id.safeParse(id).success || (credit !== undefined && !Credit.safeParse(credit).success)) return text(404, 'Not found.')
  try {
    const doc = await shopFrrataDocument(auth.membership, id, credit)
    if (!doc) return text(404, 'Not found.')
    return pdfResponse(await frrataFile(doc))
  } catch (e) {
    console.error('[billing invoice pdf]', errName(e))
    return text(500, 'We could not make the PDF. Try again in a minute.')
  }
}
