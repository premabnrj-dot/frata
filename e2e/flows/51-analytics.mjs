// =============================================================================
// FLOW: analytics (A·1, docs/plans/2026-11-08-analytics-a1.md) — where orders come from, judged on deliveries. Written
// first (plan A1·0): step 1 pins today's capture (a tagged landing with a creator's ?code= is recorded on the order, the
// code with via 'link') before A1·4 moves capture into the shop shell. The page's steps join with A1·6 (CI runs every
// flow, so no step lands red). Seeds its own creator offer, code-only, and ends it after.
// Guards: a source lost when capture moves, a creator link that stops crediting its creator.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, SHOP, USERS, playwright, signedIn } from '../lib.mjs'

const { devices } = playwright

export default {
  name: 'analytics',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    // Earlier flows place many orders from this machine: start this one's hour afresh (30 orders an hour per shop and IP;
    // the keys are hashed, so the throwaway database's limits are cleared whole).
    await db`delete from rate_limits`
    // A creator's offer: 25% off, unlisted, only through its code (better than any automatic offer, so it is the one used).
    const [d] = await db`insert into discounts (tenant_id, title, style, percent_bps, starts_at, started_at, started_by, created_by, listed)
      values (${T}, 'Riya''s followers', 'order_off', 2500, now() - interval '1 minute', now(), ${USERS.owner.id}, ${USERS.owner.id}, false) returning id`
    // A public code (no label) makes the offer code-only; without one it would apply to every bag (candidates()).
    await db`insert into discount_codes (tenant_id, discount_id, code) values (${T}, ${d.id}, 'FOLLOW51')`
    await db`insert into discount_codes (tenant_id, discount_id, code, label) values (${T}, ${d.id}, 'RIYA51', 'Riya')`

    const ctx = await t.browser.newContext({ ...devices['Pixel 7'] })
    const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('a tagged creator link: the order keeps its tags, and the code is credited as a link', async () => {
        // A fresh context: the tab's first page is this tagged landing (no earlier visit to settle first).
        // Arriving from Instagram's link shim (its referrer, reduced to a hostname, is kept beside the tags).
        await p.goto(SHOP + '/products/chanderi-kurta-set?utm_source=instagram&utm_medium=bio&utm_campaign=diwali-drop&code=RIYA51', { waitUntil: 'domcontentloaded', referer: 'https://l.instagram.com/?u=https%3A%2F%2Fkesar&e=AT1' })
        await p.getByRole('button', { name: /^Rust/ }).click(); await p.getByRole('button', { name: 'M', exact: true }).click()
        await p.getByRole('button', { name: /Add to bag/ }).click(); await p.getByRole('dialog', { name: 'Your bag' }).waitFor()
        await p.getByRole('button', { name: 'Checkout' }).click(); await p.waitForURL(/\/checkout$/)
        await p.fill('#phone', '98290 51001'); await p.fill('#name', 'Asha Analytics'); await p.fill('#pincode', '302001'); await p.fill('#city', 'Jaipur')
        await p.fill('#addressLine', '5, MI Road'); await p.fill('#area', 'C Scheme'); await p.selectOption('#state', 'Rajasthan')
        await p.getByText('Pay on delivery', { exact: true }).click()
        await p.getByRole('button', { name: /^Place order/ }).click()
        await p.waitForURL(/\/orders#t=/)
        const [o] = await db`select id, checkout from orders where tenant_id = ${T} and phone like '%9829051001%' order by placed_at desc limit 1`
        assert.ok(o, 'the order was placed')
        const attr = o.checkout?.attribution ?? {}
        assert.equal(attr.utm_source, 'instagram'); assert.equal(attr.utm_medium, 'bio'); assert.equal(attr.utm_campaign, 'diwali-drop')
        assert.equal(attr.ref_host, 'l.instagram.com', 'the referring site, as a hostname only')
        const used = await db`select od.via, dc.code from order_discounts od join discount_codes dc on dc.tenant_id = od.tenant_id and dc.id = od.code_id where od.order_id = ${o.id}`
        assert.deepEqual(used.map((r) => [r.code, r.via]), [['RIYA51', 'link']], 'the creator code, credited as a link')
      })
      await t.step('the offer is the code\'s only: a bag without it gets no 25% off', async () => {
        await p.goto(SHOP + '/products/chanderi-kurta-set', { waitUntil: 'domcontentloaded' })
        await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() }); await p.reload({ waitUntil: 'domcontentloaded' })
        await p.getByRole('button', { name: /^Rust/ }).click(); await p.getByRole('button', { name: 'M', exact: true }).click()
        await p.getByRole('button', { name: /Add to bag/ }).click()
        const bag = p.getByRole('dialog', { name: 'Your bag' }); await bag.waitFor()
        assert.equal(await bag.getByText('Riya\'s followers').count(), 0)
      })
    } finally {
      await ctx.close()
    }

    // A console preview never captures: tags and a creator code in its address are not stored (plan review 9).
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    try {
      await t.step('a console preview stores no attribution and no creator code', async () => {
        const c = await owner.newPage(); c.setDefaultTimeout(10_000); c.on('pageerror', (e) => t.errors.push(e.message))
        await c.goto(CONSOLE + '/console/preview/products/chanderi-kurta-set?utm_source=preview-test&code=RIYA51')
        await c.waitForLoadState('networkidle')
        const stored = await c.evaluate(() => [sessionStorage.getItem('frata.attr.v1'), sessionStorage.getItem('frrata.code.v1')])
        assert.deepEqual(stored, [null, null])
      })
    } finally {
      await owner.close()
      await db`update discounts set ended_at = now() where id = ${d.id}`
    }
  },
}
