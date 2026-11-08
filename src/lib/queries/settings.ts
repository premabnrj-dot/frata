import 'server-only'
import { eq, getTableColumns } from 'drizzle-orm'
import { shopPolicies, shopSettings, tenants } from '@/lib/db/schema'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import type { ShipCosts } from '@/domains/settings/ship-costs'
import { paise } from '@/domains/money/paise'
import { BUILT_PAGES, readyToOpen, setupSteps, type SetupStep } from '@/domains/setup/checklist'
import { formatInr } from '@/lib/format'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { activeProductCount, paymentStatusFor } from './payments'

// The settings row WITHOUT the shop's shipping-cost estimates: a merchant's cost, read only through shipCostsIn by
// owners and admins (ADR-0003; tenancy audit 2026-11-08: partners reach pages that read this row).
const { shipCostDelivery: _d, shipCostReturn: _r, shipCostCod: _c, shipCostsConfirmedAt: _a, ...settingsColumns } = getTableColumns(shopSettings)

/** A shop's name, address slug and settings row (costs left out), in one round trip. Null only if the row is missing. */
export async function shopWithSettings(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx.select({ name: tenants.name, slug: tenants.slug, settings: settingsColumns })
      .from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId)).limit(1)
    return row ?? null
  })
}

/** Policy pages the merchant rewrote by hand, by kind. */
export async function policyOverrides(tenantId: string): Promise<Record<string, string>> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.select({ kind: shopPolicies.kind, body: shopPolicies.body }).from(shopPolicies).where(eq(shopPolicies.tenantId, tenantId)),
  )
  return Object.fromEntries(rows.map((r) => [r.kind, r.body]))
}


export type Setup = { name: string; address: string; open: boolean; steps: SetupStep[]; done: number; ready: boolean; left: SetupStep[] }

/**
 * The setup checklist as Home (before the shop opens) and /console/setup read it, once (U·4 review: one read, not
 * two copies of its inputs). Null when the shop's row is missing; throws when the read fails.
 */
export async function setupFor(tenantId: string): Promise<Setup | null> {
  const [shop, products, pay] = await Promise.all([shopWithSettings(tenantId), activeProductCount(tenantId), paymentStatusFor(tenantId)])
  if (!shop) return null
  const address = `${shop.slug}.${SHOP_DOMAIN}`
  const steps = setupSteps({
    shopName: shop.name, address, productCount: products,
    legalName: shop.settings.legalName, grievanceName: shop.settings.grievanceName, grievanceEmail: shop.settings.grievanceEmail, grievancePhone: shop.settings.grievancePhone,
    codOn: shop.settings.codOn, codMaxPaise: shop.settings.codMax, paymentsConnected: !!pay?.connected && pay.mode === 'live' && !!pay.webhookSeenAt, publishedAt: shop.settings.publishedAt,
  }, BUILT_PAGES, (p) => formatInr(paise(p)))
  return {
    name: shop.name, address, open: !!shop.settings.publishedAt, steps, done: steps.filter((s) => s.done).length, ready: readyToOpen(steps),
    left: steps.filter((s) => !s.done && s.key !== 'publish'),
  }
}

/**
 * The shop's three shipping-cost estimates (Ship S·0, owner call S3), in paise, and when they were confirmed. A
 * merchant's cost: read on the server only (ADR-0003), never put into ShopFacts (the storefront reads those).
 */
export async function shipCostsFor(tenantId: string): Promise<ShipCosts | null> {
  return withTenant(tenantId, (tx) => shipCostsIn(tx, tenantId))
}

/** The one read of the three costs, inside the caller's tenant transaction (offerStats reads it too). */
export async function shipCostsIn(tx: Tx, tenantId: string): Promise<ShipCosts | null> {
  const [r] = await tx.select({ delivery: shopSettings.shipCostDelivery, ret: shopSettings.shipCostReturn, cod: shopSettings.shipCostCod, confirmedAt: shopSettings.shipCostsConfirmedAt })
    .from(shopSettings).where(eq(shopSettings.tenantId, tenantId)).limit(1)
  const n = (v: number | bigint | string | null) => (v === null ? null : Number(v))
  return r ? { delivery: n(r.delivery), ret: n(r.ret), cod: n(r.cod), confirmedAt: r.confirmedAt } : null
}
