// =============================================================================
// FLOW: order edit OE·1 (docs/plans/2026-11-12-order-edit.md § Tasks 5; mockup views COD and Saved) — on a pay-on-delivery
// order to confirm: "Edit items" opens the editor in place; a size swapped by its chip and a line removed with a reason;
// "What changes" says each change and what the courier collects, priced in the browser; Save names the order, the toast
// says what to collect and the database agrees (lines taken out, never rewritten; stock per line; the edit's record; the
// email held for the Undo window); the Items card says "Was M", Activity says what changed; Undo puts it all back. Then
// the states the mockup didn't draw: over the COD maximum (refused with the limit, Save waits), a line whose product was
// deleted (remove only), staff and a paid order (no button), and the phone (stacked, Save fixed above the bottom bar).
// Seeds its own orders and puts every stock figure back at the end.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn, todayAgo, until, USERS } from '../lib.mjs'

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

      await t.step('the Items card says "Was M"; Activity says what changed and the totals', async () => {
        await p.getByRole('region', { name: 'Items' }).getByText('Was M').waitFor()
        await p.getByRole('region', { name: 'Activity' }).getByText(/Items changed · Chanderi kurta set M → S, Chanderi kurta set removed · ₹4,980 → ₹2,490 · emailed/).waitFor()
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

      await t.step('paid online: no Edit items; staff: no Edit items', async () => {
        await p.goto(CONSOLE + `/console/orders/${G}`); await p.getByRole('heading', { name: label(G) }).waitFor()
        assert.equal(await p.getByRole('button', { name: 'Edit items' }).count(), 0)
        const staff = await signedIn(t.browser, 'staff'); const q = await staff.newPage()
        await q.goto(CONSOLE + `/console/orders/${E}`); await q.getByRole('heading', { name: label(E) }).waitFor()
        assert.equal(await q.getByRole('button', { name: 'Edit items' }).count(), 0)
        await staff.close()
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
      await db`delete from orders where tenant_id = ${T} and number between ${E} and ${G}`
      for (const [vid, s] of Object.entries(stockBefore)) await db`update variants set stock = ${s} where id = ${vid}`
    }
  },
}
