import { Page, Text, View } from '@react-pdf/renderer'
import type { FrrataDoc } from '@/domains/billing/document'
import { PAPER } from '@/domains/documents/paper'
import { paise } from '@/domains/money/paise'
import { formatInr } from '@/lib/format'
import { dayIN } from '@/lib/format-date'
import { Footer, Masthead, s, Table, Totals, type Brand } from './blocks'

// =============================================================================
// FILE: src/lib/documents/pdf/frrata-invoice.tsx — FRRATA'S TAX INVOICE OR CREDIT NOTE TO A SHOP (billing B2). Built from
// the shared blocks; its data is FrrataDoc (src/domains/billing/document.ts), from the frozen rows. The GST heads are
// the invoice's own, shown once on the taxable total (plan finding 20). Test mode prints "not a tax invoice" across it.
// =============================================================================

const rs = (p: number) => formatInr(paise(p), { decimals: true })
export const FRRATA_BRAND: Brand = { name: 'Frrata', accent: PAPER.ink, logo: null }

export function FrrataInvoicePage({ doc }: { doc: FrrataDoc }) {
  const credit = doc.kind === 'credit_note'
  const intra = doc.totals.cgst > 0 || doc.totals.sgst > 0
  const totals: [string, string][] = [
    ['Taxable value', rs(doc.totals.taxable)],
    ...(intra ? [['CGST 9%', rs(doc.totals.cgst)], ['SGST 9%', rs(doc.totals.sgst)]] as [string, string][] : [['IGST 18%', rs(doc.totals.igst)]] as [string, string][]),
    [credit ? 'Credited' : 'Total', rs(doc.totals.total)],
  ]
  return (
    <Page size="A4" style={s.page}>
      {doc.testMode ? <Text style={{ position: 'absolute', top: 120, right: 40, transform: 'rotate(-8deg)', borderWidth: 3, borderColor: PAPER.stamp, color: PAPER.stamp, fontSize: 16, fontWeight: 600, paddingHorizontal: 8, paddingVertical: 2 }}>TEST — NOT A TAX INVOICE</Text> : null}
      <Masthead brand={FRRATA_BRAND} title={credit ? 'Credit note' : 'Tax invoice'} reference={doc.number} meta={dayIN(doc.date)} />
      {doc.against ? <Text style={{ ...s.sub, marginTop: -6, marginBottom: 8 }}>Against tax invoice {doc.against.number} of {dayIN(doc.against.date)}.</Text> : null}
      <View style={s.two}>
        <View style={s.col}><Text style={s.label}>SUPPLIER</Text><Text style={{ fontWeight: 600 }}>{doc.seller.name}</Text><Text>{doc.seller.address}</Text>
          <Text>{doc.seller.gstin ? `GSTIN ${doc.seller.gstin}` : 'GSTIN: not registered yet'}</Text></View>
        <View style={s.col}><Text style={s.label}>BILL TO</Text><Text style={{ fontWeight: 600 }}>{doc.buyer.name}</Text><Text>{doc.buyer.address}</Text>
          {doc.buyer.gstin ? <Text>GSTIN {doc.buyer.gstin}</Text> : null}
          {doc.buyer.placeOfSupply ? <Text>Place of supply: state {doc.buyer.placeOfSupply}</Text> : null}
          <Text>Tax payable on reverse charge: No</Text></View>
      </View>
      {doc.period ? <Text style={{ ...s.sub, marginBottom: 6 }}>Service: Frrata commerce platform (SAC {doc.sac}). Plan for the month invoiced, in advance; fees on the month before, in arrears.</Text> : <Text style={{ ...s.sub, marginBottom: 6 }}>SAC {doc.sac}.</Text>}
      <Table head={['Description', 'Qty', 'Taxable value']} rows={doc.lines.map((l) => [l.description, String(l.quantity), rs(l.taxable)])} widths={[7, 1, 2]} right={[1, 2]} />
      <Totals lines={totals} />
      <View style={{ ...s.row, marginTop: 18, alignItems: 'flex-end' }} wrap={false}>
        <Text style={{ flex: 1, color: PAPER.sub, paddingRight: 20 }}>{credit ? `Reason: ${doc.against?.reason ?? ''}` : 'Amounts in rupees. Each GST head is on the taxable value.'}</Text>
        <View style={{ alignItems: 'flex-end' }}><View style={{ height: 24 }} /><Text style={{ borderTopWidth: 0.75, borderTopColor: PAPER.ink, paddingTop: 2 }}>Authorised signatory</Text><Text style={s.sub}>for {doc.seller.name}</Text></View>
      </View>
      <Footer left="Frrata · billing" right={doc.number} />
    </Page>
  )
}
