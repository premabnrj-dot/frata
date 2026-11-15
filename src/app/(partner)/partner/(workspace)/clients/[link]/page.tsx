import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { Icon } from '@/components/icons/icon'
import { z } from 'zod'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { Facts } from '@/components/data/facts'
import { Money } from '@/components/data/numeric'
import { billState } from '@/domains/partners/bills'
import { STAGE_LABEL } from '@/domains/partners/stage'
import { partnerCan } from '@/domains/partners/team'
import { PARTNER_TERMS } from '@/domains/partners/terms'
import { istDayKey } from '@/domains/time/day'
import { switchStoreAction } from '@/app/choose/actions'
import { requirePartner } from '@/lib/auth/require-partner'
import { partnerClients } from '@/lib/db/partners'
import { billSummary, clientBills, clientShares } from '@/lib/db/partner-bills'
import { dayMonthIN } from '@/lib/format-date'
import { formatInr } from '@/lib/format'
import { shopHost } from '@/lib/public-env'
import { toRupees, type Paise } from '@/domains/money/paise'
import { HandOver } from '../../hand-over'
import { buildClients, dayWords, failed, nextWords, remindHref, shareMonthLabel, signer, STAGE_TONE } from '../../_components/clients'
import { BillMore, ChangeBilling, MarkPaid, RecordBill, StoreMore } from '../../_components/bills'

export const metadata = { title: 'Client' }

const rupees = (p: Paise) => toRupees(p).toLocaleString('en-IN', { maximumFractionDigits: 2 })

