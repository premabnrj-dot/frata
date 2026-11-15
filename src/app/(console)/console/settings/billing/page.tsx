import Link from 'next/link'
import { pageRoles } from '@/domains/settings/groups'
import { Money } from '@/components/data/numeric'
import { SettingsHead } from '../_components/settings-head'
import { Panel } from '@/components/ui/panel'
import { Badge, Tag } from '@/components/ui/badge'
import { Banner } from '@/components/ui/banner'
import { button } from '@/components/ui/button'
import { ViewTabs } from '@/components/ui/view-tabs'
import { STATE_OPTIONS } from '@/domains/billing/details'
import { paise } from '@/domains/money/paise'
import { planCostAt } from '@/domains/billing/charges'
import { planChangeAdds, planChangeStarts } from '@/domains/billing/bill'
import { monthStartIST, nextMonthStartIST } from '@/domains/time/month'
import { MODULES, isModuleKey } from '@/domains/modules/registry'
import { formatInr } from '@/lib/format'
import { publicPlans } from '@/lib/db/platform'
import { requireMember } from '@/lib/auth/require-member'
import { dayIN, dayMonthLongIN, monthYearIN } from '@/lib/format-date'
import { errName } from '@/lib/log'
import { addonsFor, billingOverview, CHARGE_PAGE, issuedCharges, openChargeOrders, payingFor, shopTrial } from '@/lib/queries/billing'
import { TakeMoreDays } from './take-more-days'
import { billingGatewayIsTest, isBillingGatewayConfigured } from '@/lib/billing/gateway'
import { PayNow } from './autopay'
import { orderPrefixFor } from '@/lib/queries/orders'
import { BillingDetailsForm } from './details-form'
import { gstinState } from '@/domains/tax/gst'
import { frrataGstin } from '@/lib/billing/seller'
import { BILLING_TABS, billOf, billingHref, pageOf, tabOf } from './_components/tabs'
import { Overview, pct } from './_components/overview'
import { Charges, type ChargesBill } from './_components/charges'
import { Plans } from './_components/plans'
import { Invoices, Payment, filterOf, methodName } from './_components/invoices'
import type { PlanOption } from './plan-choice'

export const metadata = { title: 'Plan and billing' }
export const dynamic = 'force-dynamic'

/**
 * Console › Settings › Plan and billing (billing B1–B4; rework R1, spec docs/specs/2026-11-15-billing-rework.md, mockup
 * docs/mockups/2026-11-15-billing-rework/). Six tabs in the address (?tab=). Owners and admins only — staff and partners
 * never see money (the query refuses them too); a support visit reads, never pays or changes the plan.
 */
