import 'server-only'
import { Document, renderToBuffer } from '@react-pdf/renderer'
import type { FrrataDoc } from '@/domains/billing/document'
import { contentDisposition } from '@/domains/documents/paper'
import { registerFonts } from './fonts'
import { FrrataInvoicePage } from './pdf/frrata-invoice'
import type { DocumentFile } from './file'

/** Frrata's invoice or credit note as a PDF (billing B2), rendered on every download from the frozen rows (finding 16). */
export async function frrataFile(doc: FrrataDoc): Promise<DocumentFile> {
  registerFonts()
  const title = doc.kind === 'credit_note' ? 'Credit note' : 'Tax invoice'
  const bytes = await renderToBuffer(<Document title={`Frrata ${title} ${doc.number}`} author="Frrata" creator="Frrata" producer="Frrata"><FrrataInvoicePage doc={doc} /></Document>)
  return { bytes, fileName: `Frrata ${title} ${doc.number.replace(/[/\\]/g, '-')}.pdf`, pages: 1 }
}
export { contentDisposition }
