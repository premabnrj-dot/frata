import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Banner } from '@/components/ui/banner'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { Empty } from '@/components/ui/empty'
import { Money, Numeric } from '@/components/data/numeric'
import { partnerCan } from '@/domains/partners/team'
import { budgetState, LOW_BANNER, seatState, nextPeriodEnd } from '@/domains/studio/credits'
import { FREE_CREDITS, SEAT_PLANS, withGst, type SeatPlan } from '@/domains/studio/prices'
import { stateName } from '@/domains/tax/gstin'
import { paise } from '@/domains/money/paise'
import { BUILDER_REFUSED } from '@/domains/tenancy/roles'
import { requirePartner } from '@/lib/auth/require-partner'
import { budgets, overview, payments, usage, type BudgetRow, type Overview, type PurchaseRow } from '@/lib/db/partner-credits'
import { realMoney } from '@/lib/studio/purchase'
import { dayIN, dayMonthIN, monthLongIN, monthShortIN } from '@/lib/format-date'
import { istDayKey } from '@/domains/time/day'
import { formatInr } from '@/lib/format'
import lazy from 'next/dynamic'

// The dialogs and switches load after the first paint (speed review L2; the partner pages' 150 kB script budget).
const parts = () => import('./credits-parts')
const Alerts = lazy(() => parts().then((m) => m.Alerts))
const BuyCredits = lazy(() => parts().then((m) => m.BuyCredits))
const CancelSeat = lazy(() => parts().then((m) => m.CancelSeat))
const ChangePlan = lazy(() => parts().then((m) => m.ChangePlan))
const EditDetails = lazy(() => parts().then((m) => m.EditDetails))
const KeepSeat = lazy(() => parts().then((m) => m.KeepSeat))
const RaiseBudget = lazy(() => parts().then((m) => m.RaiseBudget))
const SetBudget = lazy(() => parts().then((m) => m.SetBudget))
const SiteBudget = lazy(() => parts().then((m) => m.SiteBudget))
const StartSeat = lazy(() => parts().then((m) => m.StartSeat))
import { USE_WORDS } from './words'

// =============================================================================
// FILE: credits/page.tsx — Partner workspace › Credits and billing (C1·4; approved mockups docs/mockups/2026-11-22-four-
// screens.html § 1 over 2026-11-13-studio-v2.html, and docs/mockups/2026-11-22-c1-undrawn.html). Five tabs in the address
// for the partner owner; a Lead sees Client budgets only, for its own clients; a Builder this page's refusal. Every figure
// comes from the definers (drizzle/0164) for the caller's own partner; nothing here is cached.
// =============================================================================

export const metadata = { title: 'Credits and billing' }
export const dynamic = 'force-dynamic'

const TABS = [['overview', 'Overview'], ['usage', 'Usage'], ['budgets', 'Client budgets'], ['payments', 'Payments and invoices'], ['plan', 'Plan']] as const
type Tab = (typeof TABS)[number][0]
const PLAN_ROWS: [SeatPlan | 'partner', string][] = [['partner', 'Partner'], ['studio', SEAT_PLANS.studio.name], ['plus', SEAT_PLANS.plus.name]]

const failedPanel = (href: string) => <Panel title="We couldn’t load billing" action={<Link href={href} className={button({ variant: 'secondary', size: 'sm' })}>Try again</Link>}>Your balance and payments are safe.</Panel>

const lotWords = (l: Overview['lots'][number]) =>
  l.kind === 'seat' ? `${monthLongIN(l.createdAt)} seat` : l.kind === 'pack' ? `Pack bought ${dayMonthIN(l.createdAt)}` : l.kind === 'credits' ? `Credits bought ${dayMonthIN(l.createdAt)}`
    : l.kind === 'grant' ? 'Free credits' : 'Credits returned'

function purchaseWords(p: PurchaseRow) {
  const what = p.kind === 'pack' || p.kind === 'credits' ? `${p.credits.toLocaleString('en-IN')} credits` : `${SEAT_PLANS[p.plan ?? 'studio'].name}, ${monthLongIN(p.at)}`
  const chip = p.refundedAt ? <Badge tone="neutral">Refunded</Badge> : p.refundDue ? <Badge tone="warn">Refund on its way</Badge>
    : p.paidAt ? (p.test ? <Badge tone="info">Test</Badge> : null) : p.failedAt ? <Badge tone="danger">Didn’t go through</Badge>
    : p.closedAt ? <Badge tone="neutral">Not paid · nothing charged</Badge> : <Badge tone="warn">Waiting for the bank</Badge>
  return { what, chip }
}

