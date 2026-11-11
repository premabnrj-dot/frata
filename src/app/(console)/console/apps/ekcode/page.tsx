import { PageHeader } from '@/components/layout/page-header'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Name } from '@/components/data/name'
import { Numeric } from '@/components/data/numeric'
import { Pager } from '@/components/data/pager'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { ANY_MEMBER, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { ekcodeConfigured } from '@/lib/ekcode/keys'
import { formatPercent, formatPhone } from '@/lib/format'
import { dayMonthIN } from '@/lib/format-date'
import { appsPage, shopModules } from '@/lib/queries/modules'
import { AppAbout } from '../_components/app-about'
import { aboutProps } from '../_components/about-data'
import { ekcodeOverview, ekcodeShoppers, type ShopperView } from '@/lib/queries/ekcode-shoppers'

export const metadata = { title: 'EkCode' }

const SIZE = 50
const BASE = '/console/apps/ekcode'

/** Console › Apps › EkCode (approved mockup v4): Overview and Shoppers. Settings come with P2. */
export default async function EkcodePage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string; page?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const sp = await searchParams
  const tenantId = auth.membership.tenantId
  const now = new Date()
  const back = { href: '/console/apps', label: 'Apps' }
  const { access } = await shopModules(tenantId, now.toISOString())
  if (!access.ekcode.usable) {
    const d = await appsPage(tenantId, auth.userId, now.toISOString())
    return <AppAbout {...aboutProps('ekcode', d, now, (CAN_MANAGE as readonly string[]).includes(auth.membership.role), auth.membership.tenantName)}
      notice={access.ekcode.why === 'paused' ? <p role="status" className="mb-4 rounded-md bg-warn px-3 py-2 text-sm text-warn-text">EkCode is paused by Frrata. We’re on it.</p> : undefined} />
  }
  const live = ekcodeConfigured()
  const tab = sp.tab === 'shoppers' ? 'shoppers' : 'overview'
  const tabs = (
    <ViewTabs label="EkCode" tabs={[
      { href: BASE, label: 'Overview', current: tab === 'overview' },
      { href: `${BASE}?tab=shoppers`, label: 'Shoppers', current: tab === 'shoppers' },
    ]} />
  )
  const header = <PageHeader title="EkCode" back={back} badges={live ? <Badge tone="ok">On</Badge> : <Badge tone="warn">Not live yet</Badge>} />
  const failed = <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>

  if (tab === 'overview') {
    const o = await ekcodeOverview(tenantId, now).catch((err) => { console.error('[ekcode overview]', err instanceof Error ? err.name : 'error'); return null })
    if (!o) return <>{header}{tabs}{failed}</>
    const stats = [
      { label: 'Orders filled in · 30 days', value: o.orders30 ? formatPercent(o.filled30 / o.orders30, 0) : '—' },
      { label: 'Sign-ins · 7 days', value: o.signIns7.toLocaleString('en-IN') },
      { label: 'New shoppers · 30 days', value: o.newShoppers30.toLocaleString('en-IN') },
      { label: 'Shoppers', value: o.shoppers.toLocaleString('en-IN') },
    ]
    return (
      <>
        {header}
        {tabs}
        {!live ? <p className="text-sm text-muted-foreground">Frrata is switching EkCode on. Your checkout shows it from then.</p> : null}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
          {stats.map((st) => (
            <div key={st.label} className="grid min-w-0 gap-0.5 bg-card p-3">
              <dt className="text-xs text-muted-foreground">{st.label}</dt>
              <dd className="font-mono text-lg font-semibold tabular-nums">{st.value}</dd>
            </div>
          ))}
        </dl>
      </>
    )
  }

  const view: ShopperView = sp.view === 'no_order' ? 'no_order' : 'all'
  const page = Math.max(1, Math.min(1000, Number.parseInt(sp.page ?? '1', 10) || 1))
  const data = await ekcodeShoppers(tenantId, view, page, SIZE).catch((err) => { console.error('[ekcode shoppers]', err instanceof Error ? err.name : 'error'); return null })
  if (!data) return <>{header}{tabs}{failed}</>
  const href = (v: ShopperView, p = 1) => `${BASE}?tab=shoppers${v === 'all' ? '' : `&view=${v}`}${p > 1 ? `&page=${p}` : ''}`
  const total = data.counts[view]
  return (
    <>
      {header}
      {tabs}
      <ViewTabs label="Shopper views" tabs={[
        { href: href('all'), label: 'All', count: data.counts.all, current: view === 'all' },
        { href: href('no_order'), label: 'No order yet', count: data.counts.no_order, current: view === 'no_order' },
      ]} />
      {data.rows.length === 0 ? (
        <Panel title={view === 'all' ? 'No shoppers yet' : 'Every shopper has ordered'} />
      ) : (
        <>
          <DataTable label="Shoppers">
            <DataTableHead><th>Shopper</th><th>Phone</th><th>First here</th><th className="text-right">Orders</th></DataTableHead>
            <DataTableBody>
              {data.rows.map((r) => (
                <DataTableRow key={r.id}>
                  <Td cell="a"><Name>{r.name}</Name></Td>
                  <Td cell="c"><Numeric>{formatPhone(`91${r.phone}`)}</Numeric></Td>
                  <Td cell="d">{dayMonthIN(r.firstAt)}</Td>
                  <Td cell="b" className="text-right"><Numeric>{r.orders}</Numeric></Td>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
          <Pager first={(page - 1) * SIZE + 1} shown={data.rows.length} total={total}
            prevHref={page > 1 ? href(view, page - 1) : undefined} nextHref={page * SIZE < total ? href(view, page + 1) : undefined} />
        </>
      )}
    </>
  )
}
