// FLOW: true-profit — True Profit (plan docs/plans/2026-11-12-true-profit-a3.md; approved mockup). Kesar is on Launch:
// the owner starts the 14-day trial itself (A3), then reads ₹ kept by product (a product opens its sizes) and by PIN
// code, at desktop and phone width. Six orders with an outcome are written for it and removed after.
import assert from 'node:assert/strict'
import { CONSOLE, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'

export default {
  name: 'true-profit',
  async run(t) {
    const { db } = t
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${KESAR}`
    const [v] = await db`select v.id, v.product_id from variants v join products p on p.id = v.product_id where v.tenant_id = ${KESAR} and p.handle = 'chanderi-kurta-set' order by v.position limit 1`
    const ids = []
    const order = async (k, outcome, pincode) => {
      const ago = (h) => new Date(Date.now() - h * 3_600_000)
      const [o] = await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, packed_at, shipped_at, delivered_at, rto_initiated_at, pincode, customer_name,
          subtotal, total, merchandise_net, cogs, invoice_number)
        values (${KESAR}, ${top + 100 + k}, 'cod', ${ago(72)}, ${ago(71)}, ${ago(70)}, ${ago(60)}, ${outcome === 'delivered' ? ago(20) : null}, ${outcome === 'rto' ? ago(20) : null},
          ${pincode}, 'E2E shopper', 249000, 249000, 237143, 90000, ${'E2E/TP/' + k})
        returning id`
      ids.push(o.id)
      await db`insert into order_lines (tenant_id, order_id, variant_id, product_id, title, qty, unit_price, taxable_value, unit_cost, kind, stock_taken_at)
        values (${KESAR}, ${o.id}, ${v.id}, ${v.product_id}, 'Chanderi kurta set', 1, 249000, 237143, 90000, 'in_stock', ${ago(72)})`
    }
    for (let k = 0; k < 4; k++) await order(k, 'delivered', '302012')
    await order(4, 'rto', '302012')
    await order(5, 'rto', '845401')
    const oc = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const o = await oc.newPage(); o.setDefaultTimeout(15_000); o.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('Launch starts the 14-day trial from the app’s page', async () => {
        await db`delete from tenant_modules where tenant_id = ${KESAR} and module = 'true_profit'`
        await db`delete from tenant_addons where tenant_id = ${KESAR} and module = 'true_profit'`
        await o.goto(CONSOLE + '/console/apps/true_profit', { waitUntil: 'domcontentloaded' })
        await o.getByRole('button', { name: 'Start free trial' }).click()
        await o.getByRole('dialog').getByText('₹1,178.82').waitFor()
        await o.getByRole('dialog').getByRole('button', { name: 'Start free trial' }).click()
        await o.getByText('Trial · 14 days left').waitFor()
      })

      await t.step('Overview: ₹ kept, per delivered order, returns, return rate; earns and loses most', async () => {
        await o.getByText(/^₹ kept · 30 days$/).waitFor()
        await o.getByText(/orders with an outcome$/).waitFor()
        await o.getByText('Returns cost you').waitFor()
        await o.getByRole('heading', { name: 'Earns most' }).waitFor()
        // Cached 15 minutes per shop and period (owner, 2026-11-12): a reload shows the same moment.
        const at = await o.getByText(/^Updated /).innerText()
        await o.reload({ waitUntil: 'domcontentloaded' })
        assert.equal(await o.getByText(/^Updated /).innerText(), at)
        await o.screenshot({ path: t.out('overview'), fullPage: true })
      })

      await t.step('Products: a product opens its sizes and colours', async () => {
        await o.getByRole('navigation', { name: 'True Profit' }).getByRole('link', { name: 'Products' }).click()
        const table = o.getByRole('table', { name: 'Products' })
        await table.getByText(/Chanderi kurta set|Sabz chanderi/).first().waitFor()
        const row = table.getByRole('row').filter({ hasText: /chanderi/i }).first()
        assert.match(await row.innerText(), /5\s+[\s\S]*2|4\s+[\s\S]*2/, 'delivered and returned counted per line')
        await row.getByRole('link').first().click()
        await o.waitForURL(/open=/)
        assert.ok((await table.getByRole('row').count()) >= 3, 'the product’s variants show under it')
        await o.screenshot({ path: t.out('products'), fullPage: true })
      })

      await t.step('Pincodes: 302012 with its COD orders; one-order PIN codes never show', async () => {
        await o.goto(CONSOLE + '/console/apps/true_profit?tab=pincodes', { waitUntil: 'domcontentloaded' })
        const table = o.getByRole('table', { name: 'Pincodes' })
        await table.getByText('302012').waitFor()
        assert.equal(await table.getByText('845401').count(), 0)
        await o.screenshot({ path: t.out('pincodes'), fullPage: true })
      })

      await t.step('A phone: rows, no sideways scroll', async () => {
        await o.setViewportSize({ width: 390, height: 844 })
        await o.goto(CONSOLE + '/console/apps/true_profit?tab=products', { waitUntil: 'domcontentloaded' })
        await o.getByRole('table', { name: 'Products' }).waitFor()
        assert.ok(await o.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll')
        await o.screenshot({ path: t.out('phone'), fullPage: true })
      })
    } finally {
      await db`delete from order_lines where tenant_id = ${KESAR} and order_id = any(${ids})`
      await db`delete from orders where tenant_id = ${KESAR} and id = any(${ids})`
      await db`delete from tenant_modules where tenant_id = ${KESAR} and module = 'true_profit'`
      await db`delete from tenant_addons where tenant_id = ${KESAR} and module = 'true_profit'`
      await oc.close()
    }
  },
}
