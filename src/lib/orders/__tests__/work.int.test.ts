// The merchant's work on an order (src/lib/orders/work.ts) on a real Postgres: tenant A of the proof
// (scripts/verify/tenancy.sh). Skipped unless INT_DB_HOST is set (CI). Everything it writes is rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const riya = { kind: 'member' as const, userId: '99999999-9999-9999-9999-999999999999', email: 'riya@kesar.test' }
const arjun = { kind: 'member' as const, userId: '99999999-9999-9999-9999-999999999998', email: 'arjun@kesar.test' }

describe.skipIf(!host)('order work', () => {
  it('confirm, hold, undo, pack, edit, note and cancel, each once and in order', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { withTenant } = await import('@/lib/db/tenant')
    const { shopSettings } = await import('@/lib/db/schema')
    const { orders, orderLines, orderEvents } = await import('@/lib/db/schema-orders')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const w = await import('@/lib/orders/work')
    const { orderState } = await import('@/domains/orders/order-state')
    const { momentColumns } = await import('@/lib/db/order-predicates')
    const { and, eq } = await import('drizzle-orm')
    const ROLLBACK = new Error('rollback')
    const now = new Date('2026-11-07T10:00:00.123Z')
    const later = (s: number) => new Date(now.getTime() + s * 1000)
    await withTenant(A, async (tx) => {
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-work-${Date.now()}`, title: 'Int kurta', options: ['Size'], status: 'active' }).returning({ id: products.id })
      const [v] = await tx.insert(variants).values({ tenantId: A, productId: p!.id, optionValues: ['M'], price: 100000, stock: 0 }).returning({ id: variants.id })
      const order = async (n: number, o: Partial<typeof orders.$inferInsert> = {}) => {
        const [r] = await tx.insert(orders).values({ tenantId: A, number: 920_000 + n, paymentMethod: 'cod', placedAt: now, subtotal: 100000, total: 100000, ...o }).returning({ id: orders.id })
        await tx.insert(orderLines).values({ tenantId: A, orderId: r!.id, variantId: v!.id, title: 'M', qty: 1, unitPrice: 100000, taxableValue: 95238, kind: 'in_stock', stockTakenAt: now })
        return r!.id
      }
      const state = async (id: string) => orderState((await tx.select(momentColumns).from(orders).where(and(eq(orders.tenantId, A), eq(orders.id, id))))[0]!, later(60))
      const stock = async () => (await tx.select({ s: variants.stock }).from(variants).where(eq(variants.id, v!.id)))[0]!.s

      // Two people, one order: the second is told who confirmed it.
      const a = await order(1)
      const first = await w.confirm(tx, A, riya, a, later(1))
      expect(first.ok).toBe(true)
      const second = await w.confirm(tx, A, arjun, a, later(2))
      expect(second).toMatchObject({ ok: false, error: 'Already confirmed', by: { email: 'riya@kesar.test' } })

      // Undo puts it back; undoing twice does nothing.
      expect((await w.undo(tx, A, riya, (first as { eventId: string }).eventId, later(3))).ok).toBe(true)
      expect(await state(a)).toBe('unconfirmed')
      expect(await w.undo(tx, A, riya, (first as { eventId: string }).eventId, later(4))).toMatchObject({ ok: false, error: 'Already undone.' })

      // Hold, then confirm from hold, then undo that confirm: back on hold.
      await w.hold(tx, A, riya, a, later(5))
      const fromHold = await w.confirm(tx, A, riya, a, later(6))
      expect(await state(a)).toBe('confirmed')
      await w.undo(tx, A, riya, (fromHold as { eventId: string }).eventId, later(7))
      expect(await state(a)).toBe('held')

      // Only the latest action is undone: take it off hold, someone confirms, then the old Undo lands — refused, so the
      // order is never confirmed AND held (architecture review 2026-11-07).
      const off = await w.unhold(tx, A, riya, a, later(7.2))
      await w.confirm(tx, A, arjun, a, later(7.4))
      expect(await w.undo(tx, A, riya, (off as { eventId: string }).eventId, later(7.6))).toMatchObject({ ok: false, error: 'This order changed since: open it to see what happened.' })
      expect(await state(a)).toBe('confirmed')
      await w.hold(tx, A, riya, a, later(7.8)) // back where the next step expects it: held

      // Pack: only once confirmed; issues …/26-27/00001 then …02, a bill of supply on its own series; undo after packing is refused.
      expect(await w.pack(tx, A, riya, a, later(8))).toMatchObject({ ok: false })
      const c2 = await w.confirm(tx, A, riya, a, later(9))
      const packed = await w.pack(tx, A, riya, a, later(10))
      expect(packed).toMatchObject({ ok: true, invoiceNumber: expect.stringMatching(/^[A-Z]+\/26-27\/B0001$/) }) // no GSTIN on the order: a bill of supply
      // The seller is stored as the invoice is issued (1D·7): a later change to Settings never rewrites it.
      const [seller] = await tx.select({ name: orders.sellerName, address: orders.sellerAddress }).from(orders).where(eq(orders.id, a))
      expect(seller!.name).toBeTruthy(); expect(seller!.address).not.toBeNull()
      expect(await w.undo(tx, A, riya, (c2 as { eventId: string }).eventId, later(11))).toMatchObject({ ok: false, error: 'Already packed — cancel it instead.' })
      const b = await order(2, { sellerGstin: '08AAAAA0000A1Z5' })
      await w.confirm(tx, A, riya, b, later(12))
      // Documents D2: the logo, signatory and note are frozen at packing; changing Settings later leaves the invoice alone.
      const logo = (n: number) => `https://abc.public.blob.vercel-storage.com/tenants/${A}/documents/aaaaaaaa-0000-0000-0000-00000000000${n}.png`
      await tx.update(shopSettings).set({ docLogo: logo(1), docSignatory: 'Riya Mehta', docNote: 'Exchanges in 7 days.' }).where(eq(shopSettings.tenantId, A))
      expect(await w.pack(tx, A, riya, b, later(13))).toMatchObject({ ok: true, invoiceNumber: expect.stringMatching(/\/26-27\/00001$/) })
      await tx.update(shopSettings).set({ docLogo: logo(2), docSignatory: 'Someone Else', docNote: '' }).where(eq(shopSettings.tenantId, A))
      const [frozen] = await tx.select({ logo: orders.invoiceLogo, signatory: orders.invoiceSignatory, note: orders.invoiceNote }).from(orders).where(eq(orders.id, b))
      expect(frozen).toEqual({ logo: logo(1), signatory: 'Riya Mehta', note: 'Exchanges in 7 days.' })
      const c = await order(3, { sellerGstin: '08AAAAA0000A1Z5' })
      await w.confirm(tx, A, riya, c, later(14))
      expect(await w.pack(tx, A, riya, c, later(15))).toMatchObject({ invoiceNumber: expect.stringMatching(/\/26-27\/00002$/) })

      // Edit after packing is refused; before, the event names fields and never values.
      expect(await w.editContact(tx, A, riya, a, { city: 'Jaipur' }, later(16))).toMatchObject({ ok: false })
      const d = await order(4)
      expect(await w.editContact(tx, A, riya, d, { addressLine: 'B-14, Tilak Marg', city: 'Jaipur' }, later(17))).toMatchObject({ ok: true, fields: ['addressLine', 'city'] })
      const [ev] = await tx.select().from(orderEvents).where(and(eq(orderEvents.orderId, d), eq(orderEvents.kind, 'edited')))
      expect(JSON.stringify(ev)).not.toContain('Tilak')
      // Shop stress test 2026-11-11: an unpaid pay-on-delivery order may not move to a pincode pay on delivery is off for.
      await tx.update(shopSettings).set({ codBlockedPincodes: ['793001'] }).where(eq(shopSettings.tenantId, A))
      expect(await w.editContact(tx, A, riya, d, { pincode: '793001', city: 'Shillong' }, later(17.5))).toMatchObject({ ok: false, error: expect.stringContaining('Pay on delivery is off for 793001') })
      await tx.update(shopSettings).set({ codBlockedPincodes: [] }).where(eq(shopSettings.tenantId, A))

      // Cancel: a reason; "other" needs words; stock back exactly once, and the variant is reported back from 0.
      expect(await w.cancel(tx, A, riya, d, { reason: 'other', restock: true }, later(18))).toMatchObject({ ok: false, error: 'Say why in a few words.' })
      const before = await stock()
      const cancelled = await w.cancel(tx, A, riya, d, { reason: 'fake', restock: true }, later(19))
      expect(cancelled).toMatchObject({ ok: true, refund: 0, backInStock: [v!.id] })
      expect(await stock()).toBe(before + 1)
      expect(await w.cancel(tx, A, riya, d, { reason: 'fake', restock: true }, later(20))).toMatchObject({ ok: false })
      expect(await stock()).toBe(before + 1)

      // A paid order says what to refund; notes are refused on an online order never paid.
      const e = await order(5, { paymentMethod: 'prepaid', paidAt: now })
      expect(await w.cancel(tx, A, riya, e, { reason: 'customer_cancelled', restock: false }, later(21))).toMatchObject({ ok: true, refund: 100000 })
      const f = await order(6, { paymentMethod: 'prepaid', payBy: now })
      expect(await w.addNote(tx, A, riya, f, 'call after 6', later(22))).toMatchObject({ ok: false })
      expect(await w.addNote(tx, A, riya, a, 'call after 6', later(23))).toMatchObject({ ok: true })

      // Unhold sends a held COD order back to To confirm; a held paid order is released by Confirm without confirming it.
      const g = await order(7)
      await w.hold(tx, A, riya, g, later(24)); await w.unhold(tx, A, riya, g, later(25))
      expect(await state(g)).toBe('unconfirmed')
      const h = await order(8, { paymentMethod: 'prepaid', paidAt: now })
      await w.hold(tx, A, riya, h, later(26))
      expect(await state(h)).toBe('held')
      expect(await w.confirm(tx, A, riya, h, later(27))).toMatchObject({ ok: true })
      expect(await state(h)).toBe('paid')

      // Packing a pre-order waits for its stock, then takes it.
      const i = await order(9)
      await tx.insert(orderLines).values({ tenantId: A, orderId: i, variantId: v!.id, title: 'M', qty: 1, unitPrice: 100000, taxableValue: 95238, kind: 'preorder', position: 1 })
      await w.confirm(tx, A, riya, i, later(28))
      await tx.update(variants).set({ stock: 0 }).where(eq(variants.id, v!.id))
      expect(await w.pack(tx, A, riya, i, later(29))).toMatchObject({ ok: false, error: expect.stringMatching(/not in stock yet/) })
      await tx.update(variants).set({ stock: 1 }).where(eq(variants.id, v!.id))
      expect(await w.pack(tx, A, riya, i, later(30))).toMatchObject({ ok: true, preordersTaken: 1, soldOut: [v!.id] })

      // No history row anywhere carries the shopper's details.
      const all = await tx.select().from(orderEvents).where(eq(orderEvents.tenantId, A))
      expect(JSON.stringify(all)).not.toMatch(/Tilak|9829043210|call after 6/)
      throw ROLLBACK
    }).catch((err) => { if (err !== ROLLBACK) throw err })
  })

  it('two people confirming at once, in two transactions: one wins, the other is told who', async () => {
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    const w = await import('@/lib/orders/work')
    const [o] = await withTenant(A, (tx) => tx.insert(orders).values({ tenantId: A, number: 950_000 + Math.floor(Math.random() * 40_000), paymentMethod: 'cod', placedAt: new Date() }).returning({ id: orders.id }))
    const [r1, r2] = await Promise.all([withTenant(A, (tx) => w.confirm(tx, A, riya, o!.id)), withTenant(A, (tx) => w.confirm(tx, A, arjun, o!.id))])
    const wins = [r1, r2].filter((r) => r.ok)
    expect(wins.length).toBe(1)
    const lost = [r1, r2].find((r) => !r.ok) as { ok: false; error: string; by?: { email: string | null } }
    expect(lost.error).toBe('Already confirmed')
    expect([riya.email, arjun.email]).toContain(lost.by?.email)
  })
})
