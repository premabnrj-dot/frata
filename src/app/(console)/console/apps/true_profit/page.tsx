import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Money, Numeric } from '@/components/data/numeric'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import type { Paise } from '@/domains/money/paise'
import { CONSOLE_ROLES } from '@/domains/tenancy/roles'
import { requireMember } from '@/lib/auth/require-member'
import { formatCount, formatPercent } from '@/lib/format'
import { timeIN } from '@/lib/format-date'
import { errName } from '@/lib/log'
import { appsPage } from '@/lib/queries/modules'
import { isTpPeriod, rateOf, TP_PERIODS, trueProfitPage, variantsFor, type Line, type TpPeriod } from '@/lib/queries/true-profit'
import { keptPerOrder } from '@/domains/orders/kept'
import { AppAbout } from '../_components/app-about'
import { aboutProps, mayTurnOff } from '../_components/about-data'
import { AppHome } from '../_components/app-home'

export const metadata = { title: 'True Profit' }
export const dynamic = 'force-dynamic'

// =============================================================================
// Console › Apps › True Profit (approved mockup https://claude.ai/artifact/XsfTjzmh8nYqFpbFBCLSth; plan
// docs/plans/2026-11-12-true-profit-a3.md). ₹ kept after returns, freight, fees and COD charges, before ads and packaging
// — by product, by size and colour, by PIN code. Not usable: the app's page (A3's trial on Launch and Growth). Costs:
// owners and admins (and a partner before handover) only; everyone else reads a panel saying so. Rule 0: labels only.
// =============================================================================

const TABS = [{ key: 'products', label: 'Products' }, { key: 'pincodes', label: 'Pincodes' }]
const SORTS = { loses: 'Loses most', earns: 'Earns most', returns: 'Returns most' } as const
type Sort = keyof typeof SORTS
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const rs = (p: number) => <Money paise={p as Paise} />
const rate = (l: Pick<Line, 'delivered' | 'returned'>) => rateOf(l.returned, l.delivered + l.returned)
// Per order counted (with an outcome and known costs), never per delivered order alone (frata-unit-economics).
const perOrder = (l: Line) => (l.counted > 0 ? Math.round(l.kept / l.counted) : null)

