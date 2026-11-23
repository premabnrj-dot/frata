import Link from 'next/link'
import { Money, Numeric } from '@/components/data/numeric'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Pager } from '@/components/data/pager'
import { SearchField } from '@/components/data/search-field'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge, Tag } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Empty, Locked, NoMatch } from '@/components/ui/empty'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import {
  burnOf, byCategory, CADENCE_WORDS, CATEGORY_WORDS, dueState, fyRange, fyStartOf, isLive, monthlyPaise, spentIn, usdToPaise,
  type CostCategory, type CostItem, type DueState, type PaymentRow,
} from '@/domains/admin/costs'
import { paise } from '@/domains/money/paise'
import { istDayKey } from '@/domains/time/day'
import { addMonths } from '@/domains/time/month'
import { costPanel, costsData, paymentsPage, type CostsData } from '@/lib/admin/costs'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { formatInr } from '@/lib/format'
import { NeedsBand } from '../_components/needs-band'
import { AddCostButton, CostMore, MarkPaidButton, UndoPaymentButton, type CostFacts, type PaidTarget } from './_components/forms'
import { amountText, dayText, inputOf, monthShortName, whenOf } from './format'

export const metadata = { title: 'Costs' }
export const dynamic = 'force-dynamic'

const VIEWS = [['overview', 'Overview'], ['all', 'All costs'], ['payments', 'Payments']] as const
type View = (typeof VIEWS)[number][0]
const KINDS = [['all', 'All'], ['repeating', 'Repeating'], ['once', 'One-time'], ['ended', 'Ended']] as const
type Kind = (typeof KINDS)[number][0]
const STARTERS: { name: string; category: CostCategory }[] = [
  { name: 'Domain', category: 'infrastructure' }, { name: 'Vercel', category: 'infrastructure' }, { name: 'Supabase', category: 'infrastructure' },
  { name: 'Anthropic', category: 'ai' }, { name: 'WhatsApp', category: 'messaging' }, { name: 'Email', category: 'software' }, { name: 'CA fees', category: 'legal' },
]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Row = { item: CostItem; state: DueState; paise: number | null }

