import { CATEGORY_WORDS, costsCsv, fyRange, type CostCategory } from '@/domains/admin/costs'
import { EXPORT_ROW_CAP, paymentsForYear } from '@/lib/admin/costs'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { errName } from '@/lib/log'

// Admin › Costs' payments for one financial year, as CSV for the CA (spec § The screen 3). Master admin only. A GET download
// like Billing's export: it needs the signed-in cookie, and a link from another site only downloads to the person who follows it.
// Cells are quoted and formula characters neutralised (csvCell). A fixed file name with no cost names. Never cached.
export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return new Response(staff.message, { status: 403 })
  const fy = new URL(request.url).searchParams.get('fy') ?? ''
  if (!/^20\d\d$/.test(fy)) return new Response('Add a year to the link, like fy=2026.', { status: 400 })
  try {
    const rows = await paymentsForYear(staff, Number(fy))
    const range = fyRange(Number(fy))
    return new Response(costsCsv(rows.map((r) => ({ ...r, category: CATEGORY_WORDS[r.category as CostCategory] ?? r.category })), rows.length >= EXPORT_ROW_CAP), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="Frrata costs FY ${range.from.slice(0, 4)}-${range.to.slice(2, 4)}.csv"`,
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Row-Cap': rows.length >= EXPORT_ROW_CAP ? 'reached' : 'no',
      },
    })
  } catch (e) {
    console.error('[costs export]', errName(e))
    return new Response('We couldn’t make the CSV. Try again.', { status: 500 })
  }
}
