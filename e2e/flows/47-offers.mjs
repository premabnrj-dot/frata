// =============================================================================
// FLOW: offers (docs/specs/2026-11-08-coupons.md, O·1) — an owner drafts and starts an automatic 10% offer and a
// "pay online, save ₹50"; the bar shows the one in it; the bag and checkout show what each saved; a COD order keeps
// the order offer only; a dismissed online payment switched to COD loses the saving (and says so first); an
// unlisted code applies only when typed, and a wrong code reads one way. Every offer is ended in `finally`, so the
// flows after this one see the shop's normal prices. Run after `checkout` (it connects Razorpay).
// Guards: a discount the order does not record, a total that ignores the offer, a saving kept after a switch, a
// code that leaks its existence, a console list that scrolls sideways on a phone.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, FAKE_CHECKOUT, SHOP, playwright, signedIn, until } from '../lib.mjs'
const { devices } = playwright

export default {
  name: 'offers',
  async run(t) {
    const { db } = t
    const lastOrder = async () => (await db`select * from orders order by placed_at desc limit 1`)[0]
    const cc = await signedIn(t.browser, 'owner')
    const c = await cc.newPage(); c.setDefaultTimeout(10_000); c.on('pageerror', (e) => t.errors.push(e.message))
    const [s] = await db`select shipping_flat, free_shipping_above, cod_charge from shop_settings limit 1`
    const ship = (amount) => (Number(s.shipping_flat) && !(Number(s.free_shipping_above) && amount >= Number(s.free_shipping_above)) ? Number(s.shipping_flat) : 0)
    const inr = (p) => '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })
    // This flow sells Rust M a few times; the flows after it expect the stock they had, so it is put back in `finally`.
    const [{ stock: rustM }] = await db`select stock from variants where option_values = '{M,Rust}'`
    await db`update variants set stock = stock + 10 where option_values = '{M,Rust}'`

    try {
      await t.step('the owner drafts an automatic 10% offer, puts it in the bar and starts it', async () => {
        await c.goto(CONSOLE + '/console/offers')
        await c.getByRole('heading', { level: 1, name: 'Offers' }).waitFor()
        await c.getByRole('link', { name: 'New offer' }).first().click()
        await c.waitForURL(/\/console\/offers\/new/)
        await c.fill('#o-title', 'Festive'); await c.fill('#o-value', '10'); await c.fill('#o-min', '2000')
        await c.getByLabel(/Show it in the bar/).check()
        await c.getByRole('button', { name: 'Save as draft' }).click()
        await c.waitForURL(/\/console\/offers\/[0-9a-f-]{36}$/)
        await c.getByText('Draft', { exact: true }).first().waitFor()
        await c.getByRole('button', { name: 'Start', exact: true }).click()
        await c.getByText('Live', { exact: true }).first().waitFor()
        await c.screenshot({ path: t.out('offer-page'), fullPage: true })
      })
      await t.step('and a "pay online, save ₹50", which takes over the bar', async () => {
        await c.goto(CONSOLE + '/console/offers/new?style=pay_online')
        await c.getByLabel(/Show it in the bar/).check() // moves the bar from Festive: one offer in it at a time
        await c.getByRole('button', { name: 'Save as draft' }).click()
        await c.waitForURL(/\/console\/offers\/[0-9a-f-]{36}$/)
        await c.getByRole('button', { name: 'Start', exact: true }).click()
        await c.getByText('Live', { exact: true }).first().waitFor()
        await c.goto(CONSOLE + '/console/offers')
        await c.getByRole('link', { name: 'Festive' }).waitFor(); await c.getByRole('link', { name: 'Pay online, save' }).waitFor()
        assert.equal((await db`select count(*)::int n from discounts where announce`)[0].n, 1, 'one offer in the bar')
        await c.getByText('₹50 off paying online · in the bar').waitFor()
        await c.screenshot({ path: t.out('offers-list'), fullPage: true })
      })
      await t.step('the list on a phone: no sideways scroll', async () => {
        const qc = await signedIn(t.browser, 'owner', { viewport: { width: 390, height: 844 } })
        const q = await qc.newPage(); await q.goto(CONSOLE + '/console/offers')
        await q.getByRole('heading', { level: 1, name: 'Offers' }).waitFor()
        assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
        await q.screenshot({ path: t.out('offers-phone'), fullPage: true }); await qc.close()
      })

      const ctx = await t.browser.newContext({ ...devices['Pixel 7'] })
      await ctx.route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_CHECKOUT }))
      const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
      const fill = async () => {
        await p.fill('#phone', '98290 43211'); await p.fill('#name', 'Meera Joshi'); await p.fill('#pincode', '302001'); await p.fill('#city', 'Jaipur')
        await p.fill('#addressLine', '7, Civil Lines'); await p.fill('#area', 'Bani Park'); await p.selectOption('#state', 'Rajasthan')
      }
      const toBag = async () => {
        await p.goto(SHOP + '/products/chanderi-kurta-set', { waitUntil: 'domcontentloaded' })
        await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() }); await p.reload({ waitUntil: 'domcontentloaded' })
        await p.getByRole('button', { name: /^Rust/ }).click(); await p.getByRole('button', { name: 'M', exact: true }).click()
        await p.getByRole('button', { name: /Add to bag/ }).click(); await p.getByRole('dialog', { name: 'Your bag' }).waitFor()
      }
      // ₹2,490 kurta: 10% off = ₹249; ₹50 more paying online.
      const order = 24900, saving = 5000, after = 249000 - order
      const cod = after + ship(after) + Number(s.cod_charge), online = after - saving + ship(after)

      await t.step('the bar, and the bag: each saving named, the pay-online total', async () => {
        await toBag()
        await p.getByText('Pay online, save ₹50', { exact: true }).first().waitFor() // the bar
        const bag = p.getByRole('dialog', { name: 'Your bag' })
        await bag.getByText('Festive', { exact: true }).waitFor(); await bag.getByText('−₹249').waitFor()
        await bag.getByText('Pay online, save (paying online)').waitFor(); await bag.getByText('−₹50').waitFor()
        await bag.getByText(inr(online)).waitFor()
        await p.screenshot({ path: t.out('bag'), fullPage: true })
      })
      await t.step('COD: the order offer only, recorded on the order and its lines', async () => {
        await p.getByRole('button', { name: 'Checkout' }).click(); await p.waitForURL(/\/checkout$/); await fill()
        await p.getByRole('list', { name: 'Offers for this bag' }).getByText('Festive').waitFor()
        await p.getByText(/No ₹50 online saving/).waitFor()
        await p.getByText('Pay on delivery', { exact: true }).click()
        await p.screenshot({ path: t.out('checkout'), fullPage: true })
        await p.getByRole('button', { name: new RegExp(`Place order · ${inr(cod).replace(/[₹,]/g, (m) => '\\' + m)}`) }).click()
        await p.waitForURL(/\/orders#t=/); await p.getByText(`Keep ${inr(cod)} ready`).waitFor()
        await p.locator('article dl').getByText('Festive', { exact: true }).waitFor() // the saving, named on the order page
        const o = await lastOrder()
        assert.equal(Number(o.discount), order); assert.equal(Number(o.total), cod)
        const ls = await db`select line_discount from order_lines where order_id = ${o.id}`
        assert.equal(ls.reduce((a, l) => a + Number(l.line_discount), 0), order, 'the lines carry the discount')
        assert.deepEqual((await db`select class, amount from order_discounts where order_id = ${o.id}`).map((r) => [r.class, Number(r.amount)]), [['order', order]])
        await c.goto(CONSOLE + `/console/orders/${o.number}`); await c.getByText('Offer · Festive').waitFor()
      })
      await t.step('online dismissed → switch to COD: told the saving goes, then it is gone from the order', async () => {
        await toBag(); await p.getByRole('button', { name: 'Checkout' }).click(); await p.waitForURL(/\/checkout$/); await fill()
        await p.evaluate(() => { window.__rzpMode = 'dismiss' })
        await p.getByText('Pay online', { exact: true }).click(); await p.getByText(`Saves ₹50`).waitFor()
        await p.getByRole('button', { name: /^Pay · / }).click(); await p.getByText(/Payment did not go through/).waitFor()
        let o = await lastOrder()
        assert.equal(Number(o.total), online); assert.equal(Number(o.discount), order + saving)
        await p.getByText('Pay on delivery', { exact: true }).click()
        await p.getByRole('button', { name: /Pay on delivery · / }).click()
        await p.waitForURL(/\/orders#t=/); await p.getByText(`Keep ${inr(cod)} ready`).waitFor()
        o = await until(async () => { const x = await lastOrder(); return x.switched_to_cod_at && x })
        assert.equal(Number(o.total), cod, 'the COD total: the order offer stays, the saving goes')
        assert.equal(Number(o.discount), order)
        assert.equal((await db`select count(*)::int n from order_discounts where order_id = ${o.id} and class = 'payment'`)[0].n, 1, 'the saving row stays (it applies again if the payment lands)')
      })
      await t.step('an unlisted code applies only when typed; a wrong code reads one way', async () => {
        const [d] = await db`insert into discounts (tenant_id, title, style, percent_bps, starts_at, started_at, started_by, created_by, listed)
          select tenant_id, 'Friends', 'order_off', 2000, now() - interval '1 minute', now(), created_by, created_by, false from discounts limit 1 returning id, tenant_id`
        await db`insert into discount_codes (tenant_id, discount_id, code) values (${d.tenant_id}, ${d.id}, 'FRIENDS20')`
        await toBag(); await p.getByRole('button', { name: 'Checkout' }).click(); await p.waitForURL(/\/checkout$/)
        assert.equal(await p.getByText('Friends', { exact: true }).count(), 0, 'an unlisted offer is not shown')
        await p.getByRole('button', { name: 'Have a code?' }).click()
        await p.fill('#offer-code', 'nope99'); await p.getByRole('button', { name: 'Apply' }).click()
        await p.getByText(/this code doesn’t work here/).waitFor()
        await p.getByRole('button', { name: 'Remove' }).click() // the field stays open for another try
        await p.fill('#offer-code', 'friends20'); await p.getByRole('button', { name: 'Apply' }).click()
        await p.getByText(/applied\./).waitFor(); await p.getByText('−₹498').first().waitFor()
        await p.screenshot({ path: t.out('checkout-code'), fullPage: true })
      })
      await ctx.close()
    } finally {
      // The flows after this one price the same products: no offer may outlive this flow.
      await db`update discounts set ended_at = now(), announce = false where ended_at is null`
      await db`update variants set stock = ${rustM} where option_values = '{M,Rust}'`
      await cc.close()
    }
  },
}
