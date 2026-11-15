import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { Empty } from '@/components/ui/empty'
import { Money, Numeric } from '@/components/data/numeric'
import { button } from '@/components/ui/button'
import { cheapestAt, costBar, costShareBps, planCostAt, summarize, type ChargeGroup } from '@/domains/billing/charges'
import { NUDGE_FLOOR } from '@/domains/billing/ladder'
import { paise } from '@/domains/money/paise'
import { formatBps } from '@/lib/format'
import { dayMonthIN, dayMonthLongIN, monthLongIN, monthShortIN } from '@/lib/format-date'
import { monthStartIST } from '@/domains/time/month'
import type { BillingOverview, Paying } from '@/lib/queries/billing'
import { billingHref } from './tabs'
import { SetUpAutopayDialog } from '../autopay'

const DAY = 86_400_000
export const GROUP_LABEL: Record<ChargeGroup, string> = { plan: 'Plan', apps: 'Apps', fees: 'Fee on delivered orders', credits: 'Credits', carry: 'Carried from last month' }
export const pct = formatBps

type Plan = { code: string; name: string; monthlyPrice: number; feeBps: number }

/** Overview (mockup § Overview): the next bill, the month so far, what Frrata cost each month, a cheaper plan, what's next. */
export function Overview({ o, paying, plans, now, canPay, method }: { o: BillingOverview; paying: Paying | null; plans: Plan[]; now: Date; canPay: boolean; method: string | null }) {
  const e = o.estimate === 'busy' ? null : o.estimate
  if (o.estimate === 'busy') return <Section><Empty title="We’re updating this bill. Reload in a minute." /></Section>
  if (!o.plan || !e) return <Section><Empty title="No plan yet. We set it when your store opens." /></Section>
  const monthStart = monthStartIST(now)
  // This month's delivered orders only (a late one from last month is billed too, but not counted here).
  const fromThisMonth = e.orders.filter((x) => x.billableAt >= monthStart)
  const sales = fromThisMonth.reduce((t, x) => t + x.base, 0), fee = fromThisMonth.reduce((t, x) => t + x.fee, 0)
  const s = summarize(e.bill.lines, e.bill.taxable, e.bill)
  const gst = e.bill.cgst + e.bill.sgst + e.bill.igst
  const daysLeft = Math.max(0, Math.ceil((e.invoiceOn.getTime() - now.getTime()) / DAY))
  const done = Math.min(100, Math.max(0, Math.round(((now.getTime() - monthStart.getTime()) / (e.invoiceOn.getTime() - monthStart.getTime())) * 100)))
  const last = o.history.at(-1)
  const share = last ? costShareBps(last.taxable, last.sales) : null
  // One verdict (charges.ts cheapestAt, the calculator's rule) at the last bill's delivered sales, against the plan on
  // now; shown only above the ladder's floor (₹500 before GST), never for a price agreed with Frrata.
  const cur = plans.find((p) => p.code === o.plan!.code)
  const best = last && cur && !o.plan.custom && last.sales > 0 ? cheapestAt(paise(last.sales), plans) : null
  const save = best && cur && last ? planCostAt(paise(last.sales), cur) - planCostAt(paise(last.sales), best) : 0
  const cheaper = best && best.code !== cur?.code && save >= NUDGE_FLOOR ? { p: best, save } : null
  const coming = [
    paying?.nextDebit ? { when: paying.nextDebit.at, what: <>Debit of <Money paise={paise(paying.nextDebit.amount)} decimals /> by {method}</> } : null,
    { when: e.invoiceOn, what: e.bill.rolled ? <>The bill is under ₹100 and moves to next month</> : <>Bill of <Money paise={paise(e.bill.total)} decimals /> so far</> },
    o.scheduled ? { when: o.scheduled.startsAt, what: <>You move to {o.scheduled.name}</> } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null)
  const max = Math.max(1, ...o.history.map((h) => h.plan + h.fees), s.beforeGst)
  const bars = [...o.history.map((h) => ({ key: h.id, label: monthShortIN(h.periodStart), plan: h.plan, fees: h.fees, sales: h.sales, open: false })),
    { key: 'open', label: `${monthShortIN(e.invoiceOn)} bill so far`, ...costBar(e.bill.lines), sales: e.bill.fees.reduce((t, f) => t + f.base, 0), open: true }]
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Next bill" action={<span className="text-sm text-muted-foreground">{dayMonthLongIN(e.invoiceOn)} · {daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}</span>}>
          <p><span className="font-num text-display font-semibold tracking-tight"><Money paise={paise(e.bill.total)} decimals /></span> <span className="text-muted-foreground">so far, with GST</span></p>
          <div role="img" aria-label={`${done}% of the month gone`} className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunk"><div className="h-full bg-chart" style={{ width: `${done}%` }} /></div>
          <table className="mt-2 w-full text-sm"><tbody>
            {s.rows.map((r) => <tr key={r.group} className="border-b border-line-soft"><td className="py-2.5">{GROUP_LABEL[r.group]}</td><td className="py-2.5 text-right"><Money paise={r.taxable} decimals /></td></tr>)}
            <tr><td className="py-2.5">GST 18%</td><td className="py-2.5 text-right"><Money paise={paise(gst)} decimals /></td></tr>
          </tbody></table>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">{method ? `Taken by ${method} on ${dayMonthLongIN(e.invoiceOn)}` : `Pay it from Invoices after ${dayMonthLongIN(e.invoiceOn)}`}</span>
            <span className="flex flex-wrap gap-2">
              <Link href={billingHref('charges')} className={button({ variant: 'ghost' })}>See every charge</Link>
              {!method && canPay ? <SetUpAutopayDialog /> : null}
            </span>
          </div>
        </Section>
        <Section title={`${monthLongIN(now)} so far`}>
          <dl className="grid grid-cols-2 gap-4">
            <Figure label="Delivered orders"><Numeric>{fromThisMonth.length.toLocaleString('en-IN')}</Numeric></Figure>
            <Figure label="Delivered sales"><Money paise={paise(sales)} /></Figure>
            <Figure label={`Fee so far · ${pct(o.plan.feeBps)}`}><Money paise={paise(fee)} /></Figure>
            <Figure label="Credited · came back or lost"><Numeric>{e.bill.credited.length.toLocaleString('en-IN')}</Numeric></Figure>
          </dl>
          {last && share !== null ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3.5">
              <span className="text-muted-foreground">Your {dayMonthIN(last.periodStart)} bill was</span>
              <span><span className="font-semibold">{pct(share)}</span> <span className="text-muted-foreground">of delivered sales</span></span>
            </div>
          ) : null}
        </Section>
      </div>

      {o.history.length ? (
        <Section title="What Frrata cost each month" action={<span className="flex items-center gap-3.5 text-small text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2.5 rounded-xs bg-chart" />Plan and apps</span>
          <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2.5 rounded-xs bg-chart-now" />Fee</span></span>}>
          <div className="grid h-56 items-end gap-3" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
            {bars.map((b) => {
              const share = costShareBps(b.plan + b.fees, b.sales)
              return (
                <div key={b.key} role="img" aria-label={`${b.label} · plan and apps ₹${(b.plan / 100).toLocaleString('en-IN')} · fee ₹${(b.fees / 100).toLocaleString('en-IN')}`} className="flex h-full flex-col items-center justify-end gap-1.5">
                  <span className="font-num text-small font-medium"><Money paise={paise(b.plan + b.fees)} /></span>
                  <div className={`flex w-full max-w-14 flex-col overflow-hidden rounded-t-md ${b.open ? 'outline-1 outline-offset-2 outline-dashed outline-input' : ''}`}>
                    <div className="bg-chart-now" style={{ height: `${Math.round((b.fees / max) * 140)}px` }} />
                    <div className="bg-chart" style={{ height: `${Math.round((b.plan / max) * 140)}px` }} />
                  </div>
                  <span className="text-small text-muted-foreground">{b.label}</span>
                  <span className="text-small text-muted-foreground">{share === null ? '—' : pct(share)}</span>
                </div>
              )
            })}
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-link">See as a table</summary>
            <table aria-label="What Frrata cost each month" className="mt-2 w-full"><thead className="text-left text-small text-muted-foreground"><tr><th scope="col" className="py-1 font-medium">Bill</th><th scope="col" className="py-1 text-right font-medium">Delivered sales</th><th scope="col" className="py-1 text-right font-medium">Plan and apps</th><th scope="col" className="py-1 text-right font-medium">Fee</th><th scope="col" className="py-1 text-right font-medium">Of sales</th></tr></thead>
              <tbody>{bars.map((b) => { const sh = costShareBps(b.plan + b.fees, b.sales); return <tr key={b.key} className="border-t border-line-soft"><td className="py-1.5">{b.label}</td><td className="py-1.5 text-right"><Money paise={paise(b.sales)} /></td><td className="py-1.5 text-right"><Money paise={paise(b.plan)} /></td><td className="py-1.5 text-right"><Money paise={paise(b.fees)} /></td><td className="py-1.5 text-right">{sh === null ? '—' : pct(sh)}</td></tr> })}</tbody></table>
          </details>
        </Section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {cheaper ? (
          <Section className="border-chart-now bg-select" title={<span className="text-select-foreground">{cheaper.p.name} would have cost <Money paise={paise(cheaper.save)} /> less on your last bill</span>}>
            <Link href={billingHref('plans')} className={button({ variant: 'secondary' })}>Compare plans</Link>
          </Section>
        ) : null}
        <Section title="Coming up">
          <ul>{coming.map((c, i) => <li key={i} className="flex gap-3 border-t border-line-soft py-2.5 first:border-0"><span className="w-14 flex-none text-muted-foreground">{dayMonthIN(c.when)}</span><span>{c.what}</span></li>)}</ul>
        </Section>
      </div>
    </div>
  )
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-label text-muted-foreground">{label}</dt><dd className="text-title font-semibold">{children}</dd></div>
}

