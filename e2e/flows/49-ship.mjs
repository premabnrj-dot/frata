// =============================================================================
// FLOW: ship (M2·2 S·0, docs/specs/2026-11-08-ship.md) — orders that have left the work tabs: To ship, On the way,
// Coming back; Mark shipped another way, then Delivered or Came back, each with Undo; staff ship but never mark an
// outcome or see a cost; partners never ship. Written first (plan S0·0): today a packed order is in no work tab, so
// the first step fails until S0·5 lands; later steps are added with the tasks that build them. Seeds its own orders.
// Guards: an outcome a partner or staff member can set, a packed order lost from every tab, an Undo that leaves the
// order unable to ship again.
// =============================================================================
import assert from 'node:assert/strict'
import { todayAgo, CONSOLE, signedIn } from '../lib.mjs'

export default {
  name: 'ship',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const [{ prefix }] = await db`select order_prefix as prefix from shop_settings where tenant_id = ${T}`
    const label = (n) => `${prefix || 'KS'}-${n}`
    const P = top + 1
    await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, packed_at, invoice_number, customer_name, phone, address_line, area, city, pincode, state, subtotal, total)
      values (${T}, ${P}, 'cod', ${todayAgo(60)}, ${todayAgo(50)}, ${todayAgo(40)}, ${'SH/26-27/' + P}, 'Ship Meera', '9822300001', '7, Civil Lines', 'Bani Park', 'Jaipur', '302016', 'Rajasthan', 249000, 249000)`

    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('a packed order is in To ship, with Mark shipped beside Print slip', async () => {
        await p.goto(CONSOLE + '/console/orders?tab=to_ship')
        await p.getByRole('row').filter({ hasText: label(P) }).waitFor()
        await p.goto(CONSOLE + `/console/orders/${P}`)
        await p.getByRole('button', { name: 'Mark shipped' }).waitFor()
        assert.ok(await p.getByRole('link', { name: /Print slip/ }).count() + await p.getByRole('button', { name: /Print slip/ }).count() > 0)
      })
    } finally {
      await owner.close()
    }
  },
}
