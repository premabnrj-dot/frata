import { requirePartner } from '@/lib/auth/require-partner'
import { partnerCan } from '@/domains/partners/team'
import { csvCell } from '@/domains/billing/document'
import { usageForCsv } from '@/lib/db/partner-credits'
import { dateTimeIN } from '@/lib/format-date'
import { errName } from '@/lib/log'
import { USE_WORDS } from '../words'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// A month of Studio credit use as CSV, for the partner's CA (C1·4; security L3): the owner only, the partner from the
// caller's membership, counted (30 an hour), at most 5,000 rows, every cell through billing's csvCell (no formulas).
// Never cached.
export const dynamic = 'force-dynamic'
const text = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function GET(request: Request) {
  const auth = await requirePartner()
  if (!auth.ok) return text(403, auth.message)
  if (!partnerCan(auth.partner.memberRole, 'credits')) return text(403, 'Only the partner owner can download usage.')
  const month = new URL(request.url).searchParams.get('month') ?? ''
  if (!/^20\d{2}-(0[1-9]|1[0-2])-01$/.test(month)) return text(404, 'Not found.')
  try {
    const r = await usageForCsv(auth, month)
    if (!r.ok) return r.error === 'too_many' ? text(429, 'Too many downloads in an hour. Try again later.') : text(404, 'Not found.')
    const rows = [['When', 'Client', 'What', 'Who', 'Estimate', 'Held', 'Charged', 'Status'].map(csvCell).join(','),
      ...r.value.uses.map((u) => [dateTimeIN(u.at), u.client, USE_WORDS[u.what], u.who ?? '', u.estimate ?? '', u.reserved, u.charged,
        u.returned ? 'Returned' : u.closed ? 'Charged' : 'Running'].map(csvCell).join(','))]
    return new Response(rows.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="studio-credits-${month.slice(0, 7)}.csv"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch (e) {
    console.error('[credits usage csv]', errName(e))
    return text(500, 'We couldn’t make the file. Try again in a minute.')
  }
}
