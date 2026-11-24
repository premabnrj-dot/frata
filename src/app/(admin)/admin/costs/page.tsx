import Link from 'next/link'
import { Download } from 'lucide-react'
import { Money, Numeric } from '@/components/data/numeric'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { SearchField } from '@/components/data/search-field'
import { PageHeader } from '@/components/layout/page-header'
import { Badge, Tag } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Empty, NoMatch } from '@/components/ui/empty'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { CADENCE_WORDS, CATEGORY_WORDS, dueState, fyStartOf, isLive, monthlyPaise, type CostCategory, type CostItem } from '@/domains/admin/costs'
import { paise } from '@/domains/money/paise'
import { istDayKey } from '@/domains/time/day'
import { costPanel, costsData, vendorFigures } from '@/lib/admin/costs'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { ChipLink } from '../_components/chip-link'
import { CostSide } from './_components/cost-side'
import { AddCostButton } from './_components/forms'
import { Overview } from './_components/overview'
import { Payments } from './_components/payments-view'
import { amountText, dayText, whenOf } from './format'

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

/** Whether a cost belongs under a kind chip. */
function inKind(item: CostItem, kind: Kind, today: string): boolean {
  const ended = !isLive(item, today)
  return kind === 'all' ? true : kind === 'ended' ? ended : ended ? false : kind === 'once' ? item.kind === 'one_time' : item.kind === 'recurring'
}

