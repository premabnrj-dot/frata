// =============================================================================
// FLOW: checkout (1C) — the regression net under every order change.
// Connect Razorpay; a COD order; an online order paid (and its webhook after
// the browser: no double, fee kept); a dismissed payment switched to COD and a
// late capture after it (paid wins, stock taken once, "Do not collect cash");
// a price change between looking and placing.
// =============================================================================
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { CONSOLE, FAKE_CHECKOUT, RZP, RZP_KEYS, SHOP, playwright, signedIn, until } from '../lib.mjs'
const { devices } = playwright

export default {
  name: 'checkout',
  async run(t) {
    const { db } = t
    const stock = async (vals) => (await db`select stock from variants where option_values = ${vals}::text[]`)[0].stock
    const lastOrder = async () => (await db`select * from orders order by placed_at desc limit 1`)[0]

    const cc = await signedIn(t.browser, 'owner')
    const c = await cc.newPage(); c.setDefaultTimeout(10_000); c.on('pageerror', (e) => t.errors.push(e.message))
    let hookUrl, hookSecret
    await t.step('wrong Razorpay keys are refused, nothing stored', async () => {
      await c.goto(CONSOLE + '/console/settings/online-payments')
      await c.fill('#key-id', RZP_KEYS.id); await c.fill('#key-secret', 'wrongsecret123456')
      await c.getByRole('button', { name: 'Test and connect' }).click()
      await c.getByText(/Razorpay did not accept these keys/).waitFor()
      assert.equal((await db`select count(*)::int n from payment_keys`)[0].n, 0)
    })
    await t.step('right keys connect, sealed', async () => {
      await c.fill('#key-secret', RZP_KEYS.secret); await c.getByRole('button', { name: 'Test and connect' }).click()
      await c.getByText('Connected. Razorpay accepted the keys.').waitFor()
      await c.locator('code', { hasText: '/api/webhooks/razorpay/' }).waitFor(); await c.locator('code', { hasText: 'whsec_' }).waitFor()
      const codes = await c.locator('code').allTextContents()
      hookUrl = codes.find((x) => x.includes('/api/webhooks/razorpay/')); hookSecret = codes.find((x) => x.startsWith('whsec_'))
      assert.ok(hookUrl && hookSecret, `webhook URL and secret shown: ${codes.join(' ')}`)
      const [k] = await db`select key_secret_enc from payment_keys`
      assert.match(k.key_secret_enc, /^v1\./); assert.ok(!k.key_secret_enc.includes(RZP_KEYS.secret))
      await c.screenshot({ path: t.out('payments'), fullPage: true })
    })
    const webhook = async (ev, sig) => {
      const body = JSON.stringify(ev)
      const r = await fetch(hookUrl.replace(/^https?:\/\/[^/]+/, CONSOLE), { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig ?? crypto.createHmac('sha256', hookSecret).update(body).digest('hex') }, body })
      return r.status
    }
    await t.step('first signed webhook seen; a forged one refused', async () => {
      assert.equal(await webhook({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_none1', order_id: 'order_none', status: 'failed', amount: 1 } } } }), 200)
      assert.equal(await webhook({ event: 'x' }, 'forged'), 401)
      await until(async () => (await db`select webhook_seen_at from payment_keys`)[0].webhook_seen_at)
    })
    await t.step('"last event" says the same on the server and in the browser (no hydration error)', async () => {
      // A browser clock 10 minutes ahead of the server: the page once read Date.now() in both places, so the
      // server said "just now", the browser "10 min ago", and React threw #418 (flaky at a minute boundary).
      const fc = await signedIn(t.browser, 'owner')
      const f = await fc.newPage(); const errs = []; f.on('pageerror', (e) => errs.push(e.message))
      await f.clock.install({ time: Date.now() + 10 * 60_000 })
      await f.goto(CONSOLE + '/console/settings/online-payments')
      await f.getByText('Working · last event just now').waitFor()
      await f.waitForLoadState('networkidle')
      assert.deepEqual(errs, [], `page errors: ${errs.join(' | ')}`)
      await fc.close()
    })

    const ctx = await t.browser.newContext({ ...devices['Pixel 7'] })
    await ctx.route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_CHECKOUT }))
    const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    const fill = async () => {
      await p.fill('#phone', '98290 43210'); await p.fill('#name', 'Ananya Sharma'); await p.fill('#pincode', '302001'); await p.fill('#city', 'Jaipur')
      await p.fill('#addressLine', 'B-14, Tilak Marg'); await p.fill('#area', 'C-Scheme'); await p.selectOption('#state', 'Rajasthan')
    }
    const toCheckout = async (colour, size) => {
      // Each checkout starts from an empty bag and no unpaid order left by an earlier step.
      await p.goto(SHOP + '/products/chanderi-kurta-set', { waitUntil: 'domcontentloaded' })
      await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() }); await p.reload({ waitUntil: 'domcontentloaded' })
      await p.getByRole('button', { name: new RegExp('^' + colour) }).click(); await p.getByRole('button', { name: size, exact: true }).click()
      await p.getByRole('button', { name: /Add to bag|Pre-order/ }).click(); await p.getByRole('dialog', { name: 'Your bag' }).waitFor()
      await p.getByRole('button', { name: 'Checkout' }).click(); await p.waitForURL(/\/checkout$/); await fill()
    }

    await t.step('COD order: placed, stock taken, cost snapshotted, address masked', async () => {
      const before = await stock('{M,Rust}')
      await toCheckout('Rust', 'M'); await p.getByText('Pay on delivery', { exact: true }).click()
      await p.screenshot({ path: t.out('checkout'), fullPage: true })
      await p.getByRole('button', { name: /Place order · ₹2,539/ }).click(); await p.waitForURL(/\/orders#t=/); await p.getByText('Keep ₹2,539 ready').waitFor()
      await p.screenshot({ path: t.out('order-cod'), fullPage: true })
      assert.equal(await stock('{M,Rust}'), before - 1)
      const o = await lastOrder()
      assert.equal(o.payment_method, 'cod'); assert.equal(Number(o.total), 253900)
      const ls = await db`select stock_taken_at, charge_taxable, charge_gst from order_lines where order_id = ${o.id}`
      assert.ok(ls.every((l) => l.stock_taken_at), 'each line stamped when its stock was taken')
      assert.equal(ls.reduce((a, l) => a + Number(l.charge_taxable) + Number(l.charge_gst), 0), Number(o.shipping) + Number(o.cod_charge), 'charge shares add up')
      assert.equal(o.area, 'C-Scheme'); assert.equal(o.address_line, 'B-14, Tilak Marg'); assert.ok(o.seller_gstin !== undefined)
      const [line] = await db`select l.unit_cost, v.unit_cost as now_cost from order_lines l join variants v on v.id = l.variant_id where l.order_id = ${o.id}`
      assert.equal(line.unit_cost, line.now_cost, 'cost snapshotted from the variant'); assert.ok(line.unit_cost !== null)
      const text = (await p.textContent('article')).replace(/\s/g, '')
      assert.ok(!text.includes('Tilak') && !text.includes('9829043210'), 'address and phone masked')
    })

    await t.step('online order: paid, stock taken once, the webhook after the browser changes nothing but the fee', async () => {
      const before = await stock('{S,Rust}')
      await toCheckout('Rust', 'S'); await p.getByText('Pay online', { exact: true }).click()
      await p.getByRole('button', { name: /^Pay · ₹2,490/ }).click(); await p.waitForURL(/\/orders#t=/); await p.getByText(/Paid · being packed/).waitFor()
      assert.equal(await stock('{S,Rust}'), before - 1)
      const rzpOrder = (await (await fetch(RZP + '/_test/orders')).json()).at(-1)
      const auth = 'Basic ' + Buffer.from(`${RZP_KEYS.id}:${RZP_KEYS.secret}`).toString('base64')
      const [pay] = (await (await fetch(`${RZP}/v1/orders/${rzpOrder.id}/payments`, { headers: { authorization: auth } })).json()).items
      assert.ok(pay?.id, 'the fake recorded the payment')
      assert.equal(await webhook({ event: 'payment.captured', payload: { payment: { entity: pay } } }), 200)
      const paid = await lastOrder(); const orders = (await db`select count(*)::int n from orders`)[0].n
      const done = await until(async () => { const x = await lastOrder(); return x.gateway_fee !== null && x })
      assert.equal(Number(done.gateway_fee), pay.fee, 'Razorpay fee kept')
      assert.equal(done.paid_at.getTime(), paid.paid_at.getTime(), 'paid once')
      assert.equal((await db`select count(*)::int n from orders`)[0].n, orders, 'no second order')
      assert.equal(await stock('{S,Rust}'), before - 1, 'stock taken once')
    })

    await t.step('dismissed payment → switch to COD → late capture: paid wins, stock once, "Do not collect cash"', async () => {
      const before = await stock('{M,Rust}')
      await toCheckout('Rust', 'M'); await p.evaluate(() => { window.__rzpMode = 'dismiss' })
      await p.getByText('Pay online', { exact: true }).click(); await p.getByRole('button', { name: /^Pay · / }).click()
      await p.getByText(/Payment did not go through/).waitFor()
      await p.getByText('Pay on delivery', { exact: true }).click(); await p.getByRole('button', { name: /Pay on delivery · ₹2,539/ }).click()
      await p.waitForURL(/\/orders#t=/); await p.getByText('Keep ₹2,539 ready').waitFor()
      let o = await lastOrder(); assert.ok(o.switched_to_cod_at); assert.equal(await stock('{M,Rust}'), before - 1)
      const pay = await (await fetch(RZP + '/_test/pay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order_id: o.razorpay_order_id }) })).json()
      assert.equal(await webhook({ event: 'payment.captured', payload: { payment: { entity: pay.payment } } }), 200)
      o = await until(async () => { const x = await lastOrder(); return x.paid_at && x })
      assert.equal(await stock('{M,Rust}'), before - 1, 'stock taken once')
      assert.equal(Number(o.cod_charge), 0, 'the COD fee comes off: the shopper paid the online total')
      assert.equal(Number(o.total), 249000)
      const shares = await db`select sum(charge_taxable + charge_gst)::int s from order_lines where order_id = ${o.id}`
      assert.equal(shares[0].s, Number(o.shipping), 'shares now cover delivery only')
      await p.reload(); await p.getByText('Paid online').waitFor()
      assert.equal(await p.getByText(/Keep ₹/).count(), 0, 'the shopper is not told to keep cash ready')
      await c.goto(CONSOLE + '/console/orders?tab=all')
      await c.getByRole("row").filter({ hasText: `-${o.number}` }).getByText('Do not collect cash').waitFor()
      await c.screenshot({ path: t.out('console-orders'), fullPage: true })
    })

    await t.step('paid after its stock sold out: refund due for the merchant, "the shop confirms" for the shopper', async () => {
      // An in-stock piece (Indigo S is a pre-order: no in-stock line to run short).
      await toCheckout('Indigo', 'M'); await p.getByText('Pay online', { exact: true }).click()
      await p.evaluate(() => { window.__rzpMode = 'dismiss' }); await p.getByRole('button', { name: /^Pay · / }).click()
      await p.getByText(/Payment did not go through/).waitFor()
      const o = await lastOrder()
      // The hold lapses and the last piece goes to someone else; then the payment lands.
      await db`update orders set pay_by = now() - interval '1 minute' where id = ${o.id}`
      const token = await p.evaluate(() => Object.entries(sessionStorage).find(([k]) => /pending/i.test(k))?.[1])
      assert.ok(token, 'the checkout keeps the unpaid order\'s link token')
      const was = await stock('{M,Indigo}'); await db`update variants set stock = 0 where option_values = '{M,Indigo}'`
      try {
        const pay = await (await fetch(RZP + '/_test/pay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order_id: o.razorpay_order_id }) })).json()
        assert.equal(await webhook({ event: 'payment.captured', payload: { payment: { entity: pay.payment } } }), 200)
        await until(async () => (await lastOrder()).paid_at)
        const [l] = await db`select stock_taken_at from order_lines where order_id = ${o.id}`
        assert.equal(l.stock_taken_at, null, 'no stock was taken that was not there')
        assert.equal(await stock('{M,Indigo}'), 0)
        await c.goto(CONSOLE + '/console/orders'); await c.getByRole('row').filter({ hasText: `-${o.number}` }).getByText('Refund due').waitFor()
        await p.goto(SHOP + '/orders#t=' + token); await p.getByText('Placed · the shop confirms it soon').waitFor()
        assert.equal(await p.getByText(/refund|held/i).count(), 0, 'the shopper sees no internal word')
      } finally { await db`update variants set stock = ${was} where option_values = '{M,Indigo}'` }
    })

    await t.step('price changed between looking and placing: told, nothing placed', async () => {
      const n = (await db`select count(*)::int n from orders`)[0].n
      await toCheckout('Indigo', 'M'); await p.getByText('Pay on delivery', { exact: true }).click()
      await db`update variants set price = 259000 where option_values = '{M,Indigo}'`
      try {
        await p.getByRole('button', { name: /Place order/ }).click(); await p.getByText(/Something changed since you looked/).waitFor()
        assert.equal((await db`select count(*)::int n from orders`)[0].n, n)
      } finally { await db`update variants set price = 249000 where option_values = '{M,Indigo}'` }
    })
    await cc.close(); await ctx.close()
  },
}
