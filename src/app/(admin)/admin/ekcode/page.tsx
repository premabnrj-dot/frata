import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { FieldMessage } from '@/components/ui/action-form'
import { FIELD } from '@/components/ui/field'
import { ADMIN_ONLY, ANY_STAFF, requireStaff, type StaffOk } from '@/lib/auth/require-staff'
import { ekBlocks, ekSettings, ekShops, ekStats, type EkShop } from '@/lib/admin/ekcode'
import { DEFAULT_LIMITS, type Limits } from '@/domains/ekcode-core/limits'
import { dayMonthIN } from '@/lib/format-date'
import { DialogButton, MoreDialogs, type DialogSpec } from '../_components/form-dialog'
import { NeedsBand } from '../_components/needs-band'
import { blockAction, limitsAction, shopControlAction } from './actions'

export const metadata = { title: 'EkCode' }

// Admin › EkCode (Neel N4, board EkCode): the breaker leads, limits behind Edit. Counts, costs and controls; never a shopper.
const TABS = [['overview', 'Overview'], ['stores', 'Stores'], ['blocked', 'Blocked']] as const
const PERIODS = [[1, 'Today'], [7, '7 days'], [30, '30 days']] as const
const PER_MSG_PAISE = 11.5 // Meta's India authentication rate before GST (frata-integrations, checked 2026-11-09); GST is reclaimed
const n = (x: number | null | undefined) => (x == null ? 'fewer than 5' : x.toLocaleString('en-IN'))
const pct = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? `${Math.round((a / b) * 100)}%` : '—')
const Why = () => <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Why</span><input name="reason" required minLength={3} maxLength={500} data-error="Say why, in a few words." className={FIELD} /><FieldMessage name="reason" /></label>

/** A store's control, as a dialog: pause, resume, or reset its breaker (the action checks again). */
function controlOf(r: EkShop): DialogSpec {
  const act = r.paused_at ? 'resume' : r.breaker_at ? 'reset' : 'pause'
  const fields = <><input type="hidden" name="tenantId" value={r.tenant_id} /><input type="hidden" name="shop" value={r.shop} /><input type="hidden" name="action" value={act} /><Why /></>
  return act === 'resume' ? { label: 'Resume codes…', title: `Resume codes for ${r.shop}?`, action: shopControlAction, keep: 'Keep paused', go: 'Resume codes', fields }
    : act === 'reset' ? { label: 'Resume codes…', title: `Resume codes for ${r.shop}?`, description: 'Codes go out again at once.', action: shopControlAction, keep: 'Keep paused', go: 'Resume codes', fields }
    : { label: 'Pause codes…', title: `Pause codes for ${r.shop}?`, description: 'Its shoppers sign in without EkCode until you resume.', action: shopControlAction, keep: 'Keep running', go: 'Pause codes', danger: true, fields }
}

