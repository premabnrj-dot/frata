import { Money, Numeric } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Panel } from '@/components/ui/panel'
import { STATE_OPTIONS } from '@/domains/billing/details'
import { STATE_LABEL } from '@/domains/billing/status'
import { paise } from '@/domains/money/paise'
import { usage } from '@/domains/plans/entitlements'
import { planChangeAdds } from '@/domains/billing/bill'
import { monthStartIST, nextMonthStartIST } from '@/domains/time/month'
import { formatInr, formatPercent } from '@/lib/format'
import { publicPlans } from '@/lib/db/platform'
import { PlanChoice } from './plan-choice'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { dayIN, dayMonthLongIN, monthYearIN } from '@/lib/format-date'
import { errName } from '@/lib/log'
import { billingOverview, payingFor } from '@/lib/queries/billing'
import { billingGatewayIsTest, isBillingGatewayConfigured } from '@/lib/billing/gateway'
import { PayNow, SetUpAutopay, StopAutopay } from './autopay'
import { orderPrefixFor } from '@/lib/queries/orders'
import { BillingDetailsForm } from './details-form'

export const metadata = { title: 'Plan and billing' }
export const dynamic = 'force-dynamic'

/**
 * Console › Settings › Plan and billing (billing B1; mockup docs/mockups/2026-11-08-billing.html). Owners and admins
 * only — staff and partners never see money (the query refuses them too). Test mode: nothing is charged yet, and the
 * page says so where Paying and Invoices will be.
 */
