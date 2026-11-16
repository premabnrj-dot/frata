'use server'

import { HELD_BY_ZONES } from '@/domains/delivery/lists'
import { moduleAccessIn } from '@/lib/queries/modules'
import { and, eq, getTableColumns, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { draftPatch, formValues, openShopErrors, parseSection, sectionFor, editorsOf, type Patch, type SectionKey, type Values } from '@/domains/settings/sections'
import { ASK_PAGES, OWNER_ONLY_FIELDS, OWNER_ONLY_PAGES, lockOf, lockedFor, refusalFor } from '@/domains/settings/owner-only'
import { z } from 'zod'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { POLICY_PAGES } from '@/domains/policies/render'
import { hostFor, refreshHosts, refreshShop } from '@/lib/queries/storefront'
import { asMember } from '@/lib/auth/as-member'
import { CAN_BUILD, CAN_MANAGE, CAN_SET_COSTS, requireMember } from '@/lib/auth/require-member'
import { changeShopAddress } from '@/lib/db/platform'
import { addressFacts } from '@/lib/queries/addresses'
import { oldNames } from '@/domains/addresses/names'
import { checkAddress, type AddressCheck } from '@/app/start/actions'
import { auditEvents, shopPolicies, shopSettings, tenants } from '@/lib/db/schema'
import { slugProblem } from '@/domains/signup/slug'
import { parseShipCosts, type ShipCostsInput } from '@/domains/settings/ship-costs'
import { dayIN } from '@/lib/format-date'
import { askedTodayIn, costsVisibleIn, hasOwnerHeldIn } from '@/lib/queries/settings'
import { errName } from '@/lib/log'
import { docImage } from '@/lib/documents/images'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { acceptedBase, storeHost, urlFor } from '@/domains/media/sizes'
import { BLOB_STORE_ID } from '@/lib/env'
import { photosAreMade } from '@/lib/media/uploaded'
import { liveWithoutRateIn } from '@/lib/queries/catalogue'
import type { Unrated } from '@/domains/tax/rates'
import { chargesGst, type Scheme } from '@/domains/tax/gst'

// Each section says who may save it (`editors`: owners, admins and the store's partner for the shop's own
// settings); the shop's address stays CAN_MANAGE. Each save checks the
// section's values with the same definition the form drew (src/domains/settings/
// sections.ts), carries the version the page loaded (two tabs never overwrite
// each other silently), and leaves an Activity row with who changed what.

/** Thrown inside the transaction so it rolls back — and no audit row records a change that never happened. */
class VersionConflict extends Error {}
class NeededWhenOpen extends Error { constructor(readonly errors: Record<string, string>) { super("needed when open") } }
/** PP1: what only the owner or a Manager changes now. Thrown so the transaction (and a support visit's audit row) rolls back. */
class OwnerOnly extends Error { constructor(readonly page: SectionKey) { super('owner only') } }

/** The pages and blocks PP1 locks (src/domains/settings/owner-only.ts): only their saves hold the store's row. */
const OWNER_ONLY_SECTIONS: readonly SectionKey[] = [...OWNER_ONLY_PAGES, ...(Object.keys(OWNER_ONLY_FIELDS) as SectionKey[])]
/** A value as the save stores it, compared by its JSON (strings, numbers, booleans, lists). */
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * What to log when a write fails: the database's code and reason only. drizzle's
 * own message carries the query's parameters — a merchant's GSTIN, phones,
 * a whole policy page — and logs are not the place for them (tenancy audit).
 */
const dbReason = errName

export type SaveResult =
  /** `unrated`: Taxes only, once the shop charges GST: live products quote() now refuses for want of a rate (never blocks the save). */
  | { ok: true; version: number; unrated?: Unrated }
  | { ok: false; error: string; errors?: Record<string, string>; conflict?: boolean; locked?: true }

/** `took`: the PIN code Settings › Pay on delivery suggested and the merchant added (recorded so the suggestion is measured). */
export async function saveSection(sectionKey: string, values: Values, version: number, took?: string): Promise<SaveResult> {
  const section = sectionFor(sectionKey)
  if (!section || !Number.isInteger(version)) return { ok: false, error: 'This page is out of date. Reload it.' }
  const parsed = parseSection(section, values)
  if (!parsed.ok) return { ok: false, error: 'Some fields need a look before saving.', errors: parsed.errors }
  const { name, ...columns } = parsed.patch
  // Only a PIN code this save really adds to the list counts as taken (checked against the row below, in the transaction).
  const blocked = (parsed.patch as Record<string, unknown>).codBlockedPincodes
  const candidate = section.key === 'payments' && typeof took === 'string' && /^[1-9]\d{5}$/.test(took) && Array.isArray(blocked) && blocked.includes(took) ? took : null
  // The fields a support visit's audit row names: what is written (locked fields dropped below leave it).
  const detail = { fields: Object.keys(parsed.patch) }
  try {
    const r = await asMember(section.editors, { action: `settings.${section.key}`, detail }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      // PP1: once the store has an owner, a partner (and a support visit, always) can't change what owner-only.ts lists.
      // The store's row is held first, so a handover accepted at the same moment is seen (fails closed: no context reads
      // as an owner). A whole page is refused; a locked field is never written (an omitted one can't blank it), and one
      // sent changed is refused in words rather than dropped in silence.
      const lock = OWNER_ONLY_SECTIONS.includes(section.key)
        ? lockOf(lockedFor(auth.membership.role, await hasOwnerHeldIn(tx, tenantId), !!auth.membership.supportSessionId), section.key)
        : null
      if (lock?.whole) throw new OwnerOnly(section.key)
      if (lock) {
        const sent = lock.fields.filter((k) => Object.hasOwn(values, k))
        if (sent.length) {
          const all = getTableColumns(shopSettings) as Record<string, AnyPgColumn>
          const [stored] = await tx.select(Object.fromEntries(sent.map((k) => [k, all[k]!]))).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)).for('update')
          // The stored value through the same normalisation the save applies (a phone's digits, an email in lower case).
          const now = draftPatch(section, formValues(section, stored ?? {}))
          if (sent.some((k) => !same(parsed.patch[k], Object.hasOwn(now, k) ? now[k] : stored?.[k]))) throw new OwnerOnly(section.key)
        }
        for (const k of lock.fields) delete (columns as Record<string, unknown>)[k]
        detail.fields = detail.fields.filter((k) => !lock.fields.includes(k))
      }
      // An open shop keeps what the law asks it to show. Checked in the transaction that saves, the row locked so
      // opening the shop at the same moment cannot slip past it.
      if (section.key === 'contact') {
        const [shop] = await tx.select({ publishedAt: shopSettings.publishedAt, grievanceName: shopSettings.grievanceName, grievanceEmail: shopSettings.grievanceEmail, grievancePhone: shopSettings.grievancePhone })
          .from(shopSettings).where(eq(shopSettings.tenantId, tenantId)).for('update')
        const needed = shop?.publishedAt ? openShopErrors(section, columns as Patch, shop) : {}
        if (Object.keys(needed).length) throw new NeededWhenOpen(needed)
      }
      // While Delivery Zones is usable it alone sets the delivery charges, days and pay-on-delivery limits (one editor).
      if ((section.key === 'shipping' || section.key === 'payments') && (await moduleAccessIn(tx, tenantId, new Date())).delivery_zones.usable) {
        for (const k of HELD_BY_ZONES) delete (columns as Record<string, unknown>)[k]
      }
      const [was] = candidate ? await tx.select({ blocked: shopSettings.codBlockedPincodes }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)).for('update') : []
      const suggested = candidate && was && !was.blocked.includes(candidate) ? candidate : null
      const [row] = await tx.update(shopSettings)
        .set({ ...(columns as Partial<typeof shopSettings.$inferInsert>), version: sql`${shopSettings.version} + 1`, updatedAt: new Date() })
        .where(and(eq(shopSettings.tenantId, tenantId), eq(shopSettings.version, version)))
        .returning({ version: shopSettings.version })
      if (!row) throw new VersionConflict()
      if (typeof name === 'string') await tx.update(tenants).set({ name }).where(eq(tenants.id, tenantId))
      if (!auth.membership.supportSessionId) {
        await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: `settings.${section.key}`, detail: { fields: detail.fields, ...(suggested ? { suggestedPin: suggested } : {}) } })
      }
      // A GSTIN saved: every live product without a rate is now 'gone' at checkout (quote). Said in the reply, not refused.
      const registered = section.key === 'business' && chargesGst({ gstin: (columns.gstin as string | null) ?? null, scheme: columns.gstScheme as Scheme })
      return { version: row.version, unrated: registered ? await liveWithoutRateIn(tx, tenantId, new Date()) : undefined }
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console', 'layout')
    return { ok: true, version: r.value.version, ...(r.value.unrated ? { unrated: r.value.unrated } : {}) }
  } catch (err) {
    if (err instanceof NeededWhenOpen) return { ok: false, error: 'Some fields need a look before saving.', errors: err.errors }
    if (err instanceof OwnerOnly) return { ok: false, locked: true, error: refusalFor(err.page) }
    if (err instanceof VersionConflict) return { ok: false, conflict: true, error: 'Someone saved this page while you were editing. Reload to see their changes, then make yours again.' }
    console.error('[saveSection]', section.key, dbReason(err))
    return { ok: false, error: 'We couldn’t save. Nothing was changed. Try again in a minute.' }
  }
}

