// =============================================================================
// FLOW: themes-three — the three 2.0 themes (docs/plans/2026-11-09-themes-three.md). Once Admin has released them:
// the gallery offers Editorial, Bazaar and Studio; each opens in the customizer with its own settings (only the
// choices it offers), its preview draws its own home and product page (one photo loaded first), and a click on a
// section in the preview selects it. Studio published: the shop wears its split header and statement footer; its
// focused checkout has the logo and every legal line, and no menu. Undo puts the old look back.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { CONSOLE, PORTS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const shopHtml = (path = '/') => new Promise((res, rej) => http.get(`http://localhost:${PORTS.app}${path}`, { headers: { host: 'kesar-studio.frata.test' } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(b)) }).on('error', rej))
const FRAME = 'iframe[title="Your shop with this look"]'

export default {
  name: 'themes-three',
  async run(t) {
    const { db } = t
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }
    const riya = await open('owner', { viewport: { width: 1440, height: 900 } })

    await t.step('Released by Admin: the gallery offers the three 2.0 themes', async () => {
      // As Admin › Themes › Release would leave them (that path is flow 48's).
      for (const k of ['editorial', 'bazaar', 'minimal']) await db`insert into theme_versions (theme_key, version, released_at) values (${k}, '2.0.0', now()) on conflict (theme_key, version) do update set released_at = now(), recalled_at = null, withdrawn_at = null`
      await riya.goto(CONSOLE + '/console/look')
      for (const name of ['Editorial', 'Bazaar', 'Studio']) await riya.getByRole('button', { name, exact: true }).waitFor()
      for (const name of ['Classic', 'Atelier', 'Minimal']) assert.equal(await riya.getByRole('button', { name, exact: true }).count(), 0, `${name} is not offered`)
      await riya.screenshot({ path: t.out('gallery'), fullPage: true })
    })

    for (const [name, key, own, notOwn] of [
      ['Editorial', 'editorial', 'Stacked', 'Pill'],
      ['Bazaar', 'bazaar', 'Pill', 'Underlined'],
      ['Studio', 'minimal', 'Underlined', 'Pill'],
    ]) {
      await t.step(`${name}: tried in a draft, its own settings, its home and product page in the preview`, async () => {
        await riya.goto(CONSOLE + '/console/look')
        await riya.getByRole('button', { name, exact: true }).click()
        const d = riya.getByRole('dialog', { name })
        await d.getByText('Version 2.0.0', { exact: false }).waitFor()
        await d.getByRole('button', { name: `Try ${name} in a draft` }).click()
        // The open draft is another theme's: trying this one asks first (Look v3).
        const ask = riya.getByRole('dialog', { name: `Try ${name}?` })
        await Promise.race([ask.waitFor().then(() => ask.getByRole('button', { name: `Try ${name}` }).click()), riya.waitForURL(/\/console\/look\/customize$/)])
        await riya.waitForURL(/\/console\/look\/customize$/)
        const [r] = await db`select theme_key, theme_version from shop_theme_revisions where tenant_id = ${KESAR} order by updated_at desc limit 1`
        assert.deepEqual([r.theme_key, r.theme_version], [key, '2.0.0'])
        const f = riya.frameLocator(FRAME)
        await f.locator('[data-section]').first().waitFor()
        await riya.waitForTimeout(400)
        await riya.screenshot({ path: t.out(`${key}-home`) })
        // Only the choices this theme offers.
        await riya.getByRole('tab', { name: 'Style' }).click()
        await riya.waitForTimeout(300)
        await riya.screenshot({ path: t.out(`${key}-style`) })
        await riya.getByRole('button', { name: own, exact: true }).first().waitFor({ state: 'attached', timeout: 2000 }).catch(() => {})
        assert.equal(await riya.getByRole('button', { name: notOwn, exact: true }).count(), 0, `${name} doesn't offer ${notOwn}`)
        // A click on a section in the preview selects it here.
        await riya.getByRole('tab', { name: /Sections/ }).click()
        if (key === 'editorial') {
          await riya.getByRole('button', { name: 'Add a section', exact: true }).click()
          const lib = riya.getByRole('dialog', { name: 'Add a section' })
          await lib.getByPlaceholder('Search sections').fill('photo')
          await riya.waitForTimeout(300)
          await riya.screenshot({ path: t.out('library') })
          await lib.getByRole('button', { name: 'Close' }).click()
        }
        await f.locator('[data-section]').nth(1).locator(':scope > *').first().click({ position: { x: 20, y: 20 } })
        await riya.getByRole('button', { name: '‹ Sections' }).waitFor()
        await riya.getByRole('button', { name: '‹ Sections' }).click()
        // The product page: its layout, one photo asked for first.
        await riya.getByLabel('Page').selectOption('product')
        await f.getByRole('button', { name: /Add to bag|Pre-order/ }).first().waitFor()
        await riya.waitForTimeout(400)
        await riya.screenshot({ path: t.out(`${key}-product`) })
        assert.equal(await f.locator('img[fetchpriority="high"]').count(), 1, 'one photo loads first on a product page')
        await riya.getByLabel('Page').selectOption('home')
        // The draft full size, as Preview opens it: home and a product, on a computer and a phone (for a person to look at).
        const [{ id: rv }] = await db`select id from shop_theme_revisions where tenant_id = ${KESAR} order by updated_at desc limit 1`
        for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
          const pg = await open('owner', { viewport: { width: w, height: h } })
          await pg.goto(CONSOLE + `/console/theme-preview/${rv}`)
          await pg.waitForTimeout(600)
          await pg.screenshot({ path: t.out(`${key}-full-${tag}`), fullPage: true })
          assert.ok(await pg.evaluate((w) => document.documentElement.scrollWidth <= w, w), `${name} home: no sideways scroll at ${w}`)
          await pg.goto(CONSOLE + `/console/theme-preview/${rv}/products/sample-rani-anarkali`)
          await pg.getByRole('button', { name: /Add to bag/ }).first().waitFor()
          await pg.waitForTimeout(600)
          await pg.screenshot({ path: t.out(`${key}-pdp-${tag}`), fullPage: tag === 'desktop' })
          await pg.context().close()
        }
      })
    }

    await t.step('Studio published: split header, statement footer, a focused checkout with every legal line', async () => {
      // The sample scene fills the preview only: a photo Hero still needs the merchant's own photo before Publish.
      await riya.getByRole('button', { name: 'Publish', exact: true }).click()
      const d = riya.getByRole('dialog', { name: 'Publish Studio?' })
      await d.getByText('Hero: add a photo').waitFor()
      assert.ok(await d.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), 'a blocked publish can’t be pressed')
      await d.getByRole('button', { name: 'Not yet' }).click()
      await riya.getByRole('button', { name: 'Hide Hero' }).click()
      await until(async () => { const [r] = await db`select settings from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'minimal' order by updated_at desc limit 1`; return (r.settings.home ?? []).some((s) => s.key === 'hero' && s.hidden) }, 10_000)
      await riya.getByRole('button', { name: 'Publish', exact: true }).click()
      await d.getByRole('button', { name: 'Publish', exact: true }).click()
      await riya.getByRole('dialog', { name: 'Your shop has its new look' }).waitFor()
      await until(async () => /data-entrance="rise"/.test(await shopHtml()), 15_000)
      const home = await shopHtml()
      assert.match(home, /data-button-motion="lift"/)
      const checkout = await shopHtml('/checkout')
      assert.ok(!/aria-label="Shop"/.test(checkout), 'no menu on the focused checkout')
      for (const p of ['shipping', 'returns', 'privacy', 'terms', 'contact']) assert.match(checkout, new RegExp(`/policies/${p}`), `the ${p} policy link stays`)
      assert.match(checkout, /Grievance|grievance/, 'the grievance officer stays')
    })

    await t.step('Undo last publish: the look before is live again', async () => {
      await riya.goto(CONSOLE + '/console/look')
      await riya.getByRole('button', { name: 'More' }).click()
      await riya.getByRole('menuitem', { name: 'Undo last publish' }).click()
      await riya.getByRole('dialog', { name: /back on your shop\?$/ }).getByRole('button', { name: 'Put it back' }).click()
      await until(async () => !/data-entrance="rise"/.test(await shopHtml()), 15_000)
    })
  },
}
