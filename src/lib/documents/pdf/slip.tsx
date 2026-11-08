import 'server-only'
import { Page, Text, View } from '@react-pdf/renderer'
import type { PackingSlip } from '@/domains/orders/documents'
import { PAPER } from '@/domains/documents/paper'
import { paise } from '@/domains/money/paise'
import { formatInr } from '@/lib/format'
import { Barcode, Footer, Masthead, s, Table, type Brand } from './blocks'

// The packing slip (Documents D1): what the packer and the courier need, in the shop's brand. The headline is what
// to collect at the door, from collect() (src/domains/orders/amounts.ts) through packingSlip(): the same figure as
// the print page. No prices: a slip goes in the parcel. On A4, or on a 4×6 in thermal label (288 × 432 pt; black only).

export type SlipSize = 'A4' | 'label'
const LABEL: [number, number] = [288, 432]

function CollectBox({ amount, big }: { amount: number; big?: boolean }) {
  return (
    <View style={{ borderWidth: 2, borderColor: amount ? PAPER.ink : PAPER.sub, borderRadius: 3, padding: big ? 6 : 8, marginBottom: 10 }}>
      <Text style={{ fontSize: big ? 15 : 16, fontWeight: 600, textAlign: 'center' }}>{amount ? `Collect ${formatInr(paise(amount))} on delivery` : 'Prepaid — collect nothing'}</Text>
    </View>
  )
}

export function SlipPage({ slip, brand, size, contact }: { slip: PackingSlip; brand: Brand; size: SlipSize; contact: string }) {
  if (size === 'label') {
    return (
      <Page size={LABEL} style={{ ...s.page, paddingTop: 14, paddingBottom: 14, paddingHorizontal: 16, fontSize: 9.5 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: PAPER.ink, paddingBottom: 5, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: 600 }}>{brand.name.toUpperCase()}</Text>
          <Text style={{ fontSize: 12, fontWeight: 600 }}>{slip.number}</Text>
        </View>
        <CollectBox amount={slip.collect} big />
        <Text style={s.label}>DELIVER TO</Text>
        <Text style={{ fontSize: 11, fontWeight: 600 }}>{slip.to.name}</Text>
        {slip.to.lines.map((l) => <Text key={l}>{l}</Text>)}
        {slip.to.phone ? <Text>{slip.to.phone}</Text> : null}
        <View style={{ marginTop: 8 }}><Barcode value={slip.number} height={40} unit={1.3} /></View>
        <Text style={{ marginTop: 6, fontSize: 8.5 }}>{slip.lines.reduce((n, l) => n + l.qty, 0)} items · {slip.lines.map((l) => `${l.title}${l.options ? ` (${l.options})` : ''}`).join(', ')}</Text>
        {slip.returnTo ? <Text style={{ marginTop: 'auto', fontSize: 7.5, color: PAPER.sub }}>If undelivered, return to: {slip.returnTo}</Text> : null}
      </Page>
    )
  }
  return (
    <Page size="A4" style={s.page}>
      <Masthead brand={brand} title="Packing slip" reference={slip.number} />
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 2 }}>
        <View style={{ flex: 1 }}><CollectBox amount={slip.collect} /></View>
        <View style={{ marginBottom: 10 }}><Barcode value={slip.number} /></View>
      </View>
      <View style={s.two}>
        <View style={s.col}><Text style={s.label}>DELIVER TO</Text><Text style={{ fontSize: 11, fontWeight: 600 }}>{slip.to.name}</Text>
          {slip.to.lines.map((l) => <Text key={l}>{l}</Text>)}{slip.to.phone ? <Text>{slip.to.phone}</Text> : null}</View>
        {slip.returnTo ? <View style={s.col}><Text style={s.label}>IF UNDELIVERED, RETURN TO</Text><Text>{slip.returnTo}</Text></View> : null}
      </View>
      <Table head={['Item', 'SKU', 'Qty']} widths={[6, 3, 1]} right={[2]}
        rows={slip.lines.map((l) => [l.options ? `${l.title}\n${l.options}` : l.title, l.sku, String(l.qty)])} />
      <Footer left={contact} right={slip.number} />
    </Page>
  )
}
