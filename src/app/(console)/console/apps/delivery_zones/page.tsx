import { Panel } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { CAN_BUILD, CONSOLE_ROLES } from '@/domains/tenancy/roles'
import { zoneCounts } from '@/domains/delivery/counts'
import { requireMember } from '@/lib/auth/require-member'
import { directoryPins } from '@/lib/queries/storefront'
import { deliveryConsole, RULES_PAGE } from '@/lib/queries/delivery'
import { appsPage } from '@/lib/queries/modules'
import { errName } from '@/lib/log'
import { AppAbout } from '../_components/app-about'
import { aboutProps, mayTurnOff } from '../_components/about-data'
import { AppHome } from '../_components/app-home'
import { ZonesTab } from './zones'
import { RulesTab } from './rules'
import { DatesTab } from './dates'

export const metadata = { title: 'Delivery Zones' }
export const dynamic = 'force-dynamic'

// =============================================================================
// Console › Apps › Delivery Zones (PD·1; approved mockup https://claude.ai/artifact/67kHoVDaRX5AFS5vWcWAgR, plan
// docs/plans/2026-11-12-delivery-zones.md). Not usable: the app's page (Launch: ₹999/month). Usable: its home — Zones,
// PIN code rules, Delivery dates, Usage and billing. Every member reads; CAN_BUILD edits (the actions say so again).
// =============================================================================

const TABS = [{ key: 'rules', label: 'PIN code rules' }, { key: 'dates', label: 'Delivery dates' }]

export default async function DeliveryZonesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const auth = await requireMember(CONSOLE_ROLES)
  if (!auth.ok) return <Panel title={auth.message} />
  const now = new Date()
  const apps = await appsPage(auth.membership.tenantId, auth.userId, now.toISOString()).catch((err) => { console.error('[zones apps]', errName(err)); return null })
  if (!apps) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const gate = apps.access.delivery_zones
  const about = aboutProps('delivery_zones', apps, now, mayTurnOff(auth.membership), auth.membership.tenantName)
  if (!gate.usable) {
    return <AppAbout {...about}
      notice={gate.why === 'paused' ? <p role="status" className="mb-4 rounded-md bg-warn px-3 py-2 text-sm text-warn-text">Delivery Zones is paused by Frrata. Your Settings apply until it’s back.</p> : undefined} />
  }
  const sp = await searchParams
  const accountant = auth.membership.role === 'accountant'
  const tab = sp.tab === 'rules' || sp.tab === 'dates' ? sp.tab : sp.tab === 'billing' && !accountant ? 'billing' : 'overview'
  const canEdit = (CAN_BUILD as readonly string[]).includes(auth.membership.role)
  const q = /^[0-9]{1,6}$/.test(sp.q ?? '') ? sp.q! : ''
  const page = Math.max(1, Math.min(50, Number(sp.page) || 1))
  const d = tab === 'billing' ? null : await deliveryConsole(auth.membership.tenantId, q, page).catch((err) => { console.error('[zones]', errName(err)); return undefined })
  const home = (body?: React.ReactNode) => (
    <AppHome k="delivery_zones" tab={tab} first="Zones" tabs={TABS} offer={about.offer} worksWith={about.worksWith} billing={!accountant}
      canTurnOff={mayTurnOff(auth.membership)} meta={d?.settings?.pickup ? <>From <span className="font-mono">{d.settings.pickup}</span></> : undefined}
      badge={d && d.zones.length ? <Badge tone="neutral">{d.zones.length} zones</Badge> : undefined}>{body}</AppHome>
  )
  if (tab === 'billing') return home()
  if (!d || !d.settings) return home(<Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>)

  if (tab === 'rules') {
    return home(<RulesTab rules={d.rules} count={d.ruleCount} q={q} page={page} pages={Math.max(1, Math.ceil(d.ruleCount / RULES_PAGE))}
      fromSettings={d.settings.blocked ?? []} canEdit={canEdit} />)
  }
  if (tab === 'dates') {
    return home(<DatesTab nowIso={now.toISOString()} canEdit={canEdit} holidays={d.holidays}
      dispatch={{ days: d.settings.dispatchDays, cutoff: d.settings.cutoff, shipDays: d.settings.shipDays }}
      zones={d.zones.map((z) => ({ id: z.id, name: z.name, daysMin: z.daysMin, daysMax: z.daysMax }))} />)
  }
  // Zones: how many of India Post's PIN codes each takes, by the rule's own matching (counts.ts).
  const dir = d.zones.length ? await directoryPins().catch((err) => { console.error('[zones directory]', errName(err)); return [] as string[] }) : []
  const own = new Map(d.zones.flatMap((z) => z.pins.map((p) => [p, z.id] as const)))
  const counts = zoneCounts(dir, d.zones, own)
  return home(
    <>
      <ZonesTab canEdit={canEdit} zones={d.zones.map((z) => ({ ...z, count: dir.length ? counts.get(z.id) ?? 0 : null }))}
        floor={{ charge: d.settings.shippingFlat, freeAbove: d.settings.freeShippingAbove || null, codOn: d.settings.codOn, codCharge: d.settings.codCharge }} />
      {!canEdit && <p className="mt-3 text-sm text-muted-foreground">Only the owner or an admin changes zones.</p>}
    </>,
  )
}