export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string; client?: string; buy?: string }> }) {
  const auth = await requirePartner()
  if (!auth.ok) return <Panel title={auth.message} />
  const me = auth
  const role = auth.partner.memberRole
  if (!partnerCan(role, 'budgets')) return <><PageHeader title="Credits and billing" /><Panel title={BUILDER_REFUSED} /></>
  const owner = partnerCan(role, 'credits')
  const q = await searchParams
  const tab: Tab = !owner ? 'budgets' : (TABS.find(([k]) => k === q.tab)?.[0] ?? 'overview')
  const href = (t: Tab) => `/partner/credits${t === 'overview' ? '' : `?tab=${t}`}`
  const tabs = <ViewTabs label="Credits and billing" scroll tabs={(owner ? TABS : TABS.filter(([k]) => k === 'budgets')).map(([k, l]) => ({ href: href(k), label: l, current: k === tab }))} />
  const now = new Date()
  const header = <PageHeader title="Credits and billing" />

  // ── A Lead: client budgets for its own clients (owner call 3) ──
  if (!owner) {
    const b = await budgets(auth)
    if (!b.ok) return <>{header}{tabs}{failedPanel('/partner/credits')}</>
    const ownerFirst = (auth.partner.name || 'the owner').split(' ')[0] ?? 'the owner'
    return <>{header}{tabs}<div className="mt-4 grid gap-4">
      {b.value.length === 0 ? <Empty picto="clients" title="No clients yet" /> : b.value.map((r) => <BudgetCard key={r.linkId} r={r} owner={false} ownerFirst={ownerFirst} />)}
    </div></>
  }

  // The tab's own read starts with the overview, never after it (speed review 2026-11-23: they don't depend on each other).
  const usageMonth = /^20\d{2}-(0[1-9]|1[0-2])$/.test(q.month ?? '') ? `${q.month}-01` : `${istDayKey(now).slice(0, 7)}-01`
  const tabRead = {
    usage: tab === 'usage' ? usage(me, usageMonth, null, 200) : null,
    budgets: tab === 'budgets' ? budgets(me) : null,
    payments: tab === 'payments' ? payments(me) : null,
  }
  // A read left unawaited (the overview failed) is never an unhandled rejection.
  for (const r of Object.values(tabRead)) r?.catch(() => undefined)
  const o = await overview(auth, realMoney())
  if (!o.ok) return <>{header}{tabs}{failedPanel(href(tab))}</>
  const v = o.value
  const seat = v.seat ? { plan: v.seat.plan, periodEnd: v.seat.periodEnd, cancelAt: v.seat.cancelAt, failedAt: v.seat.failedAt, endedAt: null, nextPlan: v.seat.nextPlan } : null
  const state = seatState(seat, now)
  const planName = v.seat && state !== 'partner' ? SEAT_PLANS[v.seat.plan].name : 'Partner'
  const renewTotal = v.seat ? withGst(SEAT_PLANS[v.seat.nextPlan ?? v.seat.plan].price) : 0

  const banners = <>
    {v.renewalFailed && state === 'failed' && <Banner tone="warn" className="mt-3" title={`The ${dayMonthIN(v.renewalFailed.forPeriodEnd)} payment didn’t go through. Your credits still work.`}
      action={<StartSeat plan={v.seat!.plan} renews={dayMonthIN(nextPeriodEnd(now))} label={`Pay ${formatMoney(v.renewalFailed.total)}`} />} />}
    {state === 'ending' && v.seat?.cancelAt && <Banner tone="info" className="mt-3" title={`${planName} ends on ${dayMonthIN(v.seat.cancelAt)}. Your credits stay until their use-by dates.`}
      action={<KeepSeat plan={planName} />} />}
    {v.balance < LOW_BANNER && !(v.balance === FREE_CREDITS && onlyFree(v)) && <Banner tone="warn" className="mt-3" title={`${v.balance} credits left. Turns that need more will wait.`} action={<BuyCredits detailsFirst={!v.hasDetails} />} />}
  </>

  return <>{header}{banners}{tabs}<div className="mt-4">{await body()}</div></>

  async function body() {
    if (tab === 'overview') {
      const total = v.balance + v.held + v.used
      return <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid gap-4">
          <Section title="Balance" action={<BuyCredits startOpen={q.buy === '1'} detailsFirst={!v.hasDetails} />}>
            <div className="grid gap-2">
              <b className="text-display font-semibold"><Numeric>{onlyFree(v) ? `${v.balance} free credits` : `${v.balance.toLocaleString('en-IN')} credits`}</Numeric></b>
              <div className="h-2 overflow-hidden rounded-full bg-sunk" aria-hidden="true"><i className="block h-full bg-primary" style={{ width: `${total ? Math.round((v.balance / total) * 100) : 0}%` }} /></div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Available</dt><dd className="font-num text-right">{v.balance.toLocaleString('en-IN')}</dd>
                <dt className="text-muted-foreground">Held by {v.heldBy} running {v.heldBy === 1 ? 'turn' : 'turns'}</dt><dd className="font-num text-right">{v.held.toLocaleString('en-IN')}</dd>
                <dt className="text-muted-foreground">Used since {dayMonthIN(v.usedSince)}</dt><dd className="font-num text-right">{v.used.toLocaleString('en-IN')}</dd>
              </dl>
            </div>
          </Section>
          <Section title="Credits by use-by date">
            {v.lots.length === 0 ? <p className="text-sm text-muted-foreground">No credits yet.</p> :
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">{v.lots.map((l, i) => <div key={i} className="contents">
                <dt className="text-muted-foreground">{lotWords(l)} · use by {dayIN(l.expiresAt)}{l.test ? ' · test' : ''}</dt><dd className="font-num text-right">{l.left} of {l.credits}</dd></div>)}</dl>}
          </Section>
        </div>
        <div className="grid gap-4">
          <Section title={<span className="flex items-center gap-2">Plan <Badge tone="neutral">{planName}</Badge></span>}>
            {v.seat && state !== 'partner' ? <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground"><Money paise={SEAT_PLANS[v.seat.plan].price} /> + GST a month</dt><dd className="font-num text-right">{SEAT_PLANS[v.seat.plan].credits} credits a month</dd>
              <dt className="text-muted-foreground">{state === 'ending' ? 'Ends' : 'Renews'}</dt><dd className="text-right">{dayMonthIN(state === 'ending' ? v.seat.cancelAt! : v.seat.periodEnd)}{state === 'ending' ? '' : ` · ${formatMoney(renewTotal)}`}</dd>
              <dt className="text-muted-foreground">Pays by</dt><dd className="text-right">{v.mandate?.method === 'card' ? 'Card' : 'UPI AutoPay'}</dd>
              {v.seat.nextPlan && state === 'active' && <><dt className="text-muted-foreground">From {dayMonthIN(v.seat.periodEnd)}</dt><dd className="text-right">{SEAT_PLANS[v.seat.nextPlan].name}</dd>
                <dd className="col-span-2"><ChangePlan to={v.seat.plan} from="" credits={0} label={`Stay on ${SEAT_PLANS[v.seat.plan].name}`} variant="ghost" /></dd></>}
            </dl> : <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm"><dt className="text-muted-foreground">Free</dt><dd className="text-right">{FREE_CREDITS} credits, once</dd></dl>}
          </Section>
          <Section title="Alerts"><Alerts low={v.alerts.low} budget={v.alerts.budget} /></Section>
        </div>
      </div>
    }

    if (tab === 'usage') {
      const month = usageMonth
      const r = (await tabRead.usage)!
      if (!r.ok) return failedPanel(href('usage'))
      const u = r.value
      const prev = new Date(`${month}T12:00:00+05:30`); prev.setMonth(prev.getMonth() - 1)
      const monthKey = (d: Date) => istDayKey(d).slice(0, 7)
      const rows = [
        ...u.uses.map((x) => ({ at: x.at, left: `${x.client} · ${USE_WORDS[x.what]}${x.who ? ` · ${x.who.split('@')[0]}` : ''}`,
          right: x.returned ? <Badge tone="neutral">Returned {x.reserved}</Badge> : x.closed ? `${x.estimate ? `≈ ${x.estimate} → ` : ''}${x.charged}` : `Held ${x.reserved}` })),
        ...u.added.map((a) => ({ at: a.at, left: a.kind === 'grant' ? 'Free credits' : a.kind === 'seat' ? `${monthLongIN(a.at)} seat` : `Bought ${dayMonthIN(a.at)}`, right: `+${a.credits}` })),
        // A seat lot is named by its month, as drawn ("October seat"): it was given 12 months before it ended.
        ...u.ended.map((e) => ({ at: e.at, left: `${e.kind === 'seat' ? `${monthLongIN(yearBefore(e.at))} seat` : e.kind === 'grant' ? 'Free credits' : 'Credits'} · past its use-by date`, right: `−${e.credits}` })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime())
      return <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/partner/credits?tab=usage&month=${monthKey(now)}`} aria-current={month.startsWith(monthKey(now)) ? 'page' : undefined} className={button({ variant: month.startsWith(monthKey(now)) ? 'primary' : 'secondary', size: 'sm' })}>{monthShortIN(now)}</Link>
          <Link href={`/partner/credits?tab=usage&month=${monthKey(prev)}`} aria-current={month.startsWith(monthKey(prev)) ? 'page' : undefined} className={button({ variant: month.startsWith(monthKey(prev)) ? 'primary' : 'secondary', size: 'sm' })}>{monthShortIN(prev)}</Link>
          <a href={`/partner/credits/usage.csv?month=${month}`} className={`${button({ variant: 'secondary', size: 'sm' })} ml-auto`}>Download CSV</a>
        </div>
        {rows.length === 0 ? <Empty title="No usage yet" /> : <Section><dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">{rows.map((x, i) => <div key={i} className="contents">
          <dt className="text-muted-foreground">{x.left}</dt><dd className="font-num text-right">{x.right}</dd></div>)}</dl></Section>}
      </div>
    }

    if (tab === 'budgets') {
      const b = (await tabRead.budgets)!
      if (!b.ok) return failedPanel(href('budgets'))
      return <div className="grid gap-4">
        {b.value.length === 0 ? <Empty picto="clients" title="No clients yet" /> : b.value.map((r) => <BudgetCard key={r.linkId} r={r} owner ownerFirst="" />)}
        <Section title="New websites" action={<SiteBudget credits={v.newSiteBudget} />}>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-sm"><dt className="text-muted-foreground">Start at</dt><dd className="font-num text-right">{v.newSiteBudget} credits</dd></dl>
        </Section>
      </div>
    }

    if (tab === 'payments') {
      const r = (await tabRead.payments)!
      if (!r.ok) return failedPanel(href('payments'))
      const p = r.value
      const d = p.details
      return <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Section ariaLabel="Payments and invoices">
          {p.purchases.length === 0 ? <p className="text-sm text-muted-foreground">No invoices yet.</p> :
            <ul className="grid gap-2 text-sm">{p.purchases.map((x) => { const w = purchaseWords(x); return <li key={x.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">{dayMonthIN(x.at)} · {w.what}</span>
              <span className="flex items-center gap-2"><Money paise={x.total} decimals />{w.chip}{x.invoiceId && x.invoiceNumber &&
                <a href={`/partner/credits/invoice/${x.invoiceId}`} className="font-mono text-small text-link underline-offset-2 hover:underline">{x.invoiceNumber}</a>}</span>
            </li> })}</ul>}
        </Section>
        <div className="grid gap-4">
          <Section title="Invoices go to" action={<EditDetails d={{ legalName: d?.legalName ?? null, gstin: d?.gstin ?? null, stateName: stateName(d?.stateCode ?? null), address: d?.address ?? null }} />}>
            {d?.legalName ? <div className="grid gap-0.5 text-sm"><span>{d.legalName}</span>{d.gstin ? <span className="font-mono text-small">{d.gstin.slice(0, 7)}••••{d.gstin.slice(12)}</span>
              : <span className="text-muted-foreground">{stateName(d.stateCode) ?? ''}</span>}</div> : <p className="text-sm text-muted-foreground">Add a name and a state.</p>}
          </Section>
          {(p.mandate || p.cancelling) && <Section title="Pays by"><dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
            {p.mandate && <><dt className="text-muted-foreground">{p.mandate.method === 'card' ? 'Card' : 'UPI AutoPay'}</dt><dd className="font-num text-right">Up to {formatMoney(p.mandate.max)} a debit</dd></>}
            {/* An old mandate the hourly run is still cancelling (C1·B, as drawn): gone once it is cancelled. */}
            {p.cancelling && <><dt className="text-muted-foreground">Old Studio AutoPay</dt><dd className="text-right"><Badge tone="warn">Cancelling</Badge></dd></>}
          </dl></Section>}
        </div>
      </div>
    }

    // Plan
    const renews = dayMonthIN(nextPeriodEnd(now))
    return <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        {PLAN_ROWS.map(([k, name]) => {
          const current = k === 'partner' ? state === 'partner' : v.seat?.plan === k && state !== 'partner'
          const p = k === 'partner' ? null : SEAT_PLANS[k]
          return <div key={k} className={`grid content-start gap-1 rounded-lg border p-3 ${current ? 'border-primary bg-select' : 'border-border'}`}>
            <b className="font-semibold">{name}</b>
            <small className="font-num text-small text-muted-foreground">{p ? <><Money paise={p.price} /> + GST a month</> : 'Free'}</small>
            <small className="text-small text-muted-foreground">{p ? `${p.credits} credits a month` : `${FREE_CREDITS} credits, once`}</small>
            {p && <small className="text-small text-muted-foreground">Use within 12 months</small>}
            {p && state === 'partner' && <div className="mt-2"><StartSeat plan={k as SeatPlan} renews={renews} primary={k === 'studio'} /></div>}
            {p && v.seat && state === 'active' && v.seat.plan !== k && v.seat.nextPlan !== k && (v.seat.plan === 'studio' && k === 'plus'
              // Studio → Studio Plus at once (owner 2026-11-23, option B); Studio Plus → Studio waits for the renewal.
              ? <div className="mt-2"><StartSeat plan="plus" renews={renews} move={{ from: SEAT_PLANS.studio.name,
                  carried: v.lots.filter((l) => l.kind === 'seat').reduce((a, l) => a + l.left, 0),
                  renewal: v.renewalOpen ? { forPeriodEnd: dayMonthIN(v.renewalOpen.forPeriodEnd), total: v.renewalOpen.total, claimed: v.renewalOpen.claimed } : null }} /></div>
              : <div className="mt-2"><ChangePlan to={k as SeatPlan} from={dayMonthIN(v.seat.periodEnd)} credits={p.credits} label={`Move to ${p.name}`} /></div>)}
            {p && v.seat && v.seat.nextPlan === k && <small className="text-small">From {dayMonthIN(v.seat.periodEnd)}</small>}
          </div>
        })}
      </div>
      {v.seat && state === 'active' && <div className="flex flex-wrap items-center gap-2">
        {v.seat.nextPlan && <ChangePlan to={v.seat.plan} from="" credits={0} label={`Stay on ${SEAT_PLANS[v.seat.plan].name}`} variant="ghost" />}
        <CancelSeat plan={SEAT_PLANS[v.seat.plan].name} ends={dayMonthIN(v.seat.periodEnd)} />
      </div>}
    </div>
  }
}

const formatMoney = (p: number) => formatInr(paise(p), { decimals: true })
const yearBefore = (d: Date) => { const x = new Date(d.getTime()); x.setUTCFullYear(x.getUTCFullYear() - 1); return x }
const onlyFree = (v: Overview) => !v.seat && !v.hasInvoices && v.lots.every((l) => l.kind === 'grant')

function BudgetCard({ r, owner, ownerFirst }: { r: BudgetRow; owner: boolean; ownerFirst: string }) {
  const s = budgetState(r.used, r.budget)
  const kind = r.kind === 'build' ? 'For the build' : 'Each month'
  return <Section title={<span className="flex flex-wrap items-center gap-2">{r.client}{s === 'paused' ? <Badge tone="danger">Used up</Badge> : s === 'warn' ? <Badge tone="warn">{Math.floor((r.used * 100) / r.budget!)}% used</Badge> : null}</span>}>
    <div className="grid gap-2">
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-sm"><dt className="text-muted-foreground">{kind}</dt>
        <dd className="font-num text-right">{r.budget === null ? `${r.used} used · no budget` : `${r.used} of ${r.budget}`}</dd></dl>
      {owner ? <div className="flex flex-wrap gap-2">{s === 'paused' && <RaiseBudget linkId={r.linkId} client={r.client} />}<SetBudget linkId={r.linkId} client={r.client} kind={kind} budget={r.budget} used={r.used} /></div>
        : s === 'paused' ? <p className="text-sm text-muted-foreground">Ask {ownerFirst} to raise it.</p> : null}
    </div>
  </Section>
}
