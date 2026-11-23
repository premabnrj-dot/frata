import Link from 'next/link'
import { Money, Numeric } from '@/components/data/numeric'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Section } from '@/components/layout/section'
import { Badge, Tag } from '@/components/ui/badge'
import { CATEGORY_WORDS, overview, usdToPaise, type CostCategory, type CostItem, type CostPayment, type DueState } from '@/domains/admin/costs'
import { paise } from '@/domains/money/paise'
import { monthKey } from '@/domains/time/month'
import { formatInr } from '@/lib/format'
import { NeedsBand } from '../../_components/needs-band'
import { amountText, dayText, inputOf, monthLongName, monthShortName, whenOf } from '../format'
import { MarkPaidButton, type PaidTarget } from './forms'

/** What Mark paid opens with for a cost's next unpaid bill. */
export function paidTarget(item: CostItem, state: DueState, today: string, rate: number | null): PaidTarget | null {
  if (!state.next) return null
  return {
    itemId: item.id, name: item.name, currency: item.currency, varies: item.varies, period: state.next, periodText: dayText(state.next), today,
    amount: inputOf(item.amount, item.currency), inr: item.currency === 'USD' && rate ? inputOf(usdToPaise(item.amount, rate), 'INR') : '',
  }
}

const sub = (item: CostItem) => [item.vendor, CATEGORY_WORDS[item.category as CostCategory]].filter(Boolean).join(' · ')

/** The Overview (mockup § Overview): the overdue band, four figures, what is due, and the month by category. */
export function Overview({ items, payments, today, rate }: { items: CostItem[]; payments: (CostPayment & { amount: number; currency: 'INR' | 'USD'; gstPaise: number | null; createdAt: Date })[]; today: string; rate: number | null }) {
  const o = overview(items, payments, today, rate)
  const first = o.due.find((d) => d.row.tone === 'overdue')
  const target = first ? paidTarget(first.item, first.state, today, rate) : null
  const inr = (p: number) => formatInr(paise(p))
  const top = o.categories[0]?.paise ?? 1
  const prev = monthShortName(monthKey(today, -1))
  return (
    <>
      {first && target ? <NeedsBand tone="warn" title={`${o.overdue} ${o.overdue === 1 ? 'cost is' : 'costs are'} overdue`} line={`· ${first.item.name} · ${first.row.overdueDays} ${first.row.overdueDays === 1 ? 'day' : 'days'}`}
        action={<MarkPaidButton t={target} small />} /> : null}
      <dl className="grid grid-cols-2 rounded-lg border border-line-soft lg:grid-cols-4">
        <Figure label={`Spent in ${monthShortName(o.month)}`} value={inr(o.spent.paise)} note={`${o.spent.count} ${o.spent.count === 1 ? 'payment' : 'payments'}`} />
        <Figure label="Monthly burn" value={inr(o.burn.monthlyPaise)} note={o.burn.missingRate ? `${o.burn.missingRate} in dollars, rate missing` : `${o.burn.count} repeating ${o.burn.count === 1 ? 'cost' : 'costs'}`} />
        <Figure label="Yearly burn" value={inr(o.burn.yearlyPaise)} note={rate ? `at ${formatInr(paise(Math.round(rate / 100)), { decimals: true })} to the dollar` : 'rupees only'} />
        <Figure label="Due in 30 days" value={inr(o.coming.paise)} note={`${o.coming.count} ${o.coming.count === 1 ? 'cost' : 'costs'}`} />
      </dl>
      <Section title={<>Due and overdue {o.due.length ? <Tag>{o.due.length}</Tag> : null}</>} className="space-y-3">
        {o.due.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is due in the next 30 days.</p> : (
          <DataTable label="Due and overdue">
            <DataTableHead><th>Cost</th><th>When</th><th>Due</th><th className="text-right">Amount</th><th><span className="sr-only">Action</span></th></DataTableHead>
            <DataTableBody>
              {o.due.map(({ row, item, state }) => {
                const w = whenOf(state)!, t = paidTarget(item, state, today, rate)!
                return (
                  <DataTableRow key={item.id}>
                    <Td cell="a"><Link href={`/admin/costs?view=all&id=${item.id}`} data-row-link className="font-medium hover:underline">{item.name}</Link>
                      <span className="hidden text-small text-muted-foreground md:block">{sub(item)}</span>
                      <span className="text-small text-muted-foreground md:hidden">{dayText(row.next)} · {w.text.toLowerCase()}</span></Td>
                    <Td cell="hide"><Badge tone={w.tone}>{w.text}</Badge>{item.varies ? <> <Tag>varies</Tag></> : null}</Td>
                    <Td cell="hide">{dayText(row.next)}</Td>
                    <Td cell="d" className="text-right"><Numeric>{item.varies ? 'about ' : ''}{amountText(item.amount, item.currency)}</Numeric></Td>
                    <Td cell="hide" className="text-right"><MarkPaidButton t={t} primary={row.tone === 'overdue'} small /></Td>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        )}
      </Section>
      {o.categories.length > 0 ? (
        <Section title={`${monthLongName(o.month)} by category`} action={<Tag>vs {prev}</Tag>} className="space-y-1 max-md:hidden">
          <ul className="divide-y divide-line-soft">
            {o.categories.map((c) => {
              const d = c.paise - c.before
              return (
                <li key={c.category} className="grid grid-cols-[7.5rem_minmax(0,1fr)_6rem] items-center gap-3 py-2 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_6rem_6rem]">
                  <span>{CATEGORY_WORDS[c.category as CostCategory] ?? c.category}</span>
                  <span aria-hidden="true" className="h-2 rounded-sm bg-sunk"><i className="block h-2 rounded-sm bg-chart" style={{ width: `${Math.max(2, Math.round((c.paise / top) * 100))}%` }} /></span>
                  <Money paise={paise(c.paise)} className="text-right" />
                  <span className={`hidden text-right font-num sm:block ${d > 0 ? 'text-danger-text' : d < 0 ? 'text-ok-text' : 'text-muted-foreground'}`}>{d === 0 ? '₹0' : `${d > 0 ? '+' : '−'}${inr(Math.abs(d))}`}</span>
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}
    </>
  )
}

const Figure = ({ label, value, note }: { label: string; value: string; note: string }) => (
  <div className="grid gap-0.5 border-line-soft p-4 [&:not(:first-child)]:border-l max-lg:[&:nth-child(odd)]:border-l-0 max-lg:[&:nth-child(n+3)]:border-t">
    <dt className="text-small font-medium text-muted-foreground">{label}</dt><dd className="font-num text-title font-semibold">{value}</dd><dd className="text-small text-muted-foreground max-md:hidden">{note}</dd>
  </div>
)
