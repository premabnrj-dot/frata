import { Money } from '@/components/data/numeric'
import { BackLink } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { PrintButton } from '@/components/ui/print-button'
import { bars, code128, encodable } from '@/domains/orders/barcode'
import { invoice, packingSlip, type DocLine, type DocOrder, type DocShop } from '@/domains/orders/documents'
import { pick, urlFor } from '@/domains/media/sizes'
import { paise } from '@/domains/money/paise'
import { ROLES } from '@/domains/orders/work'
import { asMember } from '@/lib/auth/as-member'
import { requireMember } from '@/lib/auth/require-member'
import { dayMonthLongIN } from '@/lib/format-date'
import { documentsFor, MAX_DOCUMENTS } from '@/lib/orders/documents'
import { formatInr } from '@/lib/format'
import { STATE } from '../_components/labels'

// =============================================================================
// FILE: src/app/(console)/console/orders/print/page.tsx
//
// THE PACKING SLIP AND THE TAX INVOICE / BILL OF SUPPLY (1D·5), as print
// pages (A4, the browser's print; not PDFs). ?kind=slip|invoice&n=1001,1002 —
// one order or a selection (at most 50), numbers resolved inside the member's
// own shop (another shop's number is silently not printed). Read through
// asMember, so a Frrata support visit that opens one is audited: these carry
// the shopper's full address. Never cached, no referrer sent onward.
// The invoice's particulars follow GST Rules 46/49; the owner's CA confirms the
// template before the first real invoice (spec § 1D·4).
// =============================================================================

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Print', referrer: 'no-referrer' as const, robots: { index: false } }

function Barcode({ value }: { value: string }) {
  if (!encodable(value)) return null
  const m = code128(value), unit = 2, h = 48
  // 10 modules of quiet zone each side, as the standard asks.
  return (
    <svg role="img" aria-label={`Barcode ${value}`} width={(m.length + 20) * unit} height={h} viewBox={`0 0 ${(m.length + 20) * unit} ${h}`} className="block">
      {bars(m).map(([x, w]) => <rect key={x} x={(x + 10) * unit} y={0} width={w * unit} height={h} fill="currentColor" />)}
    </svg>
  )
}

