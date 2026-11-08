// =============================================================================
// FLOW: ship (M2·2 S·0, docs/specs/2026-11-08-ship.md) — orders that have left the work tabs: To ship, On the way,
// Coming back; Mark shipped another way, then Delivered or Came back, each with Undo; staff ship but never mark an
// outcome or see a cost; partners never ship; bulk Delivered and its one Undo. Written first (plan S0·0);
// its first step failed until S0·5 landed. Seeds its own orders and members, and removes the members after.
// Guards: an outcome a partner or staff member can set, a packed order lost from every tab, an Undo that leaves the
// order unable to ship again.
// =============================================================================
import assert from 'node:assert/strict'
import { todayAgo, until, CONSOLE, USERS, signedIn } from '../lib.mjs'

export default {
  name: 'ship',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const [{ prefix }] = await db`select order_prefix as prefix from shop_settings where tenant_id = ${T}`
    const label = (n) => `${prefix || 'KS'}-${n}`
    const P = top + 1, Q = top + 2
    await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, packed_at, invoice_number, customer_name, phone, address_line, area, city, pincode, state, subtotal, total)
      values (${T}, ${P}, 'cod', ${todayAgo(60)}, ${todayAgo(50)}, ${todayAgo(40)}, ${'SH/26-27/' + P}, 'Ship Meera', '9822300001', '7, Civil Lines', 'Bani Park', 'Jaipur', '302016', 'Rajasthan', 249000, 249000),
        (${T}, ${Q}, 'cod', ${todayAgo(60)}, ${todayAgo(50)}, ${todayAgo(40)}, ${'SH/26-27/' + Q}, 'Ship Kabir', '9822300002', '9, MI Road', 'C Scheme', 'Jaipur', '302001', 'Rajasthan', 149000, 149000)`
    // Its orders take numbers top+1..top+6: move the shop's own order counter past them, so a shopper's next order
    // (placed by a later flow) never collides with one seeded here (orders_tenant_number).
    await db`insert into tenant_counters (tenant_id, kind, period, next) values (${T}, 'order', '', ${top + 7})
      on conflict (tenant_id, kind, period) do update set next = greatest(tenant_counters.next, excluded.next)`
    const moments = async (n) => (await db`select shipped_at, delivered_at, rto_delivered_at from orders where tenant_id = ${T} and number = ${n}`)[0]
    const S = USERS.staff, Pa = USERS.partner
    await db`insert into auth.users (id, email, email_confirmed_at) values (${Pa.id}, ${Pa.email}, now()), (${S.id}, ${S.email}, now()) on conflict (id) do nothing`
    await db`insert into members (tenant_id, user_id, role) values (${T}, ${Pa.id}, 'partner'), (${T}, ${S.id}, 'staff') on conflict do nothing`

    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('a packed order is in To ship, with Mark shipped beside Print slip', async () => {
        await p.goto(CONSOLE + '/console/orders?tab=to_ship')
        await p.getByRole('row').filter({ hasText: label(P) }).waitFor()
        await p.goto(CONSOLE + `/console/orders/${P}`)
        await p.getByRole('button', { name: 'Mark shipped' }).waitFor()
        assert.ok(await p.getByRole('link', { name: /Print packing slip/ }).count() + await p.getByRole('button', { name: /Print packing slip/ }).count() > 0)
      })

      await t.step('Mark shipped another way: in On the way; Undo puts it back in To ship', async () => {
        await p.getByLabel('Courier').fill('Professional Couriers')
        await p.getByLabel('Tracking number').fill('PC123456')
        await p.getByRole('button', { name: 'Mark shipped' }).click()
        await p.locator('[data-toast]', { hasText: `${label(P)} marked shipped.` }).waitFor()
        await p.getByRole('heading', { name: 'On the way' }).waitFor()
        await p.getByText('PC123456').waitFor()
        await p.getByRole('button', { name: 'Undo' }).click()
        await p.locator('[data-toast]', { hasText: 'Undone.' }).waitFor()
        await until(async () => (await moments(P)).shipped_at === null)
        await p.reload()
        await p.getByRole('button', { name: 'Mark shipped' }).click()
        await p.getByRole('heading', { name: 'On the way' }).waitFor()
        await p.goto(CONSOLE + '/console/orders?tab=on_the_way')
        await p.getByRole('row').filter({ hasText: label(P) }).waitFor()
      })

      await t.step('Delivered, with Undo; then delivered for good and in no shipping tab', async () => {
        await p.goto(CONSOLE + `/console/orders/${P}`)
        await p.getByRole('button', { name: 'Delivered', exact: true }).click()
        await p.locator('[data-toast]', { hasText: `${label(P)} marked delivered.` }).waitFor()
        await p.getByRole('button', { name: 'Undo' }).click()
        await p.locator('[data-toast]', { hasText: 'Undone.' }).waitFor()
        await until(async () => (await moments(P)).delivered_at === null)
        await p.reload()
        await p.getByRole('button', { name: 'Delivered', exact: true }).click()
        await p.locator('[data-toast]', { hasText: `${label(P)} marked delivered.` }).waitFor()
        await until(async () => (await moments(P)).delivered_at !== null)
        await p.goto(CONSOLE + '/console/orders?tab=on_the_way')
        await p.getByRole('navigation', { name: 'Order views' }).getByRole('link', { name: /^On the way/ }).waitFor()
        assert.equal(await p.getByRole('row').filter({ hasText: label(P) }).count(), 0)
      })

      await t.step('Came back asks first, then it is out of On the way', async () => {
        await p.goto(CONSOLE + `/console/orders/${Q}`)
        await p.getByRole('button', { name: 'Mark shipped' }).click()
        await p.getByRole('heading', { name: 'On the way' }).waitFor()
        await p.getByRole('button', { name: 'Came back', exact: true }).click()
        const d = p.getByRole('dialog', { name: `${label(Q)} came back?` })
        await d.waitFor()
        await d.getByRole('button', { name: 'Came back' }).click()
        await p.locator('[data-toast]', { hasText: `${label(Q)} marked came back.` }).waitFor()
        await until(async () => (await moments(Q)).rto_delivered_at !== null)
      })

      await t.step('Lost by the courier on an order paid online: asks first, then says to refund', async () => {
        const L = top + 6
        const [{ id }] = await db`insert into orders (tenant_id, number, payment_method, placed_at, paid_at, confirmed_at, packed_at, shipped_at, invoice_number, customer_name, phone, address_line, area, city, pincode, state, subtotal, total)
          values (${T}, ${L}, 'prepaid', ${todayAgo(60)}, ${todayAgo(59)}, ${todayAgo(50)}, ${todayAgo(40)}, ${todayAgo(30)}, ${'SH/26-27/' + L}, 'Ship Lata', '9822300006', '5, MI Road', 'C Scheme', 'Jaipur', '302001', 'Rajasthan', 99000, 99000) returning id`
        await db`insert into shipments (tenant_id, order_id, provider) values (${T}, ${id}, 'self')`
        await p.goto(CONSOLE + `/console/orders/${L}`)
        await p.getByRole('button', { name: 'Lost by the courier' }).click()
        const d = p.getByRole('dialog', { name: 'Lost by the courier?' })
        await d.getByRole('button', { name: 'Mark lost' }).click()
        await p.locator('[data-toast]', { hasText: `${label(L)} marked lost.` }).waitFor()
        await p.getByText(/Lost by the courier after it was paid online: refund the shopper in Razorpay/).waitFor()
        assert.ok((await db`select lost_at from orders where id = ${id}`)[0].lost_at)
      })

      await t.step('Bulk Delivered from On the way, and one Undo for both', async () => {
        const U = [top + 4, top + 5]
        for (const n of U) {
          const [{ id }] = await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, packed_at, shipped_at, invoice_number, customer_name, phone, address_line, area, city, pincode, state, subtotal, total)
            values (${T}, ${n}, 'cod', ${todayAgo(60)}, ${todayAgo(50)}, ${todayAgo(40)}, ${todayAgo(30)}, ${'SH/26-27/' + n}, 'Ship Bulk', '9822300009', '1, MI Road', 'C Scheme', 'Jaipur', '302001', 'Rajasthan', 99000, 99000) returning id`
          await db`insert into shipments (tenant_id, order_id, provider) values (${T}, ${id}, 'self')`
        }
        await p.goto(CONSOLE + '/console/orders?tab=on_the_way')
        for (const n of U) await p.getByRole('checkbox', { name: `Select ${label(n)}` }).check()
        await p.getByRole('region', { name: 'Selected orders' }).getByRole('button', { name: 'Delivered' }).click()
        await p.locator('[data-toast]', { hasText: 'Marked 2 delivered.' }).waitFor()
        await until(async () => (await Promise.all(U.map(moments))).every((m) => m.delivered_at !== null))
        await p.locator('[data-toast]').getByRole('button', { name: 'Undo' }).click()
        await p.locator('[data-toast]', { hasText: 'Undone.' }).waitFor()
        await until(async () => (await Promise.all(U.map(moments))).every((m) => m.delivered_at === null))
      })

      await t.step('Shipping costs: confirmed once, shown on Settings', async () => {
        await p.goto(CONSOLE + '/console/settings')
        await p.getByRole('link', { name: /Shipping costs/ }).filter({ hasText: 'Not confirmed' }).click()
        await p.waitForURL(/\/console\/settings\/shipping-costs$/)
        await p.getByLabel('A delivery').fill('65')
        await p.getByRole('button', { name: 'Confirm these costs' }).click()
        await p.getByText('Shipping costs confirmed.').waitFor()
        await p.getByText(/^Confirmed on /).waitFor()
        await p.goto(CONSOLE + '/console/settings')
        await p.getByRole('link', { name: /Shipping costs/ }).filter({ hasText: 'Delivery ₹65' }).waitFor()
      })
    } finally {
      await owner.close()
    }

    const R = top + 3
    await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, packed_at, shipped_at, invoice_number, customer_name, phone, address_line, area, city, pincode, state, subtotal, total)
      values (${T}, ${R}, 'cod', ${todayAgo(60)}, ${todayAgo(50)}, ${todayAgo(40)}, null, ${'SH/26-27/' + R}, 'Ship Asha', '9822300003', '3, Tonk Road', 'Durgapura', 'Jaipur', '302018', 'Rajasthan', 99000, 99000)`
    const staff = await signedIn(t.browser, 'staff', { viewport: { width: 390, height: 844 } })
    const partner = await signedIn(t.browser, 'partner', { viewport: { width: 1280, height: 900 } })
    try {
      await t.step('Staff ship but never mark an outcome or open shipping costs', async () => {
        const s = await staff.newPage(); s.setDefaultTimeout(10_000); s.on('pageerror', (e) => t.errors.push(e.message))
        // From the queue row, with Undo (the outcome Undo checks the staff member's own role on the server).
        await s.goto(CONSOLE + '/console/orders?tab=to_ship')
        await s.getByRole('button', { name: `Mark shipped ${label(R)}` }).click()
        await s.locator('[data-toast]', { hasText: `${label(R)} marked shipped.` }).waitFor()
        await until(async () => (await moments(R)).shipped_at !== null)
        await s.locator('[data-toast]').getByRole('button', { name: 'Undo' }).click()
        await s.locator('[data-toast]', { hasText: 'Undone.' }).waitFor()
        await until(async () => (await moments(R)).shipped_at === null)
        await s.goto(CONSOLE + `/console/orders/${R}`)
        await s.getByRole('button', { name: 'Mark shipped' }).click()
        await s.getByText('An owner or admin marks it delivered or came back.').waitFor()
        assert.equal(await s.getByRole('button', { name: 'Delivered', exact: true }).count(), 0)
        // The cost of goods follows the same rule (owner 2026-11-08): staff edit products without it, and it never reaches their page.
        const costs = async () => (await db`select v.option_values, v.unit_cost, v.stock from variants v join products p on p.id = v.product_id
          where p.tenant_id = ${T} and p.handle = 'chanderi-kurta-set' and v.archived_at is null order by v.option_values`).map((r) => ({ values: r.option_values.join(' '), cost: r.unit_cost, stock: r.stock }))
        const before = await costs()
        const known = before.find((r) => r.cost !== null)
        assert.ok(known, 'the seed has a cost to hide')
        await s.goto(CONSOLE + '/console/products/chanderi-kurta-set')
        await s.getByText('Sizes, colours and stock').waitFor()
        assert.equal(await s.getByRole('columnheader', { name: 'Your cost, ₹' }).count(), 0)
        assert.ok(!(await s.content()).includes(String(Number(known.cost) / 100)), 'the cost is not anywhere in the page')
        // A staff save changes the stock and keeps every stored cost as it was.
        await s.getByLabel('Stock for M Rust').fill('7')
        await s.getByRole('button', { name: 'Save', exact: true }).click()
        await until(async () => (await costs()).find((r) => r.values === 'M Rust')?.stock === 7)
        assert.deepEqual((await costs()).map((r) => [r.values, r.cost]), before.map((r) => [r.values, r.cost]))
        await s.goto(CONSOLE + '/console/settings/shipping-costs')
        await s.getByText(/Only the owner or an admin|can’t change this shop’s settings/).first().waitFor()
        assert.equal(await s.getByLabel('A delivery').count(), 0)
      })

      await t.step('Partners never ship', async () => {
        await db`update orders set shipped_at = null where tenant_id = ${T} and number = ${R}`
        await db`update shipments set ended_at = now(), ended_reason = 'undone' where tenant_id = ${T} and ended_at is null and order_id = (select id from orders where tenant_id = ${T} and number = ${R})`
        const q = await partner.newPage(); q.setDefaultTimeout(10_000); q.on('pageerror', (e) => t.errors.push(e.message))
        await q.goto(CONSOLE + `/console/orders/${R}`)
        await q.waitForLoadState('networkidle')
        assert.equal(await q.getByRole('button', { name: 'Mark shipped' }).count(), 0)
      })
    } finally {
      await staff.close(); await partner.close()
      await db`delete from members where tenant_id = ${T} and user_id in (${Pa.id}, ${S.id})`
    }
  },
}
