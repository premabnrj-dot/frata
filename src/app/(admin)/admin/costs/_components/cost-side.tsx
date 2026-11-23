import { Money } from '@/components/data/numeric'
import { Badge, Tag } from '@/components/ui/badge'
import { CADENCE_WORDS, CATEGORY_WORDS, dueState, isLive, monthlyPaise, usdToPaise, type CostCategory, type CostItem, type PaymentRow } from '@/domains/admin/costs'
import { paise } from '@/domains/money/paise'
import { formatInr } from '@/lib/format'
import { amountText, dayText, inputOf, whenOf } from '../format'
import { CostFrame } from './cost-frame'
import { CostFooter, CostHeaderMenu, UndoPaymentButton, type CostFacts } from './forms'
import { paidTarget } from './overview'

/** One cost beside the list (mockup § All costs): its facts, its payments (the newest can be undone) and its actions. */
export function CostSide({ item, payments, today, rate, closeHref, prevHref, nextHref }: {
  item: CostItem; payments: PaymentRow[]; today: string; rate: number | null; closeHref: string; prevHref?: string; nextHref?: string
}) {
  const ended = !isLive(item, today)
  const state = dueState(item, new Set(payments.map((p) => p.periodFor)), today)
  const w = ended ? null : whenOf(state)
  const m = monthlyPaise(item, rate)
  const facts: CostFacts = {
    id: item.id, name: item.name, vendor: item.vendor ?? null, category: item.category as CostCategory, note: item.note ?? null, varies: item.varies, currency: item.currency,
    amount: inputOf(item.amount, item.currency), cadence: item.cadence, anchorOn: item.anchorOn, recurring: item.kind === 'recurring' && !ended, paid: payments.length > 0,
  }
  const target = ended ? null : paidTarget(item, state, today, rate)
  return (
    <CostFrame title={item.name} closeHref={closeHref} {...(prevHref ? { prevHref } : {})} {...(nextHref ? { nextHref } : {})} footer={<CostFooter c={facts} today={today} target={target} />}>
      <div className="flex flex-wrap items-center gap-1.5">
        {ended ? <Badge>{item.kind === 'one_time' ? 'Removed' : `Ended ${dayText(item.endsOn!)}`}</Badge> : w && state.next ? <Badge tone={w.tone}>Due {dayText(state.next)}</Badge> : null}
        <Tag>{CATEGORY_WORDS[item.category as CostCategory] ?? item.category}</Tag>
        <span className="ml-auto"><CostHeaderMenu c={facts} today={today} /></span>
      </div>
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Amount</dt><dd className="font-num">{item.varies ? 'about ' : ''}{amountText(item.amount, item.currency)}{item.currency === 'USD' && rate ? <> · about {formatInr(paise(usdToPaise(item.amount, rate)))}</> : null}</dd>
        {item.kind === 'recurring' ? <><dt className="text-muted-foreground">Repeats</dt><dd>{CADENCE_WORDS[item.cadence!]}</dd></> : null}
        {item.vendor ? <><dt className="text-muted-foreground">Vendor</dt><dd>{item.vendor}</dd></> : null}
        {item.kind === 'recurring' && m !== null ? <><dt className="text-muted-foreground">Per year</dt><dd className="font-num">{formatInr(paise(Math.round(m * 12)))}</dd></> : null}
        {item.note ? <><dt className="text-muted-foreground">Note</dt><dd className="min-w-0 break-words">{item.note}</dd></> : null}
      </dl>
      <section aria-label="Payments" className="rounded-lg border border-line-soft">
        <h3 className="flex items-center gap-2 border-b border-line-soft px-3 py-2 text-label font-semibold">Payments <Tag>{payments.length}</Tag></h3>
        {payments.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">No payments yet. Mark a cost paid.</p> : (
          <ul className="divide-y divide-line-soft">
            {payments.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm"><span className="flex-1">{dayText(p.paidOn)}</span><Money paise={paise(p.inrPaise)} />
                {i === 0 ? <UndoPaymentButton itemId={item.id} paymentId={p.id} /> : <span className="w-14" aria-hidden="true" />}</li>
            ))}
          </ul>
        )}
      </section>
    </CostFrame>
  )
}