export default async function PlanAndBillingPage() {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the shop’s owner or an admin can see its plan and bills' : auth.message} />
  const now = new Date()
  const [o, prefix, paying] = await Promise.all([
    billingOverview(auth.membership, now).catch((e) => { console.error('[billing page]', errName(e)); return null }),
    orderPrefixFor(auth.membership.tenantId),
    payingFor(auth.membership, now).catch(() => null),
  ])
  const plans = await publicPlans().catch((e) => { console.error('[billing page] plans', errName(e)); return [] as Awaited<ReturnType<typeof publicPlans>> })
  // Autopay and Pay now: only with Frrata's gateway connected, never on a Frrata support visit (finding 10).
  const canPay = isBillingGatewayConfigured() && !auth.membership.supportSessionId
  const METHOD: Record<string, string> = { upi: 'UPI Autopay', card: 'Card', emandate: 'Bank mandate (eNACH)' }
  if (!o) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const e = o.estimate === 'busy' ? null : o.estimate
  // This month's delivered orders only (a late order from last month is billed too, and listed, but not counted here),
  // so the value matches the count beside it.
  const monthStart = e ? new Date(e.bill.lines.find((l) => l.kind === 'fee')?.periodStart ?? e.invoiceOn) : now
  const thisMonthOrders = e?.orders.filter((x) => x.billableAt >= monthStart) ?? []
  const feeSoFar = thisMonthOrders.reduce((t, x) => t + x.fee, 0)
  const delivered = thisMonthOrders.reduce((t, x) => t + x.base, 0)
  const thisMonth = monthYearIN(now)
  const gst = e ? e.bill.cgst + e.bill.sgst + e.bill.igst : 0
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Plan and billing" back={{ href: '/console/settings', label: 'Settings' }} />
      <p className="-mt-2 text-sm text-muted-foreground">Only owners and admins see this page. Frrata is not charging yet: billing is in test mode, and these are estimates.</p>

      <Section>
        <h2 className="text-section font-semibold">{thisMonth} so far</h2>
        {o.estimate === 'busy' ? <p className="text-sm text-muted-foreground">Frrata is updating this estimate right now. Reload in a moment.</p>
          : !o.plan || !e ? <p className="text-sm text-muted-foreground">No plan yet, so nothing to bill. Frrata sets your plan when your shop opens.</p> : (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-muted-foreground">Delivered orders</dt><dd className="text-lg font-semibold"><Numeric>{e.bill.usage.orders.toLocaleString('en-IN')}</Numeric> <span className="text-sm font-normal text-muted-foreground">of {e.bill.usage.included.toLocaleString('en-IN')} included</span></dd></div>
              <div><dt className="text-muted-foreground">Delivered value</dt><dd className="text-lg font-semibold"><Money paise={paise(delivered)} /></dd></div>
              <div><dt className="text-muted-foreground">Fee so far</dt><dd className="text-lg font-semibold"><Money paise={paise(feeSoFar)} decimals /></dd></div>
            </dl>
            {usage(e.bill.usage.orders, e.bill.usage.included).over && <p className="text-sm text-warn-text">Over your plan&apos;s included orders. You keep selling: each delivered order pays the same fee, and nothing extra is charged for going over.</p>}
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              {e.bill.rolled
                ? <>Your bill on {dayMonthLongIN(e.invoiceOn)} would be under ₹100: it rolls to the next month instead of a tiny invoice.</>
                : <>Estimated bill on {dayMonthLongIN(e.invoiceOn)}: <strong><Money paise={paise(e.bill.total)} decimals /></strong> including GST.</>}
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">How it adds up</summary>
              <table className="mt-2 w-full">
                <tbody>
                  {e.bill.lines.map((l, i) => <tr key={i} className="border-t border-border"><td className="py-1.5 pr-3">{l.description}</td><td className="py-1.5 text-right"><Money paise={paise(l.taxable)} decimals /></td></tr>)}
                  {!e.bill.rolled && <tr className="border-t border-border"><td className="py-1.5 pr-3">GST 18%</td><td className="py-1.5 text-right"><Money paise={paise(gst)} decimals /></td></tr>}
                </tbody>
              </table>
              {e.orders.length > 0 && (
                <>
                  <p className="mt-3 text-muted-foreground">Each delivered order pays its fee once: delivered, or 30 days after it shipped if no outcome was marked. An order that comes back later is credited on a later bill.</p>
                  <table className="mt-1 w-full">
                    <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 font-medium">Order</th><th className="py-1 text-right font-medium">Value</th><th className="py-1 text-right font-medium">Fee</th></tr></thead>
                    <tbody>
                      {e.orders.slice(0, 200).map((x) => (
                        <tr key={x.number} className="border-t border-border"><td className="py-1 font-mono">{prefix}-{x.number}</td><td className="py-1 text-right"><Money paise={paise(x.base)} decimals /></td><td className="py-1 text-right"><Money paise={paise(x.fee)} decimals /> <span className="text-xs text-muted-foreground">{formatPercent(x.feeBps / 10_000, x.feeBps % 100 === 0 ? 0 : 1)}</span></td></tr>
                      ))}
                    </tbody>
                  </table>
                  {e.orders.length > 200 && <p className="mt-1 text-xs text-muted-foreground">The first 200 of {e.orders.length.toLocaleString('en-IN')} are shown.</p>}
                </>
              )}
            </details>
          </>
        )}
      </Section>

      <Section>
        <h2 className="text-section font-semibold">Your plan</h2>
        {o.plan ? (
          <>
            <p className="text-sm"><strong>{o.plan.name}</strong> · <Money paise={paise(o.plan.monthlyPrice)} /> a month · {o.plan.includedOrders.toLocaleString('en-IN')} orders included · {formatPercent(o.plan.feeBps / 10_000, o.plan.feeBps % 100 === 0 ? 0 : 1)} of each delivered order&apos;s value (before GST and delivery)</p>
            {o.plan.trialEndsAt && o.plan.trialEndsAt > now && <p className="text-sm text-ok-text">Free trial until {dayIN(o.plan.trialEndsAt)}: the plan costs nothing until then.</p>}
            {o.plan.custom || auth.membership.supportSessionId || plans.length === 0
              ? <p className="text-xs text-muted-foreground">{o.plan.custom ? 'Your price was agreed with Frrata. To change your plan, message Frrata.' : auth.membership.supportSessionId ? 'A Frrata support visit cannot change the shop’s plan.' : 'Plans could not be loaded. Try again in a minute.'}</p>
              : <PlanChoice downgradeOn={dayMonthLongIN(o.forChange.downgradeOn)}
                  scheduled={o.scheduled ? { name: o.scheduled.name, on: dayMonthLongIN(o.scheduled.startsAt), byShop: o.scheduled.byShop } : null}
                  options={plans.filter((p) => p.code !== o.plan!.code).map((p) => ({
                    code: p.code, name: p.name, price: formatInr(paise(p.monthlyPrice)), included: p.includedOrders.toLocaleString('en-IN'),
                    fee: formatPercent(p.feeBps / 10_000, p.feeBps % 100 === 0 ? 0 : 1), upgrade: p.monthlyPrice > o.plan!.monthlyPrice,
                    // The figure the next invoice carries: the same rule (planChangeAdds), never the page's own arithmetic.
                    difference: (() => { const d = planChangeAdds(o.forChange.plans, { planCode: p.code as never, name: p.name, monthlyPrice: paise(p.monthlyPrice), includedOrders: p.includedOrders, feeBps: p.feeBps }, now, monthStartIST(now), nextMonthStartIST(now), o.forChange.billed); return d > 0 ? formatInr(d) : null })(),
                  }))} />}
          </>
        ) : <p className="text-sm text-muted-foreground">No plan yet.</p>}
      </Section>

      <Section>
        <h2 className="text-section font-semibold">Paying</h2>
        {!isBillingGatewayConfigured() ? <p className="text-sm text-muted-foreground">Nothing to set up yet. When billing starts, you choose UPI Autopay, a card or a bank mandate (eNACH) here, and Frrata tells you each amount before it is taken.</p>
          : paying?.mandate ? (
            <div className="space-y-1 text-sm">
              <p><strong>{METHOD[paying.mandate.method] ?? paying.mandate.method}</strong> · <span className="text-ok-text">Active</span> · up to <Money paise={paise(paying.mandate.max)} /> a debit · since {dayIN(paying.mandate.since)}</p>
              {paying.nextDebit && <p>Next debit <Money paise={paise(paying.nextDebit.amount)} decimals /> on {dayIN(paying.nextDebit.at)}. You were told a day ahead, as the RBI rules ask.</p>}
              {canPay && <StopAutopay />}
            </div>
          ) : canPay ? <SetUpAutopay /> : <p className="text-sm text-muted-foreground">No autopay. {auth.membership.supportSessionId ? 'Only the shop’s owner or an admin can set it up.' : ''}</p>}
        {billingGatewayIsTest() && <p className="mt-1 text-xs text-muted-foreground">Test gateway: no real money moves.</p>}
      </Section>

      <Section>
        <h2 className="text-section font-semibold">Invoices</h2>
        {o.invoices.length === 0 ? <p className="text-sm text-muted-foreground">No invoices yet. Frrata&apos;s invoices to you appear here, one each month, with a PDF. Until billing starts, any invoice here is a test and is never collected.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 font-medium">Month</th><th className="py-1 font-medium">Invoice</th><th className="py-1 text-right font-medium">Amount</th><th className="py-1 font-medium">Status</th><th className="py-1"><span className="sr-only">PDF</span></th></tr></thead>
            <tbody>{o.invoices.map((i) => (
              <tr key={i.id} className="border-t border-border align-top">
                <td className="py-1.5">{monthYearIN(i.periodStart)}</td>
                <td className="py-1.5 font-mono">{i.number}{i.credits.map((c) => <a key={c.number} href={`/console/settings/billing/invoice/${i.id}?credit=${encodeURIComponent(c.number)}`} className="block text-xs text-muted-foreground underline">Credit note {c.number}</a>)}</td>
                <td className="py-1.5 text-right"><Money paise={paise(i.total)} decimals /></td>
                <td className="py-1.5">{i.testMode ? <span className="text-muted-foreground">{i.state === 'due' && billingGatewayIsTest() ? <>Test · due <Money paise={paise(i.due)} decimals /> (test money)</> : i.state === 'due' ? 'Test — never collected' : `Test · ${STATE_LABEL[i.state].toLowerCase()}`}</span> : i.state === 'due' ? <span className="text-warn-text">Due <Money paise={paise(i.due)} decimals /></span> : STATE_LABEL[i.state]}</td>
                <td className="py-1.5 text-right"><a href={`/console/settings/billing/invoice/${i.id}`} className="underline">PDF</a>{canPay && i.state === 'due' && i.testMode === billingGatewayIsTest() ? <div className="mt-1"><PayNow invoiceId={i.id} /></div> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      <BillingDetailsForm initial={o.details} states={STATE_OPTIONS.map(([c, l]) => [c, l])} />
    </div>
  )
}
