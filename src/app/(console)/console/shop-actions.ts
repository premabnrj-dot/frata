'use server'

import { refreshKeys } from '@/lib/queries/storefront-api'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { readyToOpen, setupSteps, BUILT_PAGES, websiteBlocksOpening } from '@/domains/setup/checklist'
import { asMember } from '@/lib/auth/as-member'
import { CAN_MANAGE } from '@/lib/auth/require-member'
import { auditEvents, shopSettings, tenants } from '@/lib/db/schema'
import { products } from '@/lib/db/schema-catalogue'
import { shopTrials } from '@/lib/db/schema-trials'
import { canTakeOnline, keysFor } from '@/lib/payments/keys'
import { hostFor, refreshShop } from '@/lib/queries/storefront'

// Opening and closing the shop (1C). The checklist is re-derived here, on the
// server, from the rows: the button on Home is only a convenience.

/** `website`: D0·3's refusal, which the checklist draws as its own panel (workbench mockup screen 2), never a toast. */
type Result = { ok: true } | { ok: false; error: string; website?: true }
const WEBSITE_NOT_READY = 'Your store is still closed. Your website runs on a Test key. Test keys stop when the store opens.'
/** The callback's tagged answer for D0·3's refusal (never matched by its words). */
const NOT_READY = { website: true } as const

/** Trials T11: going live starts a shop's trial for good, so a Frrata support visit never opens or closes a shop with a
 * trial that has not ended — the owner does. */
const SUPPORT_TRIAL = 'This store is on a free trial. Only its owner opens or closes it. Opening starts the trial.'
async function trialBlocksSupport(tx: Parameters<Parameters<typeof asMember>[2]>[0], tenantId: string): Promise<boolean> {
  const [t] = await tx.select({ endedAt: shopTrials.endedAt }).from(shopTrials).where(eq(shopTrials.tenantId, tenantId))
  return !!t && !t.endedAt
}

const pgCode = (err: unknown): string | undefined => {
  const e = err as { code?: string; cause?: { code?: string } } | null
  return e?.code ?? e?.cause?.code
}

export async function openShop(): Promise<Result> {
  try {
    const r = await asMember(CAN_MANAGE, { action: 'shop.open' }, async (tx, auth) => {
      const t = auth.membership.tenantId
      if (auth.membership.supportSessionId && await trialBlocksSupport(tx, t)) return SUPPORT_TRIAL
      // D0·3's facts join this first read (speed review L): the Website, and the store's Test and Build keys that answer
      // now by the key definer's own rules (app_store_building_keys, 0158: 0 once the store ever opened). The settings row
      // is held, as key creation and mintBuildKey hold it, so no key slips in between this check and the opening.
      const [s] = await tx.select({ name: tenants.name, slug: tenants.slug, legalName: shopSettings.legalName, grievanceName: shopSettings.grievanceName, grievanceEmail: shopSettings.grievanceEmail, grievancePhone: shopSettings.grievancePhone, codOn: shopSettings.codOn, codMax: shopSettings.codMax, publishedAt: shopSettings.publishedAt,
        siteOrigin: shopSettings.siteOrigin,
        siteLock: shopSettings.tenantId })
        .from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, t)).for('update', { of: shopSettings })
      if (!s) return 'Your store’s settings are missing.'
      if (s.publishedAt) return null
      const [p] = await tx.select({ n: count() }).from(products).where(and(eq(products.tenantId, t), eq(products.status, 'active')))
      const steps = setupSteps({ shopName: s.name, address: hostFor(s.slug), productCount: p?.n ?? 0, legalName: s.legalName, grievanceName: s.grievanceName, grievanceEmail: s.grievanceEmail, grievancePhone: s.grievancePhone, codOn: s.codOn, codMaxPaise: Number(s.codMax), paymentsConnected: canTakeOnline(await keysFor(tx, t)), publishedAt: null },
        BUILT_PAGES, String)
      if (!readyToOpen(steps)) return `Not yet: ${steps.filter((x) => !x.done && x.key !== 'publish').map((x) => x.title.toLowerCase()).join(', ')}.`
      // Counted after the lock (a second statement sees a key committed while this one waited: security LOW-4).
      const [b] = await tx.execute<{ n: number }>(sql`select app_store_building_keys() as n`)
      if (websiteBlocksOpening({ siteOrigin: s.siteOrigin, buildingKeys: Number(b?.n ?? 0) })) return NOT_READY
      await tx.update(shopSettings).set({ publishedAt: sql`now()` }).where(and(eq(shopSettings.tenantId, t), isNull(shopSettings.publishedAt)))
      if (!auth.membership.supportSessionId) await tx.insert(auditEvents).values({ tenantId: t, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'shop.open', target: hostFor(s.slug) })
      return null
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value) return typeof r.value === 'string' ? { ok: false, error: r.value } : { ok: false, error: WEBSITE_NOT_READY, website: true }
    refreshShop(r.tenantId, 'shop')
    // Opening ends every test key (the definer: first_opened_at): purge their cached lookups too (V1 SA0).
    await refreshKeys(r.tenantId)
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    // A partner-built shop opens once its owner accepts the handover (owner, 2026-11-08; the database refuses).
    if (pgCode(err) === '23514') return { ok: false, error: 'The store opens once its owner accepts the handover.' }
    console.error('[openShop]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We couldn’t open the store. Nothing was changed.' }
  }
}

export async function closeShop(): Promise<Result> {
  try {
    const r = await asMember(CAN_MANAGE, { action: 'shop.close' }, async (tx, auth) => {
      if (auth.membership.supportSessionId && await trialBlocksSupport(tx, auth.membership.tenantId)) return SUPPORT_TRIAL
      await tx.update(shopSettings).set({ publishedAt: null }).where(eq(shopSettings.tenantId, auth.membership.tenantId))
      if (!auth.membership.supportSessionId) await tx.insert(auditEvents).values({ tenantId: auth.membership.tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'shop.close' })
      return null
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value) return { ok: false, error: r.value }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    console.error('[closeShop]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We couldn’t close the store. Nothing was changed.' }
  }
}
