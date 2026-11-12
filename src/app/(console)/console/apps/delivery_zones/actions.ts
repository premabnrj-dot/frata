'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { PRESET_NAMES } from '@/domains/delivery/presets'
import { MAX_HOLIDAYS, MAX_PINS, MAX_RULES, MAX_ZONES, readPins, readRulesCsv, RULES } from '@/domains/delivery/lists'
import { asModule } from '@/lib/auth/as-module'
import { CAN_BUILD, requireMember } from '@/lib/auth/require-member'
import type { Tx } from '@/lib/db'
import { auditEvents, shopSettings } from '@/lib/db/schema'
import { deliveryRules, deliveryZonePins, deliveryZones, shopHolidays } from '@/lib/db/schema-delivery'
import { refreshShop } from '@/lib/storefront/refresh'
import { shopModules } from '@/lib/queries/modules'
import { errName } from '@/lib/log'

// =============================================================================
// Console › Apps › Delivery Zones (PD·1; plan docs/plans/2026-11-12-delivery-zones.md, review findings). Who: CAN_BUILD
// (owners, admins, partners before handover — the same rule as Settings › Shipping and Pay on delivery), through
// asModule (the app usable: on, granted, not paused); a support visit acts as today, audited by asMember. Each write:
// Zod-capped input, the shop's totals checked under the shop's own delivery lock, one member audit row (counts or the
// one PIN code, never 5,000), then the shop's cached facts refreshed (the product page and policy state the zones).
// =============================================================================

type Result = { ok: true } | { ok: false; error: string }
const FAILED = 'We could not save that. Nothing was changed.'
const rupees = z.number().min(0).max(1_00_000)
const paise = (r: number) => Math.round(r * 100)

async function write(action: string, detail: object, work: (tx: Tx, tenantId: string) => Promise<string | null>): Promise<Result> {
  try {
    const r = await asModule('delivery_zones', CAN_BUILD, { action, detail }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${tenantId + ':delivery'}, 0))`)
      const refused = await work(tx, tenantId)
      if (refused) return refused
      if (!auth.membership.supportSessionId) await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action, detail })
      return null
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value) return { ok: false, error: r.value }
    // Only zones and dispatch reach a cached page (coreShop); rules and holidays are read per check (speed review DZ7 M3).
    if (!/^delivery\.(rule|rules|holiday)\./.test(action)) refreshShop(r.tenantId, 'shop')
    revalidatePath('/console/apps/delivery_zones')
    return { ok: true }
  } catch (err) {
    console.error(`[${action}]`, errName(err))
    return { ok: false, error: FAILED }
  }
}

/** The four starting zones, each with today's Settings, so nothing changes for shoppers until the brand edits one. */
export async function startZonesAction(): Promise<Result> {
  return write('delivery.zones.start', {}, async (tx, t) => {
    const [n] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${deliveryZones} where tenant_id = ${t}`)
    if (n && n.n > 0) return 'Your zones are already set up.'
    const [s] = await tx.select({ flat: shopSettings.shippingFlat, free: shopSettings.freeShippingAbove, codOn: shopSettings.codOn, codCharge: shopSettings.codCharge, codMin: shopSettings.codMin,
      codMax: shopSettings.codMax, metro: shopSettings.metroDays, rest: shopSettings.restDays }).from(shopSettings).where(eq(shopSettings.tenantId, t))
    if (!s) return FAILED
    const order = ['metro', 'tier2', 'special', 'rest'] as const
    await tx.insert(deliveryZones).values(order.map((preset, position) => ({
      tenantId: t, position, name: PRESET_NAMES[preset], preset, charge: Number(s.flat), freeAbove: Number(s.free) || null,
      daysMin: Math.min(s.metro, s.rest), daysMax: Math.max(s.metro, s.rest), codOn: s.codOn, codCharge: Number(s.codCharge), codMin: Number(s.codMin), codMax: Number(s.codMax) || null,
    })))
    return null
  })
}