/** Admin › Costs (spec docs/specs/2026-11-23-admin-costs.md; mockup docs/mockups/2026-11-23-admin-costs.html): what Frrata pays. */
export default async function CostsPage({ searchParams }: { searchParams: Promise<{ view?: string; id?: string; kind?: string; q?: string; ym?: string; after?: string }> }) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) {
    return staff.reason === 'not_staff'
      ? <><PageHeader title="Costs" /><Empty picto="shield" title="Only a master admin can open Costs"><Link href="/admin" className={button({ variant: 'secondary' })}>Back to Today</Link></Empty></>
      : <Panel title={staff.message} />
  }
  const sp = await searchParams
  const today = istDayKey(new Date())
  const view: View = VIEWS.find(([k]) => k === sp.view)?.[0] ?? 'overview'
  const data = await costsData(staff, today)
  const rate = data.rate?.rateE4 ?? null
  const empty = data.items.length === 0

  const header = (
    <PageHeader title="Costs"
      actions={<>
        {empty ? null : <a href={`/admin/costs/export?fy=${fyStartOf(today)}`} className={button({ variant: 'secondary' }) + ' max-md:hidden'}><Download aria-hidden="true" className="size-4" />Export CSV</a>}
        <AddCostButton today={today} />
      </>} />
  )
  if (empty && view !== 'payments') {
    return (
      <>
        {header}
        <Empty picto="payments" title="No costs yet">
          <AddCostButton today={today} />
          <div className="flex w-full flex-wrap justify-center gap-2">{STARTERS.map((s) => <AddCostButton key={s.name} today={today} starter={s} label={s.name} variant="secondary" />)}</div>
        </Empty>
      </>
    )
  }
  const tabs = <ViewTabs label="Costs" tabs={VIEWS.map(([k, l]) => ({ href: `/admin/costs?view=${k}`, label: l, current: view === k }))} />
  if (view === 'overview') return <>{header}{tabs}<Overview items={data.items} payments={data.payments} today={today} rate={rate} figures={await vendorFigures(staff, today)} /></>
  if (view === 'payments') return <>{header}{tabs}<Payments staff={staff} today={today} sp={sp} /></>

  // All costs
  const kind: Kind = KINDS.find(([k]) => k === sp.kind)?.[0] ?? 'all'
  const q = (sp.q ?? '').trim().slice(0, 80).toLowerCase()
  const paidBy = new Map<string, Set<string>>()
  for (const p of data.payments) { const s = paidBy.get(p.itemId) ?? new Set<string>(); s.add(p.periodFor); paidBy.set(p.itemId, s) }
  const shown = data.items.filter((item) => inKind(item, kind, today) && (!q || item.name.toLowerCase().includes(q) || (item.vendor ?? '').toLowerCase().includes(q)))
  const id = sp.id && UUID.test(sp.id) ? sp.id : null
  const open = id ? await costPanel(staff, id) : null
  const here = `/admin/costs?view=all${q ? `&q=${encodeURIComponent(q)}` : ''}${kind === 'all' ? '' : `&kind=${kind}`}`
  const at = id ? shown.findIndex((i) => i.id === id) : -1
  const prevId = at > 0 ? shown[at - 1]!.id : null, nextId = at >= 0 && at < shown.length - 1 ? shown[at + 1]!.id : null
  return (
    <>
      {header}{tabs}
      <div className={`flex flex-col gap-3 ${open ? 'max-md:hidden md:pr-100' : ''}`}>
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label="Cost type" className="flex flex-wrap gap-1.5">
            {KINDS.map(([k, l]) => <ChipLink key={k} href={`/admin/costs?view=all${q ? `&q=${encodeURIComponent(q)}` : ''}${k === 'all' ? '' : `&kind=${k}`}`} current={kind === k}>{l} <span className="font-num text-small opacity-70">{data.items.filter((i) => inKind(i, k, today)).length}</span></ChipLink>)}
          </nav>
          <div className="ml-auto flex w-full min-w-0 sm:w-72"><SearchField label="Search costs" placeholder="Search name or vendor" value={q} clearHref={`/admin/costs?view=all${kind === 'all' ? '' : `&kind=${kind}`}`} hidden={kind === 'all' ? { view: 'all' } : { view: 'all', kind }} /></div>
        </div>
        {shown.length === 0 ? <NoMatch title="No costs match"><Link href="/admin/costs?view=all" className={button({ variant: 'secondary' })}>Show all costs</Link></NoMatch> : (
          <>
            <DataTable label="All costs">
              <DataTableHead><th>Cost</th><th>Repeats</th><th>Next due</th><th className="text-right">Amount</th><th className="text-right">Per month</th></DataTableHead>
              <DataTableBody>
                {shown.map((item) => {
                  const ended = !isLive(item, today)
                  const w = ended ? null : whenOf(dueState(item, paidBy.get(item.id) ?? new Set(), today))
                  const m = ended ? null : monthlyPaise(item, rate)
                  const unrated = !ended && item.kind === 'recurring' && item.currency === 'USD' && rate === null
                  return (
                    <DataTableRow key={item.id} selected={item.id === id} dimmed={ended}>
                      <Td cell="a"><Link href={`${here}&id=${item.id}`} data-row-link className="font-medium hover:underline">{item.name}</Link>
                        <span className="block text-small text-muted-foreground">{[item.vendor, CATEGORY_WORDS[item.category as CostCategory]].filter(Boolean).join(' · ')}</span></Td>
                      <Td cell="b">{item.kind === 'recurring' ? <>{CADENCE_WORDS[item.cadence!]}{item.varies ? <> <Tag>varies</Tag></> : null}</> : <Tag>Once</Tag>}</Td>
                      <Td cell="c">{ended ? <Badge>{item.kind === 'one_time' ? 'Removed' : `Ended ${dayText(item.endsOn!)}`}</Badge> : item.kind === 'one_time' ? `Paid ${dayText(item.anchorOn)}` : w ? <Badge tone={w.tone}>{w.text}</Badge> : '—'}</Td>
                      <Td cell="d" className="text-right"><Numeric>{item.varies ? 'about ' : ''}{amountText(item.amount, item.currency)}</Numeric></Td>
                      <Td cell="e" className="text-right">{m !== null ? <Money paise={paise(Math.round(m))} /> : unrated ? <Tag>rate missing</Tag> : '—'}</Td>
                    </DataTableRow>
                  )
                })}
              </DataTableBody>
            </DataTable>
            <p className="text-sm text-muted-foreground">{shown.length} {shown.length === 1 ? 'cost' : 'costs'}</p>
          </>
        )}
      </div>
      {open
        ? <CostSide item={open.item} payments={open.payments} today={today} rate={rate} figure={(await vendorFigures(staff, today))[open.item.id] ?? null} closeHref={here}
            {...(prevId ? { prevHref: `${here}&id=${prevId}` } : {})} {...(nextId ? { nextHref: `${here}&id=${nextId}` } : {})} />
        : id ? <Panel title="We couldn’t find that cost" /> : null}
    </>
  )
}
