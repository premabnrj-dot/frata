'use server'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { cleanTax } from '@/domains/catalogue/product-form'
import { hsnDigitsIn } from '@/lib/queries/settings'
import { asMember } from '@/lib/auth/as-member'
import { ANY_MEMBER } from '@/lib/auth/require-member'
import { auditEvents } from '@/lib/db/schema'
import { products } from '@/lib/db/schema-catalogue'
import { refreshShop } from '@/lib/queries/storefront'
import { errName } from '@/lib/log'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }
class Stop extends Error { constructor(public error: string) { super('stop') } }

/**
 * Products › HSN codes: one HSN (and unit, or the merchant's own rate for a code the table lacks) on several products at
 * once (plan 2026-11-09-gst-core-and-categories, mockup "Set HSN in bulk"). The catalogue is ANY_MEMBER's; only this
 * shop's products are touched (the tenant from the session, every id filtered by it).
 */
export async function setProductsTax(ids: string[], input: { hsn: string; uqc: string; ownBps: string }): Promise<Result<{ changed: number }>> {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x)))].slice(0, 500)
  if (!list.length) return { ok: false, error: 'Pick the products first.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.tax', detail: { count: list.length } }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const t = cleanTax({ hsn: String(input?.hsn ?? ''), uqc: String(input?.uqc ?? ''), ownBps: String(input?.ownBps ?? ''), origin: '' }, new Date(), await hsnDigitsIn(tx, tenantId))
      if (!t.ok) throw new Stop(Object.values(t.errors)[0]!)
      if (!t.tax.hsn) throw new Stop('Choose an HSN code.')
      const rows = await tx.update(products).set({ hsn: t.tax.hsn, uqc: t.tax.uqc, gstBps: t.tax.gstBps, version: sql`${products.version} + 1`, updatedAt: new Date() })
        .where(and(eq(products.tenantId, tenantId), inArray(products.id, list))).returning({ id: products.id })
      if (!auth.membership.supportSessionId) await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'product.tax', target: `${rows.length} products · HSN ${t.tax.hsn}` })
      return rows.length
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    revalidatePath('/console/products', 'layout')
    return { ok: true, changed: r.value }
  } catch (err) {
    if (err instanceof Stop) return { ok: false, error: err.error }
    console.error('[setProductsTax]', errName(err))
    return { ok: false, error: 'We could not save. Nothing was changed. Try again in a minute.' }
  }
}