const Zone = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(40),
  charge: rupees, freeAbove: rupees.nullable(), daysMin: z.number().int().min(0).max(60), daysMax: z.number().int().min(0).max(60),
  codOn: z.boolean(), codCharge: rupees, codMin: rupees, codMax: rupees.nullable(),
  /** The brand's own zone's PIN codes and prefixes, as typed; ignored for a starting zone. */
  pins: z.string().max(60_000).optional(),
}).refine((v) => v.daysMax >= v.daysMin, { message: 'days' })

export async function saveZoneAction(input: unknown): Promise<Result> {
  const p = Zone.safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues.some((i) => i.message === 'days') ? 'The longest delivery time can’t be shorter than the shortest.' : 'Check the zone’s numbers.' }
  const v = p.data
  const own = v.pins !== undefined ? readPins(v.pins) : null
  if (own?.bad.length) return { ok: false, error: `Not a PIN code or 3-digit prefix: ${own.bad.join(', ')}` }
  return write('delivery.zone.save', { zone: v.name, pins: own?.pins.length ?? 0 }, async (tx, t) => {
    const cols = { name: v.name, charge: paise(v.charge), freeAbove: v.freeAbove ? paise(v.freeAbove) : null, daysMin: v.daysMin, daysMax: v.daysMax,
      codOn: v.codOn, codCharge: paise(v.codCharge), codMin: paise(v.codMin), codMax: v.codMax ? paise(v.codMax) : null, updatedAt: new Date() }
    let id = v.id
    let preset: string | null = null
    if (id) {
      const [z0] = await tx.update(deliveryZones).set(cols).where(and(eq(deliveryZones.tenantId, t), eq(deliveryZones.id, id))).returning({ preset: deliveryZones.preset })
      if (!z0) return 'This zone was removed. Reload the page.'
      preset = z0.preset
    } else {
      const [c] = await tx.execute<{ n: number; next: number }>(sql`select count(*)::int as n, coalesce(max(position) + 1, 0)::int as next from ${deliveryZones} where tenant_id = ${t}`)
      if ((c?.n ?? 0) >= MAX_ZONES) return `A shop can have up to ${MAX_ZONES} zones.`
      if ((c?.next ?? 0) > 49) return 'Remove a zone first.'
      const [z1] = await tx.insert(deliveryZones).values({ tenantId: t, position: c?.next ?? 0, preset: null, ...cols }).returning({ id: deliveryZones.id })
      id = z1!.id
    }
    if (own && preset === null) {
      // The zone's own list replaces what it had; a PIN code can be in one zone only, and the shop holds ≤ 5,000.
      await tx.delete(deliveryZonePins).where(and(eq(deliveryZonePins.tenantId, t), eq(deliveryZonePins.zoneId, id!)))
      const [c] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${deliveryZonePins} where tenant_id = ${t}`)
      if ((c?.n ?? 0) + own.pins.length > MAX_PINS) return `A shop's zones can list up to ${MAX_PINS.toLocaleString('en-IN')} PIN codes.`
      if (own.pins.length) {
        const taken = await tx.execute<{ pin: string; name: string }>(sql`select p.pin, z.name from ${deliveryZonePins} p join ${deliveryZones} z on z.id = p.zone_id and z.tenant_id = p.tenant_id
          where p.tenant_id = ${t} and p.pin in (select jsonb_array_elements_text(${JSON.stringify(own.pins)}::jsonb)) limit 3`)
        if (taken.length) return `${taken.map((x) => `${x.pin} is already in ${x.name}`).join('; ')}.`
        await tx.execute(sql`insert into ${deliveryZonePins} (tenant_id, pin, zone_id) select ${t}::uuid, x, ${id}::uuid from jsonb_array_elements_text(${JSON.stringify(own.pins)}::jsonb) x`)
      }
    }
    return null
  })
}

