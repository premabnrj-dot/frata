'use server'

import { and, eq, getTableColumns, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { editorsOf, sectionFor, type Patch, type SectionKey, type Values } from '@/domains/settings/sections'
import { parseFields, SETUP_FIELDS, type SetupPopup } from '@/domains/settings/fields'
import { refusalFor } from '@/domains/settings/owner-only'
import { chargesGst, type Scheme } from '@/domains/tax/gst'
import { asMember } from '@/lib/auth/as-member'
import { requireMember } from '@/lib/auth/require-member'
import { auditEvents, shopSettings, tenants } from '@/lib/db/schema'
import { errName } from '@/lib/log'
import { liveWithoutRateIn } from '@/lib/queries/catalogue'
import { setupPopupFor, type SetupPopupRead } from '@/lib/queries/settings'
import { refreshShop } from '@/lib/queries/storefront'
import { columnsIn, NeededWhenOpen, OwnerOnly, VersionConflict, type SaveResult } from './save-locks'

/** The database's code and reason only, never the query's parameters (a GSTIN, phones): see actions.ts. */
const dbReason = errName

// ---- Setup popups (plan docs/plans/2026-11-23-o2a-setup-card.md O2a·5) ----

/** The sections a popup saves and who may save it: everyone who may edit every one of them. */
const popupSections = (popup: SetupPopup) => Object.entries(SETUP_FIELDS[popup]) as [SectionKey, readonly string[]][]
const popupEditors = (popup: SetupPopup) => popupSections(popup).map(([k]) => editorsOf(k)).reduce((a, b) => a.filter((r) => b.includes(r)))
const POPUPS = Object.keys(SETUP_FIELDS) as SetupPopup[]
/** Each popup's input: only its own keys (strict), each a short string or a switch. */
const POPUP_VALUES = Object.fromEntries(POPUPS.map((p) => [p, z.object(Object.fromEntries(popupSections(p).flatMap(([, keys]) => keys)
  .map((k) => [k, z.union([z.string().max(400), z.boolean()]).optional()]))).strict()])) as unknown as Record<SetupPopup, z.ZodType<Values>>

export type SetupSaveResult = SaveResult | { ok: false; error: string; stale: string[] }
class FieldErrors extends Error { constructor(readonly errors: Record<string, string>) { super('fields') } }
class Stale extends Error { constructor(readonly keys: string[]) { super('stale') } }

/**
 * A setup popup's save: only the fields SETUP_FIELDS names for it (chosen here, never by the client), through
 * parseFields, so a field it leaves out is never blanked; then each section's own locks (columnsIn), ONE update checked
 * against the version the popup read (details writes its two sections in it), the Activity row, and for Business the
 * products a GSTIN leaves without a rate.
 */
export async function saveSetupFields(popup: SetupPopup, values: Values, version: number): Promise<SetupSaveResult> {
  if (!(POPUPS as string[]).includes(popup) || !Number.isInteger(version)) return { ok: false, error: 'This page is out of date. Reload it.' }
  const input = POPUP_VALUES[popup].safeParse(values)
  if (!input.success) return { ok: false, error: 'This page is out of date. Reload it.' }
  const sent = input.data
  const detail = { fields: Object.keys(sent) }
  try {
    const r = await asMember(popupEditors(popup), { action: `settings.setup.${popup}`, detail }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      // saveSection's lock order: the store's row (FOR KEY SHARE, as hasOwnerHeldIn takes it) before its settings row.
      // Taken the other way round, a writer holding the store's row and waiting for the settings would deadlock with us.
      await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).for('key share')
      const [row] = await tx.select({ name: tenants.name, settings: getTableColumns(shopSettings) }).from(tenants)
        .innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId)).for('update', { of: shopSettings })
      if (!row) throw new VersionConflict()
      const stored: Record<string, unknown> = { ...row.settings, name: row.name }
      const columns: Patch = {}
      const written: string[] = []
      for (const [key, keys] of popupSections(popup)) {
        const section = sectionFor(key)!
        const parsed = parseFields(section, keys, sent, stored)
        if (!parsed.ok) throw 'stale' in parsed ? new Stale(parsed.stale) : new FieldErrors(parsed.errors)
        const part: Patch = { ...parsed.patch }
        const d = { fields: Object.keys(part) }
        await columnsIn(tx, auth, section, parsed.patch, sent, part, d)
        Object.assign(columns, part)
        written.push(...d.fields)
      }
      detail.fields = written
      const [done] = await tx.update(shopSettings)
        .set({ ...(columns as Partial<typeof shopSettings.$inferInsert>), version: sql`${shopSettings.version} + 1`, updatedAt: new Date() })
        .where(and(eq(shopSettings.tenantId, tenantId), eq(shopSettings.version, version)))
        .returning({ version: shopSettings.version, gstin: shopSettings.gstin, gstScheme: shopSettings.gstScheme })
      if (!done) throw new VersionConflict()
      if (!auth.membership.supportSessionId) {
        await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: `settings.setup.${popup}`, detail: { fields: written } })
      }
      const registered = popup === 'details' && ('gstin' in columns || 'gstScheme' in columns) && chargesGst({ gstin: done.gstin, scheme: done.gstScheme as Scheme })
      return { version: done.version, unrated: registered ? await liveWithoutRateIn(tx, tenantId, new Date()) : undefined }
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console', 'layout')
    return { ok: true, version: r.value.version, ...(r.value.unrated ? { unrated: r.value.unrated } : {}) }
  } catch (err) {
    if (err instanceof FieldErrors || err instanceof NeededWhenOpen) return { ok: false, error: 'Some fields need a look before saving.', errors: err.errors }
    if (err instanceof Stale) return { ok: false, error: 'Your limit is below the lowest Pay on delivery order. Change that first.', stale: err.keys }
    if (err instanceof OwnerOnly) return { ok: false, locked: true, error: refusalFor(err.page) }
    if (err instanceof VersionConflict) return { ok: false, conflict: true, error: 'Someone saved these settings while you were editing. Close this and open it again to see their changes.' }
    console.error('[saveSetupFields]', popup, dbReason(err))
    return { ok: false, error: 'We couldn’t save. Nothing was changed. Try again in a minute.' }
  }
}

/** What a setup popup shows when it opens: its values and the version its save carries (SetupPopupRead). */
export async function loadSetupPopup(popup: SetupPopup): Promise<({ ok: true } & SetupPopupRead) | { ok: false; error: string }> {
  if (!(POPUPS as string[]).includes(popup)) return { ok: false, error: 'This page is out of date. Reload it.' }
  const me = await requireMember(popupEditors(popup))
  if (!me.ok) return { ok: false, error: me.message }
  try {
    const r = await setupPopupFor(me.membership.tenantId, me.membership.role, !!me.membership.supportSessionId, popup)
    return r ? { ok: true, ...r } : { ok: false, error: 'Your store’s settings are missing.' }
  } catch (err) {
    console.error('[loadSetupPopup]', popup, dbReason(err))
    return { ok: false, error: 'We couldn’t load this. Try again in a minute.' }
  }
}