export default async function TrueProfitPage({ searchParams }: { searchParams: Promise<{ tab?: string; days?: string; sort?: string; open?: string }> }) {
  const auth = await requireMember(CONSOLE_ROLES)
  if (!auth.ok) return <Panel title={auth.message} />
  const now = new Date()
  const apps = await appsPage(auth.membership.tenantId, auth.userId, now.toISOString()).catch((err) => { console.error('[tp apps]', errName(err)); return null })
  if (!apps) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const gate = apps.access.true_profit
  const about = aboutProps('true_profit', apps, now, mayTurnOff(auth.membership), auth.membership.tenantName)
  if (!gate.usable) {
    return <AppAbout {...about}
      notice={gate.why === 'paused' ? <p role="status" className="mb-4 rounded-md bg-warn px-3 py-2 text-sm text-warn-text">True Profit is paused by Frrata. We’re on it.</p> : undefined} />
  }
  const sp = await searchParams
  const tab = sp.tab === 'products' || sp.tab === 'pincodes' ? sp.tab : sp.tab === 'billing' ? 'billing' : 'overview'
  const days = Number(sp.days)
  const period: TpPeriod = isTpPeriod(days) ? days : 30
  const sort: Sort = sp.sort === 'earns' || sp.sort === 'returns' ? sp.sort : 'loses'
  const open = sp.open && UUID.test(sp.open) ? sp.open : null
  const role = auth.membership.role
  const home = (body?: React.ReactNode, badge?: React.ReactNode) => (
    <AppHome k="true_profit" tab={tab} tabs={TABS} offer={about.offer} worksWith={about.worksWith} billing={role !== 'accountant'}
      canTurnOff={mayTurnOff(auth.membership)} badge={badge}>{body}</AppHome>
  )
  if (tab === 'billing') return home()
  const [d, variants] = await Promise.all([
    trueProfitPage(auth.membership.tenantId, role, period),
    tab === 'products' && open ? variantsFor(auth.membership.tenantId, role, period, open, now) : Promise.resolve(null),
  ]).catch((err) => { console.error('[tp]', errName(err)); return [undefined, null] as const })
  if (d === undefined) return home(<Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>)
  if (d === null) return home(<Panel title="Owners and admins see costs" />)

  const q = (o: Record<string, string | number | null>) => {
    const p = new URLSearchParams({ ...(tab !== 'overview' ? { tab } : {}), ...(period !== 30 ? { days: String(period) } : {}) })
    for (const [k, v] of Object.entries(o)) { if (v === null) p.delete(k); else p.set(k, String(v)) }
    const s = p.toString()
    return `/console/apps/true_profit${s ? `?${s}` : ''}`
  }
  // The figures are cached up to 15 minutes (owner, 2026-11-12): when they were worked out sits beside the period.
  const periods = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ViewTabs label="Period" tabs={TP_PERIODS.map((p) => ({ href: q({ days: p === 30 ? null : p }), label: `${p} days`, current: p === period }))} />
      <span className="text-xs text-muted-foreground">Updated {timeIN(new Date(d.at))}</span>
    </div>
  )
  const leftOut = d.total.leftOut > 0 && (
    <p role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-warn px-3 py-2 text-sm text-warn-text">
      {formatCount(d.total.leftOut)} orders left out{d.noCost ? `: ${d.noCost} ${d.noCost === 1 ? 'product has' : 'products have'} no cost price` : ''}.
      {d.noCost ? <Link href="/console/products" className="underline underline-offset-4">Add costs</Link> : null}
    </p>
  )
  if (d.total.counted === 0 && d.total.leftOut === 0) {
    return home(<div className="space-y-4">{periods}<Panel title={`No orders with an outcome in the last ${period} days`} /></div>)
  }

  if (tab === 'products') {
    const rows = [...d.products].sort(sort === 'earns' ? (a, b) => b.kept - a.kept : sort === 'returns' ? (a, b) => (rate(b) ?? 0) - (rate(a) ?? 0) : (a, b) => a.kept - b.kept)
    return home(
      <div className="space-y-4">
        {periods}
        {leftOut}
        <nav aria-label="Sort" className="flex flex-wrap gap-1">
          {(Object.keys(SORTS) as Sort[]).map((s) => <Link key={s} href={q({ sort: s === 'loses' ? null : s, open: null })} aria-current={s === sort ? 'true' : undefined}
            className="rounded-full border border-border px-3 py-1 text-sm aria-[current=true]:border-primary aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground">{SORTS[s]}</Link>)}
        </nav>
        <DataTable label="Products">
          <DataTableHead><th>Product</th><th className="text-right">Delivered</th><th className="text-right">Returned</th><th className="text-right">Return rate</th><th className="text-right">₹ kept</th><th className="text-right">Per order</th></DataTableHead>
          <DataTableBody>
            {rows.map((p) => (
              <ProductRows key={p.id} p={p} openHref={q({ open: open === p.id ? null : p.id, sort: sort === 'loses' ? null : sort })} open={open === p.id} variants={open === p.id ? variants : null} />
            ))}
          </DataTableBody>
        </DataTable>
      </div>,
    )
  }

  if (tab === 'pincodes') {
    const losing = d.pincodes.filter((p) => p.codLoses).length
    return home(
      <div className="space-y-4">
        {periods}
        <div className="flex flex-wrap gap-2"><Badge tone={losing ? 'warn' : 'neutral'}>COD loses money · {losing}</Badge><Badge tone="neutral">Top 50</Badge></div>
        {d.pincodes.length === 0 ? <Panel title="No PIN code with 5 orders yet" /> : (
          <DataTable label="Pincodes">
            <DataTableHead><th>Pincode</th><th>Place</th><th className="text-right">COD orders</th><th className="text-right">Returned</th><th className="text-right">₹ kept · COD</th><th className="text-right">₹ kept · prepaid</th></DataTableHead>
            <DataTableBody>
              {d.pincodes.map((p) => (
                <DataTableRow key={p.pincode}>
                  <Td cell="a"><span className="font-mono">{p.pincode}</span></Td>
                  <Td cell="c">{p.place ?? '—'}</Td>
                  <Td cell="hide" className="text-right"><Numeric>{p.codOrders}</Numeric></Td>
                  <Td cell="d" className="text-right"><Numeric>{p.codReturned}</Numeric><span className="md:hidden"> returned of {p.codOrders} COD</span></Td>
                  <Td cell="b" className="text-right">{p.codKept === null ? '—' : rs(p.codKept)}</Td>
                  <Td cell="hide" className="text-right">{p.prepaidKept === null ? '—' : rs(p.prepaidKept)}</Td>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </div>,
    )
  }

  // Overview.
  const k = d.total
  // What came back cost: parcels back and lost, and what returns after delivery credited.
  const returnsCost = -(k.rto.kept + k.lost.kept) + d.afterCredited
  const per = keptPerOrder(k)
  const earns = [...d.products].filter((p) => p.kept > 0).sort((a, b) => b.kept - a.kept).slice(0, 3)
  const loses = [
    ...d.products.filter((p) => p.kept < 0).map((p) => ({ label: p.name, kept: p.kept, href: q({ tab: 'products', open: p.id }) })),
    ...d.pincodes.filter((p) => p.codLoses).map((p) => ({ label: `Pincode ${p.pincode} · COD`, kept: p.codKept!, href: q({ tab: 'pincodes' }) })),
  ].sort((a, b) => a.kept - b.kept).slice(0, 3)
  const overall = rateOf(d.returned, d.delivered + k.rto.n)
  return home(
    <div className="space-y-4">
      {periods}
      {leftOut}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={`₹ kept · ${period} days`} value={rs(k.kept)} sub={`${formatCount(k.counted)} orders with an outcome`} />
        <Tile label="Per order" value={per === null ? '—' : rs(per)} />
        <Tile label="Returns cost you" value={rs(Math.max(0, returnsCost))} sub={`${formatCount(d.returned)} returned · ${formatCount(d.lost)} lost`} />
        <Tile label="Return rate" value={overall === null ? '—' : formatPercent(overall)}
          sub={d.codRate !== null || d.prepaidRate !== null ? `COD ${d.codRate === null ? '—' : formatPercent(d.codRate, 0)} · prepaid ${d.prepaidRate === null ? '—' : formatPercent(d.prepaidRate, 0)}` : undefined} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Earns most" flush>
          {earns.length ? <ul className="divide-y divide-border">{earns.map((p) => <ListRow key={p.id} label={p.name} kept={p.kept} href={q({ tab: 'products', open: p.id })} />)}</ul>
            : <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing yet</p>}
        </Section>
        <Section title="Loses most" flush>
          {loses.length ? <ul className="divide-y divide-border">{loses.map((l) => <ListRow key={l.label} label={l.label} kept={l.kept} href={l.href} />)}</ul>
            : <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing loses money</p>}
        </Section>
      </div>
    </div>,
  )
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Section>
      <span className="text-xs text-muted-foreground">{label}</span>
      <b className="block font-mono text-lg tabular-nums">{value}</b>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </Section>
  )
}

function ListRow({ label, kept, href }: { label: string; kept: number; href: string }) {
  return (
    <li><Link href={href} prefetch={false} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-muted/40">
      <span className="min-w-0 truncate">{label}</span>{rs(kept)}
    </Link></li>
  )
}

function ProductRows({ p, open, openHref, variants }: { p: Line; open: boolean; openHref: string; variants: Line[] | null }) {
  const r = rate(p), per = perOrder(p)
  return (
    <>
      <DataTableRow>
        <Td cell="a"><Link href={openHref} prefetch={false} data-row-link aria-expanded={open} className="font-medium">{p.name}{'\u00a0'}<span aria-hidden="true">{open ? "▾" : "▸"}</span></Link></Td>
        <Td cell="hide" className="text-right"><Numeric>{p.delivered}</Numeric></Td>
        <Td cell="hide" className="text-right"><Numeric>{p.returned}</Numeric></Td>
        <Td cell="d" className="text-right"><span className="md:hidden">{p.delivered} delivered · {p.returned} returned · </span><Numeric>{r === null ? '—' : formatPercent(r, 0)}</Numeric></Td>
        <Td cell="b" className="text-right">{rs(p.kept)}</Td>
        <Td cell="hide" className="text-right">{per === null ? '—' : rs(per)}</Td>
      </DataTableRow>
      {open && variants?.map((v) => {
        const vr = rate(v), vp = perOrder(v)
        return (
          <DataTableRow key={v.id} dimmed>
            <Td cell="a"><span className="pl-4">{v.name || 'One size'}</span></Td>
            <Td cell="hide" className="text-right"><Numeric>{v.delivered}</Numeric></Td>
            <Td cell="hide" className="text-right"><Numeric>{v.returned}</Numeric></Td>
            <Td cell="d" className="text-right"><Numeric>{vr === null ? '—' : formatPercent(vr, 0)}</Numeric></Td>
            <Td cell="b" className="text-right">{rs(v.kept)}</Td>
            <Td cell="hide" className="text-right">{vp === null ? '—' : rs(vp)}</Td>
          </DataTableRow>
        )
      })}
    </>
  )
}