export async function deleteZoneAction(id: unknown): Promise<Result> {
  const p = z.uuid().safeParse(id)
  if (!p.success) return { ok: false, error: FAILED }
  return write('delivery.zone.delete', {}, async (tx, t) => {
    const gone = await tx.delete(deliveryZones).where(and(eq(deliveryZones.tenantId, t), eq(deliveryZones.id, p.data))).returning({ id: deliveryZones.id })
    if (!gone.length) return 'This zone was already removed.'
    // Positions stay 0…n−1 (the unique slot a new zone takes).
    await tx.execute(sql`update ${deliveryZones} z set position = r.p from (select id, (row_number() over (order by position))::int - 1 as p from ${deliveryZones} where tenant_id = ${t}) r where z.id = r.id and z.tenant_id = ${t}`)
    return null
  })
}

export async function moveZoneAction(input: unknown): Promise<Result> {
  const p = z.object({ id: z.uuid(), up: z.boolean() }).safeParse(input)
  if (!p.success) return { ok: false, error: FAILED }
  return write('delivery.zone.move', {}, async (tx, t) => {
    const rows = await tx.select({ id: deliveryZones.id, position: deliveryZones.position }).from(deliveryZones).where(eq(deliveryZones.tenantId, t)).orderBy(deliveryZones.position)
    const i = rows.findIndex((r) => r.id === p.data.id), j = p.data.up ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= rows.length) return null
    const a = rows[i]!, b = rows[j]!
    // Positions carry no unique rule (the order is read sorted), so the two simply trade places.
    await tx.update(deliveryZones).set({ position: a.position }).where(and(eq(deliveryZones.tenantId, t), eq(deliveryZones.id, b.id)))
    await tx.update(deliveryZones).set({ position: b.position }).where(and(eq(deliveryZones.tenantId, t), eq(deliveryZones.id, a.id)))
    return null
  })
}

const Rule = z.object({ pincode: z.string().regex(/^[1-9][0-9]{5}$/), rule: z.enum(RULES), codMax: rupees.nullable(), note: z.string().trim().max(120).nullable() })
  .refine((r) => (r.rule === 'cod_max') === (r.codMax !== null && r.codMax > 0))

