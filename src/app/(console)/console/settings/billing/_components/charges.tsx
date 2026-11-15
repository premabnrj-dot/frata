import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { Money } from '@/components/data/numeric'
import { DataTable, DataTableBody, DataTableHead, DataTableRow } from '@/components/data/data-table'
import { Badge, Tag } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { summarize, type ChargeGroup, type ChargeLine } from '@/domains/billing/charges'
import { paise } from '@/domains/money/paise'
import { dayMonthIN, dayMonthLongIN } from '@/lib/format-date'
import type { ChargeOrder } from '@/lib/queries/billing'
import { billingHref } from './tabs'
import { GROUP_LABEL, pct } from './overview'

export type BillPick = { id: string; label: string }
export type ChargesBill = {
  id: string
  title: string
  status: { tone: 'ok' | 'warn' | 'neutral'; label: string }
  lines: (ChargeLine & { periodStart?: Date | null; periodEnd?: Date | null })[]
  taxable: number; cgst: number; sgst: number; igst: number; total: number
  orders: ChargeOrder[]; orderCount: number; credits: ChargeOrder[]; page: number; pageSize: number
}

const OUTCOME: Record<ChargeOrder['outcome'], string> = { delivered: 'Delivered', assumed: 'Shipped 30+ days', came_back: 'Came back', lost: 'Lost' }
const DAY = 86_400_000

