import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { ekBlocks, ekSettings, ekShops, ekStats } from '@/lib/admin/ekcode'
import { DEFAULT_LIMITS, type Limits } from '@/domains/ekcode-core/limits'
import { dateTimeIN } from '@/lib/format-date'
import { blockAction, limitsAction, shopControlAction } from './actions'
import { Submit } from '@/components/ui/submit'

export const metadata = { title: 'EkCode' }

// Admin › EkCode (approved mockup v4, P1: Overview, Shops, Controls). Counts, costs and controls; never a shopper.
const TABS = [['overview', 'Overview'], ['shops', 'Shops'], ['controls', 'Controls']] as const
const PERIODS = [[1, 'Today'], [7, '7 days'], [30, '30 days']] as const
const PER_MSG_PAISE = 11.5 // Meta's India authentication rate before GST (frata-integrations, checked 2026-11-09); GST is reclaimed
const n = (x: number | null | undefined) => (x == null ? 'fewer than 5' : x.toLocaleString('en-IN'))
const field = 'h-10 w-28 rounded-md border border-input bg-card px-3 text-sm md:h-9'

export default async function EkcodeAdmin({ searchParams }: { searchParams: Promise<{ tab?: string; days?: string; ok?: string; error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const sp = await searchParams
  const admin = await requireStaff(ADMIN_ONLY)
  const tab = admin.ok && (sp.tab === 'shops' || sp.tab === 'controls') ? sp.tab : 'overview'
  const days = sp.days === '1' ? 1 : sp.days === '30' ? 30 : 7
  const href = (t: string, d = days) => `/admin/ekcode?tab=${t}&days=${d}`
  return (
    <>
      <PageHeader title="EkCode" />
      <Notice ok={sp.ok} error={sp.error} />
      <nav aria-label="EkCode" className="mb-4 flex gap-1 border-b border-border">
        {TABS.filter(([t]) => admin.ok || t === 'overview').map(([t, label]) => (
          <Link key={t} href={href(t)} aria-current={tab === t ? 'page' : undefined} className={`px-3 py-2 text-sm ${tab === t ? 'border-b-2 border-foreground font-medium' : 'text-muted-foreground'}`}>{label}</Link>
        ))}
      </nav>
      {tab !== 'controls' && (
        <div className="mb-4 flex gap-1.5">{PERIODS.map(([d, label]) => <Link key={d} href={href(tab, d)} className={`rounded-full border border-border px-3 py-1 text-sm ${days === d ? 'bg-foreground text-background' : ''}`}>{label}</Link>)}</div>
      )}
      {tab === 'overview' && <Overview staff={staff} days={days} />}
      {tab === 'shops' && admin.ok && <Shops staff={admin} days={days} />}
      {tab === 'controls' && admin.ok && <Controls staff={admin} />}
    </>
  )
}

async function Overview({ staff, days }: { staff: Parameters<typeof ekStats>[0]; days: 1 | 7 | 30 }) {
  const s = await ekStats(staff, days)
  if (!s) return <Panel title="No EkCode numbers yet" />
  const steps = [['Tapped', s.started], ['Code sent', s.codes], ['Code arrived', s.delivered], ['Code right', s.verified], ['Continued', s.continued]] as const
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
        {[['EkCode accounts', n(s.accounts)], ['Signed in · 30 days', n(s.active)], ['Shoppers on 2+ shops', n(s.multi_shop)], ['Peak codes a minute', n(s.peak_minute)]].map(([l, v]) => (
          <div key={l} className="bg-card p-4"><dd className="font-mono text-2xl">{v}</dd><dt className="text-xs text-muted-foreground">{l}</dt></div>
        ))}
      </dl>
      <DataTable label="Sign-in, step by step">
        <DataTableHead><th>Step</th><th className="text-right">Count</th></DataTableHead>
        <DataTableBody>{steps.map(([l, v]) => <DataTableRow key={l}><Td cell="a">{l}</Td><Td cell="c" className="text-right font-mono">{n(v)}</Td></DataTableRow>)}</DataTableBody>
      </DataTable>
      <p className="text-sm">Codes delivered this month: <span className="font-mono">{n(s.codes_month)}</span> · Meta, ex GST: <span className="font-mono">₹{((s.codes_month * PER_MSG_PAISE) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></p>
    </div>
  )
}

async function Shops({ staff, days }: { staff: Parameters<typeof ekShops>[0]; days: 1 | 7 | 30 }) {
  const shops = await ekShops(staff, days)
  if (!shops.length) return <Panel title="No shop has EkCode on yet" />
  return (
    <DataTable label="Shops with EkCode">
      <DataTableHead><th>Shop</th><th className="text-right">Codes</th><th className="text-right">Right</th><th className="text-right">Continued</th><th>State</th><th><span className="sr-only">Action</span></th></DataTableHead>
      <DataTableBody>
        {shops.map((r) => (
          <DataTableRow key={r.tenant_id}>
            <Td cell="a" className="font-medium">{r.shop}</Td>
            <Td cell="c" className="text-right font-mono">{n(r.codes)}</Td>
            <Td cell="c" className="text-right font-mono">{r.codes && r.verified != null ? `${Math.round((r.verified / r.codes) * 100)}%` : '—'}</Td>
            <Td cell="c" className="text-right font-mono">{n(r.continued)}</Td>
            <Td cell="d">{r.paused_at ? <Badge tone="warn">Paused</Badge> : r.breaker_at ? <Badge tone="warn">Breaker</Badge> : <Badge tone="ok">OK</Badge>}{r.raised_cap ? <span className="ml-2 text-xs text-muted-foreground">cap {r.raised_cap}/day</span> : null}</Td>
            <Td cell="f" className="text-right">
              <form action={shopControlAction} className="flex justify-end gap-2">
                <input type="hidden" name="tenantId" value={r.tenant_id} /><input type="hidden" name="shop" value={r.shop} />
                <input type="hidden" name="action" value={r.paused_at ? 'resume' : r.breaker_at ? 'reset' : 'pause'} />
                <label className="sr-only" htmlFor={`why-${r.tenant_id}`}>Why</label>
                <input id={`why-${r.tenant_id}`} name="reason" required minLength={3} maxLength={500} placeholder="Why" className="h-10 w-40 rounded-md border border-input bg-card px-3 text-sm md:h-9" />
                <Submit variant="secondary">{r.paused_at ? `Resume ${r.shop}` : r.breaker_at ? `Reset ${r.shop}'s breaker` : `Pause EkCode for ${r.shop}`}</Submit>
              </form>
            </Td>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  )
}

async function Controls({ staff }: { staff: Parameters<typeof ekSettings>[0] }) {
  const [s, blocks] = await Promise.all([ekSettings(staff), ekBlocks(staff)])
  const l = { ...DEFAULT_LIMITS, ...(s?.limits as Partial<Limits> | undefined) }
  const rows: [keyof Limits, string][] = [['perNumber10m', 'Codes per number, 10 min'], ['perNumberDay', 'Codes per number, a day'], ['triesPerCode', 'Tries per code'],
    ['perNetworkHour', 'Codes per network, an hour'], ['perWideNetworkHour', 'Codes per wide network, an hour'], ['globalHour', 'Codes, every shop, an hour'],
    ['breakerAfter', 'Breaker after codes'], ['breakerMinRight', 'Breaker below share right']]
  return (
    <div className="grid gap-6">
      <Section title="Limits">
      <form action={limitsAction} className="grid gap-3">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="signIn" defaultChecked={s?.sign_in ?? true} /> Sign-in with EkCode, every shop</label>
        {rows.map(([k, label]) => (
          <label key={k} className="flex items-center justify-between gap-3 text-sm">{label}
            <input name={k} type="number" step={k === 'breakerMinRight' ? '0.05' : '1'} defaultValue={String(l[k])} className={field} /></label>
        ))}
        {(['launch', 'growth', 'scale'] as const).map((p) => (
          <label key={p} className="flex items-center justify-between gap-3 text-sm">Codes a day per shop · {p[0]!.toUpperCase() + p.slice(1)}
            <input name={p} type="number" defaultValue={String(l.perShopDay[p])} className={field} /></label>
        ))}
        <label className="grid gap-1 text-sm font-medium">Why<input name="reason" required minLength={3} maxLength={500} className="h-10 rounded-md border border-input bg-card px-3 text-sm font-normal md:h-9" /></label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{s ? `v${s.version} · ${dateTimeIN(new Date(s.at))}` : ''}</span>
          <Submit>Save limits for every shop</Submit>
        </div>
      </form>
      </Section>
      <Section title="Block a number">
      <form action={blockAction} className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm font-medium">Number<input name="phone" inputMode="numeric" maxLength={14} className="h-10 w-40 rounded-md border border-input bg-card px-3 font-mono text-sm md:h-9" /></label>
        <label className="grid gap-1 text-sm font-medium">Why<input name="reason" required minLength={3} maxLength={500} className="h-10 w-56 rounded-md border border-input bg-card px-3 text-sm font-normal md:h-9" /></label>
        <select name="lift" className="h-10 rounded-md border border-input bg-card px-2 text-sm md:h-9" aria-label="Block or unblock"><option value="0">Block</option><option value="1">Unblock</option></select>
        <Submit variant="secondary">Apply to this number</Submit>
      </form>
      </Section>
      <DataTable label="Blocked">
        <DataTableHead><th>Kind</th><th>Why</th><th>When</th></DataTableHead>
        <DataTableBody>{blocks.map((b) => <DataTableRow key={b.key_hash}><Td cell="a">{b.kind === 'phone' ? 'A number' : 'A network'}</Td><Td cell="c">{b.reason}</Td><Td cell="d">{dateTimeIN(new Date(b.at))}</Td></DataTableRow>)}</DataTableBody>
      </DataTable>
    </div>
  )
}
