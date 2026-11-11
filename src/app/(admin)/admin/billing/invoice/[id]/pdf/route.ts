import { frrataDocument } from '@/lib/admin/billing'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { pdfResponse } from '@/lib/documents/file'
import { frrataFile } from '@/lib/documents/frrata'
import { errName } from '@/lib/log'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// Admin's copy of a Frrata invoice or credit note (billing B2): ADMIN_ONLY, rendered from the frozen rows. Never cached.
export const dynamic = 'force-dynamic'
const text = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return text(403, staff.message)
  const { id } = await params
  const credit = new URL(request.url).searchParams.get('credit') ?? undefined
  if (!/^[0-9a-f-]{36}$/.test(id) || (credit !== undefined && !/^[A-Z0-9/-]{1,24}$/.test(credit))) return text(404, 'Not found.')
  try {
    const doc = await frrataDocument(staff, id, credit)
    return doc ? pdfResponse(await frrataFile(doc)) : text(404, 'Not found.')
  } catch (e) {
    console.error('[admin billing pdf]', errName(e))
    return text(500, 'We could not make the PDF.')
  }
}