function Slip({ o, lines, shop }: { o: DocOrder; lines: DocLine[]; shop: DocShop }) {
  const s = packingSlip(o, lines, shop)
  return (
    <article className="space-y-5 break-after-page bg-background p-6 text-foreground print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">{s.shop}</p><p className="font-mono text-4xl font-semibold">{s.number}</p></div>
        <Barcode value={s.number} />
      </header>
      {/* A cancelled order never reaches here: documentsFor prints a slip only where applies('print') (1D·7). */}
      <div className={`border-4 p-4 text-center ${s.collect ? 'border-foreground' : 'border-muted-foreground'}`}>
        {s.collect ? <p className="text-3xl font-semibold">Collect <Money paise={paise(s.collect)} /></p> : <p className="text-2xl font-semibold">Prepaid — collect nothing</p>}
      </div>
      <section aria-label="Deliver to" className="text-lg">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Deliver to</p>
        <p className="font-semibold">{s.to.name}</p>
        {s.to.lines.map((l) => <p key={l}>{l}</p>)}
        {s.to.phone ? <p className="font-mono">{s.to.phone}</p> : null}
      </section>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-foreground text-left"><th className="py-1"> </th><th className="py-1">Item</th><th className="py-1">SKU</th><th className="py-1 text-right">Qty</th></tr></thead>
        <tbody>
          {s.lines.map((l, i) => (
            <tr key={i} className="border-b border-border align-top">
              <td className="py-2 pr-2">{l.imageBase && l.imageWidths ? <img src={urlFor(l.imageBase, pick(l.imageWidths, 120))} alt="" width={40} height={50} className="h-[50px] w-10 object-cover" /> : null}</td>
              <td className="py-2"><span className="font-medium">{l.title}</span><span className="block text-muted-foreground">{l.options}</span></td>
              <td className="py-2 font-mono">{l.sku ?? '—'}</td>
              <td className="py-2 text-right font-mono text-base font-semibold">{l.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.returnTo ? <p className="text-xs text-muted-foreground">If undelivered, return to: {s.returnTo}</p> : null}
    </article>
  )
}

const rate = (bps: number) => `${bps / 100}%`

function Invoice({ o, lines, shop }: { o: DocOrder; lines: DocLine[]; shop: DocShop }) {
  const inv = invoice(o, lines, shop)
  if (!inv) return <article className="break-after-page p-6"><p className="font-mono">{o.number}</p><p>Not packed yet: its invoice is issued when it is marked packed.</p></article>
  const intra = inv.supply === 'intra'
  return (
    <article className="relative space-y-5 break-after-page bg-background p-6 text-sm text-foreground print:p-0">
      {inv.cancelled ? <p className="absolute right-6 top-6 rotate-[-8deg] border-4 border-danger-text px-3 py-1 text-2xl font-bold text-danger-text print:right-0 print:top-0">CANCELLED</p> : null}
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{inv.kind === 'tax_invoice' ? 'Tax invoice' : 'Bill of supply'}</h1>
        <p>No. <span className="font-mono font-semibold">{inv.number}</span> · {dayMonthLongIN(inv.date)} · Order <span className="font-mono">{o.number}</span></p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
        <section aria-label="Seller"><p className="text-xs uppercase tracking-wide text-muted-foreground">Seller</p>
          <p className="font-semibold">{inv.seller.name}</p><p className="whitespace-pre-line">{inv.seller.address}</p>
          {inv.seller.gstin ? <p>GSTIN <span className="font-mono">{inv.seller.gstin}</span></p> : <p>Not registered for GST</p>}</section>
        <section aria-label="Buyer"><p className="text-xs uppercase tracking-wide text-muted-foreground">Bill to and ship to</p>
          <p className="font-semibold">{inv.buyer.name}</p>{inv.buyer.lines.map((l) => <p key={l}>{l}</p>)}
          <p>Place of supply: {inv.placeOfSupply.state}{inv.placeOfSupply.code ? ` (${inv.placeOfSupply.code})` : ''}</p></section>
      </div>
      <table className="w-full">
        <thead><tr className="border-b border-foreground text-left">
          <th className="py-1">Item</th><th className="py-1">HSN</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Taxable value</th>
          {inv.kind === 'tax_invoice' ? <><th className="py-1 text-right">Rate</th>{intra ? <><th className="py-1 text-right">CGST</th><th className="py-1 text-right">SGST</th></> : <th className="py-1 text-right">IGST</th>}</> : null}
          <th className="py-1 text-right">Total</th>
        </tr></thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i} className="border-b border-border">
              <td className="py-1.5">{l.title}</td><td className="py-1.5 font-mono">{l.hsn ?? '—'}</td><td className="py-1.5 text-right font-mono">{l.qty}</td>
              <td className="py-1.5 text-right"><Money paise={paise(l.taxable)} decimals /></td>
              {inv.kind === 'tax_invoice' ? <><td className="py-1.5 text-right font-mono">{rate(l.rateBps)}</td>{intra ? <><td className="py-1.5 text-right"><Money paise={paise(l.cgst)} decimals /></td><td className="py-1.5 text-right"><Money paise={paise(l.sgst)} decimals /></td></> : <td className="py-1.5 text-right"><Money paise={paise(l.igst)} decimals /></td>}</> : null}
              <td className="py-1.5 text-right"><Money paise={paise(l.total)} decimals /></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="font-semibold">
          <td className="py-2" colSpan={3}>Total</td><td className="py-2 text-right"><Money paise={paise(inv.totals.taxable)} decimals /></td>
          {inv.kind === 'tax_invoice' ? <><td />{intra ? <><td className="py-2 text-right"><Money paise={paise(inv.totals.cgst)} decimals /></td><td className="py-2 text-right"><Money paise={paise(inv.totals.sgst)} decimals /></td></> : <td className="py-2 text-right"><Money paise={paise(inv.totals.igst)} decimals /></td>}</> : null}
          <td className="py-2 text-right"><Money paise={paise(inv.totals.total)} decimals /></td>
        </tr></tfoot>
      </table>
      <div className="space-y-1 text-xs text-muted-foreground">
        {inv.charges.delivery || inv.charges.cod ? <p>Delivery{inv.charges.cod ? ' and the pay-on-delivery fee' : ''} ({[inv.charges.delivery ? formatInr(paise(inv.charges.delivery), { decimals: true }) : null, inv.charges.cod ? formatInr(paise(inv.charges.cod), { decimals: true }) : null].filter(Boolean).join(' + ')}) are part of the supply and included in each item&apos;s value above.</p> : null}
        {inv.pricesIncludeGst && inv.kind === 'tax_invoice' ? <p>Prices include GST.</p> : null}
        {inv.kind === 'bill_of_supply' ? <p>The seller is not registered for GST; no GST is charged.</p> : null}
      </div>
    </article>
  )
}

export default async function PrintPage({ searchParams }: { searchParams: Promise<{ kind?: string; n?: string }> }) {
  const auth = await requireMember(ROLES.print) // first, as every console page; asMember checks again (cached per request)
  if (!auth.ok) return <Panel title={auth.message} />
  const sp = await searchParams
  const kind = sp.kind === 'invoice' ? 'invoice' : 'slip'
  const asked = [...new Set((sp.n ?? '').split(',').map((x) => Number(x.trim())).filter((x) => Number.isSafeInteger(x) && x > 0))]
  const numbers = asked.slice(0, MAX_DOCUMENTS)
  const r = await asMember(ROLES.print, { action: kind === 'invoice' ? 'order.print_invoice' : 'order.print_slip', detail: { count: numbers.length } }, async (tx, auth) =>
    documentsFor(tx, auth.membership.tenantId, numbers, kind))
    .catch((err) => { console.error('[print]', err instanceof Error ? err.name : err); return null })
  if (!r) return <Panel title="We could not load these documents">Nothing was changed. Try again in a minute.</Panel>
  if (!r.ok) return <Panel title={r.error} />
  const docs = r.value.orders
  const title = kind === 'invoice' ? (docs.length === 1 ? 'Invoice' : `${docs.length} invoices`) : docs.length === 1 ? 'Packing slip' : `${docs.length} packing slips`
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <BackLink href={docs.length === 1 ? `/console/orders/${docs[0]!.n}` : '/console/orders'} label={docs.length === 1 ? docs[0]!.o.number : 'Orders'} />
        <h1 className="text-section font-semibold">{title}</h1>
        {docs.length ? <PrintButton /> : null}
      </div>
      {r.value.skipped.length ? <p role="status" className="text-sm print:hidden">Not printed: {r.value.skipped.map((x) => `${x.number} (${STATE[x.state].label.toLowerCase()})`).join(', ')}. A packing slip is for an order from confirmed until it is delivered.</p> : null}
      {asked.length > numbers.length ? <p role="status" className="text-sm print:hidden">The first {MAX_DOCUMENTS} of the {asked.length} orders asked for. Print these, then the rest.</p> : null}
      {docs.length === 0 ? <Panel title="Nothing to print">{r.value.skipped.length ? 'None of these orders has a packing slip now.' : 'None of these orders is in your shop.'}</Panel>
        : docs.map(({ o, lines }) => kind === 'invoice' ? <Invoice key={o.number} o={o} lines={lines} shop={r.value.shop} /> : <Slip key={o.number} o={o} lines={lines} shop={r.value.shop} />)}
    </>
  )
}
