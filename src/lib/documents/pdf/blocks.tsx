import 'server-only'
import { Image, StyleSheet, Svg, Rect, Text, View } from '@react-pdf/renderer'
import { bars, code128, encodable } from '@/domains/orders/barcode'
import { PAPER } from '@/domains/documents/paper'
import { FAMILY } from '../fonts'

// =============================================================================
// FILE: src/lib/documents/pdf/blocks.tsx — the pieces every document is laid out from (Documents D0).
//
// A document says WHAT (its data); these say how it looks, so a slip, an invoice and a credit note stay related
// (Ekatan's lib/documents/pdf/blocks.ts, the shape the owner chose). On white paper always; the shop's colour only
// as `accent` (paperAccent: one rule and the title), money and numbers in ink.
// =============================================================================

export type Brand = {
  /** The shop's name as it prints. */
  name: string
  /** paperAccent(): the shop's colour where it reads on paper, else ink. */
  accent: string
  /** A PNG or JPEG logo for paper, as bytes (never a URL: a renderer fetches nothing). */
  logo: Uint8Array | null
  /** Under the invoice: the shop's own line (D2), and who signs. */
  note?: string
  signatory?: string
  /** The shop's support contact for the footer. */
  contact?: string
}

export const s = StyleSheet.create({
  page: { fontFamily: FAMILY, fontSize: 9.5, color: PAPER.ink, paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, lineHeight: 1.4 },
  label: { fontSize: 7, letterSpacing: 0.8, color: PAPER.sub, fontWeight: 600, marginBottom: 2 },
  mono: { fontFamily: FAMILY },
  sub: { color: PAPER.sub },
  row: { flexDirection: 'row' },
  two: { flexDirection: 'row', gap: 18, marginBottom: 10 },
  col: { flex: 1 },
  th: { fontSize: 7.5, color: PAPER.sub, fontWeight: 600, paddingVertical: 3, paddingHorizontal: 3 },
  td: { paddingVertical: 4, paddingHorizontal: 3 },
  num: { textAlign: 'right' },
})

/** The shop's mark (its logo, or its initial on its colour), its name, then the document's title and number. */
export function Masthead({ brand, title, reference, meta }: { brand: Brand; title: string; reference: string; meta?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 8, marginBottom: 12, borderBottomWidth: 2, borderBottomColor: brand.accent }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '60%' }}>
        {brand.logo
          ? <Image src={{ data: Buffer.from(brand.logo), format: 'png' }} style={{ height: 30, maxWidth: 120, objectFit: 'contain' }} />
          : <View style={{ width: 28, height: 28, borderRadius: 4, backgroundColor: brand.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: PAPER.white, fontSize: 13, fontWeight: 600 }}>{initial(brand.name)}</Text></View>}
        <Text style={{ fontSize: 14, fontWeight: 600, letterSpacing: 0.6 }}>{brand.name.toUpperCase()}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 1, color: brand.accent }}>{title.toUpperCase()}</Text>
        <Text style={{ fontWeight: 600 }}>{reference}</Text>
        {meta ? <Text style={s.sub}>{meta}</Text> : null}
      </View>
    </View>
  )
}

const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '·'

/** Code 128 of a reference, drawn from the same modules as the print page (src/domains/orders/barcode.ts). */
export function Barcode({ value, height = 34, unit = 1.2 }: { value: string; height?: number; unit?: number }) {
  if (!encodable(value)) return null
  const m = code128(value)
  const w = (m.length + 20) * unit
  return (
    <Svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
      {bars(m).map(([x, bw]) => <Rect key={x} x={(x + 10) * unit} y={0} width={bw * unit} height={height} fill={PAPER.ink} />)}
    </Svg>
  )
}

/** A table: header row over a rule, rows over hairlines; `widths` as flex shares, `right` the numeric columns. */
export function Table({ head, rows, widths, right = [] }: { head: string[]; rows: (string | null)[][]; widths: number[]; right?: number[] }) {
  const cell = (i: number) => ({ flex: widths[i] ?? 1, ...(right.includes(i) ? s.num : {}) })
  return (
    <View style={{ marginVertical: 6 }}>
      <View style={{ ...s.row, borderBottomWidth: 1, borderBottomColor: PAPER.ink }}>{head.map((h, i) => <Text key={i} style={{ ...s.th, ...cell(i) }}>{h}</Text>)}</View>
      {rows.map((r, j) => (
        <View key={j} wrap={false} style={{ ...s.row, borderBottomWidth: 0.5, borderBottomColor: PAPER.line }}>
          {r.map((c, i) => <Text key={i} style={{ ...s.td, ...cell(i) }}>{c ?? '—'}</Text>)}
        </View>
      ))}
    </View>
  )
}

/** Label : value pairs, right-aligned, the last one ruled and bold (a total). */
export function Totals({ lines }: { lines: [string, string][] }) {
  return (
    <View style={{ marginLeft: 'auto', width: 220, marginTop: 4 }} wrap={false}>
      {lines.map(([k, v], i) => {
        const last = i === lines.length - 1
        return <View key={k} style={{ ...s.row, justifyContent: 'space-between', paddingVertical: 1.5, ...(last ? { borderTopWidth: 1, borderTopColor: PAPER.ink, marginTop: 2, paddingTop: 4 } : {}) }}>
          <Text style={last ? { fontWeight: 600 } : undefined}>{k}</Text><Text style={last ? { fontWeight: 600 } : undefined}>{v}</Text>
        </View>
      })}
    </View>
  )
}

/** At the foot of each page: the shop's contact, and the document's own reference (one file may hold fifty). */
export function Footer({ left, right }: { left: string; right: string }) {
  return (
    <View fixed style={{ position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: PAPER.line, paddingTop: 4 }}>
      <Text style={{ fontSize: 7.5, color: PAPER.sub }}>{left}</Text>
      <Text style={{ fontSize: 7.5, color: PAPER.sub }}>{right}</Text>
    </View>
  )
}