/** A policy page rewritten by hand, or `null` to follow the settings again. */
export async function savePolicyText(kind: string, body: string | null): Promise<{ ok: true } | { ok: false; error: string; locked?: true }> {
  if (!POLICY_PAGES.some(([k]) => k === kind)) return { ok: false, error: 'Unknown page.' }
  const text = body?.trim() ?? null
  if (text !== null && (text.length < 1 || text.length > 20000)) return { ok: false, error: 'Between 1 and 20,000 characters.' }
  try {
    const r = await asMember(CAN_BUILD, { action: `policy.${text === null ? 'reset' : 'edit'}`, target: kind }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      // PP1: a policy page's own words are the Policies page's, owner-only once the store has an owner (edit and reset).
      if (lockedFor(auth.membership.role, await hasOwnerHeldIn(tx, tenantId), !!auth.membership.supportSessionId).pages.includes('policies')) throw new OwnerOnly('policies')
      if (text === null) await tx.delete(shopPolicies).where(and(eq(shopPolicies.tenantId, tenantId), eq(shopPolicies.kind, kind)))
      else await tx.insert(shopPolicies).values({ tenantId, kind, body: text, updatedBy: auth.userId })
        .onConflictDoUpdate({ target: [shopPolicies.tenantId, shopPolicies.kind], set: { body: text, updatedAt: new Date(), updatedBy: auth.userId } })
      if (!auth.membership.supportSessionId) {
        await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: `policy.${text === null ? 'reset' : 'edit'}`, target: kind })
      }
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console/settings/policies')
    return { ok: true }
  } catch (err) {
    if (err instanceof OwnerOnly) return { ok: false, locked: true, error: refusalFor('policies') }
    console.error('[savePolicyText]', dbReason(err))
    return { ok: false, error: 'We couldn’t save the page. Nothing was changed.' }
  }
}

