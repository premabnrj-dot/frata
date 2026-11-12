// FLOW: delivery-zones — Delivery Zones (plan docs/plans/2026-11-12-delivery-zones.md; approved mockup). PD·0 in every
// plan: the product page's PIN code check from the shop's own Settings. PD·1 with the app usable: a Special zone with
// pay online only, a PIN code the shop doesn't deliver to, and checkout refusing that PIN code.
import assert from 'node:assert/strict'
import { CONSOLE, SHOP, signedIn, until } from '../lib.mjs'

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
        // The shop's cached facts follow the zones (60 s backstop; a console save purges them).
        // No remembered PIN code while polling, so each reload asks nothing of the check's rate limit.
        await p.evaluate(() => localStorage.removeItem('frrata.pin'))
        await until(async () => { await p.goto(SHOP + '/products/chanderi-kurta-set', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000); return (await p.getByText(/delivery in 2–10 days, by PIN code/).count()) > 0 }, 75_000)
        assert.equal(await p.getByText(/to metros, .+ elsewhere/).count(), 0, 'the floor’s metro / elsewhere days are gone')
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

      await t.step('PD·1 console: set up zones, edit one, rules (add, import, export), dates; Settings hands the fields over', async () => {
        await db`delete from delivery_rules where tenant_id = ${KESAR}`
        await db`delete from delivery_zones where tenant_id = ${KESAR}`
        const [before] = await db`select dispatch_days, ship_days, shipping_flat from shop_settings where tenant_id = ${KESAR}`
        const oc = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
        const o = await oc.newPage(); o.setDefaultTimeout(15_000); o.on('pageerror', (e) => t.errors.push(e.message))
        try {
          await o.goto(CONSOLE + '/console/apps/delivery_zones', { waitUntil: 'domcontentloaded' })
          await o.getByText('Start with four zones').waitFor()
          await o.getByRole('button', { name: 'Set up zones' }).click()
          const table = o.getByRole('table', { name: 'Zones' })
          await table.getByText('Rest of India', { exact: true }).waitFor()
          assert.equal(await table.getByRole('row').count(), 5, 'four zones and the header')
          const [z] = await db`select count(*)::int as n, min(charge)::int as lo, max(charge)::int as hi from delivery_zones where tenant_id = ${KESAR}`
          assert.deepEqual([z.n, z.lo, z.hi], [4, Number(before.shipping_flat), Number(before.shipping_flat)], 'each zone starts from Settings’ charge')
          await o.screenshot({ path: t.out('console-zones'), fullPage: true })

          // Edit Special: ₹129, pay online only.
          await table.getByRole('row').filter({ hasText: 'Special' }).getByRole('button', { name: 'Edit' }).click()
          await o.fill('#z-charge', '129')
          await o.getByRole('switch').click()
          await o.getByRole('button', { name: 'Save zone' }).click()
          await o.getByText('Zone saved').waitFor()
          await table.getByRole('row').filter({ hasText: 'Special' }).getByText('Pay online only').waitFor()
          const [sp] = await db`select charge::int, cod_on from delivery_zones where tenant_id = ${KESAR} and preset = 'special'`
          assert.deepEqual([sp.charge, sp.cod_on], [12900, false])

          // A zone of the brand's own.
          await o.getByRole('button', { name: 'Add a zone' }).click()
          await o.fill('#z-name', 'Jaipur same city')
          await o.fill('#z-pins', '302001, 302012 303')
          await o.fill('#z-charge', '39')
          await o.getByRole('button', { name: 'Save zone' }).click()
          await table.getByText('Jaipur same city').waitFor()
          const pins = await db`select pin from delivery_zone_pins where tenant_id = ${KESAR} order by pin`
          assert.deepEqual(pins.map((r) => r.pin), ['302001', '302012', '303'])

          // Rules: add one, import two, export.
          await o.goto(CONSOLE + '/console/apps/delivery_zones?tab=rules', { waitUntil: 'domcontentloaded' })
          await o.getByRole('button', { name: 'Add a rule' }).click()
          await o.fill('#ar-pin', '744101')
          await o.selectOption('#ar-rule', 'no_delivery')
          await o.fill('#ar-note', 'Courier doesn’t reach')
          await o.getByRole('button', { name: 'Save rule' }).click()
          await o.getByRole('table', { name: 'PIN code rules' }).getByText('744101').waitFor()
          await o.getByRole('button', { name: 'Import CSV' }).click()
          await o.setInputFiles('input[type=file]', { name: 'rules.csv', mimeType: 'text/csv', buffer: Buffer.from('pincode,rule,cod_max,note\n400070,cod_max,1500,\n110094,prepaid_only,,7 of 11 came back\n12345,no_delivery,,\n') })
          await o.getByText(/lines left out/).waitFor()
          await o.getByRole('button', { name: 'Import 2 rules' }).click()
          await o.getByText('2 rules imported').waitFor()
          const rules = await db`select pincode, rule, cod_max::int as m from delivery_rules where tenant_id = ${KESAR} order by pincode`
          assert.deepEqual(rules.map((r) => `${r.pincode}:${r.rule}:${r.m ?? ''}`), ['110094:prepaid_only:', '400070:cod_max:150000', '744101:no_delivery:'])
          const csv = await o.evaluate(async () => (await fetch('/console/apps/delivery_zones/export')).text())
          assert.match(csv, /^\uFEFF?pincode,rule,cod_max,note/)
          assert.match(csv, /400070,cod_max,1500/)
          await o.screenshot({ path: t.out('console-rules'), fullPage: true })

          // Dates: ship on Sundays too, and a holiday; the preview follows.
          await o.goto(CONSOLE + '/console/apps/delivery_zones?tab=dates', { waitUntil: 'domcontentloaded' })
          await o.getByRole('button', { name: 'Sun', exact: true }).click()
          await o.getByRole('button', { name: 'Save', exact: true }).click()
          await o.getByText('Dispatch saved').waitFor()
          const [ds] = await db`select ship_days from shop_settings where tenant_id = ${KESAR}`
          assert.equal(ds.ship_days, Number(before.ship_days) | 64)
          await o.fill('#h-day', '2099-12-25')
          await o.fill('#h-name', 'Christmas')
          await o.getByRole('button', { name: 'Add a holiday' }).click()
          await o.getByText('Holiday added').waitFor()
          await o.getByText('Christmas', { exact: true }).waitFor()
          await o.screenshot({ path: t.out('console-dates'), fullPage: true })

          // Settings › Shipping and delivery: the app sets the charges and days now.
          await o.goto(CONSOLE + '/console/settings/shipping', { waitUntil: 'domcontentloaded' })
          await o.getByText('Set in Delivery Zones').waitFor()
          assert.equal(await o.locator('#f-shippingFlat').count(), 0)

          // A phone: the zones are rows, never a sideways table.
          await o.setViewportSize({ width: 390, height: 844 })
          await o.goto(CONSOLE + '/console/apps/delivery_zones', { waitUntil: 'domcontentloaded' })
          await table.getByText('Jaipur same city').waitFor()
          assert.ok(await o.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll on a phone')
          await o.screenshot({ path: t.out('console-zones-phone'), fullPage: true })
        } finally {
          await db`update shop_settings set ship_days = ${before.ship_days}, dispatch_days = ${before.dispatch_days} where tenant_id = ${KESAR}`
          await db`delete from shop_holidays where tenant_id = ${KESAR}`
          await oc.close()
        }
      })
    } finally {
      await db`delete from delivery_zone_pins where tenant_id = ${KESAR}`
      await db`delete from delivery_rules where tenant_id = ${KESAR}`
      await db`delete from delivery_zones where tenant_id = ${KESAR}`
      await db`delete from tenant_modules where tenant_id = ${KESAR} and module = 'delivery_zones'`
      await db`delete from tenant_addons where tenant_id = ${KESAR} and module = 'delivery_zones'`
      await ctx.close()
    }
  },
}
