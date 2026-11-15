// =============================================================================
// FLOW: neel-offer (Neel N2b·2) — the new-offer form as drawn: What kind as cards, The offer, What shoppers see at the
// side (the bar and the bag follow the form), What it costs you only for whoever sees costs, the phone, axe. Saves
// nothing.
// =============================================================================
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { CONSOLE, signedIn, USERS } from '../lib.mjs'

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  return p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
}

export default {
  name: 'neel-offer',
  async run(t) {
    const { db } = t
    // A best seller whose cost is known: one delivered order of the store's cheapest costed size (its own price and cost).
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [v] = await db`select v.id, v.product_id, v.price, v.unit_cost from variants v where v.tenant_id = ${T} and v.archived_at is null and v.price > 0 and v.unit_cost is not null order by v.price, v.id limit 1`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const ago = (h) => new Date(Date.now() - h * 3_600_000)
    const [o] = await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, packed_at, shipped_at, delivered_at, pincode, customer_name, subtotal, total, merchandise_net, cogs, invoice_number)
      values (${T}, ${top + 1}, 'prepaid', ${ago(72)}, ${ago(71)}, ${ago(70)}, ${ago(60)}, ${ago(20)}, '452018', 'Offer Shopper', ${v.price}, ${v.price}, ${v.price}, ${v.unit_cost}, ${'OFFER-' + (top + 1)}) returning id`
    await db`insert into order_lines (tenant_id, order_id, variant_id, product_id, title, qty, unit_price, taxable_value, unit_cost, kind, stock_taken_at)
      values (${T}, ${o.id}, ${v.id}, ${v.product_id}, 'Best seller', 1, ${v.price}, ${v.price}, ${v.unit_cost}, 'in_stock', ${ago(72)})`
    await db`insert into members (tenant_id, user_id, role) values (${T}, ${USERS.staff.id}, 'staff') on conflict do nothing`
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('the form as drawn; the preview follows what is typed', async () => {
        await p.goto(`${CONSOLE}/console/offers/new`)
        await p.getByRole('heading', { name: 'What kind' }).waitFor()
        await p.getByRole('heading', { name: 'The offer' }).waitFor()
        const see = p.getByRole('region', { name: 'Preview' })
        await see.getByText('The bar at the top of the store').count()
        await p.locator('#o-title').fill('Festive N2b')
        await p.locator('#o-value').fill('10')
        await see.getByText(/Festive N2b|10%/).first().waitFor()
        // What it costs you (owner sees costs): the piece's figures follow the percent typed.
        const cost = p.getByRole('heading', { name: 'What it costs you' })
        await cost.waitFor()
        const card = cost.locator('xpath=ancestor::section[1]')
        const before = await card.innerText()
        assert.match(before, /You keep about −?₹[\d,]+ instead of −?₹[\d,]+\./)
        await p.locator('#o-value').fill('20')
        await card.getByText(/You keep about/).filter({ hasNotText: before.match(/You keep about −?₹[\d,]+/)[0] }).waitFor()
        await p.screenshot({ path: 'e2e/.out/87-offer-1280.png', fullPage: true })
        const v = await audit(p); assert.deepEqual(v, [], `axe: ${v.join('; ')}`)
      })
      await t.step('staff never see what an offer costs (the form is not theirs)', async () => {
        const staff = await signedIn(t.browser, 'staff', { viewport: { width: 1280, height: 900 } })
        try {
          const q = await staff.newPage(); q.setDefaultTimeout(10_000)
          await q.goto(`${CONSOLE}/console/offers/new`, { waitUntil: 'networkidle' })
          assert.equal(await q.getByRole('heading', { name: 'What it costs you' }).count(), 0)
          assert.equal(await q.getByText(/You keep about/).count(), 0)
        } finally { await staff.close() }
      })
      await t.step('the phone: nothing scrolls sideways', async () => {
        await p.setViewportSize({ width: 390, height: 844 }); await p.reload()
        await p.getByRole('heading', { name: 'What kind' }).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 391), 'nothing scrolls sideways')
        await p.screenshot({ path: 'e2e/.out/87-offer-390.png', fullPage: true })
      })
    } finally {
      await owner.close()
      await db`delete from orders where tenant_id = ${T} and id = ${o.id}`
    }
  },
}