export default async function EkcodeAdmin({ searchParams }: { searchParams: Promise<{ tab?: string; days?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [sp, admin] = await Promise.all([searchParams, requireStaff(ADMIN_ONLY)])
  const tab = admin.ok && (sp.tab === 'stores' || sp.tab === 'blocked') ? sp.tab : 'overview'
  const days = sp.days === '1' ? 1 : sp.days === '30' ? 30 : 7
  const href = (t: string, d = days) => `/admin/ekcode?tab=${t}&days=${d}`
  const [shops, settings] = admin.ok ? await Promise.all([ekShops(admin, days).catch(() => null), ekSettings(admin).catch(() => null)]) : [null, null]
  const stopped = (shops ?? []).filter((r) => r.paused_at || r.breaker_at)
  const first = stopped[0]
  const l = { ...DEFAULT_LIMITS, ...(settings?.limits as Partial<Limits> | undefined) }
  const rows: [keyof Limits, string][] = [['perNumber10m', 'Codes per number, 10 min'], ['perNumberDay', 'Codes per number, a day'], ['triesPerCode', 'Tries per code'],
    ['perNetworkHour', 'Codes per network, an hour'], ['perWideNetworkHour', 'Codes per wide network, an hour'], ['globalHour', 'Codes, every store, an hour'],
    ['breakerAfter', 'Check after this many codes'], ['breakerMinRight', 'Pause below this share typed right']]
  const small = `${FIELD} w-28 font-num`

  return (
    <>
      <PageHeader title="EkCode" actions={admin.ok && <>
        <DialogButton spec={{ label: 'Block a number', title: 'Block or unblock a number?', action: blockAction, keep: 'Don’t change it', go: 'Apply to this number', fields: <>
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Number</span><input name="phone" inputMode="numeric" maxLength={14} className={`${FIELD} font-num`} /><FieldMessage name="phone" /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Block or unblock</span><select name="lift" className={FIELD}><option value="0">Block</option><option value="1">Unblock</option></select></label>
          <Why /></> }} />
        <DialogButton spec={{ label: 'Edit limits', title: 'Edit limits for every store?', description: settings ? `Version ${settings.version} · ${dayMonthIN(new Date(settings.at))}` : undefined, action: limitsAction, keep: 'Keep limits', go: 'Save limits', fields: <>
          <label className="flex min-h-6 items-center gap-2 text-sm font-medium"><input type="checkbox" name="signIn" defaultChecked={settings?.sign_in ?? true} /> Sign-in with EkCode, every store</label>
          {rows.map(([k, label]) => <label key={k} className="flex items-center justify-between gap-3 text-sm">{label}<input name={k} type="number" step={k === 'breakerMinRight' ? '0.05' : '1'} defaultValue={String(l[k])} className={small} /><FieldMessage name={k} /></label>)}
          {(['launch', 'growth', 'scale'] as const).map((p) => <label key={p} className="flex items-center justify-between gap-3 text-sm">Codes a day per store · {p[0]!.toUpperCase() + p.slice(1)}<input name={p} type="number" defaultValue={String(l.perShopDay[p])} className={small} /></label>)}
          <Why /></> }} />
      </>} />

      {first && (
        <NeedsBand title={`Codes are paused for ${first.shop}.`}
          line={`${n(first.codes)} asked · ${pct(first.verified, first.codes)} typed right${stopped.length > 1 ? ` · ${stopped.length - 1} more paused` : ''}`}
          action={<DialogButton spec={controlOf(first)} />} />
      )}

      <ViewTabs label="EkCode" tabs={TABS.filter(([t]) => admin.ok || t === 'overview').map(([t, label]) => ({ href: href(t), label, count: t === 'blocked' ? undefined : undefined, current: tab === t }))} />
      {tab !== 'blocked' && (
        <nav aria-label="Period" className="flex gap-1.5">{PERIODS.map(([d, label]) => <Link key={d} href={href(tab, d)} aria-current={days === d ? 'page' : undefined} className={`inline-flex min-h-6 items-center rounded-full border border-border px-3 py-1 text-sm ${days === d ? 'bg-foreground text-background' : ''}`}>{label}</Link>)}</nav>
      )}
      {tab === 'overview' && <Overview staff={staff} days={days} />}
      {tab === 'stores' && shops !== null && (shops.length === 0 ? <Panel title="No store has EkCode on yet" /> : (
        <DataTable label="Stores with EkCode">
          <DataTableHead><th>Store</th><th className="text-right">Codes</th><th className="text-right">Right</th><th className="text-right">Continued</th><th>State</th><th><span className="sr-only">More</span></th></DataTableHead>
          <DataTableBody>
            {shops.map((r) => (
              <DataTableRow key={r.tenant_id}>
                <Td cell="a" className="font-medium">{r.shop}</Td>
                <Td cell="c" className="text-right font-num">{n(r.codes)}</Td>
                <Td cell="c" className="text-right font-num">{pct(r.verified, r.codes)}</Td>
                <Td cell="c" className="text-right font-num">{n(r.continued)}</Td>
                <Td cell="d">{r.paused_at ? <Badge tone="warn">Paused</Badge> : r.breaker_at ? <Badge tone="danger">Paused by limit</Badge> : <Badge tone="ok">Running</Badge>}{r.raised_cap ? <span className="ml-2 text-xs text-muted-foreground">cap {r.raised_cap} a day</span> : null}</Td>
                <Td cell="f" className="text-right"><MoreDialogs label={`More for ${r.shop}`} specs={[controlOf(r)]} /></Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      ))}
      {tab === 'blocked' && admin.ok && <Blocked staff={admin} />}
    </>
  )
}

async function Overview({ staff, days }: { staff: StaffOk; days: 1 | 7 | 30 }) {
  const s = await ekStats(staff, days)
  if (!s) return <Panel title="No EkCode numbers yet" />
  const kept = [['Asked for a code', s.codes, null], ['Typed it right', s.verified, s.codes], ['Continued to pay', s.continued, s.verified]] as const
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
        {[['Accounts', n(s.accounts)], ['Signed in', n(s.active)], ['On 2 or more stores', n(s.multi_shop)], ['Meta cost', `₹${((s.codes_month * PER_MSG_PAISE) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`]].map(([label, v]) => (
          <div key={label} className="flex flex-col-reverse bg-card p-4"><dd className="font-num text-2xl">{v}</dd><dt className="text-xs text-muted-foreground">{label}</dt></div>
        ))}
      </dl>
      <DataTable label="Sign-in, step by step">
        <DataTableHead><th>Step</th><th className="text-right">Shoppers</th><th className="text-right">Kept</th></DataTableHead>
        <DataTableBody>{kept.map(([label, v, of]) => <DataTableRow key={label}><Td cell="a">{label}</Td><Td cell="c" className="text-right font-num">{n(v)}</Td><Td cell="b" className="text-right font-num">{of === null ? '—' : pct(v, of)}</Td></DataTableRow>)}</DataTableBody>
      </DataTable>
    </div>
  )
}

async function Blocked({ staff }: { staff: StaffOk }) {
  const blocks = await ekBlocks(staff)
  if (!blocks.length) return <Panel title="Nothing is blocked" />
  return (
    <DataTable label="Blocked">
      <DataTableHead><th>Kind</th><th>Why</th><th>When</th></DataTableHead>
      <DataTableBody>{blocks.map((b) => <DataTableRow key={b.key_hash}><Td cell="a">{b.kind === 'phone' ? 'A number' : 'A network'}</Td><Td cell="c">{b.reason}</Td><Td cell="d">{dayMonthIN(new Date(b.at))}</Td></DataTableRow>)}</DataTableBody>
    </DataTable>
  )
}
