// Analytics A·1's read (src/lib/queries/analytics.ts) on a real Postgres under the policies: sources classified from
// the grouped raw inputs, the period against the one before, ₹ kept after returns by source, a creator's code, the
// source page's last orders, staff without ₹, and shop B's orders never counted. Skipped unless INT_DB_HOST is set.
// Rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const ME = '99999999-9999-9999-9999-999999999999'

describe.skipIf(!host)('analytics', () => {
  it('classifies the window by source, judges it on ₹ kept after returns, and never reads another shop', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    const { shopSettings } = await import('@/lib/db/schema')
    const { discounts, discountCodes, orderDiscounts } = await import('@/lib/db/schema-discounts')
    const { eq } = await import('drizzle-orm')
    const q = await import('@/lib/queries/analytics')
    const now = new Date('2031-03-01T10:00:00Z')
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
    const ROLLBACK = new Error('rollback')
    let n = 970_000 + Math.floor(Math.random() * 9_000)
    const ig = { attribution: { utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'diwali-drop', ref_host: 'l.instagram.com' } }

    // Shop B: an Instagram order shop A must never count.
    await withTenant(B, async (tx) => {
      await tx.insert(orders).values({ tenantId: B, number: n++, paymentMethod: 'cod', placedAt: ago(2), subtotal: 100000, total: 100000, checkout: ig })
      throw ROLLBACK
    }).catch((err) => { if (err !== ROLLBACK) throw err })

    await withTenant(A, async (tx) => {
      // The work already in shop A's window (other tests' rows): read first, so the assertions below compare the change.
      const base = await q.analyticsIn(tx, A, 'owner', 30, now)
      const before = (slug: string) => base?.sources.find((s) => s.slug === slug)?.cur.orders ?? 0
      await tx.update(shopSettings).set({ shipCostDelivery: 7000, shipCostReturn: 7000, shipCostCod: 3600, shipCostsConfirmedAt: now }).where(eq(shopSettings.tenantId, A))
      const order = async (o: { at: Date; checkout?: unknown; delivered?: boolean; rto?: boolean; method?: 'cod' | 'prepaid'; paid?: boolean; payBy?: Date; cogs?: number }) => {
        const [r] = await tx.insert(orders).values({
          tenantId: A, number: n++, paymentMethod: o.method ?? 'cod', placedAt: o.at, subtotal: 180000, total: 180000, merchandiseNet: 171429,
          checkout: o.checkout as Record<string, unknown> ?? null, cogs: o.cogs ?? null, paidAt: o.paid ? o.at : null, payBy: o.payBy ?? null,
          confirmedAt: o.at, shippedAt: o.delivered || o.rto ? o.at : null,
          deliveredAt: o.delivered ? o.at : null, rtoInitiatedAt: o.rto ? o.at : null,
        }).returning({ id: orders.id })
        return r!.id
      }
      // Instagram bio, Diwali drop: one delivered (costs known), one came back. In the period before: one delivered.
      await order({ at: ago(3), checkout: ig, delivered: true, cogs: 70000 })
      await order({ at: ago(4), checkout: ig, rto: true })
      await order({ at: ago(40), checkout: ig, delivered: true, cogs: 70000 })
      // A creator's code (Riya), credited to her whatever the tags say.
      const [d] = await tx.insert(discounts).values({ tenantId: A, title: 'Riya int', style: 'order_off', percentBps: 1000, startsAt: ago(90), startedAt: ago(90), startedBy: ME, createdBy: ME }).returning({ id: discounts.id })
      const [code] = await tx.insert(discountCodes).values({ tenantId: A, discountId: d!.id, code: `RIYA${n % 10000}`, label: 'Riya' }).returning({ id: discountCodes.id, code: discountCodes.code })
      const viaRiya = await order({ at: ago(2), checkout: ig, delivered: true, cogs: 70000 })
      await tx.insert(orderDiscounts).values({ tenantId: A, orderId: viaRiya, discountId: d!.id, codeId: code!.id, class: 'order', amount: 18000, title: 'Riya int', style: 'order_off', percentBps: 1000, minSubtotal: 0, via: 'link' })
      // Direct, not sent yet; and an online order never paid (abandoned): not an order.
      await order({ at: ago(1) })
      await order({ at: ago(1), method: 'prepaid', payBy: ago(1) })

      const s = await q.analyticsIn(tx, A, 'owner', 30, now)
      const bio = s.sources.find((x) => x.slug === 'instagram-bio')!
      const riya = s.sources.find((x) => x.slug === `creator-${code!.code.toLowerCase()}`)!
      expect({ orders: bio.cur.orders - before('instagram-bio'), prev: bio.prev.orders >= 1, label: bio.label, campaign: bio.campaigns.some((c) => c.name === 'diwali-drop') })
        .toEqual({ orders: 2, prev: true, label: 'Instagram bio', campaign: true })
      expect({ delivered: bio.cur.delivered >= 1, rto: bio.cur.rto >= 1 }).toEqual({ delivered: true, rto: true })
      expect({ label: riya.label, orders: riya.cur.orders, delivered: riya.cur.delivered }).toEqual({ label: 'Creator · Riya', orders: 1, delivered: 1 })
      // ₹ kept after returns, from kept.ts: Riya's delivered COD order = 1,714.29 − 700 − 70 − 36 COD fee − the plan's fee.
      expect(riya.cur.kept?.counted).toBe(1)
      expect(riya.cur.kept!.kept).toBeGreaterThan(171429 - 70000 - 7000 - 3600 - 5000)
      expect(s.sources.find((x) => x.slug === 'direct-or-unknown')!.cur.notSent).toBeGreaterThanOrEqual(1)
      expect(s.known).toBeGreaterThanOrEqual(3)
      // Shop B's Instagram order is not here: A's Instagram rows are only its own (base + 2).
      expect(bio.cur.orders).toBe(before('instagram-bio') + 2)
      // Staff see the counts, never ₹.
      const staff = await q.analyticsIn(tx, A, 'staff', 30, now)
      expect(staff.costs).toBe(false)
      expect(staff.sources.every((x) => x.cur.kept === null)).toBe(true)
      // The source page: Riya's own last orders; an unknown or malformed slug is nothing.
      const page = await q.sourcePageIn(tx, A, 'owner', 30, riya.slug, now)
      expect(page?.orders.length).toBe(1)
      expect(await q.sourcePageIn(tx, A, 'owner', 30, 'no-such-source', now)).toBeNull()
      expect(await q.sourcePageIn(tx, A, 'owner', 30, "x' or 1=1 --", now)).toBeNull()
      throw ROLLBACK
    }).catch((err) => { if (err !== ROLLBACK) throw err })
  })
})
