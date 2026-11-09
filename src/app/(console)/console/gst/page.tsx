import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { button } from '@/components/ui/button'
import { dueDate } from '@/domains/tax/gstr1'
import { requireMember } from '@/lib/auth/require-member'
import { CAN_SEE_GST } from '@/domains/tenancy/roles'
import { dayIN } from '@/lib/format-date'
import { gstPeriod, type Fix } from '@/lib/queries/gst'
import { ReviewTabs } from './review-tabs'
import { FilePanel } from './file-panel'
import { gsp } from '@/lib/gst/gsp'
import { liabilityOf, stepOf } from '@/domains/tax/gsp'

export const metadata = { title: 'GST' }
export const dynamic = 'force-dynamic'

const rs = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: p % 100 ? 2 : 0 })}`
const FIX_WORDS: Record<Fix['kind'], { title: string; href: string; action: string }> = {
  no_hsn: { title: 'Invoices with an item that has no HSN code', href: '/console/products/tax', action: 'Set HSN' },
  hsn_digits: { title: 'HSN codes with too few digits for your turnover', href: '/console/products/tax', action: 'Fix HSN' },
  bad_gstin: { title: 'A business buyer’s GSTIN that doesn’t check out', href: '/console/orders', action: 'Open orders' },
  gap: { title: 'Invoice numbers missing from the series', href: '/console/orders', action: 'Open orders' },
  came_back: { title: 'Parcels that came back without a credit note', href: '/console/orders', action: 'Open orders' },
  bad_note: { title: 'Credit notes left out: their figures no longer add up', href: '/console/orders', action: 'Open orders' },
}

/** Console › GST (GST app G1; approved mockup "The month", "Review", "For your CA"). */
export default async function GstPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const auth = await requireMember(CAN_SEE_GST)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the owner, an admin or the accountant sees GST' : auth.message} />
  const now = new Date()
  const { p } = await searchParams
  const d = await gstPeriod(auth.membership.tenantId, p ?? null, now).catch((err) => { console.error('[gst]', err instanceof Error ? err.name : 'error'); return undefined })
  if (d === undefined) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  if (!d) return <Panel title="Nothing to file for that period yet" action={<Link href="/console/gst" className={button({ variant: 'secondary' })}>Last period</Link>} />
  const { shop, period, gstr, fixes } = d
  if (!shop.gstin || shop.scheme !== 'regular') {
    return (
      <>
        <PageHeader title="GST" />
        <Panel title={!shop.gstin ? 'Your shop isn’t registered for GST' : 'Your shop is on the composition scheme'}
          action={auth.membership.role !== 'accountant' ? <Link href="/console/settings/taxes" className={button({ variant: 'secondary' })}>Settings › Taxes</Link> : undefined}>
          {!shop.gstin ? 'It issues bills of supply and delivers within its state. GSTR-1 is for registered shops.' : 'It issues bills of supply; your CA files CMP-08 each quarter. GSTR-1 is for the regular scheme.'}
        </Panel>
      </>
    )
  }
  const toFix = fixes.reduce((a, f) => a + (f.kind === 'gap' ? 0 : f.count), 0)
  const due = dueDate(period, shop.filing)
  const q = `p=${encodeURIComponent(period.key)}`
  const exp = (f: string) => `/console/gst/export?${q}&f=${f}`
  const tax = gstr.totals
  // Filing from Frrata is behind a switch (lib/gst/gsp.ts): off, the page is the CA's files only. Never on a support visit.
  const filer = auth.membership.supportSessionId ? null : gsp()
  const ours = liabilityOf(gstr)
  const filed = !!d.filing.filedAt
  return (
    <div className="space-y-4">
      <PageHeader title="GST" badges={<Badge tone={filed || !toFix ? 'ok' : 'warn'}>{filed ? 'Filed' : toFix ? `${toFix} to fix` : 'Ready'}</Badge>}
        meta={<>GSTIN <span className="font-mono">{shop.gstin}</span> · {shop.filing === 'monthly' ? 'Monthly' : 'Quarterly (IFF)'} · due {dayIN(due)}</>} />
      <nav aria-label="Period" className="flex items-center gap-1">
        <Link href={`/console/gst?p=${d.prev}`} aria-label="Previous period" className="grid size-9 place-items-center rounded-md border border-input">‹</Link>
        <span className="min-w-40 px-2 text-center font-semibold">{period.label}</span>
        {d.next ? <Link href={`/console/gst?p=${d.next}`} aria-label="Next period" className="grid size-9 place-items-center rounded-md border border-input">›</Link> : <span className="grid size-9 place-items-center rounded-md border border-input opacity-40" aria-hidden="true">›</span>}
      </nav>

      <ol className="grid overflow-hidden rounded-lg border border-border sm:grid-cols-3">
        {(filed
          ? [['done', 'Fix', 'Done'], ['done', 'Check the tables', `${gstr.totals.invoices} invoices · ${gstr.totals.creditNotes} credit notes`], ['done', 'Filed', `ARN ${d.filing.arn}`]]
          : [[toFix ? 'now' : 'done', 'Fix', toFix ? `${toFix} left` : 'Done'], [toFix ? '' : 'now', 'Check the tables', `${gstr.totals.invoices} invoices · ${gstr.totals.creditNotes} credit notes`], ['', filer ? 'File or send to your CA' : 'Send to your CA', 'GSTR-1 file, sheets, Tally']]).map(([s, t, sub], i) => (
          <li key={t} className="flex items-center gap-3 border-b border-border p-3 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${s === 'done' ? 'bg-ok text-ok-text' : s === 'now' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}>{s === 'done' ? '✓' : i + 1}</span>
            <span><b className="block text-sm">{t}</b><span className="text-xs text-muted-foreground">{sub}</span></span>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {([['Invoices', String(tax.invoices)], ['Taxable value', rs(tax.taxable)], ['CGST + SGST', rs(tax.cgst + tax.sgst)], ['IGST', rs(tax.igst)], ['Credit notes', tax.credited ? `−${rs(tax.credited)}` : '₹0']] as const).map(([l, v]) => (
          <div key={l} className="rounded-lg border border-border p-3"><span className="text-xs text-muted-foreground">{l}</span><b className="block font-mono text-lg tabular-nums">{v}</b></div>
        ))}
      </div>

      {fixes.length > 0 && (
        <Section ariaLabel="To fix" flush><ul className="divide-y divide-border">
          {fixes.map((f) => (
            <li key={f.kind} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Badge tone={f.kind === 'gap' ? 'neutral' : 'warn'}>{f.count}</Badge>
              <span className="min-w-0 flex-1"><b className="block text-sm">{FIX_WORDS[f.kind].title}</b><span className="font-mono text-xs text-muted-foreground">{f.examples.join(', ')}{f.count > f.examples.length ? '…' : ''}</span></span>
              {auth.membership.role !== 'accountant' ? <Link href={FIX_WORDS[f.kind].href} className={button({ variant: 'secondary' })}>{FIX_WORDS[f.kind].action}</Link> : null}
            </li>
          ))}
        </ul></Section>
      )}

      <ReviewTabs gstr={gstr} />

      {filer && (
        <Section ariaLabel="File from Frrata">
          <h2 className="text-section font-semibold">File from Frrata</h2>
          <FilePanel period={period.key} step={stepOf({ connected: d.filing.connected, filed: !!d.filing.filedAt, pushed: d.filing.pushed, now: ours, portal: d.filing.portal })}
            ours={ours} portal={d.filing.portal} username={d.filing.username} pushedAt={d.filing.pushedAt?.toISOString() ?? null}
            filedAt={d.filing.filedAt?.toISOString() ?? null} arn={d.filing.arn} gspName={filer.name} />
        </Section>
      )}

      <Section ariaLabel="For your CA">
        <h2 className="text-section font-semibold">For your CA</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {([['json', 'GSTR-1 for the offline tool', 'JSON'], ['sheets', 'GSTR-1 tables', 'CSV'], ['register', 'Sales register', 'CSV'], ['tally', 'Vouchers for Tally', 'XML']] as const).map(([f, l, t]) => (
            <li key={f}><a href={exp(f)} className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm hover:bg-muted">
              <span aria-hidden="true">↓</span><span className="flex-1">{l}</span><span className="text-xs text-muted-foreground">{t}</span></a></li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
