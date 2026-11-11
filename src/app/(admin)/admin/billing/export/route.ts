import { gstCsv } from '@/domains/billing/document'
import { monthOfYM, nextMonthStartIST } from '@/domains/time/month'
import { gstRows } from '@/lib/admin/billing'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { errName } from '@/lib/log'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// The month's GST export for the CA (billing B2): issued invoices and credit notes, GSTR-1 style, as CSV. ADMIN_ONLY;
// every cell quoted and formula characters neutralised (finding 17). Never cached.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return new Response(staff.message, { status: 403 })
  const ym = new URL(request.url).searchParams.get('month') ?? ''
  const start = monthOfYM(ym)
  if (!start) return new Response('Which month?', { status: 400 })
  try {
    const rows = await gstRows(staff, start, nextMonthStartIST(start))
    const day = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
    return new Response(gstCsv(rows, day), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="Frrata GST ${ym}.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch (e) {
    console.error('[billing export]', errName(e))
    return new Response('We could not make the export.', { status: 500 })
  }
}
