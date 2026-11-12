// FLOW: delivery-zones — Delivery Zones (plan docs/plans/2026-11-12-delivery-zones.md; approved mockup). PD·0 in every
// plan: the product page's PIN code check from the shop's own Settings. PD·1 with the app usable: a Special zone with
// pay online only, a PIN code the shop doesn't deliver to, and checkout refusing that PIN code.
import assert from 'node:assert/strict'
import { SHOP, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const U = '00000000-0000-0000-0000-000000000000'

export default {
  name: 'delivery-zones',
  async run(t) {
    const { db } = t
    const ctx = await t.browser.newContext({ viewport: { width: 390, height: 844 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    const check = async (pin) => {
      await p.fill('#delivery-pin', pin)
      await p.getByRole('button', { name: 'Check', exact: true }).click()
    }
    const [v] = await db`select v.id from variants v join products p on p.id = v.product_id where v.tenant_id = ${KESAR} and p.handle = 'chanderi-kurta-set' and p.status = 'active' order by v.position limit 1`
    // From inside the shop's page (its own address and Origin), as the bag asks.
    const quoteFor = (pincode) => p.evaluate(async ([id, pin]) => (await fetch('/api/shop/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bag: [{ variantId: id, qty: 1 }], pincode: pin }) })).json(), [v.id, pincode])

    try {
      await t.step('PD·0 (every plan): the PIN code check answers from the shop’s Settings, and is remembered', async () => {
        await p.goto(SHOP + '/products/chanderi-kurta-set', { waitUntil: 'domcontentloaded' })
        await p.evaluate(() => localStorage.removeItem('frrata.pin'))
        await check('3020')
        await p.getByText('Type a 6-digit PIN code.').waitFor()
        await check('302001')
        await p.getByText(/^✓ Delivers to .+ by /).waitFor()
        await p.getByText(/^Pay on delivery available|^Free delivery|^Delivery ₹/).first().waitFor()
        await p.screenshot({ path: t.out('check-floor'), fullPage: false })
        await p.reload({ waitUntil: 'domcontentloaded' })
        assert.ok(await until(async () => (await p.inputValue('#delivery-pin')) === '302001', 10_000), 'the PIN code is remembered on this phone')
        await p.getByText(/^✓ Delivers to .+ by /).waitFor()
      })

      await t.step('PD·1 (app usable): Special pays online only; a PIN code rule says it isn’t delivered; checkout refuses it', async () => {
        const [price] = await db`select id from addon_prices where module = 'delivery_zones' order by version desc limit 1`
        await db`insert into tenant_addons (tenant_id, module, addon_price_id, created_by, reason) values (${KESAR}, 'delivery_zones', ${price.id}, ${U}, 'E2E')`
        await db`insert into tenant_modules (tenant_id, module, enabled_by) values (${KESAR}, 'delivery_zones', ${U}) on conflict do nothing`
        await db`insert into delivery_zones (tenant_id, position, name, preset, charge, free_above, days_min, days_max, cod_on, cod_charge) values
          (${KESAR}, 0, 'Metro', 'metro', 5900, 149900, 2, 3, true, 4900),
          (${KESAR}, 1, 'Special', 'special', 14900, null, 6, 10, false, 0),
          (${KESAR}, 2, 'Rest of India', 'rest', 9900, 199900, 4, 7, true, 6900)`
        await db`insert into delivery_rules (tenant_id, pincode, rule) values (${KESAR}, '744101', 'no_delivery')`
        await p.goto(SHOP + '/products/chanderi-kurta-set', { waitUntil: 'domcontentloaded' })
        await check('799001')
        await p.getByText('Pay online for this PIN code').waitFor()
        await p.getByText(/^Delivery ₹149/).waitFor()
        await check('744101')
        await p.getByText(/^We don't deliver to .+ yet$/).waitFor()
        await p.screenshot({ path: t.out('check-no-delivery'), fullPage: false })
        // Checkout's quote and placement read the same rule.
        const q = await until(async () => { const r = await quoteFor('744101'); return r.quote?.deliverable === false && r }, 10_000)
        assert.equal(q.quote.cod, null)
        const metro = await quoteFor('400070')
        assert.equal(metro.quote.deliverable, true)
        assert.equal(metro.quote.shipping, 0, 'the kurta is above the Metro zone’s free-delivery threshold')
      })
    } finally {
      await db`delete from delivery_rules where tenant_id = ${KESAR}`
      await db`delete from delivery_zones where tenant_id = ${KESAR}`
      await db`delete from tenant_modules where tenant_id = ${KESAR} and module = 'delivery_zones'`
      await db`delete from tenant_addons where tenant_id = ${KESAR} and module = 'delivery_zones'`
      await ctx.close()
    }
  },
}
