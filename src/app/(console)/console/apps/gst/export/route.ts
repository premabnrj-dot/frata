import { asModule } from '@/lib/auth/as-module'
import { CAN_SEE_GST } from '@/domains/tenancy/roles'
import { contentDisposition } from '@/domains/documents/paper'
import { hsnEntry } from '@/domains/tax/rates'
import { gstr1Csv, gstr1Json, salesRegister, tallyXml } from '@/domains/tax/gstr1-files'
import { gstPeriodIn } from '@/lib/queries/gst'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/app/(console)/console/apps/gst/export/route.ts — A PERIOD'S FILES FOR THE CA (GST app G1).
// GET ?p=2026-10|2026-Q3&f=json|sheets|register|tally. Owner, admin or accountant (CAN_SEE_GST), inside the member's
// own shop; a Frrata support visit is audited (the files carry buyers' names and GSTINs). Limited per member, failing
// closed. Never cached, never sniffed. Built from the documents as issued (queries/gst.ts): nothing is recomputed.
// =============================================================================

export const dynamic = 'force-dynamic'

const FORMATS = ['json', 'sheets', 'register', 'tally'] as const
type Format = (typeof FORMATS)[number]
const TYPES: Record<Format, string> = { json: 'application/json', sheets: 'text/csv; charset=utf-8', register: 'text/csv; charset=utf-8', tally: 'application/xml; charset=utf-8' }
const SHEET_NAMES: Record<string, string> = { b2b: 'B2B', b2cl: 'B2CL', b2cs: 'B2CS', cdnr: 'CDNR', cdnur: 'CDNUR', nil: 'NIL', hsn: 'HSN', docs: 'DOCS' }

const text = (status: number, body: string) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>GST</title><body style="font:16px system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><p>${body.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)}</p><p><a href="/console/apps/gst">Back to GST</a></p>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } })

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const f = sp.get('f') as Format
  if (!FORMATS.includes(f)) return text(400, 'Which file? GSTR-1, the tables, the sales register or Tally.')
  const p = sp.get('p')
  if (p && !/^\d{4}-(\d{2}|Q[1-4])$/.test(p)) return text(400, 'That isn’t a GST period.')
  const now = new Date()
  try {
    const r = await asModule('gst', CAN_SEE_GST, { action: 'gst.export', detail: { period: p, format: f } }, async (tx, auth) => {
      if (!(await withinLimit(LIMITS.gstExportMember, auth.userId, now, true))) return 'limited' as const
      return gstPeriodIn(tx, auth.membership.tenantId, p, now)
    })
    if (!r.ok) return text(403, r.error)
    if (r.value === 'limited') return text(429, 'Too many exports in the last few minutes. Try again shortly.')
    const d = r.value
    if (!d) return text(404, 'Nothing to file for that period yet.')
    if (!d.shop.gstin || d.shop.scheme !== 'regular') return text(404, 'GSTR-1 is for shops on the regular GST scheme.')
    const notes = d.notes.map((n) => n.doc)
    const base = `${d.shop.gstin}_${d.period.key}`
    let body: string, name: string
    if (f === 'json') {
      body = JSON.stringify(gstr1Json(d.gstr, d.shop.gstin, d.period.fp, (hsn) => hsnEntry(hsn, d.period.from)?.name ?? ''), null, 2)
      name = `GSTR1_${base}.json`
    } else if (f === 'sheets') {
      // One file, one block per table, each headed by its name (the portal's table names), so a CA opens one download.
      body = Object.entries(gstr1Csv(d.gstr)).map(([t, csv]) => `${SHEET_NAMES[t] ?? t.toUpperCase()}\n${csv}`).join('\n')
      name = `GSTR1_tables_${base}.csv`
    } else if (f === 'register') {
      body = salesRegister(d.invoices, notes)
      name = `Sales_register_${base}.csv`
    } else {
      body = tallyXml(d.shop.legalName || d.shop.name, d.invoices, notes)
      name = `Tally_vouchers_${base}.xml`
    }
    // A BOM so Excel reads ₹ and Indian names in a CSV as UTF-8. Streamed in chunks: a quarter's Tally file runs to tens
    // of MB, past what a buffered function response may carry (speed review 2026-11-09); a stream is not capped.
    const bytes = new TextEncoder().encode(f === 'sheets' || f === 'register' ? `\uFEFF${body}` : body)
    const CHUNK = 256 * 1024
    let at = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(c) { if (at >= bytes.length) { c.close(); return } c.enqueue(bytes.subarray(at, at + CHUNK)); at += CHUNK },
    })
    return new Response(stream, {
      headers: { 'Content-Type': TYPES[f], 'Content-Disposition': contentDisposition(name), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (err) {
    console.error('[gst/export]', errName(err))
    return text(500, 'We could not make that file. Try again in a minute.')
  }
}
