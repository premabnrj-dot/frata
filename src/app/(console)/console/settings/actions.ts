'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { openShopErrors, parseSection, sectionFor, type Values } from '@/domains/settings/sections'
import { POLICY_PAGES } from '@/domains/policies/render'
import { hostFor, refreshHosts, refreshShop } from '@/lib/queries/storefront'
import { asMember } from '@/lib/auth/as-member'
import { CAN_BUILD, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { changeShopAddress } from '@/lib/db/platform'
import { auditEvents, shopPolicies, shopSettings, tenants } from '@/lib/db/schema'
import { slugProblem } from '@/domains/signup/slug'
import { parseShipCosts, type ShipCostsInput } from '@/domains/settings/ship-costs'
import { dayIN } from '@/lib/format-date'
import { shopWithSettings } from '@/lib/queries/settings'

// Each section says who may save it (`editors`: owners, admins and the store's partner for the shop's own
// settings); the shop's address stays CAN_MANAGE. Each save checks the
// section's values with the same definition the form drew (src/domains/settings/
// sections.ts), carries the version the page loaded (two tabs never overwrite
// each other silently), and leaves an Activity row with who changed what.

/** Thrown inside the transaction so it rolls back — and no audit row records a change that never happened. */
class VersionConflict extends Error {}
class NeededWhenOpen extends Error { constructor(readonly errors: Record<string, string>) { super("needed when open") } }

/**
 * What to log when a write fails: the database's code and reason only. drizzle's
 * own message carries the query's parameters — a merchant's GSTIN, phones,
 * a whole policy page — and logs are not the place for them (tenancy audit).
 */
function dbReason(err: unknown): string {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause
  if (cause) return `${cause.code ?? ''} ${cause.message ?? ''}`.trim()
  return err instanceof Error ? err.name : 'unknown'
}

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; error: string; errors?: Record<string, string>; conflict?: boolean }

export async function saveSection(sectionKey: string, values: Values, version: number): Promise<SaveResult> {
  const section = sectionFor(sectionKey)
  if (!section || !Number.isInteger(version)) return { ok: false, error: 'This page is out of date. Reload it.' }
  const parsed = parseSection(section, values)
  if (!parsed.ok) return { ok: false, error: 'Some fields need a look before saving.', errors: parsed.errors }
  const { name, ...columns } = parsed.patch
  try {
    const r = await asMember(section.editors, { action: `settings.${section.key}`, detail: { fields: Object.keys(parsed.patch) } }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      // An open shop keeps what the law asks it to show. Checked in the transaction that saves, the row locked so
      // opening the shop at the same moment cannot slip past it.
      if (section.key === 'contact') {
        const [shop] = await tx.select({ publishedAt: shopSettings.publishedAt, grievanceName: shopSettings.grievanceName, grievanceEmail: shopSettings.grievanceEmail, grievancePhone: shopSettings.grievancePhone })
          .from(shopSettings).where(eq(shopSettings.tenantId, tenantId)).for('update')
        const needed = shop?.publishedAt ? openShopErrors(section, parsed.patch, shop) : {}
        if (Object.keys(needed).length) throw new NeededWhenOpen(needed)
      }
      const [row] = await tx.update(shopSettings)
        .set({ ...(columns as Partial<typeof shopSettings.$inferInsert>), version: sql`${shopSettings.version} + 1`, updatedAt: new Date() })
        .where(and(eq(shopSettings.tenantId, tenantId), eq(shopSettings.version, version)))
        .returning({ version: shopSettings.version })
      if (!row) throw new VersionConflict()
      if (typeof name === 'string') await tx.update(tenants).set({ name }).where(eq(tenants.id, tenantId))
      if (!auth.membership.supportSessionId) {
        await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: `settings.${section.key}`, detail: { fields: Object.keys(parsed.patch) } })
      }
      return row.version
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console', 'layout')
    return { ok: true, version: r.value }
  } catch (err) {
    if (err instanceof NeededWhenOpen) return { ok: false, error: 'Some fields need a look before saving.', errors: err.errors }
    if (err instanceof VersionConflict) return { ok: false, conflict: true, error: 'Someone saved this page while you were editing. Reload to see their changes, then make yours again.' }
    console.error('[saveSection]', section.key, dbReason(err))
    return { ok: false, error: 'We could not save. Nothing was changed. Try again in a minute.' }
  }
}

