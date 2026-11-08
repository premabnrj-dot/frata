import 'server-only'
import { Page, Text, View } from '@react-pdf/renderer'
import type { Invoice } from '@/domains/orders/documents'
import { PAPER } from '@/domains/documents/paper'
import { paise } from '@/domains/money/paise'
import { formatInr } from '@/lib/format'
import { dayIN } from '@/lib/format-date'
import { Footer, Masthead, s, Table, Totals, type Brand } from './blocks'

// The tax invoice or bill of supply (Documents D1): exactly invoice()'s figures (src/domains/orders/documents.ts),
// frozen at packing — nothing here computes tax. CGST Rule 46 particulars, adding what the print page lacked: reverse
// charge (No), the unit (pcs) and the authorised signatory. Cancelled after packing: the same number, stamped.

const rs = (p: number) => formatInr(paise(p), { decimals: true })
const rate = (bps: number) => `${bps / 100}%`

export function InvoicePage({ inv, order, brand, contact }: { inv: Invoice; order: string; brand: Brand; contact: string }) {
  const tax = inv.kind === 'tax_invoice'
  const intra = inv.supply === 'intra'
  const offs = inv.totals.discount > 0
  const head = ['Item', 'HSN', 'Qty', ...(offs ? ['Value', 'Discount'] : []), 'Taxable value', ...(tax ? ['Rate', ...(intra ? ['CGST', 'SGST'] : ['IGST'])] : []), 'Total']
  const widths = [5, 1.4, 1, ...(offs ? [1.8, 1.8] : []), 2, ...(tax ? [1, ...(intra ? [1.6, 1.6] : [1.8])] : []), 2]
  const rows = inv.lines.map((l) => [l.title, l.hsn, `${l.qty} pcs`, ...(offs ? [rs(l.gross), l.discount ? `−${rs(l.discount)}` : '—'] : []), rs(l.taxable),
    ...(tax ? [rate(l.rateBps), ...(intra ? [rs(l.cgst), rs(l.sgst)] : [rs(l.igst)])] : []), rs(l.total)])
  const right = head.map((_, i) => i).filter((i) => i >= 2)
  const totals: [string, string][] = [
    ...(offs ? [['Value', rs(inv.totals.gross)] as [string, string], ['Discount', `−${rs(inv.totals.discount)}`] as [string, string]] : []),
    ['Taxable value', rs(inv.totals.taxable)],
    ...(tax ? (intra ? [['CGST', rs(inv.totals.cgst)], ['SGST', rs(inv.totals.sgst)]] : [['IGST', rs(inv.totals.igst)]]) as [string, string][] : []),
    ['Total', rs(inv.totals.total)],
  ]
  return (
    <Page size="A4" style={s.page}>
      {inv.cancelled ? <Text style={{ position: 'absolute', top: 120, right: 50, transform: 'rotate(-8deg)', borderWidth: 3, borderColor: PAPER.stamp, color: PAPER.stamp, fontSize: 22, fontWeight: 600, paddingHorizontal: 10, paddingVertical: 2 }}>CANCELLED</Text> : null}
      <Masthead brand={brand} title={tax ? 'Tax invoice' : 'Bill of supply'} reference={inv.number} meta={`${dayIN(inv.date)} · order ${order}`} />
      <View style={s.two}>
        <View style={s.col}><Text style={s.label}>SELLER</Text><Text style={{ fontWeight: 600 }}>{inv.seller.name}</Text><Text>{inv.seller.address}</Text>
          <Text>{inv.seller.gstin ? `GSTIN ${inv.seller.gstin}` : 'Not registered for GST'}</Text></View>
        <View style={s.col}><Text style={s.label}>BILL TO AND SHIP TO</Text><Text style={{ fontWeight: 600 }}>{inv.buyer.name}</Text>{inv.buyer.lines.map((l) => <Text key={l}>{l}</Text>)}
          <Text>Place of supply: {inv.placeOfSupply.state}{inv.placeOfSupply.code ? ` (${inv.placeOfSupply.code})` : ''}</Text>
          {tax ? <Text>Tax payable on reverse charge: No</Text> : null}</View>
      </View>
      <Table head={head} rows={rows} widths={widths} right={right} />
      <Totals lines={totals} />
      <View style={{ marginTop: 10, gap: 2 }}>
        {inv.charges.delivery || inv.charges.cod ? <Text style={s.sub}>Delivery{inv.charges.cod ? ' and the pay-on-delivery fee' : ''} ({[inv.charges.delivery ? rs(inv.charges.delivery) : null, inv.charges.cod ? rs(inv.charges.cod) : null].filter(Boolean).join(' + ')}) are shared across the items above, at each item's rate.</Text> : null}
        {inv.pricesIncludeGst && tax ? <Text style={s.sub}>Prices include GST.</Text> : null}
        {!tax ? <Text style={s.sub}>The seller is not registered for GST; no GST is charged.</Text> : null}
      </View>
      <View style={{ ...s.row, marginTop: 18, alignItems: 'flex-end' }} wrap={false}>
        <Text style={{ flex: 1, color: PAPER.sub, paddingRight: 20 }}>{brand.note ?? ''}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ height: 24 }} />
          <Text style={{ borderTopWidth: 0.75, borderTopColor: PAPER.ink, paddingTop: 2 }}>Authorised signatory{brand.signatory ? ` · ${brand.signatory}` : ''}</Text>
          <Text style={s.sub}>for {inv.seller.name}</Text>
        </View>
      </View>
      <Footer left={contact} right={inv.number} />
    </Page>
  )
}