/** Charges (mockup § Charges): one bill at a time; the summary adds up to the bill; by order, or by plan and apps. */
export function Charges({ picks, bill, view, prefix }: { picks: BillPick[]; bill: ChargesBill; view: 'orders' | 'items'; prefix: string }) {
  const s = summarize(bill.lines, bill.taxable, bill)
  const fees = bill.lines.filter((l) => l.kind === 'fee')
  const feeCount = fees.reduce((t, l) => t + l.quantity, 0)
  const how = (g: ChargeGroup): string => {
    if (g === 'fees') return `${feeCount.toLocaleString('en-IN')} order${feeCount === 1 ? '' : 's'}${fees[0]?.rateBps ? ` · ${pct(fees[0].rateBps)}` : ''}`
    if (g === 'credits') return `${bill.credits.length.toLocaleString('en-IN')} came back or lost after billing`
    return s.rows.find((r) => r.group === g)?.lines.map((l) => l.description).join(' · ') ?? ''
  }
  const at = (v: string, extra: Record<string, string | number> = {}) => billingHref('charges', { bill: bill.id === 'open' ? undefined : bill.id, view: v === 'orders' ? undefined : v, ...extra })
  const pages = Math.ceil(bill.orderCount / bill.pageSize)
  const items = bill.lines.filter((l) => l.kind === 'plan' || l.kind === 'change' || l.kind === 'addon')
  return (
    <div className="space-y-4">
      <nav aria-label="Bill" className="flex flex-wrap gap-1.5">
        {picks.map((p) => <Link key={p.id} href={billingHref('charges', { bill: p.id === 'open' ? undefined : p.id })} aria-current={p.id === bill.id ? 'page' : undefined}
          className={`inline-flex h-7.5 items-center rounded-full border px-3 text-label font-medium ${p.id === bill.id ? 'border-chart-now bg-select text-select-foreground' : 'border-border bg-card'}`}>{p.label}</Link>)}
      </nav>

      <Section title={bill.title} action={<Badge tone={bill.status.tone}>{bill.status.label}</Badge>}>
        <DataTable label="What this bill is made of">
          <DataTableHead><th>Charge</th><th>Worked out</th><th className="text-right">Amount</th></DataTableHead>
          <DataTableBody>
            {s.rows.map((r) => (
              <DataTableRow key={r.group}>
                <td data-cell="a">{r.group === 'fees' || r.group === 'plan' || r.group === 'apps' ? <Link className="text-link underline-offset-2 hover:underline" href={at(r.group === 'fees' ? 'orders' : 'items')}>{GROUP_LABEL[r.group]}</Link> : GROUP_LABEL[r.group]}</td>
                <td data-cell="c" className="text-muted-foreground">{how(r.group)}</td>
                <td data-cell="b" className="text-right"><Money paise={r.taxable} decimals /></td>
              </DataTableRow>
            ))}
            <DataTableRow><td data-cell="a" className="font-semibold">Before GST</td><td data-cell="hide" /><td data-cell="b" className="text-right font-semibold"><Money paise={s.beforeGst} decimals /></td></DataTableRow>
            {s.cgst ? <DataTableRow><td data-cell="a">CGST 9%</td><td data-cell="hide" /><td data-cell="b" className="text-right"><Money paise={s.cgst} decimals /></td></DataTableRow> : null}
            {s.sgst ? <DataTableRow><td data-cell="a">SGST 9%</td><td data-cell="hide" /><td data-cell="b" className="text-right"><Money paise={s.sgst} decimals /></td></DataTableRow> : null}
            {s.igst ? <DataTableRow><td data-cell="a">IGST 18%</td><td data-cell="hide" /><td data-cell="b" className="text-right"><Money paise={s.igst} decimals /></td></DataTableRow> : null}
            <DataTableRow><td data-cell="a" className="font-semibold">Total</td><td data-cell="hide" /><td data-cell="b" className="text-right font-semibold"><Money paise={s.total} decimals /></td></DataTableRow>
          </DataTableBody>
        </DataTable>
      </Section>

      <Section ariaLabel="Charges in detail">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          <nav aria-label="View" className="inline-flex gap-0.5 rounded-mid bg-sunk p-0.5">
            {([['orders', 'By order'], ['items', 'Plan and apps']] as const).map(([k, l]) => (
              <Link key={k} href={at(k)} aria-current={view === k ? 'page' : undefined}
                className={`inline-flex h-8 items-center rounded-md px-3 text-label font-medium ${view === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>{l}</Link>
            ))}
          </nav>
          {view === 'orders' && pages > 1 ? <span className="text-label text-muted-foreground">Page {bill.page + 1} of {pages}</span> : null}
        </div>
        {view === 'orders' ? (
          <>
            <DataTable label="Orders on this bill">
              <DataTableHead><th>Order</th><th>Shipped</th><th>Outcome</th><th className="text-right">Order total</th><th className="text-right">Fee is on</th><th className="text-right">Rate</th><th className="text-right">Fee</th></DataTableHead>
              <DataTableBody>
                {[...bill.orders, ...bill.credits.map((c) => ({ ...c, credit: true as const }))].map((o, i) => (
                  <DataTableRow key={`${o.number}-${i}`}>
                    <td data-cell="a"><Link className="text-link underline-offset-2 hover:underline" href={`/console/orders/${o.number}`}>{prefix}-{o.number}</Link></td>
                    <td data-cell="e" className="text-muted-foreground"><span className="md:hidden">Shipped </span>{o.shippedAt ? dayMonthIN(o.shippedAt) : '—'}</td>
                    <td data-cell="c"><Badge tone={'credit' in o ? 'neutral' : 'ok'}>{OUTCOME[o.outcome]}{o.outcomeAt ? ` ${dayMonthIN(o.outcomeAt)}` : ''}</Badge>{'credit' in o ? <Tag className="ml-1.5">Credit</Tag> : null}</td>
                    <td data-cell="hide" className="text-right"><Money paise={paise(o.total)} decimals /></td>
                    <td data-cell="d" className="text-right"><Money paise={paise(o.base)} decimals /></td>
                    <td data-cell="hide" className="text-right text-muted-foreground">{pct(o.feeBps)}</td>
                    <td data-cell="b" className="text-right font-medium"><Money paise={paise(o.fee)} decimals /></td>
                  </DataTableRow>
                ))}
                {bill.orderCount === 0 && !bill.credits.length ? <DataTableRow><td data-cell="e" colSpan={7} className="text-muted-foreground">No delivered orders on this bill.</td></DataTableRow> : null}
              </DataTableBody>
            </DataTable>
            {pages > 1 ? (
              <div className="mt-3 flex justify-end gap-2">
                {bill.page > 0 ? <Link href={at('orders', { page: bill.page - 1 })} className={button({ variant: 'secondary', size: 'sm' })}>Newer orders</Link> : null}
                {bill.page + 1 < pages ? <Link href={at('orders', { page: bill.page + 1 })} className={button({ variant: 'secondary', size: 'sm' })}>Older orders</Link> : null}
              </div>
            ) : null}
          </>
        ) : (
          <DataTable label="Plan and apps on this bill">
            <DataTableHead><th>Item</th><th>Period</th><th className="text-right">Days</th><th className="text-right">Amount</th></DataTableHead>
            <DataTableBody>
              {items.map((l, i) => (
                <DataTableRow key={i}>
                  <td data-cell="a">{l.description}</td>
                  <td data-cell="c" className="text-muted-foreground">{l.periodStart && l.periodEnd ? `${dayMonthIN(l.periodStart)} – ${dayMonthLongIN(new Date(l.periodEnd.getTime() - DAY))}` : '—'}</td>
                  <td data-cell="d" className="text-right text-muted-foreground"><span className="md:hidden">Days </span>{l.periodStart && l.periodEnd ? Math.round((l.periodEnd.getTime() - l.periodStart.getTime()) / DAY) : '—'}</td>
                  <td data-cell="b" className="text-right font-medium"><Money paise={paise(l.taxable)} decimals /></td>
                </DataTableRow>
              ))}
              {!items.length ? <DataTableRow><td data-cell="e" colSpan={4} className="text-muted-foreground">No plan or apps on this bill.</td></DataTableRow> : null}
              <DataTableRow><td data-cell="a" className="font-semibold" colSpan={3}>Plan and apps</td><td data-cell="b" className="text-right font-semibold"><Money paise={paise(items.reduce((t, l) => t + l.taxable, 0))} decimals /></td></DataTableRow>
            </DataTableBody>
          </DataTable>
        )}
      </Section>
    </div>
  )
}
