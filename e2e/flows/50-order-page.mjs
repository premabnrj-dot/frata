// =============================================================================
// FLOW: order page (1D·4c) — /console/orders/<number>: badges and ONE primary
// action, the risk card with Call/WhatsApp, a high-risk confirm that asks
// first, hold and back, Mark packed issuing the invoice number, cancel with a
// reason putting stock back once, editing the address (history names fields,
// never values), notes, staff without Cancel/Edit, another number "not found",
// and the phone layout. Seeds its own orders and removes them at the end.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn, until, USERS } from '../lib.mjs'

export default {
  name: 'order-page',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const [{ prefix }] = await db`select order_prefix as prefix from shop_settings where tenant_id = ${T}`
    const [v] = await db`select id, product_id, stock from variants where tenant_id = ${T} and option_values = '{M,Rust}'`
    const label = (n) => `${prefix || 'KS'}-${n}`
    const H = top + 3, P = top + 4 // H: the third COD order today from one phone (High); P: an ordinary order to pack and cancel
    await db`insert into orders (tenant_id, number, payment_method, placed_at, customer_name, phone, address_line, area, city, pincode, state, subtotal, total) values
      (${T}, ${top + 1}, 'cod', now() - interval '50 minutes', 'Page Riya', '9822200001', 'B-14, Tilak Marg', 'C-Scheme', 'Jaipur', '302001', 'Rajasthan', 249000, 249000),
      (${T}, ${top + 2}, 'cod', now() - interval '40 minutes', 'Page Riya', '9822200001', 'B-14, Tilak Marg', 'C-Scheme', 'Jaipur', '302001', 'Rajasthan', 249000, 249000),
      (${T}, ${H}, 'cod', now() - interval '30 minutes', 'Page Riya', '9822200001', 'B-14, Tilak Marg', 'C-Scheme', 'Jaipur', '302001', 'Rajasthan', 249000, 249000),
      (${T}, ${P}, 'cod', now() - interval '20 minutes', 'Page Dev', '9822200002', 'Flat 22, Shanti Nagar', 'Vaishali', 'Jaipur', '302021', 'Rajasthan', 249000, 249000)`
    const [{ id: pId }] = await db`select id from orders where tenant_id = ${T} and number = ${P}`
    await db`insert into order_lines (tenant_id, order_id, variant_id, product_id, title, option_values, sku, qty, unit_price, taxable_value, gst_bps, gst, kind, stock_taken_at)
      values (${T}, ${pId}, ${v.id}, ${v.product_id}, 'Chanderi kurta set', '{M,Rust}', 'KS-M-RUST', 1, 249000, 237143, 500, 11857, 'in_stock', now())`
    await db`update variants set stock = stock - 1 where id = ${v.id}`
    const stock = async () => (await db`select stock from variants where id = ${v.id}`)[0].stock
    const order = async (n) => (await db`select confirmed_at, held_at, packed_at, invoice_number, cancelled_at, cancel_reason, city from orders where tenant_id = ${T} and number = ${n}`)[0]
    await db`insert into members (tenant_id, user_id, role) values (${T}, ${USERS.staff.id}, 'staff') on conflict do nothing`

    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    const toast = (text) => p.locator('[data-toast]', { hasText: text }).waitFor()
    try {
      await t.step('the queue opens a high-risk order on c; its page says why and how to reach the customer', async () => {
        await p.goto(CONSOLE + '/console/orders')
        await p.getByRole('row').filter({ hasText: label(H) }).getByRole('cell').nth(2).click()
        await p.keyboard.press('c'); await p.waitForURL(new RegExp(`/console/orders/${H}$`))
        await p.getByRole('heading', { name: label(H) }).waitFor()
        const card = p.getByRole('region', { name: 'High risk' })
        await card.getByText(/pay-on-delivery orders from this phone today/).waitFor()
        await card.getByText('Call before confirming. Cancel if unreachable.').waitFor()
        assert.equal(await card.getByRole('link', { name: 'Call 9822200001' }).getAttribute('href'), 'tel:+919822200001')
        assert.match(await card.getByRole('link', { name: 'WhatsApp' }).getAttribute('href'), /^https:\/\/wa\.me\/919822200001\?text=/)
        await p.screenshot({ path: t.out('high-risk'), fullPage: true })
      })

      await t.step('confirming a high-risk order asks first; "Not yet" changes nothing; Confirm anyway confirms with Undo', async () => {
        await p.getByRole('button', { name: 'Confirm', exact: true }).first().click()
        const d = p.getByRole('dialog', { name: `Confirm ${label(H)}?` }); await d.waitFor()
        await d.getByRole('button', { name: 'Not yet' }).click(); await d.waitFor({ state: 'hidden' })
        assert.equal((await order(H)).confirmed_at, null)
        await p.getByRole('button', { name: 'Confirm', exact: true }).first().click(); await d.getByRole('button', { name: 'Confirm anyway' }).click()
        await toast(`${label(H)} confirmed.`); await until(async () => (await order(H)).confirmed_at)
        await p.getByRole('button', { name: 'Undo' }).click(); await until(async () => !(await order(H)).confirmed_at)
      })

      await t.step('More: hold, then take off hold; the history names who did it', async () => {
        await p.goto(CONSOLE + `/console/orders/${P}`)
        await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: 'Put on hold' }).click()
        await until(async () => (await order(P)).held_at); await p.getByText('On hold', { exact: true }).first().waitFor()
        await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: 'Take off hold' }).click()
        await until(async () => !(await order(P)).held_at)
        await p.getByRole('region', { name: 'Activity' }).getByText('Put on hold').waitFor()
        await p.getByRole('region', { name: 'Activity' }).getByText(/riya@kesarstudio\.in/).first().waitFor()
      })

      await t.step('edit the address: saved, the history says which field and never the value', async () => {
        await p.getByRole('region', { name: 'Customer' }).getByRole('button', { name: 'Edit' }).click()
        const d = p.getByRole('dialog', { name: `Who ${label(P)} goes to` }); await d.waitFor()
        await d.getByLabel('City').fill('Ajmer'); await d.getByRole('button', { name: 'Save' }).click(); await d.waitFor({ state: 'hidden' })
        await until(async () => (await order(P)).city === 'Ajmer')
        await p.getByRole('region', { name: 'Activity' }).getByText('Changed the city').waitFor()
        assert.equal(JSON.stringify(await db`select * from order_events where tenant_id = ${T} and order_id = ${pId}`).includes('Ajmer'), false)
      })

      await t.step('a note for the team', async () => {
        await p.getByLabel('A note for your team').fill('Call after 6 pm'); await p.getByRole('button', { name: 'Add note' }).click()
        await p.getByRole('region', { name: 'Notes' }).getByText('Call after 6 pm').waitFor()
      })

      await t.step('confirm then Mark packed: the invoice number is issued and shown; the address is no longer editable', async () => {
        await p.getByRole('button', { name: 'Confirm', exact: true }).first().click(); await until(async () => (await order(P)).confirmed_at)
        await p.getByRole('button', { name: 'Mark packed' }).first().click()
        const o = await until(async () => { const x = await order(P); return x.invoice_number && x })
        assert.match(o.invoice_number, /\/\d\d-\d\d\/B?\d{4,5}$/)
        await p.getByText(o.invoice_number).waitFor()
        assert.equal(await p.getByRole('region', { name: 'Customer' }).getByRole('button', { name: 'Edit' }).count(), 0)
      })

      await t.step('cancel asks for a reason, puts the stock back once, and keeps the invoice', async () => {
        const before = await stock()
        await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: 'Cancel order…' }).click()
        const d = p.getByRole('dialog', { name: `Cancel ${label(P)}?` }); await d.waitFor()
        assert.equal(await p.evaluate(() => document.activeElement?.textContent), 'Keep the order')
        await d.getByRole('button', { name: 'Cancel order' }).click(); await d.getByText('Pick a reason.').waitFor()
        await d.getByLabel('Other').check(); await d.getByRole('button', { name: 'Cancel order' }).click(); await d.getByText('Say why in a few words.').waitFor()
        await d.getByLabel('Customer cancelled').check(); await d.getByRole('button', { name: 'Cancel order' }).click()
        const o = await until(async () => { const x = await order(P); return x.cancelled_at && x })
        assert.equal(o.cancel_reason, 'customer_cancelled'); assert.ok(o.invoice_number, 'the invoice stays')
        assert.equal(await stock(), before + 1)
        await p.getByText('Cancelled: nothing to collect.').waitFor()
        await p.getByRole('region', { name: 'Activity' }).getByText('Cancelled · Customer cancelled').waitFor()
      })

      await t.step('staff: no Cancel, no Edit; another number is "not found"', async () => {
        const staff = await signedIn(t.browser, 'staff'); const q = await staff.newPage()
        await q.goto(CONSOLE + `/console/orders/${top + 1}`); await q.getByRole('heading', { name: label(top + 1) }).waitFor()
        await q.getByRole('button', { name: 'More' }).click()
        assert.equal(await q.getByRole('menuitem', { name: 'Cancel order…' }).count(), 0)
        assert.equal(await q.getByRole('region', { name: 'Customer' }).getByRole('button', { name: 'Edit' }).count(), 0)
        await q.goto(CONSOLE + '/console/orders/999999999'); await q.getByText('No such order in your shop').waitFor()
        await q.goto(CONSOLE + '/console/orders/not-a-number'); await q.getByText('No such order in your shop').waitFor()
        await staff.close()
      })

      await t.step('phone: one column, the primary action fixed above the bottom bar, nothing scrolls sideways', async () => {
        await p.setViewportSize({ width: 390, height: 844 })
        await p.goto(CONSOLE + `/console/orders/${top + 1}`)
        const bar = p.locator('.fixed', { has: p.getByRole('button', { name: 'Confirm', exact: true }) })
        await bar.waitFor(); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390))
        await p.screenshot({ path: t.out('phone'), fullPage: true })
      })
    } catch (e) {
      await p.screenshot({ path: t.out('FAILED'), fullPage: true }).catch(() => {})
      throw e
    } finally {
      await owner.close()
      await db`delete from members where tenant_id = ${T} and user_id = ${USERS.staff.id}`
      await db`delete from orders where tenant_id = ${T} and number between ${top + 1} and ${P}`
    }
  },
}
