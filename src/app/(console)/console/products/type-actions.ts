'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { cleanChart, type Chart } from '@/domains/catalogue/size-charts'
import { refreshShop } from '@/lib/queries/storefront'
import { asMember } from '@/lib/auth/as-member'
import { memberAudit } from '@/lib/auth/member-audit'
import { ANY_MEMBER } from '@/lib/auth/require-member'
import { productTypes } from '@/lib/db/schema-catalogue'
import { errName as reason } from '@/lib/log'

// Product types and their size charts (moved out of actions.ts, Signal S3): every write through asMember, the tenant
// always the member's.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }
class Stop extends Error { constructor(public result: { ok: false; error: string }) { super('stop') } }

/** A product type's size chart, shared by every product of that type. */
export async function saveSizeChart(typeId: string, chart: Chart): Promise<Result> {
  const c = cleanChart(chart)
  if (!c.ok) return { ok: false, error: c.error }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'size_chart.save', target: typeId }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const [row] = await tx.update(productTypes).set({ sizeChart: c.chart, updatedAt: new Date() })
        .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.id, typeId))).returning({ name: productTypes.name })
      if (!row) throw new Stop({ ok: false, error: 'That product type is not in your shop.' })
      await memberAudit(tx, auth, 'size_chart.save', row.name)
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    revalidatePath('/console/products', 'layout')
    return { ok: true }
  } catch (err) {
    if (err instanceof Stop) return err.result
    console.error('[saveSizeChart]', reason(err))
    return { ok: false, error: 'We could not save the size chart.' }
  }
}

/** A new product type, starting from an empty chart or a copy of another type's. */
export async function createType(name: string, copyFrom: string | null): Promise<Result<{ id: string }>> {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (!n || n.length > 60) return { ok: false, error: 'A name of up to 60 characters, like Saree.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product_type.create', target: n }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      let chart: Chart = { columns: [], rows: [], howToMeasure: '' }
      if (copyFrom) {
        const [src] = await tx.select({ c: productTypes.sizeChart }).from(productTypes).where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.id, copyFrom)))
        if (src) chart = src.c
      }
      const [row] = await tx.insert(productTypes).values({ tenantId, name: n, sizeChart: chart }).onConflictDoNothing().returning({ id: productTypes.id })
      if (!row) throw new Stop({ ok: false, error: `You already have a type called ${n}.` })
      await memberAudit(tx, auth, 'product_type.create', n)
      return row.id
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    return { ok: true, id: r.value }
  } catch (err) {
    if (err instanceof Stop) return err.result
    console.error('[createType]', reason(err))
    return { ok: false, error: 'We could not create the type.' }
  }
}

