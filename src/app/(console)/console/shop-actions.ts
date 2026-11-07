'use server'

import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { readyToOpen, setupSteps } from '@/domains/setup/checklist'
import { asMember } from '@/lib/auth/as-member'
import { CAN_MANAGE } from '@/lib/auth/require-member'
import { auditEvents, shopSettings, tenants } from '@/lib/db/schema'
import { products } from '@/lib/db/schema-catalogue'
import { canTakeOnline, keysFor } from '@/lib/payments/keys'
import { hostFor, refreshShop } from '@/lib/queries/storefront'

// Opening and closing the shop (1C). The checklist is re-derived here, on the
// server, from the rows: the button on Home is only a convenience.

type Result = { ok: true } | { ok: false; error: string }

export async function openShop(): Promise<Result> {
  try {
    const r = await asMember(CAN_MANAGE, { action: 'shop.open' }, async (tx, auth) => {
      const t = auth.membership.tenantId
      const [s] = await tx.select({ name: tenants.name, slug: tenants.slug, legalName: shopSettings.legalName, grievanceName: shopSettings.grievanceName, codOn: shopSettings.codOn, codMax: shopSettings.codMax, publishedAt: shopSettings.publishedAt })
        .from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, t))
      if (!s) return 'Your shop’s settings are missing.'
      if (s.publishedAt) return null
      const [p] = await tx.select({ n: count() }).from(products).where(and(eq(products.tenantId, t), eq(products.status, 'active')))
      const steps = setupSteps({ shopName: s.name, address: hostFor(s.slug), productCount: p?.n ?? 0, legalName: s.legalName, grievanceName: s.grievanceName, codOn: s.codOn, codMaxPaise: Number(s.codMax), paymentsConnected: canTakeOnline(await keysFor(tx, t)), publishedAt: null },
        { products: true, settings: true, publish: true }, String)
      if (!readyToOpen(steps)) return `Not yet: ${steps.filter((x) => !x.done && x.key !== 'publish').map((x) => x.title.toLowerCase()).join(', ')}.`
      await tx.update(shopSettings).set({ publishedAt: sql`now()` }).where(and(eq(shopSettings.tenantId, t), isNull(shopSettings.publishedAt)))
      if (!auth.membership.supportSessionId) await tx.insert(auditEvents).values({ tenantId: t, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'shop.open', target: hostFor(s.slug) })
      return null
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value) return { ok: false, error: r.value }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    console.error('[openShop]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not open the shop. Nothing was changed.' }
  }
}

export async function closeShop(): Promise<Result> {
  try {
    const r = await asMember(CAN_MANAGE, { action: 'shop.close' }, async (tx, auth) => {
      await tx.update(shopSettings).set({ publishedAt: null }).where(eq(shopSettings.tenantId, auth.membership.tenantId))
      if (!auth.membership.supportSessionId) await tx.insert(auditEvents).values({ tenantId: auth.membership.tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'shop.close' })
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    console.error('[closeShop]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not close the shop. Nothing was changed.' }
  }
}
