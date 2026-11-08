import 'server-only'
import { Document, renderToBuffer } from '@react-pdf/renderer'
import { invoice, packingSlip, type DocLine, type DocOrder, type DocShop, type Invoice, type PackingSlip } from '@/domains/orders/documents'
import { contentDisposition, documentFileName, PAPER } from '@/domains/documents/paper'
import { registerFonts } from './fonts'
import { InvoicePage } from './pdf/invoice'
import { SlipPage, type SlipSize } from './pdf/slip'
import type { Brand } from './pdf/blocks'

// =============================================================================
// FILE: src/lib/documents/file.tsx — ONE function makes a document file (Documents D0).
//
// The console download, a bulk download, the shopper's copy and (later) an email attachment all call this, so they
// can never be different documents (Ekatan's quote-pdf-file.ts, the shape the owner chose). Its inputs are the
// typed document data (no cost field exists on them: ADR-0003, check:doc-inputs) and a Brand of bytes and words:
// it fetches nothing.
// ⚠️ NOT A ROUTE: it takes orders already read for one shop; every caller checks who is asking first.
// =============================================================================

/** What to make: the document DATA (packingSlip() / invoice() output), never orders (architecture review 2026-11-08). */
export type DocumentRequest =
  | { kind: 'slip'; size: SlipSize; slips: PackingSlip[] }
  | { kind: 'invoice'; invoices: { inv: Invoice; order: string }[] }
export type DocumentFile = { bytes: Buffer; fileName: string; pages: number }

/** Today in India, for a bulk file's name. */
const istDay = (now: Date) => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10)

export async function documentFile(req: DocumentRequest, brand: Brand, contact: string, now = new Date()): Promise<DocumentFile | null> {
  registerFonts()
  const meta = { author: brand.name, creator: brand.name, producer: brand.name }
  if (req.kind === 'slip') {
    if (!req.slips.length) return null
    const bytes = await renderToBuffer(<Document title={`${brand.name} packing slips`} {...meta}>
      {req.slips.map((slip) => <SlipPage key={slip.number} slip={slip} brand={req.size === 'label' ? { ...brand, accent: PAPER.ink } : brand} size={req.size} contact={contact} />)}
    </Document>)
    return { bytes, fileName: documentFileName('slip', brand.name, req.slips.map((x) => x.number), istDay(now)), pages: req.slips.length }
  }
  if (!req.invoices.length) return null
  const bytes = await renderToBuffer(<Document title={`${brand.name} invoices`} {...meta}>
    {req.invoices.map(({ inv, order }) => <InvoicePage key={inv.number} inv={inv} order={order} brand={brand} contact={contact} />)}
  </Document>)
  const one = req.invoices.length === 1 ? req.invoices[0]!.inv : null
  return { bytes, fileName: documentFileName('invoice', brand.name, req.invoices.map((x) => x.inv.number), istDay(now), one?.kind === 'bill_of_supply' ? 'Bill of supply' : undefined), pages: req.invoices.length }
}

/** The documents for orders already read for ONE shop (documentsFor), as a request: invoices only once packed. */
export function requestFor(kind: 'slip' | 'invoice', size: SlipSize, docs: { o: DocOrder; lines: DocLine[] }[], shop: DocShop): DocumentRequest {
  if (kind === 'slip') return { kind, size, slips: docs.map(({ o, lines }) => packingSlip(o, lines, shop)) }
  return { kind, invoices: docs.flatMap(({ o, lines }) => { const inv = invoice(o, lines, shop); return inv ? [{ inv, order: o.number }] : [] }) }
}

/** The response a download answers with: never cached, never sent on as a referrer, never sniffed. */
export function pdfResponse(file: DocumentFile): Response {
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(file.fileName),
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
