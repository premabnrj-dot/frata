// =============================================================================
// FLOW: paging — a long list is cut into pages at their own addresses (speed review P2, 2026-11-08). A 600-piece
// shop rendered 3.9 MB of HTML and 1,200 images on Shop all; now 48 a page, each page cached on its own.
// =============================================================================
import assert from 'node:assert/strict'
import { SHOP, until } from '../lib.mjs'

const PREFIX = 'paging-proof-'

export default {
  name: 'paging',
  async run(t) {
    const { db } = t
    const [{ id: kesar }] = await db`select id from tenants where slug = 'kesar-studio'`
    const before = (await db`select count(*)::int n from products where tenant_id = ${kesar} and status = 'active'`)[0].n
    const ids = await db`insert into products ${db(Array.from({ length: 60 }, (_, i) => ({ tenant_id: kesar, handle: `${PREFIX}${i}`, title: `Paging proof kurta ${i}`, status: 'active', published_at: new Date() })))} returning id`
    await db`insert into variants ${db(ids.map((p) => ({ tenant_id: kesar, product_id: p.id, price: 129900, stock: 3 })))}`
    try {
      await t.step('Shop all shows 48, then page 2 the rest; a page past the end is not found', async () => {
        const ctx = await t.browser.newContext(); const p = await ctx.newPage()
        const total = before + 60, pages = Math.ceil(total / 48)
        // The catalogue is cached for up to 60 s: wait for the new pieces to reach Shop all.
        await until(async () => { await p.goto(SHOP + '/products'); return (await p.getByRole("navigation", { name: "Pages" }).count()) === 1 }, 150_000)
        assert.equal(await p.locator('section:has(> h1) > ul > li').count(), 48)
        await p.getByText(`Page 1 of ${pages}`).waitFor()
        await p.getByRole('link', { name: 'Next' }).click()
        await p.waitForURL(/\/products\/page\/2$/)
        await p.getByText(`Page 2 of ${pages}`).waitFor()
        assert.equal((await p.goto(SHOP + `/products/page/${pages + 1}`)).status(), 404)
        assert.equal((await p.goto(SHOP + '/products/page/1')).status(), 404, 'page 1 lives at /products only')
        await ctx.close()
      })
    } finally {
      await db`delete from variants where tenant_id = ${kesar} and product_id in ${db(ids.map((p) => p.id))}`
      await db`delete from products where tenant_id = ${kesar} and handle like ${PREFIX + '%'}`
    }
  },
}
