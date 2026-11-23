import 'server-only'
import { eq, getTableColumns } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { HELD_BY_ZONES } from '@/domains/delivery/lists'
import { draftPatch, formValues, openShopErrors, type Patch, type Section, type SectionKey, type Values } from '@/domains/settings/sections'
import { OWNER_ONLY_FIELDS, OWNER_ONLY_PAGES, lockOf, lockedFor } from '@/domains/settings/owner-only'
import type { asMember } from '@/lib/auth/as-member'
import { shopSettings } from '@/lib/db/schema'
import { moduleAccessIn } from '@/lib/queries/modules'
import { hasOwnerHeldIn } from '@/lib/queries/settings'
import type { Unrated } from '@/domains/tax/rates'

// What every Settings save keeps, shared by the pages' saveSection and the setup popups' saveSetupFields (O2a·5):
// the errors thrown inside the transaction and the per-section locks.

export type SaveResult =
  /** `unrated`: Taxes only, once the shop charges GST: live products quote() now refuses for want of a rate (never blocks the save). */
  | { ok: true; version: number; unrated?: Unrated }
  | { ok: false; error: string; errors?: Record<string, string>; conflict?: boolean; locked?: true }

/** Thrown inside the transaction so it rolls back — and no audit row records a change that never happened. */
export class VersionConflict extends Error {}
export class NeededWhenOpen extends Error { constructor(readonly errors: Record<string, string>) { super("needed when open") } }
/** PP1: what only the owner or a Manager changes now. Thrown so the transaction (and a support visit's audit row) rolls back. */
export class OwnerOnly extends Error { constructor(readonly page: SectionKey) { super('owner only') } }

/** The pages and blocks PP1 locks (src/domains/settings/owner-only.ts): only their saves hold the store's row. */
export const OWNER_ONLY_SECTIONS: readonly SectionKey[] = [...OWNER_ONLY_PAGES, ...(Object.keys(OWNER_ONLY_FIELDS) as SectionKey[])]
/** A value as the save stores it, compared by its JSON (strings, numbers, booleans, lists). */
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

type SaveTx = Parameters<Parameters<typeof asMember>[2]>[0]
type SaveAuth = Parameters<Parameters<typeof asMember>[2]>[1]

/**
 * The locks every settings save keeps, for one section, inside the save's transaction (saveSection and a setup popup's
 * saveSetupFields, O2a·5): PP1's owner-only pages and fields (a whole page throws OwnerOnly; a locked field is dropped
 * from `columns` and `detail`, and one sent changed throws), an open store's grievance officer (NeededWhenOpen), and
 * Delivery Zones' fields while it is usable (dropped). `patch` is what the parse made; `columns` is edited in place.
 */
export async function columnsIn(tx: SaveTx, auth: SaveAuth, section: Section, patch: Patch, values: Values, columns: Patch, detail: { fields: string[] }) {
  const tenantId = auth.membership.tenantId
  // PP1: once the store has an owner, a partner (and a support visit, always) can't change what owner-only.ts lists.
  // The store's row is held first, so a handover accepted at the same moment is seen (fails closed: no context reads
  // as an owner). A whole page is refused; a locked field is never written (an omitted one can't blank it), and one
  // sent changed is refused in words rather than dropped in silence.
  const locked = OWNER_ONLY_SECTIONS.includes(section.key)
    ? lockedFor(auth.membership.role, await hasOwnerHeldIn(tx, tenantId), !!auth.membership.supportSessionId)
    : null
  // The series decides whether the order prefix stands in for it on invoices (owner-only.ts STANDS_IN).
  const [series] = locked && section.key === 'invoices'
    ? await tx.select({ invoiceSeries: shopSettings.invoiceSeries }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)).for('update')
    : []
  const lock = locked ? lockOf(locked, section.key, series) : null
  if (lock?.whole) throw new OwnerOnly(section.key)
  if (lock) {
    const sent = lock.fields.filter((k) => Object.hasOwn(values, k))
    if (sent.length) {
      const all = getTableColumns(shopSettings) as Record<string, AnyPgColumn>
      const [stored] = await tx.select(Object.fromEntries(sent.map((k) => [k, all[k]!]))).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)).for('update')
      // The stored value through the same normalisation the save applies (a phone's digits, an email in lower case).
      const now = draftPatch(section, formValues(section, stored ?? {}))
      if (sent.some((k) => !same(patch[k], Object.hasOwn(now, k) ? now[k] : stored?.[k]))) throw new OwnerOnly(section.key)
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
}