/** Admin › Costs (spec docs/specs/2026-11-23-admin-costs.md; mockup docs/mockups/2026-11-23-admin-costs.html): what Frrata pays. */
export default async function CostsPage({ searchParams }: { searchParams: Promise<{ view?: string; id?: string; kind?: string; q?: string; ym?: string; after?: string }> }) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return staff.reason === 'not_staff' ? <Locked title="Only a master admin can open Costs" who="Ask a master admin." /> : <Panel title={staff.message} />
  const sp = await searchParams
  const today = istDayKey(new Date())
  const view: View = VIEWS.find(([k]) => k === sp.view)?.[0] ?? 'overview'
  const data = await costsData(staff, today)
  const rate = data.rate?.rateE4 ?? null
  const paidBy = new Map<string, Set<string>>()
  for (const p of data.payments) { const s = paidBy.get(p.itemId) ?? new Set<string>(); s.add(p.periodFor); paidBy.set(p.itemId, s) }
  const rows: Row[] = data.items.map((item) => ({
    item, state: dueState(item, paidBy.get(item.id) ?? new Set(), today),
    paise: item.currency === 'INR' ? item.amount : rate ? usdToPaise(item.amount, rate) : null,
  }))
  const lastPaid = new Map<string, string>()
  for (const p of data.payments) if (p.periodFor > (lastPaid.get(p.itemId) ?? '')) lastPaid.set(p.itemId, p.periodFor)

  const header = (
    <PageHeader title="Costs"
      actions={<>
        <a href={`/admin/costs/export?fy=${fyStartOf(today)}`} className={button({ variant: 'secondary' })}>Export CSV</a>
        <AddCostButton today={today} />
      </>} />
  )
  const tabs = <ViewTabs label="Costs" tabs={VIEWS.map(([k, l]) => ({ href: `/admin/costs?view=${k}`, label: l, current: view === k }))} />

  if (!data.items.length && view !== 'payments') {
    return (
      <>
        {header}
        <Empty picto="calendar" title="No costs yet">
          <AddCostButton today={today} label="Add cost" />
          <div className="flex flex-wrap justify-center gap-2">{STARTERS.map((s) => <AddCostButton key={s.name} today={today} starter={s} label={s.name} variant="secondary" />)}</div>
        </Empty>
      </>
    )
  }

  if (view === 'overview') return <>{header}{tabs}<Overview rows={rows} data={data} today={today} rate={rate} /></>
  if (view === 'payments') return <>{header}{tabs}<Payments staff={staff} today={today} sp={sp} /></>

  // All costs
  const kind: Kind = KINDS.find(([k]) => k === sp.kind)?.[0] ?? 'all'
  const q = (sp.q ?? '').trim().slice(0, 80).toLowerCase()
  const shown = rows.filter(({ item }) => {
    const ended = !isLive(item, today)
    const inKind = kind === 'all' ? true : kind === 'ended' ? ended : kind === 'once' ? item.kind === 'one_time' && !ended : item.kind === 'recurring' && !ended
    return inKind && (!q || item.name.toLowerCase().includes(q) || (item.vendor ?? '').toLowerCase().includes(q))
  })
  const count = (k: Kind) => rows.filter(({ item }) => { const e = !isLive(item, today); return k === 'all' ? true : k === 'ended' ? e : k === 'once' ? item.kind === 'one_time' && !e : item.kind === 'recurring' && !e }).length
  const id = sp.id && UUID.test(sp.id) ? sp.id : null
  const open = id ? await costPanel(staff, id) : null
  const base = `/admin/costs?view=all${q ? `&q=${encodeURIComponent(q)}` : ''}`
  return (
    <>
      {header}{tabs}
      <div className={open ? 'max-md:hidden' : undefined}>
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label="Kind" className="flex flex-wrap gap-1.5">
            {KINDS.map(([k, l]) => <Link key={k} href={`${base}${k === 'all' ? '' : `&kind=${k}`}`} aria-current={kind === k ? 'true' : undefined}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-label font-medium ${kind === k ? 'border-select bg-select text-select-foreground' : 'border-line-soft text-muted-foreground hover:bg-accent'}`}>{l} <span className="font-num text-small opacity-70">{count(k)}</span></Link>)}
          </nav>
          <div className="ml-auto flex w-full min-w-0 sm:w-72"><SearchField label="Search costs" placeholder="Search name or vendor" value={q} clearHref="/admin/costs?view=all" hidden={kind === 'all' ? { view: 'all' } : { view: 'all', kind }} /></div>
        </div>
        {shown.length === 0 ? <NoMatch title="No costs match"><Link href="/admin/costs?view=all" className={button({ variant: 'secondary' })}>Show all costs</Link></NoMatch> : (
          <DataTable label="All costs">
            <DataTableHead><th>Cost</th><th>Repeats</th><th>Next due</th><th className="text-right">Amount</th><th className="text-right">Per month</th></DataTableHead>
            <DataTableBody>
              {shown.map(({ item, state }) => {
                const ended = !isLive(item, today)
                const w = ended ? null : whenOf(state)
                const m = ended ? null : monthlyPaise(item, rate)
                return (
                  <DataTableRow key={item.id} selected={item.id === id} dimmed={ended}>
                    <Td cell="a"><Link href={`${base}${kind === 'all' ? '' : `&kind=${kind}`}&id=${item.id}`} data-row-link className="font-medium hover:underline">{item.name}</Link>
                      <span className="block text-small text-muted-foreground">{[item.vendor, CATEGORY_WORDS[item.category as CostCategory]].filter(Boolean).join(' · ')}</span></Td>
                    <Td cell="b">{item.kind === 'recurring' ? <>{CADENCE_WORDS[item.cadence!]}{item.varies ? <> <Tag>varies</Tag></> : null}</> : <Tag>Once</Tag>}</Td>
                    <Td cell="c">{ended ? <Badge>{item.kind === 'one_time' ? 'Removed' : `Ended ${dayText(item.endsOn!)}`}</Badge> : item.kind === 'one_time' ? `Paid ${dayText(item.anchorOn)}` : w ? <Badge tone={w.tone}>{w.text}</Badge> : '—'}</Td>
                    <Td cell="d" className="text-right"><Numeric>{item.varies ? 'about ' : ''}{amountText(item.amount, item.currency)}</Numeric></Td>
                    <Td cell="e" className="text-right">{m === null ? '—' : <Money paise={paise(Math.round(m))} />}</Td>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        )}
      </div>
      {open ? <CostSide item={open.item} payments={open.payments} today={today} rate={rate} closeHref={`${base}${kind === 'all' ? '' : `&kind=${kind}`}`} paid={lastPaid.has(open.item.id)} /> : id ? <Panel title="That cost is gone" /> : null}
    </>
  )
}

// ── Overview ────────────────────────────────────────────────────────────────────────────────────────────────────────

function paidTarget(r: Row, today: string, rate: number | null): PaidTarget | null {
  if (!r.state.next) return null
  const { item } = r
  return {
    itemId: item.id, name: item.name, currency: item.currency, varies: item.varies, period: r.state.next, today,
    amount: inputOf(item.amount, item.currency), inr: item.currency === 'USD' && rate ? inputOf(usdToPaise(item.amount, rate), 'INR') : '',
  }
}

function Overview({ rows, data, today, rate }: { rows: Row[]; data: CostsData; today: string; rate: number | null }) {
  const live = rows.filter((r) => isLive(r.item, today) && r.item.kind === 'recurring')
  const overdue = live.filter((r) => r.state.tone === 'overdue').sort((a, b) => a.state.next!.localeCompare(b.state.next!))
  const horizon = istDayKey(new Date(new Date(`${today}T00:00:00Z`).getTime() + 30 * 86_400_000))
  const upcoming = live.filter((r) => r.state.next && (r.state.tone === 'overdue' || r.state.next <= horizon)).sort((a, b) => a.state.next!.localeCompare(b.state.next!))
  const comingPaise = upcoming.filter((r) => r.state.tone !== 'overdue' && r.paise !== null).reduce((t, r) => t + r.paise!, 0)
  const coming = upcoming.filter((r) => r.state.tone !== 'overdue').length
  const ym = today.slice(0, 7)
  const prev = addMonths(new Date(`${ym}-01T00:00:00Z`), -1).toISOString().slice(0, 7)
  const spent = spentIn(data.payments, ym)
  const burn = burnOf(data.items, today, rate)
  const now = byCategory(data.payments, ym), before = new Map(byCategory(data.payments, prev).map((c) => [c.category, c.paise]))
  const top = now[0]?.paise ?? 1
  const first = overdue[0]
  const target = first ? paidTarget(first, today, rate) : null
  const inr = (p: number) => formatInr(paise(p))
  return (
    <>
      {first && target ? <NeedsBand tone="warn" title={`${overdue.length} ${overdue.length === 1 ? 'cost is' : 'costs are'} overdue`} line={`${first.item.name} · ${first.state.overdueDays} ${first.state.overdueDays === 1 ? 'day' : 'days'}`}
        action={<MarkPaidButton t={target} primary />} /> : null}
      <dl className="grid grid-cols-2 rounded-lg border border-line-soft lg:grid-cols-4">
        <Figure label={`Spent in ${monthShortName(ym)}`} value={inr(spent.paise)} note={`${spent.count} ${spent.count === 1 ? 'payment' : 'payments'}`} />
        <Figure label="Monthly burn" value={inr(burn.monthlyPaise)} note={burn.missingRate ? `${burn.missingRate} in dollars, rate missing` : `${burn.count} repeating ${burn.count === 1 ? 'cost' : 'costs'}`} />
        <Figure label="Yearly burn" value={inr(burn.yearlyPaise)} note={rate ? `at ₹${(rate / 1e4).toFixed(2)} to the dollar` : 'rupees only'} />
        <Figure label="Due in 30 days" value={inr(comingPaise)} note={`${coming} ${coming === 1 ? 'cost' : 'costs'}`} />
      </dl>
      <Section title="Due and overdue" className="space-y-3">
        {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is due in the next 30 days.</p> : (
          <DataTable label="Due and overdue">
            <DataTableHead><th>Cost</th><th>When</th><th>Due</th><th className="text-right">Amount</th><th><span className="sr-only">Action</span></th></DataTableHead>
            <DataTableBody>
              {upcoming.map((r) => {
                const w = whenOf(r.state)!, t = paidTarget(r, today, rate)!
                return (
                  <DataTableRow key={r.item.id}>
                    <Td cell="a"><Link href={`/admin/costs?view=all&id=${r.item.id}`} data-row-link className="font-medium hover:underline">{r.item.name}</Link>
                      <span className="block text-small text-muted-foreground">{[r.item.vendor, CATEGORY_WORDS[r.item.category as CostCategory]].filter(Boolean).join(' · ')}</span></Td>
                    <Td cell="b"><Badge tone={w.tone}>{w.text}</Badge>{r.item.varies ? <> <Tag>varies</Tag></> : null}</Td>
                    <Td cell="c">{dayText(r.state.next!)}</Td>
                    <Td cell="d" className="text-right"><Numeric>{r.item.varies ? 'about ' : ''}{amountText(r.item.amount, r.item.currency)}</Numeric></Td>
                    <Td cell="f" className="text-right"><MarkPaidButton t={t} /></Td>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        )}
      </Section>
      {now.length > 0 ? (
        <Section title={`${monthShortName(ym)} by category`} className="space-y-1">
          <ul className="divide-y divide-line-soft">
            {now.map((c) => {
              const was = before.get(c.category) ?? 0, d = c.paise - was
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
    <dt className="text-small font-medium text-muted-foreground">{label}</dt><dd className="font-num text-title font-semibold">{value}</dd><dd className="text-small text-muted-foreground">{note}</dd>
  </div>
)

// ── A cost, beside the list ─────────────────────────────────────────────────────────────────────────────────────────

function CostSide({ item, payments, today, rate, closeHref, paid }: { item: CostItem; payments: PaymentRow[]; today: string; rate: number | null; closeHref: string; paid: boolean }) {
  const ended = !isLive(item, today)
  const state = dueState(item, new Set(payments.map((p) => p.periodFor)), today)
  const w = ended ? null : whenOf(state)
  const m = monthlyPaise(item, rate)
  const facts: CostFacts = {
    id: item.id, name: item.name, vendor: item.vendor ?? null, category: item.category as CostCategory, note: item.note ?? null, varies: item.varies, currency: item.currency,
    amount: inputOf(item.amount, item.currency), cadence: item.cadence, anchorOn: item.anchorOn, recurring: item.kind === 'recurring' && !ended, paid,
  }
  const target: PaidTarget | null = !ended && state.next ? {
    itemId: item.id, name: item.name, currency: item.currency, varies: item.varies, period: state.next, today,
    amount: inputOf(item.amount, item.currency), inr: item.currency === 'USD' && rate ? inputOf(usdToPaise(item.amount, rate), 'INR') : '',
  } : null
  return (
    <aside aria-label={item.name} className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-4 md:fixed md:inset-y-0 md:right-0 md:z-40 md:w-100 md:overflow-y-auto md:rounded-none md:border-y-0 md:border-r-0 md:p-5 md:shadow-lg">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2"><h2 className="min-w-0 flex-1 truncate text-section font-semibold">{item.name}</h2><Link href={closeHref} className={button({ variant: 'ghost', size: 'sm' })}>Close</Link></div>
        <div className="flex flex-wrap gap-1.5">{ended ? <Badge>{item.kind === 'one_time' ? 'Removed' : `Ended ${dayText(item.endsOn!)}`}</Badge> : w ? <Badge tone={w.tone}>{w.text}</Badge> : null}<Tag>{CATEGORY_WORDS[item.category as CostCategory] ?? item.category}</Tag></div>
      </header>
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Amount</dt><dd className="font-num">{item.varies ? 'about ' : ''}{amountText(item.amount, item.currency)}{item.currency === 'USD' && rate ? <> · about {formatInr(paise(usdToPaise(item.amount, rate)))}</> : null}</dd>
        {item.kind === 'recurring' ? <><dt className="text-muted-foreground">Repeats</dt><dd>{CADENCE_WORDS[item.cadence!]}</dd></> : null}
        {item.vendor ? <><dt className="text-muted-foreground">Vendor</dt><dd>{item.vendor}</dd></> : null}
        {item.kind === 'recurring' && m !== null ? <><dt className="text-muted-foreground">Per year</dt><dd className="font-num">{formatInr(paise(Math.round(m * 12)))}</dd></> : null}
        {item.note ? <><dt className="text-muted-foreground">Note</dt><dd className="min-w-0 break-words">{item.note}</dd></> : null}
      </dl>
      <section aria-label="Payments" className="space-y-1">
        <h3 className="text-label font-medium text-muted-foreground">Payments · {payments.length}</h3>
        {payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet.</p> : (
          <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm"><span className="flex-1">{dayText(p.paidOn)}</span><Money paise={paise(p.inrPaise)} /><UndoPaymentButton itemId={item.id} paymentId={p.id} /></li>
            ))}
          </ul>
        )}
      </section>
      <footer className="flex flex-wrap items-center gap-2">
        {target ? <MarkPaidButton t={target} primary /> : null}
        {!ended ? <CostMore c={facts} today={today} /> : null}
      </footer>
    </aside>
  )
}

// ── Payments ────────────────────────────────────────────────────────────────────────────────────────────────────────

async function Payments({ staff, today, sp }: { staff: Parameters<typeof paymentsPage>[0]; today: string; sp: { ym?: string; after?: string } }) {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(new Date(`${today.slice(0, 7)}-01T00:00:00Z`), -i).toISOString().slice(0, 7))
  const fy = fyStartOf(today)
  const ym = sp.ym === 'fy' ? 'fy' : months.includes(sp.ym ?? '') ? sp.ym! : months[0]!
  const range = ym === 'fy' ? fyRange(fy) : { from: `${ym}-01`, to: new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10) }
  const m = /^(\d{4}-\d{2}-\d{2})_([0-9a-f-]{36})$/.exec(sp.after ?? '')
  const page = await paymentsPage(staff, { ...range, after: m ? { paidOn: m[1]!, id: m[2]! } : null })
  const here = `/admin/costs?view=payments&ym=${ym}`
  const total = page.rows.reduce((t, r) => t + r.inrPaise, 0)
  return (
    <>
      <nav aria-label="Period" className="flex flex-wrap gap-1.5">
        {months.map((x) => <Link key={x} href={`/admin/costs?view=payments&ym=${x}`} aria-current={ym === x ? 'true' : undefined} className={`inline-flex h-8 items-center rounded-full border px-3 text-label font-medium ${ym === x ? 'border-select bg-select text-select-foreground' : 'border-line-soft text-muted-foreground hover:bg-accent'}`}>{monthShortName(x)} {x.slice(0, 4)}</Link>)}
        <Link href="/admin/costs?view=payments&ym=fy" aria-current={ym === 'fy' ? 'true' : undefined} className={`inline-flex h-8 items-center rounded-full border px-3 text-label font-medium ${ym === 'fy' ? 'border-select bg-select text-select-foreground' : 'border-line-soft text-muted-foreground hover:bg-accent'}`}>FY {fy}–{String(fy + 1).slice(2)}</Link>
      </nav>
      {page.rows.length === 0 ? <NoMatch title="No payments in this period" /> : (
        <DataTable label="Payments">
          <DataTableHead><th>Cost</th><th>Paid on</th><th>For the bill due</th><th className="text-right">Billed</th><th className="text-right">In rupees</th></DataTableHead>
          <DataTableBody>
            {page.rows.map((p) => (
              <DataTableRow key={p.id}>
                <Td cell="a"><Link href={`/admin/costs?view=all&id=${p.itemId}`} data-row-link className="font-medium hover:underline">{p.name}</Link><span className="block text-small text-muted-foreground">{CATEGORY_WORDS[p.category as CostCategory] ?? p.category}</span></Td>
                <Td cell="b">{dayText(p.paidOn)}</Td>
                <Td cell="c">{dayText(p.periodFor)}</Td>
                <Td cell="d" className="text-right"><Numeric>{amountText(p.amount, p.currency as 'INR' | 'USD')}</Numeric></Td>
                <Td cell="e" className="text-right"><Money paise={paise(p.inrPaise)} /></Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
      {page.rows.length > 0 ? <Pager first={1} shown={page.rows.length} total={page.next ? `${page.rows.length}+` : page.rows.length}
        {...(sp.after ? { prevHref: here } : {})} {...(page.next ? { nextHref: `${here}&after=${page.next.paidOn}_${page.next.id}` } : {})} /> : null}
      {page.rows.length > 0 && !page.next && !sp.after ? <p className="text-sm text-muted-foreground">{page.rows.length} {page.rows.length === 1 ? 'payment' : 'payments'} · <Numeric>{formatInr(paise(total))}</Numeric></p> : null}
    </>
  )
}