export default async function PlanAndBillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams
  // Apps A2: where an upgrade came from, as a boolean only (never rendered, logged or stored raw).
  const fromFeatured = q.from === 'featured'
  const tab = tabOf(q.tab)
  const auth = await requireMember(pageRoles('billing'))
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the store’s owner or a manager can see its plan and bills' : auth.message} />
  const now = new Date()
  const m = auth.membership
  const [o, prefix, paying, trial, plans] = await Promise.all([
    billingOverview(m, now).catch((e) => { console.error('[billing page]', errName(e)); return null }),
    orderPrefixFor(m.tenantId),
    payingFor(m, now).catch(() => null),
    shopTrial(m, now).catch(() => null),
    publicPlans().catch((e) => { console.error('[billing page] plans', errName(e)); return [] as Awaited<ReturnType<typeof publicPlans>> }),
  ])
  if (!o) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  const configured = isBillingGatewayConfigured(), test = billingGatewayIsTest()
  // Autopay and Pay now: only with Frrata's gateway connected, never on a Frrata support visit (finding 10).
  const canPay = configured && !m.supportSessionId
  const method = paying?.mandate ? methodName(paying.mandate.method) : null
  const due = o.invoices.find((i) => i.state === 'due' && i.testMode === test)
  const e = o.estimate === 'busy' ? null : o.estimate

  const head = (
    <SettingsHead page="billing" role={m.role}
      badges={<>
        {o.plan ? <Tag>{o.plan.name} · {formatInr(paise(o.plan.monthlyPrice))} a month + {pct(o.plan.feeBps)}</Tag> : null}
        {trial && trial.state !== 'paid' ? <Badge tone={trial.state === 'grace' || trial.state === 'paused' ? 'danger' : 'info'}>{trial.state === 'building' ? 'Trial starts when your store goes live' : trial.state === 'grace' || trial.state === 'paused' ? `Trial ended · ${trial.state === 'paused' ? 'paused' : `pauses ${dayIN(trial.pausesAt)}`}` : `Trial · ${trial.daysLeft} days left`}</Badge> : null}
        <Badge tone={method ? 'ok' : 'neutral'}>{method ? 'Autopay on' : 'Autopay off'}</Badge>
        {test ? <Badge tone="info">Test payments</Badge> : null}
      </>}
      actions={<>{trial?.mayExtend && !m.supportSessionId ? <TakeMoreDays /> : null}<Link href={billingHref('plans')} className={button({ variant: 'secondary' })}>Compare plans</Link></>} />
  )

  let body: React.ReactNode
  if (tab === 'overview') {
    body = <Overview o={o} paying={paying} plans={plans} now={now} canPay={canPay} method={method} />
  } else if (tab === 'charges') {
    const id = billOf(q.bill), page = pageOf(q.page)
    const picks = [...(e ? [{ id: 'open', label: `${dayMonthLongIN(e.invoiceOn)} · so far` }] : []), ...o.invoices.slice(0, 12).map((i) => ({ id: i.id, label: monthYearIN(i.periodStart) }))]
    let bill: ChargesBill | null = null
    if (id === 'open' && e) {
      // The open bill holds at most a month of orders; the list stops at 2,000 (said in the count) and pages 50 at a time.
      const all = await openChargeOrders(m, e.bill.fees)
      bill = { id: 'open', title: `Bill of ${dayMonthLongIN(e.invoiceOn)} · so far`, status: { tone: 'neutral', label: 'Not issued yet' }, lines: e.bill.lines, taxable: e.bill.taxable,
        cgst: e.bill.cgst, sgst: e.bill.sgst, igst: e.bill.igst, total: e.bill.total, orders: all.slice(page * CHARGE_PAGE, (page + 1) * CHARGE_PAGE), orderCount: all.length, credits: [], page, pageSize: CHARGE_PAGE,
        totals: { base: e.bill.fees.reduce((t, f) => t + f.base, 0), fee: e.bill.fees.reduce((t, f) => t + f.fee, 0) } }
    } else if (id !== 'open') {
      const c = await issuedCharges(m, id, page)
      const inv = o.invoices.find((i) => i.id === id)
      if (c) bill = { id, title: `Bill of ${dayMonthLongIN(c.invoice.periodStart)} · ${c.invoice.number}`, status: inv?.state === 'due' ? { tone: 'warn', label: 'Due' } : inv?.state === 'paid' ? { tone: 'ok', label: 'Paid' } : { tone: 'neutral', label: c.invoice.testMode ? 'Test' : 'Issued' },
        lines: c.lines, taxable: c.invoice.taxable, cgst: c.invoice.cgst, sgst: c.invoice.sgst, igst: c.invoice.igst, total: c.invoice.total, orders: c.orders, orderCount: c.orderCount, credits: page === 0 ? c.credits : [], page, pageSize: CHARGE_PAGE, totals: c.totals }
    }
    body = bill ? <Charges picks={picks} bill={bill} view={q.view === 'items' ? 'items' : 'orders'} prefix={prefix} /> : <Panel title="That bill isn’t here">Pick a bill above, or go back to Overview.</Panel>
  } else if (tab === 'plans') {
    const addons = await addonsFor(m, now).catch((err) => { console.error('[billing page] add-ons', errName(err)); return { prices: {}, on: [] as string[] } })
    const cur = o.plan
    const names = (keys: string[]) => keys.filter(isModuleKey).map((k) => MODULES[k].name)
    const curPlan = plans.find((p) => p.code === cur?.code)
    const curFeatures = curPlan?.features ?? []
    const lastSales = o.history.at(-1)?.sales ?? 0
    const options: PlanOption[] = cur ? plans.filter((p) => p.code !== cur.code).map((p) => {
      const target = { planCode: p.code as never, name: p.name, monthlyPrice: paise(p.monthlyPrice), includedOrders: p.includedOrders, feeBps: p.feeBps }
      const latest = [...o.forChange.plans].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0]
      const starts = latest ? planChangeStarts(latest, target, now, nextMonthStartIST(now)) : now
      // The figure the next invoice carries: the same rule (planChangeAdds), never the page's own arithmetic.
      const d = planChangeAdds(o.forChange.plans, target, now, monthStartIST(now), nextMonthStartIST(now), o.forChange.billed)
      const upgrade = p.monthlyPrice > cur.monthlyPrice
      return { code: p.code, name: p.name, price: formatInr(paise(p.monthlyPrice)), fee: pct(p.feeBps), upgrade,
        difference: d > 0 ? formatInr(d) : null, afterTrial: starts.getTime() > now.getTime() && upgrade ? dayMonthLongIN(starts) : null,
        gains: names(p.features.filter((f) => !curFeatures.includes(f))), loses: names(curFeatures.filter((f) => !p.features.includes(f))),
        lastBill: lastSales > 0 && curPlan ? [formatInr(planCostAt(paise(lastSales), p)), formatInr(planCostAt(paise(lastSales), curPlan))] : null }
    }) : []
    const recent = o.history.slice(-3).filter((h) => h.sales > 0)
    const mine = recent.length ? Math.round(recent.reduce((t, h) => t + h.sales, 0) / recent.length) : null
    body = <Plans plans={plans} current={cur?.code ?? null} custom={!!cur?.custom} options={options} downgradeOn={dayMonthLongIN(o.forChange.downgradeOn)}
      scheduled={o.scheduled ? { name: o.scheduled.name, on: dayMonthLongIN(o.scheduled.startsAt), byShop: o.scheduled.byShop } : null}
      fromFeatured={fromFeatured} mine={mine} prices={addons.prices} on={addons.on} readOnly={!!m.supportSessionId} />
  } else if (tab === 'invoices') {
    body = <Invoices invoices={o.invoices} show={filterOf(q.show)} canPay={canPay} testGateway={test} />
  } else if (tab === 'payment') {
    body = <Payment paying={paying} payments={o.payments} canPay={canPay} configured={configured} supportVisit={!!m.supportSessionId} />
  } else {
    body = <BillingDetailsForm initial={o.details} states={STATE_OPTIONS.map(([c, l]) => [c, l])} frrataState={gstinState(frrataGstin())} />
  }

  return (
    <div className="max-w-5xl space-y-5">
      {head}
      {due ? (
        <Banner tone="warn" title={<>{monthYearIN(due.periodStart)} bill of <Money paise={paise(due.due)} decimals /> is due</>}
          action={canPay ? <PayNow invoiceId={due.id} /> : <Link href={billingHref('invoices', { show: 'due' })}>See invoices</Link>} />
      ) : null}
      <ViewTabs label="Plan and billing" scroll tabs={BILLING_TABS.map(([k, label]) => ({ href: billingHref(k), label, current: k === tab, count: k === 'invoices' && due ? 1 : undefined }))} />
      {body}
    </div>
  )
}