/** A client's page (P2, mockup v2 frames 4–8, 18, 22–25). The link id only picks among the partner's own clients. */
export default async function ClientPage({ params, searchParams }: { params: Promise<{ link: string }>; searchParams: Promise<{ tab?: string; record?: string }> }) {
  const auth = await requirePartner()
  if (!auth.ok) return <Panel title={auth.message} />
  const role = auth.partner.memberRole
  const back = { href: '/partner', label: 'Clients' }
  const gone = <><PageHeader title="Client" back={back} /><Panel title="This client isn’t in your list" action={<Link href="/partner" className={button({ variant: 'secondary', size: 'sm' })}>See your clients</Link>} /></>
  const { link } = await params
  if (role === 'builder' || !z.uuid().safeParse(link).success) return gone
  const owner = partnerCan(role, 'billing')
  const rows = await partnerClients(auth).catch(failed('client'))
  if (!rows) return <><PageHeader title="Client" back={back} /><Panel title="We couldn’t load this client" action={<Link href={`/partner/clients/${link}`} className={button({ variant: 'secondary', size: 'sm' })}>Try again</Link>}>Nothing was changed. Try again in a minute.</Panel></>
  const row = rows.find((r) => r.linkId === link)
  if (!row) return gone
  const [billing, shares, bills] = owner
    ? await Promise.all([billSummary(auth).catch(failed('client.summary')), clientShares(auth).catch(failed('client.shares')), clientBills(auth, link).catch(failed('client.bills'))])
    : [[], [], []]
  const now = new Date(), today = istDayKey(now)
  // Built over every row, so a relinked store's book sits on one link only (its live one).
  const c = buildClients(rows, billing ?? [], shares ?? [], role, now).find((x) => x.row.linkId === link)
  if (!c) return gone
  const ended = c.stage === 'ended'
  const words = nextWords(c, today, now)
  const from = signer(auth.partner)
  const oldest = billing?.find((b) => b.tenantId === row.tenantId)?.open[0] ?? null
  const remind = owner ? remindHref(c, from, oldest, today) : null
  const { tab: t, record } = await searchParams
  const books = owner && c.holdsBook
  const tab = books && t !== 'store' ? 'billing' : 'store'
  const deal = c.deal
  const nextBillDay = deal?.kind === 'retainer' && deal.renewsOn ? deal.renewsOn : today
  const fill = { label: deal?.kind === 'retainer' ? `${new Date(`${nextBillDay}T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' })} retainer` : '', amount: deal ? rupees(deal.amount) : '', dueOn: nextBillDay }
  const primary = !owner ? null
    : c.next?.action === 'handOver' ? <HandOver tenantId={row.tenantId} store={row.name} again={false} primary />
    : remind ? <a href={remind} target="_blank" rel="noopener noreferrer" className={button()}><MessageCircle aria-hidden="true" className="size-4" />Remind</a>
    : c.next?.action === 'recordBill' ? <RecordBill linkId={link} store={row.name} fill={fill} today={today} primary startOpen={record === '1'} /> : null
  const actions = <>
    {!ended && <StoreMore tenantId={row.tenantId} />}
    {!ended && <form action={switchStoreAction}><input type="hidden" name="tenantId" value={row.tenantId} /><button type="submit" className={button({ variant: 'secondary' })}><Icon name="merchants" className="size-4" />Open store</button></form>}
    {primary}
  </>
  const meta = <span className="flex flex-wrap gap-x-3.5">
    <span>{ended && row.removedAt ? `Removed ${dayMonthIN(row.removedAt)}` : row.slug ? shopHost(row.slug) : null}</span>
    {words && <span className={c.next?.reason === 'overdue' ? 'text-danger-text' : undefined}>{words}</span>}
  </span>
  const lastMonth = shareMonthLabel(now)
  const facts: [string, React.ReactNode][] = [
    ['Started', dayWords(istDayKey(row.linkedAt), today)],
    ...(row.inviteSentAt ? [['Invite sent', dayWords(istDayKey(row.inviteSentAt), today)] as [string, string]] : []),
    ...(row.ownerSince ? [['Owner joined', dayWords(istDayKey(row.ownerSince), today)] as [string, string]] : []),
    ...(row.firstOpenedAt ? [['Opened', dayWords(istDayKey(row.firstOpenedAt), today)] as [string, string]] : []),
    ...(row.removedAt ? [['Removed', dayWords(istDayKey(row.removedAt), today)] as [string, string]] : []),
    ...(owner && row.shareMonths !== null ? [['Your share', shareWords(c, lastMonth)] as [string, React.ReactNode]] : []),
    ...(owner && c.shareEnds ? [['Share ends', dayWords(istDayKey(c.shareEnds), today)] as [string, string]] : []),
  ]
  return (
    <>
      <PageHeader title={row.name} back={back} badges={<Badge tone={STAGE_TONE[c.stage]}>{STAGE_LABEL[c.stage]}</Badge>} meta={meta} actions={actions} />
      {books && <ViewTabs label={row.name} tabs={[{ href: `/partner/clients/${link}`, label: 'Your billing', current: tab === 'billing' }, { href: `/partner/clients/${link}?tab=store`, label: 'Store', current: tab === 'store' }]} />}
      {tab === 'store' ? <Section ariaLabel="Store"><Facts rows={facts} className="grid-cols-[120px_minmax(0,1fr)]" /></Section>
        : !bills || !billing ? <Panel title="We couldn’t load the bills" action={<Link href={`/partner/clients/${link}`} className={button({ variant: 'secondary', size: 'sm' })}>Try again</Link>}>Nothing was changed. Try again in a minute.</Panel>
        : (
        <Section flush ariaLabel="Your billing">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              {deal ? <><p className="font-medium"><span>{deal.kind === 'retainer' ? 'Retainer' : 'Project'} · </span><Money paise={deal.amount} />{deal.kind === 'retainer' ? ' a month' : ''}</p>
                {deal.renewsOn ? <p className="text-small text-muted-foreground">Next bill {dayWords(deal.renewsOn, today)}</p> : null}</>
                : <p className="text-muted-foreground">No billing set</p>}
            </div>
            <ChangeBilling linkId={link} store={row.name} today={today} deal={{ kind: deal?.kind ?? 'retainer', amount: deal ? rupees(deal.amount) : '', renewsOn: deal?.renewsOn ?? '' }} />
          </div>
          <ul data-list className="divide-y divide-border">
            {bills.map((b) => {
              const s = billState(b, today)
              const name = b.number ?? b.label
              return (
                <li key={b.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_7rem_6rem_auto]">
                  <div className="min-w-0"><p className="truncate font-medium">{b.label}</p>
                    <p className="text-small text-muted-foreground">{b.number ? <span className="font-mono">{b.number}</span> : null}{b.number ? ' · ' : ''}{b.paidAt ? `paid ${dayMonthIN(b.paidAt)}` : `due ${dayWords(b.dueOn, today)}`}</p></div>
                  <Money paise={b.amount} className="text-right" />
                  <span><Badge tone={s === 'paid' ? 'ok' : s === 'overdue' ? 'danger' : s === 'due' ? 'warn' : 'neutral'}>{s === 'paid' ? 'Paid' : s === 'overdue' ? 'Overdue' : s === 'due' ? 'Due' : 'Later'}</Badge></span>
                  <span className="flex items-center justify-end gap-1.5">
                    {!b.paidAt && <MarkPaid linkId={link} billId={b.id} name={name} amount={formatInr(b.amount)} />}
                    <BillMore linkId={link} billId={b.id} name={name} amount={formatInr(b.amount)} paid={!!b.paidAt} />
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
            {c.next?.action === 'recordBill' ? <span /> : <RecordBill linkId={link} store={row.name} fill={fill} today={today} startOpen={record === '1'} />}
            <span className="inline-flex items-center gap-1.5 text-small text-muted-foreground"><Icon name="eyeOff" className="size-3.5" />Your client never sees this</span>
          </div>
        </Section>
      )}
    </>
  )
}

function shareWords(c: ReturnType<typeof buildClients>[number], lastMonth: string): React.ReactNode {
  const pct = `${(c.shareBps ?? PARTNER_TERMS.shareBps) / 100}%`
  if (!c.shareStarted) return `${pct} from opening`
  if (c.share?.kind === 'paid') return <>{pct} · <Money paise={c.share.amount} decimals={c.share.amount % 100 !== 0} /> in {lastMonth}</>
  return pct
}
