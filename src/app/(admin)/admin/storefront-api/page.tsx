import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { NeedsBand } from '../_components/needs-band'
import { Panel } from '@/components/ui/panel'
import { FieldError } from '@/components/ui/field-error'
import { button } from '@/components/ui/button'
import { ViewTabs } from '@/components/ui/view-tabs'
import { Icon } from '@/components/icons/icon'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { apiShopListed, apiShops } from '@/lib/admin/storefront-api'
import { ADMIN_PAGE_SIZE, apiShopState, sortApiShops, VERSION_RELEASED, versionRows, type ApiShopRow } from '@/domains/storefront-api/admin-view'
import { istDayKey } from '@/domains/time/day'
import { shopHost } from '@/lib/public-env'
import { formatCount } from '@/lib/format'
import { dayIN, dayMonthIN } from '@/lib/format-date'
import { MoreLinks } from './more'

export const metadata = { title: 'Storefront API' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Frrata Admin › Storefront API (SA1b D·8; approved mockup § Admin, drawn to the Admin redraw): one job, the stores on
 * the API and whether their website reads. A waiting task leads (websites with no reads for 2 days); a list beside one
 * store; Versions. Counts and dates only. On a phone the list, then the store on its own page.
 */
export default async function StorefrontApiPage({ searchParams }: { searchParams: Promise<{ view?: string; id?: string; page?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const sp = await searchParams
  const versions = sp.view === 'versions'
  const now = new Date()
  const today = istDayKey(now)
  const rows = await apiShops(staff).catch(() => null)
  const header = <PageHeader title="Storefront API" />
  // Error and empty as drawn: a card with one line (the error with its mark), not a centred panel.
  if (!rows) return <>{header}<Section><FieldError message="We couldn't load the stores. Reload in a minute." className="!text-sm" /></Section></>
  const tabs = <ViewTabs label="Storefront API views" tabs={[
    { href: '/admin/storefront-api', label: 'Stores', count: rows.length, current: !versions },
    { href: '/admin/storefront-api?view=versions', label: 'Versions', current: versions },
  ]} />
  if (!rows.length) return <>{header}{tabs}<Section><p className="text-sm font-medium">No store uses the Storefront API yet</p></Section></>
  if (versions) return (
    <>{header}{tabs}
      <Section flush ariaLabel="Versions"><div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="bg-sunk text-label text-muted-foreground [&>th]:h-9 [&>th]:px-4 [&>th]:text-left [&>th]:font-medium">
          <th scope="col">Version</th><th scope="col">Released</th><th scope="col" className="!text-right">Stores that read, last 7 days</th><th scope="col" className="max-md:hidden">Ends</th></tr></thead>
        <tbody>{versionRows(rows, today).map((v) => (
          <tr key={v.version} className="border-t border-line-soft [&>td]:h-12 [&>td]:px-4">
            <td className="font-mono text-small">{v.version}</td><td className="font-num">{dayIN(new Date(`${VERSION_RELEASED[v.version as keyof typeof VERSION_RELEASED]}T12:00:00+05:30`))}</td>
            <td className="text-right font-num">{formatCount(v.stores)}</td><td className="max-md:hidden">—</td></tr>))}</tbody>
      </table></div></Section>
    </>
  )

  const sorted = sortApiShops(rows, today)
  const waiting = sorted.filter((r) => apiShopState(r, today) === 'no_reads').length
  const pages = Math.max(1, Math.ceil(sorted.length / ADMIN_PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1))
  const shown = sorted.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE)
  const chosen = sp.id && UUID.test(sp.id) ? rows.find((r) => r.tenantId === sp.id) ?? null : null
  const open = chosen ?? shown[0] ?? null
  const listed = open ? await apiShopListed(staff, open.tenantId).catch(() => null) : null
  const href = (id: string) => `/admin/storefront-api?${page > 1 ? `page=${page}&` : ''}id=${id}`

  return (
    <>
      {/* On a phone a chosen store is its own page: the list hides, a way back shows (mockup § Admin phone). */}
      {/* display: contents, so the header and tabs keep the page's own spacing (as on Versions). */}
      <div className={chosen ? 'contents max-lg:hidden' : 'contents'}>{header}{tabs}</div>
      {chosen ? <div className="lg:hidden"><Link href="/admin/storefront-api" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground"><Icon name="back" className="size-4" />Storefront API</Link>
        <h1 className="font-display text-title font-semibold [overflow-wrap:anywhere]">{chosen.name}</h1></div> : null}
      {waiting ? <div className={chosen ? 'max-lg:hidden' : ''}><NeedsBand className="mb-4" title={`${waiting === 1 ? '1 website' : `${formatCount(waiting)} websites`} with no reads for 2 days`} /></div> : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className={chosen ? 'max-lg:hidden' : ''}>
          <Section flush ariaLabel="Stores"><ul data-list className="divide-y divide-border">
            {shown.map((r) => <li key={r.tenantId}><StoreRow r={r} today={today} on={open?.tenantId === r.tenantId} href={href(r.tenantId)} /></li>)}
          </ul></Section>
          {pages > 1 ? <nav aria-label="Pages" className="mt-3 flex items-center justify-end gap-3 text-sm">
            {page > 1 ? <Link href={`/admin/storefront-api?page=${page - 1}`} className="underline">Previous</Link> : null}
            <span className="font-num text-muted-foreground">Page {page} of {pages}</span>
            {page < pages ? <Link href={`/admin/storefront-api?page=${page + 1}`} className="underline">Next</Link> : null}
          </nav> : null}
        </div>
        {open ? <div className={chosen ? '' : 'max-lg:hidden'}><StoreRecord r={open} today={today} listed={listed} />
          {/* On a phone the record is its own page: the name is its title (above) and Merchants a button (as drawn). */}
          {chosen ? <Link href={`/admin/merchants/${chosen.tenantId}`} className={`${button({ variant: 'secondary' })} mt-4 lg:hidden`}>Open in Merchants</Link> : null}</div> : null}
      </div>
    </>
  )
}

function StateChip({ r, today }: { r: ApiShopRow; today: string }) {
  const s = apiShopState(r, today)
  if (s === 'no_reads') return <Badge tone="warn">No reads</Badge>
  if (s === 'not_open') return <Badge tone="neutral">Not open</Badge>
  return null
}

const keysWord = (n: number) => (n === 1 ? '1 key' : `${formatCount(n)} keys`)
const lastReadWord = (r: ApiShopRow, today: string) => r.lastRead === null ? 'Never read' : r.lastRead === today ? 'Today'
  : r.lastRead === new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) ? 'Yesterday' : `Last read ${dayMonthIN(new Date(`${r.lastRead}T12:00:00+05:30`))}`

/** The phone list's shorter words (as drawn): "13 Nov", "Never". */
const lastReadShort = (r: ApiShopRow, today: string) => lastReadWord(r, today).replace(/^Last read /, '').replace(/^Never read$/, 'Never')

function StoreRow({ r, today, on, href }: { r: ApiShopRow; today: string; on: boolean; href: string }) {
  const chip = <StateChip r={r} today={today} />
  return (
    <Link href={href} aria-current={on || undefined} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 text-sm hover:bg-accent ${on ? 'bg-select' : ''}`}>
      <span className="truncate font-medium">{r.name}</span>
      <span className="text-right text-muted-foreground">{apiShopState(r, today) === 'reading' ? <span className="font-num">{keysWord(r.liveKeys + r.testKeys)}</span> : chip}</span>
      <span className="truncate font-mono text-small text-muted-foreground">{r.siteHost ?? '—'}</span>
      <span className="text-right font-num text-small text-muted-foreground"><span className="max-md:hidden">{lastReadWord(r, today)}</span><span className="md:hidden">{lastReadShort(r, today)}</span></span>
    </Link>
  )
}

function StoreRecord({ r, today, listed }: { r: ApiShopRow; today: string; listed: number | null }) {
  const near = listed !== null && listed > 500
  return (
    <Section className="max-lg:[&>div:first-child]:hidden" title={<span className="flex min-w-0 flex-col"><span className="truncate">{r.name}</span><span className="truncate font-mono text-small font-normal text-muted-foreground">{r.siteHost ?? shopHost(r.slug)}</span></span>}
      action={<span className="flex items-center gap-2"><StateChip r={r} today={today} /><MoreLinks label={`More for ${r.name}`} items={[{ label: `Open ${r.name} in Merchants`, href: `/admin/merchants/${r.tenantId}` }]} /></span>}>
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Website</dt><dd className="font-mono text-small [overflow-wrap:anywhere]">{r.siteHost ? `https://${r.siteHost}` : '—'}</dd>
        <dt className="text-muted-foreground">Checkout</dt><dd className="font-mono text-small [overflow-wrap:anywhere]">{r.mainHost ?? shopHost(r.slug)}</dd>
        <dt className="text-muted-foreground">Live keys</dt><dd className="font-num">{r.liveKeys}</dd>
        <dt className="text-muted-foreground">Test keys</dt><dd className="font-num">{r.testKeys}</dd>
        <dt className="text-muted-foreground">Last read</dt><dd className="font-num">{r.lastRead ? `${r.lastRead === today ? 'Today' : dayMonthIN(new Date(`${r.lastRead}T12:00:00+05:30`))}${r.lastVersion ? ` · version ${r.lastVersion}` : ''}` : 'Never'}</dd>
        <dt className="text-muted-foreground">Partner</dt><dd>{r.partner ?? '—'}</dd>
        <dt className="text-muted-foreground">Products</dt><dd className="font-num">{listed === null ? '—' : <span className="inline-flex items-center gap-2">{formatCount(listed)} listed{near ? <Badge tone="warn">Near 600</Badge> : null}</span>}</dd>
        <dt className="text-muted-foreground">Store</dt><dd>{r.published && r.openedAt ? `Open since ${dayMonthIN(r.openedAt)}` : 'Not open'}</dd>
      </dl>
    </Section>
  )
}
