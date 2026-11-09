// =============================================================================
// FLOW: theme Signal (docs/plans/2026-11-09-theme-signal.md S1). Once Admin releases it, Signal is in the gallery;
// tried in a draft, its preview draws the floating header, label pills, tabs by collection, the grey-tile cards, the
// swipe row's counter, the signal band and the photo footer, with the accessories samples for a shop that sells
// bags. Removes its draft, its release row and puts the shop's categories back.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const FRAME = 'iframe[title="Your shop with this look"]'

export default {
  name: 'signal',
  async run(t) {
    const { db } = t
    const [{ sells }] = await db`select sells from shop_settings where tenant_id = ${KESAR}`
    const [{ n: before }] = await db`select count(*)::int n from shop_theme_revisions where tenant_id = ${KESAR}`
    const cleanup = async () => {
      await db`update shop_settings set sells = ${sells} where tenant_id = ${KESAR}`
      await db.begin(async (x) => { await x`set local session_replication_role = replica`; await x`delete from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal'`; await x`delete from theme_versions where theme_key = 'signal'` })
    }
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    try {
      await t.step('Released by Admin: Signal is in the gallery; tried in a draft, the preview wears it', async () => {
        // Every Signal version released: a new draft takes the newest (1.3.0, S3).
        await db`insert into theme_versions (theme_key, version, released_at) values ('signal', '1.0.0', now()), ('signal', '1.1.0', now()), ('signal', '1.2.0', now()), ('signal', '1.3.0', now()) on conflict (theme_key, version) do update set released_at = now(), recalled_at = null, withdrawn_at = null`
        await db`update shop_settings set sells = '{accessories}' where tenant_id = ${KESAR}`
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'Signal', exact: true }).click()
        const d = p.getByRole('dialog', { name: 'Signal' })
        await d.getByRole('button', { name: 'Try Signal in a draft' }).click()
        const ask = p.getByRole('dialog', { name: 'Try Signal?' })
        await Promise.race([ask.waitFor().then(() => ask.getByRole('button', { name: 'Try Signal' }).click()), p.waitForURL(/\/console\/look\/customize$/)])
        await p.waitForURL(/\/console\/look\/customize$/)
        // A shop that customised its home before carries those sections over (carryOver); this checks Signal's own.
        await db`update shop_theme_revisions set settings = settings - 'home' where tenant_id = ${KESAR} and theme_key = 'signal' and id not in (select revision_id from shop_theme_publishes)`
        await p.reload()
        const f = p.frameLocator(FRAME)
        await f.locator('[data-section]').first().waitFor()
        await f.locator('[data-header="float"]').waitFor({ state: 'attached' })
        await f.locator('.store-label', { hasText: 'Bestsellers' }).waitFor()
        await f.locator('.store-tab').first().waitFor()
        await f.locator('[data-card="tile"]').waitFor({ state: 'attached' })
        // S2 (1.2.0): the board's story half and type scale, filled with the bags set's samples in the preview.
        const [rev] = await db`select theme_version from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' order by updated_at desc limit 1`
        assert.equal(rev.theme_version, '1.3.0')
        await f.locator('[data-scale="signal"]').waitFor({ state: 'attached' })
        await f.locator('.store-script-hero', { hasText: 'New season' }).waitFor()
        await f.locator('.store-spotlight').getByText('In spotlight').waitFor()
        assert.equal(await f.locator('.store-fan > li').count(), 5, 'the fan borrows five sample cards')
        await f.locator('.store-statement .store-script', { hasText: 'the long way' }).waitFor({ state: 'attached' })
        const h2 = await f.locator('[data-section="best"] h2').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
        assert.ok(h2 >= 22, `section headings use the scale (${h2}px)`)
        await p.waitForTimeout(500)
        await p.screenshot({ path: t.out('signal-customize') })
      })

      await t.step('Story sections in the customizer: add a Story fan and a Statement, edit them, the preview follows', async () => {
        await p.getByRole('tab', { name: 'Sections' }).click()
        await p.getByRole('button', { name: /^Story fan/ }).first().click()
        await p.getByLabel('Heading', { exact: true }).fill('Roam, out in the city')
        await p.getByRole('button', { name: /^Add a card/ }).click()
        await p.getByText('Card 1', { exact: true }).waitFor()
        await p.frameLocator(FRAME).getByText('Roam, out in the city').waitFor()
        await p.getByRole('button', { name: '‹ Sections' }).click()
        await p.getByRole('button', { name: /^Statement/ }).first().click()
        await p.getByLabel('Handwritten line').fill('the long road')
        await p.frameLocator(FRAME).locator('.store-statement .store-script', { hasText: 'the long road' }).waitFor({ state: 'attached' })
        await p.getByRole('button', { name: '‹ Sections' }).click()
        await p.getByRole('button', { name: /^Hero/ }).first().click()
        await p.getByLabel('Handwritten line above (optional)').fill('Monsoon Edit')
        await p.frameLocator(FRAME).locator('.store-script-hero', { hasText: 'Monsoon Edit' }).waitFor()
        await p.getByRole('button', { name: '‹ Sections' }).click()
        await p.getByRole('button', { name: /^Image with text/ }).first().click()
        await p.getByRole('radio', { name: 'Spotlight' }).or(p.getByRole('button', { name: 'Spotlight', exact: true })).first().waitFor()
        await p.getByRole('button', { name: '‹ Sections' }).click()
        // The library offers both, "made for" Signal.
        await p.getByRole('button', { name: 'Add a section', exact: true }).click()
        const lib = p.getByRole('dialog', { name: 'Add a section' })
        await lib.getByRole('button', { name: /^Story fan/ }).waitFor()
        await lib.getByRole('button', { name: /^Statement/ }).waitFor()
        await p.keyboard.press('Escape')
        await p.screenshot({ path: t.out('signal-story-forms') })
        // As a shopper with motion on sees them: the fan fanned out (middle card forward), the statement once scrolled to.
        const [r] = await db`select id from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' order by updated_at desc limit 1`
        const moving = await signedIn(t.browser, 'owner', { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
        const q = await moving.newPage()
        await q.goto(CONSOLE + `/console/theme-preview/${r.id}`)
        const fan = q.locator('.store-fan')
        await fan.scrollIntoViewIfNeeded()
        const xs = await fan.locator('li').evaluateAll((ls) => ls.map((l) => Math.round(l.getBoundingClientRect().x)))
        const zs = await fan.locator('li').evaluateAll((ls) => ls.map((l) => Number(getComputedStyle(l).zIndex)))
        assert.ok(xs.every((x, i) => i === 0 || x > xs[i - 1]), 'cards fan left to right')
        assert.equal(zs.indexOf(Math.max(...zs)), Math.floor((zs.length - 1) / 2), 'the middle card is forward')
        await fan.screenshot({ path: t.out('signal-fan-motion') })
        const st = q.locator('.store-statement')
        await st.scrollIntoViewIfNeeded(); await q.waitForTimeout(400)
        await st.screenshot({ path: t.out('signal-statement') })
        await moving.close()
      })

      await t.step('The preview on its own, a computer and a phone: home and a sample bag', async () => {
        const [r] = await db`select id from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' order by updated_at desc limit 1`
        assert.ok(r, 'a Signal draft')
        for (const [vp, tag] of [[{ width: 1440, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']]) {
          await p.setViewportSize(vp)
          await p.goto(CONSOLE + `/console/theme-preview/${r.id}`)
          await p.locator('.store-tab').first().waitFor()
          await p.waitForTimeout(400)
          await p.screenshot({ path: t.out(`signal-home-${tag}`), fullPage: true })
          // A second tab shows its own pieces, with no script.
          await p.locator('.store-tab').nth(1).click()
          assert.equal(await p.locator('.store-tab-panel[data-tab="1"]').isVisible(), true)
          await p.goto(CONSOLE + `/console/theme-preview/${r.id}/products/sample-navy-backpack`)
          await p.getByRole('heading', { name: 'Roam backpack' }).waitFor()
          await p.screenshot({ path: t.out(`signal-product-${tag}`), fullPage: true })
        }
        // The bag and the checkout wear the theme too: tiles for the fields and the ways to pay, the theme's buttons.
        const [v] = await db`select v.id from variants v join products p on p.id = v.product_id where p.tenant_id = ${KESAR} and p.status = 'active' limit 1`
        await p.setViewportSize({ width: 1440, height: 900 })
        await p.evaluate((id) => localStorage.setItem('frata.bag.v1', JSON.stringify([{ variantId: id, qty: 1 }])), v.id)
        await p.goto(CONSOLE + `/console/theme-preview/${r.id}/bag`)
        await p.getByRole('heading', { name: 'Your bag' }).waitFor()
        await p.waitForTimeout(800)
        await p.screenshot({ path: t.out('signal-bag-desktop'), fullPage: true })
        await p.goto(CONSOLE + `/console/theme-preview/${r.id}/checkout`)
        await p.locator('.store-field').first().waitFor()
        await p.waitForTimeout(800)
        assert.equal(await p.locator('.store-field').first().evaluate((e) => getComputedStyle(e).borderTopColor), 'rgba(0, 0, 0, 0)', 'checkout fields sit on tiles')
        await p.screenshot({ path: t.out('signal-checkout-desktop'), fullPage: true })
        await p.evaluate(() => localStorage.removeItem('frata.bag.v1'))
        const [{ n: after }] = await db`select count(*)::int n from shop_theme_revisions where tenant_id = ${KESAR}`
        assert.ok(after >= before)
      })

      await t.step('S3: a story and two pairings in the product editor; Signal 1.3\'s product page shows them, Add and Choose', async () => {
        const [a] = await db`select id, handle, title from products where tenant_id = ${KESAR} and handle = 'chanderi-kurta-set'`
        const [b] = await db`insert into products (tenant_id, handle, title, status, published_at, options, option_values) values (${KESAR}, 'e2e-daypack-mini', 'Daypack Mini', 'active', now(), '{Size}', '[["S","M"]]') returning id, handle, title`
        await db`insert into variants (tenant_id, product_id, price, stock, option_values) values (${KESAR}, ${b.id}, 299000, 4, '{S}'), (${KESAR}, ${b.id}, 299000, 4, '{M}')`
        const [c] = await db`insert into products (tenant_id, handle, title, status, published_at) values (${KESAR}, 'e2e-strap-tag', 'Strap Tag', 'active', now()) returning id, handle, title`
        await db`insert into variants (tenant_id, product_id, price, stock) values (${KESAR}, ${c.id}, 49000, 5)`
        try {
          await p.setViewportSize({ width: 1440, height: 900 })
          await p.goto(CONSOLE + `/console/products/${a.handle}`)
          await p.getByRole('heading', { name: 'Stories' }).waitFor()
          await p.getByText('Pick up to 2 pieces shoppers can add from this page.').waitFor()
          await p.getByRole('button', { name: 'Add a story' }).click()
          await p.locator('#st-0').fill('A pocket for everything')
          await p.locator('#sx-0').fill('The main compartment opens flat, with room for three days of clothes.')
          await p.getByRole('button', { name: 'Add a note' }).click()
          await p.getByLabel('Note 1', { exact: true }).fill('Opens flat like a suitcase')
          for (const piece of [c, b]) {
            await p.locator('#pair-find').fill(piece.title.slice(0, 8))
            await p.getByRole('button', { name: `Add ${piece.title}` }).click()
          }
          assert.equal(await p.locator('#pair-find').count(), 0, '2 of 2: the search closes')
          await p.screenshot({ path: t.out('signal-s3-editor'), fullPage: true })
          await p.getByRole('button', { name: 'Save', exact: true }).first().click()
          await p.getByText(/^Saved/).waitFor()
          const [row] = await db`select stories from products where id = ${a.id}`
          assert.equal(row.stories.length, 1); assert.deepEqual(row.stories[0].notes, ['Opens flat like a suitcase'])
          const pairs = await db`select paired_id from product_pairs where product_id = ${a.id} order by position`
          assert.deepEqual(pairs.map((x) => x.paired_id), [c.id, b.id])
          // The preview of the Signal 1.3 draft: the story as a slide (one story: no counter), Add for one size, Choose for sizes.
          const [r] = await db`select id from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' order by updated_at desc limit 1`
          for (const [vp, tag] of [[{ width: 1440, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']]) {
            await p.setViewportSize(vp)
            await p.goto(CONSOLE + `/console/theme-preview/${r.id}/products/${a.handle}`)
            await p.getByRole('heading', { name: 'A pocket for everything' }).waitFor()
            await p.locator('.store-pair').getByText('Pair it with').waitFor()
            await p.getByRole('button', { name: 'Add Strap Tag to bag' }).waitFor()
            await p.getByRole('link', { name: `Choose a size of ${b.title}` }).waitFor()
            await p.screenshot({ path: t.out(`signal-s3-product-${tag}`), fullPage: true })
          }
          await p.getByRole('button', { name: 'Add Strap Tag to bag' }).click()
          await p.getByText('This is a preview: shoppers add to their bag here.').waitFor()
        } finally {
          await db`update products set stories = '[]' where id = ${a.id}`
          await db`delete from product_pairs where tenant_id = ${KESAR}`
          await db`delete from products where id in (${c.id}, ${b.id})`
        }
      })
    } finally {
      await ctx.close()
      await cleanup()
    }
  },
}