const AskInput = z.enum(ASK_PAGES)

/**
 * Ask the owner (PP1): a partner on a store that has an owner tells its owners and Managers in Notices which locked page
 * to update. Takes the page only; who asks is the session's, the store the membership's. The definer (app_ask_owner,
 * drizzle/0150) is the lock: a live partner of this store, a store with an owner, at most one line a page an India day.
 * Never a support visit. Counted per person first, failing closed.
 */
export async function askOwnerAction(page: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = AskInput.safeParse(page)
  if (!parsed.success) return { ok: false, error: 'Unknown page.' }
  const me = await requireMember(CAN_BUILD)
  if (!me.ok) return { ok: false, error: me.message }
  if (me.membership.supportSessionId) return { ok: false, error: 'A support visit can’t ask the owner.' }
  if (!(await withinLimit(LIMITS.askOwner, `${me.membership.tenantId}:${me.userId}`, new Date(), true))) return { ok: false, error: 'Too many asks this hour. Try again in an hour.' }
  try {
    const r = await asMember(CAN_BUILD, { action: 'settings.ask_owner', target: parsed.data }, async (tx, auth) => {
      const [row] = await tx.execute<{ asked: boolean }>(sql`select app_ask_owner(${auth.userId}::uuid, ${parsed.data}) as asked`)
      // Not written: already asked today (by anyone) is the same answer as a new line; anything else is a refusal.
      return row?.asked === true || (await askedTodayIn(tx, auth.membership.tenantId, parsed.data, new Date()))
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value) return { ok: false, error: 'We couldn’t ask the owner. Nothing was sent.' }
    revalidatePath(`/console/settings/${parsed.data}`)
    return { ok: true }
  } catch (err) {
    console.error('[askOwnerAction]', errName(err))
    return { ok: false, error: 'We couldn’t ask the owner. Nothing was sent. Try again in a minute.' }
  }
}

const ADDRESS_ERRORS: Record<string, string> = {
  not_owner: 'Only the owner or a manager of this store can change its address.',
  frozen: 'Frrata has paused address changes for this store.',
  no_renames_left: 'No changes left.',
  needs_razorpay: 'Razorpay must approve this address first.',
  bad_slug: 'Letters, digits and hyphens, at least 3.',
  slug_taken: 'That address is taken. Try another.',
}

/** The address check on Settings: like sign-up's, but one of this shop's own old names is free to take back. */
export async function checkShopAddress(slug: string): Promise<AddressCheck> {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return { state: 'shape' }
  const s = String(slug ?? '').toLowerCase()
  const f = await addressFacts(auth.membership.tenantId).catch(() => null)
  if (f && oldNames(f.names).includes(s)) return { state: 'ok' }
  return checkAddress(s)
}

export async function changeAddress(slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return { ok: false, error: auth.message }
  if (auth.membership.supportSessionId) return { ok: false, error: 'Only the store’s owner can change its address.' }
  const s = String(slug ?? '').toLowerCase()
  const problem = slugProblem(s)
  if (problem) return { ok: false, error: problem === 'reserved' ? 'That address is reserved. Try another.' : ADDRESS_ERRORS.bad_slug! }
  const before = await addressFacts(auth.membership.tenantId).catch(() => null)
  const r = await changeShopAddress(auth.membership.tenantId, auth.userId, s)
  if (!r.ok) return { ok: false, error: ADDRESS_ERRORS[r.error] ?? 'We couldn’t change the address. Nothing was changed.' }
  // Every name the shop has had now leads to the new one: each host's lookup, and every page of the one it left
  // (storefront review 2026-11-07; shop addresses D·1, tenancy H5).
  const all = [...new Set([s, ...(before ? [before.slug, ...before.names.map((n) => n.name)] : [])])]
  refreshHosts(...all.map((n) => hostFor(n)))
  refreshShop(auth.membership.tenantId, 'shop')
  if (before) revalidatePath(`/s/${hostFor(before.slug)}`, 'layout')
  revalidatePath('/console', 'layout')
  return { ok: true }
}

// ── Ship S·0: what shipping costs when the shop sends orders another way (owner call S3) ──

/**
 * Confirm the three shipping costs: saving them IS confirming them (profit then reads "estimated", not "before
 * shipping costs"). A merchant's cost: owners and admins, and a partner before handover (seesCosts; owner 2026-11-08).
 */
export async function saveShipCosts(input: ShipCostsInput): Promise<{ ok: true; confirmedOn: string } | { ok: false; error: string; errors?: Record<string, string> }> {
  const p = parseShipCosts(input)
  if (!p.ok) return { ok: false, error: 'Some fields need a look before saving.', errors: p.errors as Record<string, string> }
  const v = p.paise
  try {
    // Owners, admins, and a partner before handover (CAN_SET_COSTS, then seesCosts in the same transaction).
    const r = await asMember(CAN_SET_COSTS, { action: 'settings.ship_costs', detail: { fields: ['shipCostDelivery', 'shipCostReturn', 'shipCostCod'] } }, async (tx, auth) => {
      if (!(await costsVisibleIn(tx, auth.membership.tenantId, auth.membership.role))) return 'handed_over' as const
      const now = new Date()
      const saved = await tx.update(shopSettings).set({ shipCostDelivery: v.delivery, shipCostReturn: v.ret, shipCostCod: v.cod, shipCostsConfirmedAt: now, updatedAt: now })
        .where(eq(shopSettings.tenantId, auth.membership.tenantId)).returning({ id: shopSettings.tenantId })
      return saved.length > 0
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value === 'handed_over') return { ok: false, error: 'The store’s owner sets its shipping costs now.' }
    if (!r.value) return { ok: false, error: 'We couldn’t save. Nothing was changed. Try again in a minute.' }
    revalidatePath('/console', 'layout')
    // The date as the page says it, so the form shows it at once (not only after the refresh).
    return { ok: true, confirmedOn: dayIN(new Date()) }
  } catch (err) {
    console.error('[saveShipCosts]', dbReason(err))
    return { ok: false, error: 'We couldn’t save. Nothing was changed. Try again in a minute.' }
  }
}

/**
 * The logo for paper (Settings › Invoices and slips, D2): a PNG the browser uploaded to this shop's documents folder, or null
 * to go back to the shop's initial. Accepted only as this shop's exact path, and only once its bytes are a PNG within
 * the size limits (docImage reads it the way a document will). Never by a Frrata support visit.
 */
export async function setDocLogo(url: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const editors = editorsOf('invoices')
  const me = await requireMember(editors)
  if (!me.ok) return { ok: false, error: me.message }
  if (me.membership.supportSessionId) return { ok: false, error: 'A support visit cannot change the store’s logo.' }
  if (!(await withinLimit(LIMITS.uploadShop, me.membership.tenantId, new Date(), true))) return { ok: false, error: 'Too many changes in the last few minutes. Try again shortly.' }
  if (url !== null && (typeof url !== 'string' || !(await docImage(url, me.membership.tenantId)))) {
    return { ok: false, error: 'We couldn’t use that logo. Choose a PNG, JPEG or WebP image.' }
  }
  try {
    const r = await asMember(editors, { action: 'settings.documents.logo', detail: { set: url !== null } }, async (tx, auth) => {
      await tx.update(shopSettings).set({ docLogo: url, updatedAt: new Date() }).where(eq(shopSettings.tenantId, auth.membership.tenantId))
      await tx.insert(auditEvents).values({ tenantId: auth.membership.tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'settings.documents.logo', detail: { set: url !== null } })
    })
    if (!r.ok) return { ok: false, error: r.error }
    revalidatePath('/console/settings', 'layout')
    return { ok: true }
  } catch (err) {
    console.error('[setDocLogo]', dbReason(err))
    return { ok: false, error: 'We couldn’t save the logo. Nothing was changed. Try again in a minute.' }
  }
}

/**
 * The shop's logo (search and sharing S1·6): shown in the shop's header, its icon and its markup. Accepted only as this
 * shop's own brand photo (`acceptedBase`, the exact stored shape) whose bytes are WebP or JPEG; null goes back to the name.
 * Never by a Frrata support visit.
 */
export async function setShopLogo(base: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const editors = editorsOf('store')
  const me = await requireMember(editors)
  if (!me.ok) return { ok: false, error: me.message }
  if (me.membership.supportSessionId) return { ok: false, error: 'A support visit cannot change the store’s logo.' }
  if (!(await withinLimit(LIMITS.uploadShop, me.membership.tenantId, new Date(), true))) return { ok: false, error: 'Too many changes in the last few minutes. Try again shortly.' }
  let url: string | null = null
  if (base !== null) {
    const host = storeHost(BLOB_STORE_ID)
    const accepted = host && typeof base === 'string' ? acceptedBase(base, host, me.membership.tenantId, 'brand') : null
    if (!accepted || !(await photosAreMade([{ base: accepted, widths: [400] }]))) return { ok: false, error: 'That logo could not be used. Choose a PNG, JPEG or WebP image.' }
    url = urlFor(accepted, 400)
  }
  try {
    const r = await asMember(editors, { action: 'settings.brand.logo', detail: { set: url !== null } }, async (tx, auth) => {
      await tx.update(shopSettings).set({ logoUrl: url, updatedAt: new Date() }).where(eq(shopSettings.tenantId, auth.membership.tenantId))
      await tx.insert(auditEvents).values({ tenantId: auth.membership.tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'settings.brand.logo', detail: { set: url !== null } })
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console/settings', 'layout')
    return { ok: true }
  } catch (err) {
    console.error('[setShopLogo]', errName(err))
    return { ok: false, error: 'We couldn’t save the logo. Nothing was changed. Try again in a minute.' }
  }
}
