import 'server-only'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { MON_TO_SAT, type Dispatch } from '@/domains/delivery/dates'
import type { PinRule, Zone, ZoneSetup } from '@/domains/delivery/resolve'
import type { PresetKey } from '@/domains/delivery/presets'
import { istDayKey } from '@/domains/time/day'
import type { Tx } from '@/lib/db'
import { pincodes, shopSettings } from '@/lib/db/schema'
import { deliveryRules, deliveryZonePins, deliveryZones, shopHolidays } from '@/lib/db/schema-delivery'
import { withTenant } from '@/lib/db/tenant'
import { moduleAccessIn } from './modules'

// =============================================================================
// FILE: src/lib/queries/delivery.ts — what Delivery Zones knows about ONE PIN code, read inside the caller's transaction
// (plan docs/plans/2026-11-12-delivery-zones.md; speed review H2, security review H1). Checkout's quote, placement and
// the switch to COD call it inside their own withTenant (never a cached loader there: P4). It reads ≤ 50 zones (no PIN
// lists), the brand's zone that lists this PIN code or its prefix (by key), this PIN code's rule (by key), holidays
// from today, the shop's dispatch settings and the directory's place for the PIN code — the place comes from the
// directory, never from the address typed. Most shops have no zones: then nothing more is read and the floor answers.
// =============================================================================

export type DeliveryRead = { setup: ZoneSetup | null; dispatch: Dispatch | null; place: { city: string; state: string } | null }

const PIN = /^[1-9][0-9]{5}$/

export async function deliveryIn(tx: Tx, tenantId: string, pin: string | null | undefined, now: Date): Promise<DeliveryRead> {
  const p = pin && PIN.test(pin) ? pin : null
  const [zones, own, rule, holidays, [s], [place]] = await Promise.all([
    tx.select({ id: deliveryZones.id, name: deliveryZones.name, position: deliveryZones.position, preset: deliveryZones.preset, charge: deliveryZones.charge,
      freeAbove: deliveryZones.freeAbove, daysMin: deliveryZones.daysMin, daysMax: deliveryZones.daysMax, codOn: deliveryZones.codOn, codCharge: deliveryZones.codCharge,
      codMin: deliveryZones.codMin, codMax: deliveryZones.codMax }).from(deliveryZones).where(eq(deliveryZones.tenantId, tenantId)),
    p ? tx.select({ zoneId: deliveryZonePins.zoneId }).from(deliveryZonePins).where(and(eq(deliveryZonePins.tenantId, tenantId), inArray(deliveryZonePins.pin, [p, p.slice(0, 3)]))) : Promise.resolve([]),
    p ? tx.select({ rule: deliveryRules.rule, codMax: deliveryRules.codMax }).from(deliveryRules).where(and(eq(deliveryRules.tenantId, tenantId), eq(deliveryRules.pincode, p))) : Promise.resolve([]),
    tx.select({ day: shopHolidays.day }).from(shopHolidays).where(and(eq(shopHolidays.tenantId, tenantId), gte(shopHolidays.day, istDayKey(now)))),
    tx.select({ days: shopSettings.dispatchDays, cutoff: shopSettings.dispatchCutoff, shipDays: shopSettings.shipDays }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)),
    p ? tx.select({ city: pincodes.city, state: pincodes.state }).from(pincodes).where(eq(pincodes.pincode, p)) : Promise.resolve([]),
  ])
  const placeOf = place ?? null
  if (!zones.length) return { setup: null, dispatch: null, place: placeOf }
  // Zones exist: they apply only while the app is usable (on, granted, not paused); otherwise the floor (plan, Arch M3).
  const access = await moduleAccessIn(tx, tenantId, now)
  if (!access.delivery_zones.usable) return { setup: null, dispatch: null, place: placeOf }
  const r = rule[0]
  const pinRule: PinRule | null = !r ? null : r.rule === 'cod_max' && r.codMax !== null ? { rule: 'cod_max', codMax: Number(r.codMax) }
    : r.rule === 'no_delivery' ? { rule: 'no_delivery' } : r.rule === 'prepaid_only' ? { rule: 'prepaid_only' } : null
  const setup: ZoneSetup = {
    zones: zones.map((z): Zone => ({ ...z, preset: (z.preset as PresetKey | null), charge: Number(z.charge), freeAbove: z.freeAbove === null ? null : Number(z.freeAbove),
      codCharge: Number(z.codCharge), codMin: Number(z.codMin), codMax: z.codMax === null ? null : Number(z.codMax) })),
    ownZoneIds: own.map((o) => o.zoneId), rule: pinRule,
  }
  const dispatch: Dispatch = { days: s?.days ?? 1, cutoff: s?.cutoff ?? null, shipDays: s?.shipDays ?? MON_TO_SAT, holidays: holidays.map((h) => String(h.day)) }
  return { setup, dispatch, place: placeOf }
}

/** The product page's PIN code check (the storefront delivery endpoint): the same read, in its own transaction. */
export function deliveryFor(tenantId: string, pin: string, now: Date): Promise<DeliveryRead> {
  return withTenant(tenantId, (tx) => deliveryIn(tx, tenantId, pin, now))
}
