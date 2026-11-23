import Link from 'next/link'
import { MessageCircle, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { PictoTile } from '@/components/brand/illustrations'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { LiveSearchField } from '@/components/data/live-search-field'
import { Money } from '@/components/data/numeric'
import { STAGE_LABEL } from '@/domains/partners/stage'
import { paise } from '@/domains/money/paise'
import { partnerCan } from '@/domains/partners/team'
import { SHARE_IN_RUPEES, shareTotal } from '@/domains/partners/share'
import { unpaidTotal } from '@/domains/partners/bills'
import { istDayKey } from '@/domains/time/day'
import { switchStoreAction } from '@/app/choose/actions'
import { requirePartner } from '@/lib/auth/require-partner'
import { partnerClients } from '@/lib/db/partners'
import { myPartnerRequests } from '@/lib/db/people'
import { Invitations } from './invitations'
import { billSummary, clientShares } from '@/lib/db/partner-bills'
import { shopHost } from '@/lib/public-env'
import { dayMonthIN } from '@/lib/format-date'
import { HandOver } from './hand-over'
import { buildClients, byWho, failed, nextWords, remindHref, shareMonthLabel, signer, STAGE_TONE, type Client } from './_components/clients'

export const metadata = { title: 'Clients' }

/** Tabs and search from this many clients; below it, one list ordered by who acts (owner, 2026-11-15, mockup v2). */
const VIEWS_FROM = 9
const VIEWS = [['needs', 'Needs you'], ['waiting', 'Waiting on the client'], ['all', 'All']] as const
type View = (typeof VIEWS)[number][0]


/** Partner workspace › Clients (P2, mockup v2 https://claude.ai/artifact/5ieqhb31Prax22Xe2UTtPX). */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; handover?: string }> }) {
  const auth = await requirePartner()
  if (!auth.ok) return <Panel title={auth.message} />
  const role = auth.partner.memberRole
  const owner = partnerCan(role, 'billing')
  const now = new Date()
  const [rows, billing, shares, asked] = await Promise.all([
    partnerClients(auth).catch(failed('clients')),
    owner ? billSummary(auth).catch(failed('clients.bills')) : Promise.resolve([]),
    owner && SHARE_IN_RUPEES ? clientShares(auth).catch(failed('clients.shares')) : Promise.resolve([]),
    // A store's invitation to be its partner: the partner owner's only (the definer matches their confirmed email).
    owner ? myPartnerRequests(auth).catch(() => []) : Promise.resolve([]),
  ])
  const invitations = <Invitations rows={asked.map((r) => ({ id: r.id, store: r.storeName, expires: dayMonthIN(r.expiresAt) }))} />
  const canCreate = partnerCan(role, 'createShop')
  const newStore = canCreate ? <Link href="/partner/new" className={button()}><Plus aria-hidden="true" className="size-4" />New client store</Link> : undefined
  if (!rows || !billing || !shares) {
    return (<><PageHeader title="Clients" actions={newStore} />{invitations}
      <Panel title="We couldn’t load your clients" action={<Link href="/partner" className={button({ variant: 'secondary', size: 'sm' })}>Try again</Link>}>Nothing was changed. Try again in a minute.</Panel></>)
  }
  if (!rows.length) {
    if (!canCreate) return (<><PageHeader title="Clients" />{invitations}<Panel title="No client stores yet" /></>)
    return (<><PageHeader title="Clients" />{invitations}
      <Section className="max-w-xl" ariaLabel="First client store"><PictoTile name="build" tone="haldi" />
        <h2 className="text-section font-semibold">Make your first client store</h2>{newStore}</Section></>)
  }
  const today = istDayKey(now)
  const clients = buildClients(rows, billing, shares, role, now)
  const { view: v, q: rawQ = '', handover } = await searchParams
  const many = clients.length >= VIEWS_FROM
  const q = many ? rawQ.trim().toLowerCase().slice(0, 60) : ''
  const counts: Record<View, number> = { needs: clients.filter((c) => c.next?.who === 'you').length, waiting: clients.filter((c) => c.next?.who === 'client').length, all: clients.length }
  const view: View = handover ? 'all' : VIEWS.some(([k]) => k === v) ? v as View : counts.needs ? 'needs' : 'all'
  const inView = (c: Client) => view === 'all' || (view === 'needs' ? c.next?.who === 'you' : c.next?.who === 'client')
  const shown = clients.filter((c) => (!many || inView(c)) && (!q || c.row.name.toLowerCase().includes(q) || (c.row.slug ?? '').includes(q)))
    .sort(many && view === 'all' ? (a, b) => Number(a.stage === 'ended') - Number(b.stage === 'ended') || a.row.name.localeCompare(b.row.name, 'en-IN', { numeric: true }) : byWho)
  const unpaid = owner ? unpaidTotal(clients.flatMap((c) => (c.bills ? [c.bills] : []))) : paise(0)
  const share = owner ? shareTotal(clients.map((c) => c.share ?? { kind: 'none' as const })) : paise(0)
  const lastMonth = shareMonthLabel(now)
  const meta = owner && (unpaid > 0 || share > 0) ? (
    <span className="flex flex-wrap gap-x-3.5">
      {unpaid > 0 && <span>Unpaid <Money paise={unpaid} className="text-danger-text" /></span>}
      {share > 0 && <span>Your share <Money paise={share} decimals={share % 100 !== 0} className="text-foreground" /> in {lastMonth}</span>}
    </span>) : undefined
  const from = signer(auth.partner)
  const tabs = VIEWS.filter(([k]) => k !== 'needs' || counts.needs > 0 || view === 'needs')
    .map(([k, label]) => ({ href: k === 'all' && !counts.needs ? '/partner' : `/partner?view=${k}`, label, count: counts[k], current: k === view }))
  const builder = role === 'builder'
  return (
    <>
      <PageHeader title="Clients" actions={newStore} meta={meta} />
      {invitations}
      {many && <ViewTabs label="Client views" tabs={tabs} scroll />}
      {many && <LiveSearchField path="/partner" params={{ view }} label="Search clients" placeholder="Search clients" value={rawQ} />}
      {!shown.length ? (q
        ? <Panel title={`No client matches “${rawQ.trim().slice(0, 60)}”`} action={<Link href={`/partner?view=${view}`} className={button({ variant: 'secondary', size: 'sm' })}>Clear search</Link>} />
        : <Panel title="No client here" action={<Link href="/partner?view=all" className={button({ variant: 'secondary', size: 'sm' })}>See all clients</Link>} />) : (
        <DataTable label="Clients">
          <DataTableHead>
            <th>Client</th><th>Stage</th>
            {!builder && <th>Next</th>}
            {owner && <th><span className="sr-only">Next step</span></th>}
            {owner && <th className="text-right">Your billing</th>}
            {builder && <th><span className="sr-only">Open</span></th>}
          </DataTableHead>
          <DataTableBody>
            {shown.map((c) => {
              const ended = c.stage === 'ended'
              const words = nextWords(c, today, now)
              const remind = owner ? remindHref(c, from, c.bills?.oldestOverdueOn ? billing.find((b) => b.tenantId === c.row.tenantId)?.open[0] ?? null : null, today) : null
              return (
                <DataTableRow key={c.row.linkId} dimmed={ended}>
                  <Td cell="a">
                    {builder ? <span className="font-medium">{c.row.name}</span>
                      : <Link href={`/partner/clients/${c.row.linkId}`} data-row-link prefetch={false} className="font-medium hover:underline">{c.row.name}</Link>}
                    <span className="hidden text-small text-muted-foreground md:block">{ended ? (c.row.removedAt ? `Removed ${dayMonthIN(c.row.removedAt)}` : 'Removed') : c.row.slug ? shopHost(c.row.slug) : null}</span>
                  </Td>
                  <Td cell="d"><Badge tone={STAGE_TONE[c.stage]}>{STAGE_LABEL[c.stage]}</Badge></Td>
                  {!builder && <Td cell="c" className={c.next?.reason === 'overdue' ? 'text-danger-text' : undefined}>
                    {words || (c.next?.reason === 'building' ? (owner ? <span className="md:hidden">Hand over</span> : null) : <span className="hidden text-muted-foreground md:inline">—</span>)}</Td>}
                  {owner && <Td cell="hide" className="w-px whitespace-nowrap text-right">
                    {c.next?.action === 'handOver' && <HandOver tenantId={c.row.tenantId} store={c.row.name} again={false} size="sm" startOpen={handover === c.row.tenantId} />}
                    {remind && <a href={remind} target="_blank" rel="noopener noreferrer" className={button({ variant: 'secondary', size: 'sm' })}><MessageCircle aria-hidden="true" className="size-4" />Remind</a>}
                    {c.next?.action === 'recordBill' && <Link href={`/partner/clients/${c.row.linkId}?record=1`} prefetch={false} className={button({ variant: 'secondary', size: 'sm' })}>Record bill</Link>}
                  </Td>}
                  {owner && <Td cell="b" className="text-right">{c.deal ? <><Money paise={c.deal.amount} />{c.deal.kind === 'retainer' ? <span className="text-muted-foreground"> a month</span> : null}</> : <span className="text-muted-foreground">—</span>}</Td>}
                  {builder && <Td cell="b" className="whitespace-nowrap text-right md:w-px">
                    <form action={switchStoreAction}><input type="hidden" name="tenantId" value={c.row.tenantId} /><button type="submit" className={button({ variant: 'secondary', size: 'sm', className: 'whitespace-nowrap' })}>Open store</button></form>
                  </Td>}
                </DataTableRow>
              )
            })}
          </DataTableBody>
        </DataTable>
      )}
    </>
  )
}
