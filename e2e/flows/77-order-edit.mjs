// =============================================================================
// FLOW: order edit OE·1 (docs/plans/2026-11-12-order-edit.md § Tasks 5; mockup views COD and Saved) — on a pay-on-delivery
// order to confirm: "Edit items" opens the editor in place; a size swapped by its chip and a line removed with a reason;
// "What changes" says each change and what the courier collects, priced in the browser; Save names the order, the toast
// says what to collect and the database agrees (lines taken out, never rewritten; stock per line; the edit's record; the
// email held for the Undo window); the Items card says "Was M", Activity says what changed; Undo puts it all back. Then
// the states the mockup didn't draw: over the COD maximum (refused with the limit, Save waits), a line whose product was
// deleted (remove only), staff (no button), and the phone (stacked, Save fixed above the bottom bar).
// OE·2 (paid online; mockup view Paid online): a lower total says "Refund ₹X" and saves as "Save and refund ₹X"; the
// refund waits out the Undo window, then goes to Razorpay at normal speed with the attempt as receipt and idempotency
// key, and the edit has no Undo after it; the shopper's page says the refund is on its way. A higher total saves as
// "Save and ask for ₹X": nothing on the order changes, "Mark packed" gives way to "Waiting for ₹X from the shopper", the
// shopper pays the difference on our order page (Razorpay Checkout, a second order) and the change applies; "Ship
// without the change" drops a request and the order packs as it was.
// Seeds its own orders (and the shop's Razorpay keys when no earlier flow connected them) and puts every stock figure back.
// =============================================================================
import assert from 'node:assert/strict'
import { createCipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto'
import { CONSOLE, FAKE_CHECKOUT, RZP, RZP_KEYS, SHOP, expectToast, signedIn, todayAgo, until, USERS } from '../lib.mjs'

// The stack's PAYMENT_KEYS_SECRET (e2e/stack.mjs): an order's own link token (secret-box.ts orderToken) and the shop's
// sealed key secret (seal), made here the way the app makes them.
const STACK_SECRET = 'e2e-only-secret'
const derived = (info) => Buffer.from(hkdfSync('sha256', STACK_SECRET, 'frata', info, 32))
const orderToken = (id) => createHmac('sha256', derived('order-links v1')).update(id).digest().subarray(0, 16).toString('base64url')
const seal = (plain, tenantId, field) => {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', derived('payment-keys v1'), iv)
  c.setAAD(Buffer.from(`${tenantId}|${field}|v1`))
  return `v1.${iv.toString('base64url')}.${Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()]).toString('base64url')}`
}
const RZP_AUTH = 'Basic ' + Buffer.from(`${RZP_KEYS.id}:${RZP_KEYS.secret}`).toString('base64')

export default {
  name: 'order-edit',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ prefix }] = await db`select order_prefix as prefix from shop_settings where tenant_id = ${T}`
    const [{ codMax }] = await db`select cod_max::bigint as "codMax" from shop_settings where tenant_id = ${T}`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const label = (n) => `${prefix || 'KS'}-${n}`
    const vs = await db`select id, product_id, option_values, stock from variants where tenant_id = ${T} and option_values in ('{M,Rust}', '{S,Rust}', '{M,Indigo}') order by option_values`
    const v = Object.fromEntries(vs.map((x) => [x.option_values.join(','), x]))
    const stockBefore = Object.fromEntries(vs.map((x) => [x.id, x.stock]))
    await db`update variants set stock = 5 where id in ${db(vs.map((x) => x.id))}`
    const stock = async (key) => (await db`select stock from variants where id = ${v[key].id}`)[0].stock
    const E = top + 1, F = top + 2, G = top + 3 // E: to edit; F: a line whose product was deleted; G: paid online
    await db`insert into orders (tenant_id, number, payment_method, placed_at, customer_name, phone, email, address_line, area, city, pincode, state, subtotal, total, merchandise_net) values
      (${T}, ${E}, 'cod', ${todayAgo(20)}, 'Page Ananya', '9822200011', 'ananya@example.com', 'B-14, Tilak Marg', 'C-Scheme', 'Jaipur', '302001', 'Rajasthan', 498000, 498000, 498000),
      (${T}, ${F}, 'cod', ${todayAgo(15)}, 'Page Dev', '9822200012', null, 'Flat 22, Shanti Nagar', 'Vaishali', 'Jaipur', '302021', 'Rajasthan', 349000, 349000, 349000)`
    await db`insert into orders (tenant_id, number, payment_method, placed_at, paid_at, customer_name, phone, address_line, city, pincode, state, subtotal, total)
      values (${T}, ${G}, 'prepaid', ${todayAgo(12)}, ${todayAgo(11)}, 'Page Paid', '9822200013', 'Flat 9, MI Road', 'Jaipur', '302001', 'Rajasthan', 249000, 249000)`
    const id = async (n) => (await db`select id from orders where tenant_id = ${T} and number = ${n}`)[0].id
    const [e, f, g] = [await id(E), await id(F), await id(G)]
    const line = (o, key, position) => db`insert into order_lines (tenant_id, order_id, variant_id, product_id, title, option_values, qty, unit_price, taxable_value, kind, position, stock_taken_at, charge_taxable, charge_gst)
      values (${T}, ${o}, ${v[key].id}, ${v[key].product_id}, 'Chanderi kurta set', ${v[key].option_values}, 1, 249000, 249000, 'in_stock', ${position}, now(), 0, 0)`
    await line(e, 'M,Rust', 0); await line(e, 'M,Indigo', 1); await line(f, 'M,Rust', 0); await line(g, 'M,Rust', 0)
    await db`update variants set stock = stock - 1 where id = ${v['M,Indigo'].id}`
    await db`update variants set stock = stock - 3 where id = ${v['M,Rust'].id}`
    // F's second line: a piece whose product was deleted (the line keeps what was sold; its variant is gone).
    await db`insert into order_lines (tenant_id, order_id, variant_id, product_id, title, option_values, qty, unit_price, taxable_value, kind, position, charge_taxable, charge_gst)
      values (${T}, ${f}, null, null, 'Old bandhani stole', '{Red}', 1, 100000, 100000, 'in_stock', 1, 0, 0)`
    await db`insert into members (tenant_id, user_id, role) values (${T}, ${USERS.staff.id}, 'staff') on conflict do nothing`
    const live = async (o) => db`select variant_id, qty, removed_at, replaced_by, stock_taken_at from order_lines where tenant_id = ${T} and order_id = ${o} and removed_at is null order by position`
    const total = async (o) => Number((await db`select total from orders where id = ${o}`)[0].total)

    let addedKeys = false
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (x) => t.errors.push(x.message))
    const toast = (text) => p.locator('[data-toast]', { hasText: text }).waitFor()
    try {
      await t.step('Edit items opens the editor in place: each line\'s sizes as chips, the one sold dashed', async () => {
        await p.goto(CONSOLE + `/console/orders/${E}`)
        await p.getByRole('region', { name: 'Items' }).getByRole('button', { name: 'Edit items' }).click()
        const ed = p.getByRole('region', { name: 'Edit items' }); await ed.waitFor()
        await ed.getByRole('button', { name: /^S · Rust/ }).first().waitFor()
        await p.getByRole('region', { name: 'What changes' }).getByRole('button', { name: `Save ${label(E)}` }).waitFor()
      })

      await t.step('swap M → S and remove a line with its reason: What changes says so and what to collect', async () => {
        const ed = p.getByRole('region', { name: 'Edit items' })
        await ed.getByRole('group').first().getByRole('button', { name: /^S · Rust/ }).click()
        await ed.getByRole('button', { name: 'Remove' }).nth(1).click()
        await ed.getByRole('group', { name: /comes out/ }).getByRole('button', { name: 'Out of stock' }).click()
        await ed.getByText('Removed · out of stock').waitFor()
        const wc = p.getByRole('region', { name: 'What changes' })
        await wc.getByText('M → S').waitFor()
        await wc.getByText('Removed · back in stock').waitFor()
        await wc.getByText('₹2,490').first().waitFor()
        assert.ok(await wc.getByLabel(/Email Page the new total/).isChecked())
        await p.screenshot({ path: t.out('editing'), fullPage: true })
      })

      await t.step('Save: the toast says what to collect; lines taken out and replaced, stock per line, the record and the held email', async () => {
        await p.getByRole('button', { name: `Save ${label(E)}` }).click()
        await toast(`${label(E)} saved · collect ₹2,490`)
        await until(async () => (await total(e)) === 249000)
        const ls = await live(e)
        assert.deepEqual(ls.map((l) => [l.variant_id, l.qty]), [[v['S,Rust'].id, 1]])
        assert.ok(ls[0].stock_taken_at, 'the new piece left the shelf')
        const out = await db`select variant_id, replaced_by from order_lines where order_id = ${e} and removed_at is not null order by position`
        assert.equal(out.length, 2); assert.ok(out[0].replaced_by, 'the swapped line names what it became'); assert.equal(out[1].replaced_by, null)
        assert.deepEqual([await stock('M,Rust'), await stock('S,Rust'), await stock('M,Indigo')], [3, 4, 5])
        const [edit] = await db`select total_before, total_after, notify from order_edits where order_id = ${e}`
        assert.deepEqual([Number(edit.total_before), Number(edit.total_after), edit.notify], [498000, 249000, true])
        const [mail] = await db`select next_attempt_at from outbox where tenant_id = ${T} and kind = 'email.order' and dedupe_key like 'email:edited:%' and payload->>'orderId' = ${e}`
        assert.ok(mail && new Date(mail.next_attempt_at).getTime() - Date.now() > 8 * 60_000, 'the email waits out the Undo window')
      })

      await t.step('the Items card says "Was M"; Activity says what changed, the totals, and that the email waits', async () => {
        await p.getByRole('region', { name: 'Items' }).getByText('Was M').waitFor()
        await p.getByRole('region', { name: 'Activity' }).getByText(/Items changed · Chanderi kurta set M → S, Chanderi kurta set removed · ₹4,980 → ₹2,490 · email waiting/).waitFor()
        await p.screenshot({ path: t.out('saved'), fullPage: true })
      })

      await t.step('Undo the change: lines, stock and money as they were', async () => {
        await p.getByRole('region', { name: 'Items' }).getByRole('button', { name: 'Undo the change' }).click()
        await toast(`${label(E)}: change undone.`)
        await until(async () => (await total(e)) === 498000)
        assert.deepEqual((await live(e)).map((l) => l.variant_id), [v['M,Rust'].id, v['M,Indigo'].id])
        assert.deepEqual([await stock('M,Rust'), await stock('S,Rust'), await stock('M,Indigo')], [2, 5, 4])
        await p.getByRole('region', { name: 'Activity' }).getByText('Undid the items change').waitFor()
        assert.equal(await p.getByRole('button', { name: 'Undo the change' }).count(), 0)
      })

      await t.step('over the COD maximum: refused with the limit, and Save waits', async () => {
        await db`update shop_settings set cod_max = 600000 where tenant_id = ${T}`
        await p.reload()
        await p.getByRole('region', { name: 'Items' }).getByRole('button', { name: 'Edit items' }).click()
        const ed = p.getByRole('region', { name: 'Edit items' }); await ed.waitFor()
        await ed.getByRole('button', { name: 'One more' }).first().click()
        const wc = p.getByRole('region', { name: 'What changes' })
        await wc.getByRole('alert').filter({ hasText: 'Pay on delivery is for orders up to ₹6,000.' }).waitFor()
        assert.ok(await wc.getByRole('button', { name: `Save ${label(E)}` }).isDisabled())
        await wc.getByRole('button', { name: 'Keep the order as it was' }).click()
        await p.getByRole('region', { name: 'Items' }).getByRole('button', { name: 'Edit items' }).waitFor()
        await db`update shop_settings set cod_max = ${codMax} where tenant_id = ${T}`
        assert.equal(await total(e), 498000)
      })

      await t.step('a line whose product was deleted can only come out', async () => {
        await p.goto(CONSOLE + `/console/orders/${F}`)
        await p.getByRole('region', { name: 'Items' }).getByRole('button', { name: 'Edit items' }).click()
        const ed = p.getByRole('region', { name: 'Edit items' }); await ed.waitFor()
        const old = ed.getByRole('listitem').filter({ hasText: 'Old bandhani stole' })
        await old.getByText('No longer sold').waitFor()
        assert.equal(await old.getByRole('button', { name: 'One more' }).count(), 0)
        assert.equal(await old.getByRole('button', { name: 'Remove' }).count(), 1)
        // No email on this order: no tick.
        assert.equal(await p.getByLabel(/the new total/).count(), 0)
      })

      await t.step('staff: no Edit items (a paid order has it now, OE·2)', async () => {
        await p.goto(CONSOLE + `/console/orders/${G}`); await p.getByRole('heading', { name: label(G) }).waitFor()
        await p.getByRole('region', { name: 'Items' }).getByRole('button', { name: 'Edit items' }).waitFor()
        const staff = await signedIn(t.browser, 'staff'); const q = await staff.newPage()
        await q.goto(CONSOLE + `/console/orders/${E}`); await q.getByRole('heading', { name: label(E) }).waitFor()
        assert.equal(await q.getByRole('button', { name: 'Edit items' }).count(), 0)
        await staff.close()
      })

      // ── OE·2: paid online ──
      // The shop's keys (flow 10 connects them; on their own this flow seals the same ones) and an order paid through
      // the fake Razorpay: a Razorpay order, a captured payment, the online total it asked.
      const [had] = await db`select tenant_id from payment_keys where tenant_id = ${T}`
      if (!had) await db`insert into payment_keys (tenant_id, key_id, key_secret_enc, webhook_secret_enc, webhook_key, mode) values
        (${T}, ${RZP_KEYS.id}, ${seal(RZP_KEYS.secret, T, 'key_secret')}, ${seal('whsec_e2e77', T, 'webhook_secret')}, ${'k_e2e77' + Date.now()}, 'live')`
      addedKeys = !had
      const paidOnline = async (n, lines, minutesAgo) => {
        const amount = lines.reduce((a, l) => a + 249000 * l.qty, 0)
        const ro = await (await fetch(`${RZP}/v1/orders`, { method: 'POST', headers: { authorization: RZP_AUTH, 'content-type': 'application/json' }, body: JSON.stringify({ amount, currency: 'INR', receipt: `e2e77-${n}` }) })).json()
        const { payment } = await (await fetch(`${RZP}/_test/pay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order_id: ro.id }) })).json()
        await db`insert into orders (tenant_id, number, payment_method, placed_at, paid_at, customer_name, phone, email, address_line, city, pincode, state, subtotal, total, merchandise_net, checkout, razorpay_order_id, razorpay_payment_id)
          values (${T}, ${n}, 'prepaid', ${todayAgo(minutesAgo)}, ${todayAgo(minutesAgo - 1)}, 'Page Meera', '9822200014', 'meera@example.com', 'Flat 3, Civil Lines', 'Jaipur', '302006', 'Rajasthan',
            ${amount}, ${amount}, ${amount}, ${db.json({ onlineTotal: amount })}, ${ro.id}, ${payment.id})`
        const o = await id(n)
        await db`update orders set token_hash = ${createHash('sha256').update(orderToken(o)).digest('hex')} where id = ${o}`
        for (const [i, l] of lines.entries()) {
          await db`insert into order_lines (tenant_id, order_id, variant_id, product_id, title, option_values, qty, unit_price, taxable_value, kind, position, stock_taken_at, charge_taxable, charge_gst)
            values (${T}, ${o}, ${v[l.key].id}, ${v[l.key].product_id}, 'Chanderi kurta set', ${v[l.key].option_values}, ${l.qty}, 249000, ${249000 * l.qty}, 'in_stock', ${i}, now(), 0, 0)`
          await db`update variants set stock = stock - ${l.qty} where id = ${v[l.key].id}`
        }
        return { id: o, payment }
      }
      const drain = () => fetch(`${CONSOLE}/api/cron/drain`, { headers: { authorization: 'Bearer e2e-cron' } })
      let H, J, K

      await t.step('paid online, lower: "Refund ₹2,490" with its timing, and "Save and refund ₹2,490"', async () => {
        H = await paidOnline(top + 4, [{ key: 'M,Rust', qty: 1 }, { key: 'M,Indigo', qty: 1 }], 30)
        await p.goto(CONSOLE + `/console/orders/${top + 4}`)
        await p.getByRole('region', { name: 'Items' }).getByRole('button', { name: 'Edit items' }).click()
        const ed = p.getByRole('region', { name: 'Edit items' }); await ed.waitFor()
        await ed.getByRole('button', { name: 'Remove' }).nth(1).click()
        await ed.getByRole('group', { name: /comes out/ }).getByRole('button', { name: 'Customer asked' }).click()
        const wc = p.getByRole('region', { name: 'What changes' })
        await wc.getByText('Paid online').waitFor()
        await wc.locator('[data-settle="refund"]').filter({ hasText: 'Refund ₹2,490' }).filter({ hasText: 'its fee isn’t returned' }).waitFor()
        assert.ok(await wc.getByLabel(/Email Page the refund/).isChecked())
        await wc.getByRole('button', { name: 'Save and refund ₹2,490' }).waitFor()
        await p.screenshot({ path: t.out('paid-lower'), fullPage: true })
      })

      await t.step('saved: applied at once, the refund waits out the Undo window, then goes at normal speed; no Undo after it', async () => {
        await p.getByRole('button', { name: 'Save and refund ₹2,490' }).click()
        await toast(`${label(top + 4)} saved · refund ₹2,490 in 10 minutes`)
        await until(async () => (await total(H.id)) === 249000)
        const [r] = await db`select id, amount, not_before, sending_at from order_refunds where order_id = ${H.id}`
        assert.equal(Number(r.amount), 249000); assert.equal(r.sending_at, null)
        assert.ok(new Date(r.not_before).getTime() - Date.now() > 8 * 60_000, 'the refund waits for the Undo window')
        await p.locator('[data-refunds]').getByText(/refund · sends/).waitFor()
        // The window passes: the drain sends it.
        await db`update order_refunds set not_before = now() where id = ${r.id}`
        await db`update outbox set next_attempt_at = now() where tenant_id = ${T} and dedupe_key = ${'refund.send:' + r.id}`
        await drain()
        await until(async () => (await db`select sent_at from order_refunds where id = ${r.id}`)[0].sent_at)
        const sent = (await (await fetch(RZP + '/_test/refunds')).json()).find((x) => x.receipt === r.id)
        assert.ok(sent, 'Razorpay got the refund')
        assert.deepEqual([sent.amount, sent.speed_requested, sent.idempotency_key, sent.payment_id], [249000, 'normal', r.id, H.payment.id])
        await p.reload()
        await p.locator('[data-refunds]').getByText(/refunded · 5–10 working days/).waitFor()
        await p.getByRole('region', { name: 'Items' }).getByRole('button', { name: 'Undo the change' }).click()
        await expectToast(p, 'The refund has gone to Razorpay: this change can\'t be undone.')
        assert.equal(await total(H.id), 249000)
        // The shopper's page: the refund is on its way.
        const s = await t.browser.newContext(); const q = await s.newPage()
        await q.goto(SHOP + `/orders#t=${orderToken(H.id)}`); await q.getByText('Refund on its way · 5–10 working days').waitFor()
        await s.close()
      })

      await t.step('paid online, higher: "Save and ask for ₹2,490"; nothing changes, Mark packed waits, the shopper pays on our page, it applies', async () => {
        J = await paidOnline(top + 5, [{ key: 'M,Indigo', qty: 1 }], 25)
        await p.goto(CONSOLE + `/console/orders/${top + 5}`)
        await p.getByRole('button', { name: 'Mark packed' }).first().waitFor()
        await p.getByRole('region', { name: 'Items' }).getByRole('button', { name: 'Edit items' }).click()
        const ed = p.getByRole('region', { name: 'Edit items' }); await ed.waitFor()
        await ed.getByRole('button', { name: 'One more' }).first().click()
        const wc = p.getByRole('region', { name: 'What changes' })
        await wc.locator('[data-settle="ask"]').filter({ hasText: 'Ask for ₹2,490' }).waitFor()
        await wc.getByRole('button', { name: 'Save and ask for ₹2,490' }).click()
        await toast(`${label(top + 5)}: waiting for ₹2,490 from the shopper`)
        await p.locator('[data-waiting]').first().filter({ hasText: 'Waiting for ₹2,490 from the shopper' }).waitFor()
        assert.equal(await p.getByRole('button', { name: 'Mark packed' }).count(), 0)
        const box = p.locator('[data-waiting-change]')
        await box.getByRole('button', { name: 'Copy payment link' }).waitFor(); await box.getByRole('button', { name: 'Ship without the change' }).waitFor()
        assert.equal(await total(J.id), 249000)
        const [w] = await db`select asked, paid_at from order_edits where order_id = ${J.id}`
        assert.deepEqual([Number(w.asked), w.paid_at], [249000, null])
        assert.equal((await db`select sum(held)::int n from order_edit_lines l join order_edits e on e.id = l.edit_id where e.order_id = ${J.id}`)[0].n, 1, 'the new piece is held')
        await p.screenshot({ path: t.out('paid-waiting'), fullPage: true })
        // The shopper, on the order page the payment link opens: what changed, the new total, and Pay.
        const s = await t.browser.newContext()
        await s.route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_CHECKOUT }))
        const q = await s.newPage(); q.on('pageerror', (x) => t.errors.push(x.message))
        await q.goto(SHOP + `/orders#t=${orderToken(J.id)}`)
        const change = q.getByRole('region', { name: 'Pay ₹2,490 for the changes' }); await change.waitFor()
        await change.getByText('Chanderi kurta set: 1 → 2').waitFor()
        await q.screenshot({ path: t.out('shopper-pay'), fullPage: true })
        await change.getByRole('button', { name: 'Pay ₹2,490' }).click()
        await until(async () => (await db`select paid_at from order_edits where order_id = ${J.id}`)[0].paid_at, 10_000)
        await until(async () => (await total(J.id)) === 498000)
        assert.deepEqual((await live(J.id)).map((l) => l.qty), [2])
        assert.equal((await db`select count(*)::int n from orders where tenant_id = ${T} and number = ${top + 5}`)[0].n, 1)
        await q.getByText('× 2').first().waitFor()
        await s.close()
        await p.reload()
        await p.getByRole('button', { name: 'Mark packed' }).first().waitFor()
        await p.getByRole('region', { name: 'Activity' }).getByText('Paid ₹2,490 for the change · items changed').waitFor()
      })

      await t.step('Ship without the change: the request is dropped and the order packs as it was', async () => {
        K = await paidOnline(top + 6, [{ key: 'M,Indigo', qty: 1 }], 20)
        await p.goto(CONSOLE + `/console/orders/${top + 6}`)
        await p.getByRole('region', { name: 'Items' }).getByRole('button', { name: 'Edit items' }).click()
        await p.getByRole('region', { name: 'Edit items' }).getByRole('button', { name: 'One more' }).first().click()
        await p.getByRole('button', { name: 'Save and ask for ₹2,490' }).click()
        await toast(`${label(top + 6)}: waiting for ₹2,490 from the shopper`)
        await p.locator('[data-waiting-change]').getByRole('button', { name: 'Ship without the change' }).click()
        await toast('The change is dropped. Pack it as it was.')
        await p.getByRole('button', { name: 'Mark packed' }).first().waitFor()
        const [w] = await db`select dropped_reason from order_edits where order_id = ${K.id}`
        assert.equal(w.dropped_reason, 'ship_without')
        assert.deepEqual((await live(K.id)).map((l) => l.qty), [1])
      })

      await t.step('phone: stacked, Save fixed above the bottom bar, nothing scrolls sideways', async () => {
        await p.setViewportSize({ width: 390, height: 844 })
        await p.goto(CONSOLE + `/console/orders/${E}`)
        await p.getByRole('region', { name: 'Items' }).getByRole('button', { name: 'Edit items' }).click()
        await p.getByRole('region', { name: 'Edit items' }).waitFor()
        await p.locator('.fixed', { has: p.getByRole('button', { name: `Save ${label(E)}` }) }).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390))
        await p.screenshot({ path: t.out('phone'), fullPage: true })
      })
    } catch (err) {
      await p.screenshot({ path: t.out('FAILED'), fullPage: true }).catch(() => {})
      throw err
    } finally {
      await owner.close()
      await db`update shop_settings set cod_max = ${codMax} where tenant_id = ${T}`
      await db`delete from members where tenant_id = ${T} and user_id = ${USERS.staff.id}`
      await db`delete from orders where tenant_id = ${T} and number between ${E} and ${top + 6}`
      if (addedKeys) await db`delete from payment_keys where tenant_id = ${T}`
      for (const [vid, s] of Object.entries(stockBefore)) await db`update variants set stock = ${s} where id = ${vid}`
    }
  },
}