export async function addRuleAction(input: unknown): Promise<Result> {
  const p = Rule.safeParse(input)
  if (!p.success) return { ok: false, error: 'Check the PIN code and the rule.' }
  const v = p.data
  return write('delivery.rule.add', { pincode: v.pincode, rule: v.rule }, async (tx, t) => {
    const [c] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${deliveryRules} where tenant_id = ${t} and pincode <> ${v.pincode}`)
    if ((c?.n ?? 0) >= MAX_RULES) return `A shop can have up to ${MAX_RULES.toLocaleString('en-IN')} PIN code rules.`
    const row = { tenantId: t, pincode: v.pincode, rule: v.rule, codMax: v.codMax ? paise(v.codMax) : null, note: v.note?.replace(/[\u0000-\u001f\u007f]/g, ' ') || null }
    await tx.insert(deliveryRules).values(row).onConflictDoUpdate({ target: [deliveryRules.tenantId, deliveryRules.pincode], set: { rule: row.rule, codMax: row.codMax, note: row.note } })
    return null
  })
}

export async function removeRuleAction(pincode: unknown): Promise<Result> {
  const p = z.string().regex(/^[1-9][0-9]{5}$/).safeParse(pincode)
  if (!p.success) return { ok: false, error: FAILED }
  return write('delivery.rule.remove', { pincode: p.data }, async (tx, t) => {
    await tx.delete(deliveryRules).where(and(eq(deliveryRules.tenantId, t), eq(deliveryRules.pincode, p.data)))
    return null
  })
}

/** The import's preview: counts and line errors only, never the rows (security review M3). */
export async function previewRulesAction(text: unknown): Promise<{ ok: true; rows: number; errors: string[] } | { ok: false; error: string }> {
  const auth = await requireMember(CAN_BUILD)
  if (!auth.ok) return { ok: false, error: auth.message }
  const mods = await shopModules(auth.membership.tenantId, new Date().toISOString())
  if (!mods.access.delivery_zones.usable) return { ok: false, error: 'Delivery Zones is off.' }
  const p = z.string().max(300_000).safeParse(text)
  if (!p.success) return { ok: false, error: 'The file is over 256 KB. Split it into smaller files.' }
  const { rows, errors } = readRulesCsv(p.data)
  return { ok: true, rows: rows.length, errors }
}

/** Import: the file is read again here (never the preview's rows back from the browser), then one statement (the rows as one JSON parameter: drizzle spreads a JS array into a list). */
export async function importRulesAction(text: unknown): Promise<Result & { added?: number; errors?: string[] }> {
  // Who may import, before the file is read (security review DZ7 L3); write() checks again with the app usable.
  const me = await requireMember(CAN_BUILD)
  if (!me.ok) return { ok: false, error: me.message }
  const p = z.string().max(300_000).safeParse(text)
  if (!p.success) return { ok: false, error: 'The file is over 256 KB. Split it into smaller files.' }
  const { rows, errors } = readRulesCsv(p.data)
  if (!rows.length) return { ok: false, error: errors[0] ?? 'No rules in the file.', errors }
  const r = await write('delivery.rules.import', { rows: rows.length, errors: errors.length }, async (tx, t) => {
    const [c] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${deliveryRules} where tenant_id = ${t} and pincode not in (select jsonb_array_elements_text(${JSON.stringify(rows.map((x) => x.pincode))}::jsonb))`)
    if ((c?.n ?? 0) + rows.length > MAX_RULES) return `A shop can have up to ${MAX_RULES.toLocaleString('en-IN')} PIN code rules.`
    await tx.execute(sql`insert into ${deliveryRules} (tenant_id, pincode, rule, cod_max, note)
      select ${t}::uuid, x.pincode, x.rule, x.cod_max, x.note
        from jsonb_to_recordset(${JSON.stringify(rows.map((x) => ({ pincode: x.pincode, rule: x.rule, cod_max: x.codMax, note: x.note })))}::jsonb) as x(pincode text, rule text, cod_max bigint, note text)
      on conflict (tenant_id, pincode) do update set rule = excluded.rule, cod_max = excluded.cod_max, note = excluded.note`)
    return null
  })
  return r.ok ? { ok: true, added: rows.length, errors } : { ...r, errors }
}

const Dispatch = z.object({ dispatchDays: z.number().int().min(0).max(30), cutoff: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).nullable(), shipDays: z.number().int().min(1).max(127) })

export async function saveDispatchAction(input: unknown): Promise<Result> {
  const p = Dispatch.safeParse(input)
  if (!p.success) return { ok: false, error: 'Pick at least one day you ship.' }
  return write('delivery.dispatch', p.data, async (tx, t) => {
    await tx.update(shopSettings).set({ dispatchDays: p.data.dispatchDays, dispatchCutoff: p.data.cutoff, shipDays: p.data.shipDays }).where(eq(shopSettings.tenantId, t))
    return null
  })
}

export async function addHolidayAction(input: unknown): Promise<Result> {
  const p = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().min(1).max(60) }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Pick a day and name it.' }
  return write('delivery.holiday.add', { day: p.data.day }, async (tx, t) => {
    const [c] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${shopHolidays} where tenant_id = ${t}`)
    if ((c?.n ?? 0) >= MAX_HOLIDAYS) return `A shop can have up to ${MAX_HOLIDAYS} holidays.`
    await tx.insert(shopHolidays).values({ tenantId: t, day: p.data.day, name: p.data.name }).onConflictDoUpdate({ target: [shopHolidays.tenantId, shopHolidays.day], set: { name: p.data.name } })
    return null
  })
}

export async function removeHolidayAction(day: unknown): Promise<Result> {
  const p = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(day)
  if (!p.success) return { ok: false, error: FAILED }
  return write('delivery.holiday.remove', { day: p.data }, async (tx, t) => {
    await tx.delete(shopHolidays).where(and(eq(shopHolidays.tenantId, t), eq(shopHolidays.day, p.data)))
    return null
  })
}

