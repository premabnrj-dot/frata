import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Money, Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dayMonthIN } from '@/lib/format-date'
import { isPeriod, sourcePage, type Period, type Stage } from '@/lib/queries/analytics'
import { shareOf } from '../_components/parts'
import { readFailed } from '../_components/read-failed'

export const metadata = { title: 'A source · Analytics' }
export const dynamic = 'force-dynamic'

// A SOURCE'S PAGE (A·1, mockup § A source): its numbers, its campaigns (the name given in Make a link) and its latest
// 50 orders, each opening its order. The slug is classifier output, checked and matched on the server; an unknown one
// is "not found", never echoed. ₹ only for whoever seesCosts.

const STAGE: Record<Stage, { label: string; tone: 'ok' | 'info' | 'neutral' | 'danger' }> = {
  delivered: { label: 'Delivered', tone: 'ok' }, rto: { label: 'Came back', tone: 'neutral' }, lost: { label: 'Lost by the courier', tone: 'danger' },
  on_the_way: { label: 'On the way', tone: 'info' }, not_sent: { label: 'Not sent yet', tone: 'neutral' },
}

export default async function SourcePage({ params, searchParams }: { params: Promise<{ source: string }>; searchParams: Promise<{ period?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const slug = (await params).source
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) notFound()
  const asked = Number((await searchParams).period ?? 30)
  const period: Period = isPeriod(asked) ? asked : 30
  const { tenantId, role } = auth.membership
  // One snapshot transaction: the source's numbers, its orders and the order prefix (speed review A1·7).
  const page = await sourcePage(tenantId, role, period, slug).catch((err: unknown) => readFailed('[analytics source]', err))
  if (page && 'failed' in page) return page.failed
  if (!page) notFound()
  const { stat, orders, prefix } = page
  const t = stat.cur, out = t.delivered + t.rto + t.lost
  const back = { href: `/console/analytics?period=${period}`, label: 'Analytics' }
  return (
    <>
      <PageHeader title={stat.label} back={back}
        meta={<>Last {period} days · <Numeric>{t.orders}</Numeric> orders · <Numeric>{t.delivered}</Numeric> delivered · {out ? `${shareOf(t.rto, out)} came back` : 'none back yet'}{t.kept && t.kept.counted ? <> · <Money paise={paise(t.kept.kept)} /> kept after returns</> : null}</>} />
      {stat.campaigns.length ? (
        <Section flush title="Campaigns">
          <DataTable label="Campaigns">
            <DataTableHead><th>Name</th><th className="text-right">Orders</th><th className="text-right">Delivered</th><th className="text-right">Came back</th>{t.kept ? <th className="text-right">₹ kept after returns</th> : null}</DataTableHead>
            <DataTableBody>
              {stat.campaigns.map((c) => {
                const o = c.cur.delivered + c.cur.rto + c.cur.lost
                return (
                  <DataTableRow key={c.name}>
                    <Td cell="a"><span className="font-medium">{c.name}</span></Td>
                    <Td cell="b" className="text-right"><Numeric>{c.cur.orders}</Numeric></Td>
                    <Td cell="c" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Delivered </span><Numeric>{c.cur.delivered}</Numeric></Td>
                    <Td cell="e" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Came back </span>{o ? shareOf(c.cur.rto, o) : '—'}</Td>
                    {t.kept ? <Td cell="f" className="text-right">{c.cur.kept && c.cur.kept.counted ? <Money paise={paise(c.cur.kept.kept)} /> : '—'}</Td> : null}
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        </Section>
      ) : null}
      <Section flush title="Latest orders">
        {orders.length ? (
          <DataTable label="Latest orders">
            <DataTableHead><th>Order</th><th>Campaign</th><th>Where it is</th><th className="text-right">Total</th></DataTableHead>
            <DataTableBody>
              {orders.map((o) => (
                <DataTableRow key={o.number}>
                  <Td cell="a"><Link href={`/console/orders/${o.number}`} data-row-link prefetch={false} className="font-mono font-medium hover:underline">{prefix}-{o.number}</Link>
                    <span className="block text-xs text-muted-foreground">{dayMonthIN(o.placedAt)}</span></Td>
                  <Td cell="c">{o.campaign ?? <span className="hidden text-muted-foreground md:inline">—</span>}</Td>
                  <Td cell="d"><Badge tone={STAGE[o.stage].tone}>{STAGE[o.stage].label}</Badge></Td>
                  <Td cell="b" className="text-right"><Money paise={paise(o.total)} /></Td>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        ) : <p className="px-4 py-3 text-sm text-muted-foreground">No orders from it in the last {period} days.</p>}
        <p className="px-4 pb-3 text-xs text-muted-foreground">The latest 50. Each opens its order.</p>
      </Section>
    </>
  )
}