/** A policy page rewritten by hand, or `null` to follow the settings again. */
export async function savePolicyText(kind: string, body: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!POLICY_PAGES.some(([k]) => k === kind)) return { ok: false, error: 'Unknown page.' }
  const text = body?.trim() ?? null
  if (text !== null && (text.length < 1 || text.length > 20000)) return { ok: false, error: 'Between 1 and 20,000 characters.' }
  try {
    const r = await asMember(CAN_BUILD, { action: `policy.${text === null ? 'reset' : 'edit'}`, target: kind }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
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
    console.error('[savePolicyText]', dbReason(err))
    return { ok: false, error: 'We could not save the page. Nothing was changed.' }
  }
}

const ADDRESS_ERRORS: Record<string, string> = {
  not_owner: 'Only the owner or an admin of this shop can change its address.',
  published: 'Your shop is open, so its address is fixed. Ask Frrata support on WhatsApp to move it.',
  bad_slug: 'Letters, digits and hyphens, at least 3.',
  slug_taken: 'That address is taken. Try another.',
}

export async function changeAddress(slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return { ok: false, error: auth.message }
  if (auth.membership.supportSessionId) return { ok: false, error: 'Only the shop’s owner can change its address.' }
  const s = String(slug ?? '').toLowerCase()
  const problem = slugProblem(s)
  if (problem) return { ok: false, error: problem === 'reserved' ? 'That address is reserved. Try another.' : ADDRESS_ERRORS.bad_slug! }
  const before = await shopWithSettings(auth.membership.tenantId).catch(() => null)
  const r = await changeShopAddress(auth.membership.tenantId, auth.userId, s)
  if (!r.ok) return { ok: false, error: ADDRESS_ERRORS[r.error] ?? 'We could not change the address. Nothing was changed.' }
  // The old address must not keep showing this shop from the storefront cache.
  // Both addresses' lookups and every page of the old one (storefront review 2026-11-07).
  refreshHosts(hostFor(s), ...(before ? [hostFor(before.slug)] : []))
  refreshShop(auth.membership.tenantId, 'shop')
  if (before) revalidatePath(`/s/${hostFor(before.slug)}`, 'layout')
  revalidatePath('/console', 'layout')
  return { ok: true }
}

// ── Ship S·0: what shipping costs when the shop sends orders another way (owner call S3) ──

/**
 * Confirm the three shipping costs: saving them IS confirming them (profit then reads "estimated", not "before
 * shipping costs"). Owners and admins only: a merchant's cost (partners build settings but never see costs).
 */
export async function saveShipCosts(input: ShipCostsInput): Promise<{ ok: true; confirmedOn: string } | { ok: false; error: string; errors?: Record<string, string> }> {
  const p = parseShipCosts(input)
  if (!p.ok) return { ok: false, error: 'Some fields need a look before saving.', errors: p.errors as Record<string, string> }
  const v = p.paise
  try {
    const r = await asMember(CAN_MANAGE, { action: 'settings.ship_costs', detail: { fields: ['shipCostDelivery', 'shipCostReturn', 'shipCostCod'] } }, async (tx, auth) => {
      const now = new Date()
      const saved = await tx.update(shopSettings).set({ shipCostDelivery: v.delivery, shipCostReturn: v.ret, shipCostCod: v.cod, shipCostsConfirmedAt: now, updatedAt: now })
        .where(eq(shopSettings.tenantId, auth.membership.tenantId)).returning({ id: shopSettings.tenantId })
      return saved.length > 0
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value) return { ok: false, error: 'We could not save. Nothing was changed. Try again in a minute.' }
    revalidatePath('/console', 'layout')
    // The date as the page says it, so the form shows it at once (not only after the refresh).
    return { ok: true, confirmedOn: dayIN(new Date()) }
  } catch (err) {
    console.error('[saveShipCosts]', dbReason(err))
    return { ok: false, error: 'We could not save. Nothing was changed. Try again in a minute.' }
  }
}
