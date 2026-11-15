// =============================================================================
// FLOW: themes-v4 — Look v4 (docs/research/2026-11-09-look-v4.md): the customizer's gear opens Site settings (a
// palette checked as it is picked and never saved unreadable, a text style, the icon library); the Menus tab makes the
// main menu the merchant's own (a link added with an icon from the picker, nested under another) and the phone tabs;
// each page opens in the preview (Shop all, Bag, Checkout; Style › Products opens a collection); the panel folds to a
// rail. Published: the shop wears the text style, the duotone icons, the menu and the tabs. Undo puts it back.
// Runs after themes-three (the 2.x themes are released there).
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { CONSOLE, PORTS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const shopHtml = (path = '/') => new Promise((res, rej) => http.get(`http://localhost:${PORTS.app}${path}`, { headers: { host: 'kesar-studio.frata.test' } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(b)) }).on('error', rej))
const FRAME = 'iframe[title="Your store with this look"]'

export default {
  name: 'themes-v4',
  async run(t) {
    const { db } = t
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`)); return p }
    const riya = await open('owner', { viewport: { width: 1440, height: 900 } })
    const draft = async () => (await db`select settings from shop_theme_revisions where tenant_id = ${KESAR} order by updated_at desc limit 1`)[0]?.settings ?? {}
    const saved = (f) => until(async () => f(await draft()), 10_000)

    await t.step('A Bazaar draft opens in the customizer', async () => {
      await riya.goto(CONSOLE + '/console/look')
      await riya.getByRole('button', { name: 'Bazaar', exact: true }).click()
      const d = riya.getByRole('dialog', { name: 'Bazaar' })
      await d.getByRole('button', { name: /^Try Bazaar/ }).click()
      const ask = riya.getByRole('dialog', { name: 'Try Bazaar?' })
      await Promise.race([ask.waitFor().then(() => ask.getByRole('button', { name: 'Try Bazaar' }).click()), riya.waitForURL(/\/console\/look\/customize$/)])
      await riya.waitForURL(/\/console\/look\/customize$/)
      await riya.frameLocator(FRAME).locator('[data-section]').first().waitFor()
    })

    await t.step('Site settings: a palette that does not read is refused as it is picked; a good one saves', async () => {
      await riya.getByRole('button', { name: 'Site settings' }).click()
      await riya.getByRole('heading', { name: 'Site settings' }).waitFor()
      await riya.getByRole('switch', { name: 'My own palette' }).click()
      await riya.getByRole('status').filter({ hasText: 'Reads well' }).waitFor()
      await saved((s) => !!s.site?.palette)
      const good = (await draft()).site.palette
      await riya.getByLabel('Text', { exact: true }).fill('#EEEEEE')
      await riya.getByRole('alert').filter({ hasText: 'hard to read' }).waitFor()
      await riya.waitForTimeout(1200)
      assert.equal((await draft()).site.palette.text, good.text, 'an unreadable palette is never saved')
      await riya.screenshot({ path: t.out('site-colours') })
      await riya.getByLabel('Text', { exact: true }).fill(good.text.toLowerCase())
      await riya.getByRole('status').filter({ hasText: 'Reads well' }).waitFor()
    })

    await t.step('Site settings: a text style and the duotone icons', async () => {
      await riya.getByRole('button', { name: /^Text styles/ }).click()
      await riya.getByRole('button', { name: /^Heading 2/ }).click()
      const size = riya.getByLabel(/^Computer · \d+ px$/)
      await size.focus()
      for (let i = 0; i < 8; i++) await riya.keyboard.press('ArrowRight')
      await riya.getByRole('switch', { name: 'Capitals' }).click()
      await saved((s) => s.site?.text?.h2?.desk === 28 && s.site.text.h2.upper === true)
      await riya.getByRole('button', { name: /^Icons/ }).click()
      await riya.getByRole('radio', { name: /Duotone/ }).click()
      await saved((s) => s.site?.icons?.library === 'duotone')
      await riya.screenshot({ path: t.out('site-type-icons') })
      await riya.getByRole('button', { name: '‹ Bazaar' }).click()
    })

    await t.step('Menus are the store’s content (V1): the Look’s Menus tab opens Console › Content', async () => {
      await riya.getByRole('tab', { name: 'Menus' }).click()
      const link = riya.getByRole('link', { name: /Edit in Content/ })
      await link.waitFor()
      assert.match(await link.getAttribute('href') ?? '', /\/console\/content\?tab=menus$/)
      await riya.screenshot({ path: t.out('menus-link') })
    })

    await t.step('Each page opens in the preview: Shop all, Bag, Checkout; Style › Products opens a collection', async () => {
      const f = riya.frameLocator(FRAME)
      for (const [v, name, sees] of [['all', 'Shop all', f.getByRole('heading', { level: 1, name: 'Shop all' })], ['bag', 'Bag', f.getByRole('heading', { level: 1, name: 'Your bag' })], ['checkout', 'Checkout', f.getByRole('heading', { level: 1, name: 'Checkout' })]]) {
        await riya.getByLabel('Page').selectOption(v)
        await riya.getByText(`Editing: ${name}`).waitFor()
        await sees.waitFor()
      }
      await riya.waitForTimeout(400)
      await riya.screenshot({ path: t.out('checkout-preview') })
      await riya.getByLabel('Page').selectOption('home')
      await riya.getByRole('tab', { name: 'Style' }).click()
      await riya.getByRole('button', { name: /^Products/ }).click()
      await riya.getByText('Editing: Collection page').waitFor()
    })

    await t.step('The panel folds to a rail; a rail icon opens it where it points', async () => {
      await riya.getByRole('button', { name: 'Fold the panel' }).click()
      await riya.waitForTimeout(300)
      await riya.screenshot({ path: t.out('folded') })
      await riya.getByRole('button', { name: 'Menus', exact: true }).click()
      await riya.getByRole('link', { name: /Edit in Content/ }).waitFor()
      // On a phone: the merchant's tabs, each an icon and words.
      await riya.getByLabel('Page').selectOption('home')
      await riya.getByRole('button', { name: 'Phone', exact: true }).click()
      await riya.frameLocator(FRAME).getByRole('navigation', { name: 'Shop tabs' }).getByText('Shop').waitFor()
      await riya.waitForTimeout(500)
      await riya.screenshot({ path: t.out('phone-tabs') })
      await riya.getByRole('button', { name: 'Computer', exact: true }).click()
    })

    await t.step('Published: the shop wears the text style and the duotone icons', async () => {
      await riya.getByRole('button', { name: 'Publish', exact: true }).click()
      const d = riya.getByRole('dialog', { name: 'Publish Bazaar?' })
      await d.waitFor()
      // A sample photo fills the preview only: a photo section still needs the merchant's own before Publish.
      if (await d.getByRole('button', { name: 'Publish', exact: true }).isDisabled()) {
        await d.getByRole('button', { name: 'Not yet' }).click()
        await riya.getByRole('tab', { name: /Sections/ }).click()
        for (const b of await riya.getByRole('button', { name: /^Hide (Hero|Photo|Shop the look|Banner)/ }).all()) await b.click()
        await riya.waitForTimeout(1200)
        await riya.getByRole('button', { name: 'Publish', exact: true }).click()
      }
      await d.getByRole('button', { name: 'Publish', exact: true }).click()
      await riya.getByRole('dialog', { name: 'Your store has its new look' }).waitFor()
      await until(async () => /data-t-h2/.test(await shopHtml()), 15_000)
      const home = await shopHtml()
      assert.match(home, /viewBox="0 0 256 256"/, 'duotone icons on the shop')
      assert.ok(!/M3\.103 6\.034h17\.794/.test(home), 'no line icon paths once the shop is duotone')
    })

    await t.step('Content › Menus: a link with an icon, moved under the one above, saved live; phone tabs of the merchant’s own', async () => {
      await riya.goto(CONSOLE + '/console/content?tab=menus')
      const main = riya.getByRole('region', { name: /Main menu/ })
      await main.getByRole('button', { name: 'Add a link' }).click()
      const add = riya.getByRole('dialog', { name: 'Add a link' })
      await add.getByLabel('Label').fill('Festive sale')
      await add.getByLabel('Opens').selectOption('/products')
      await add.getByLabel('Icon').selectOption('flame')
      await add.getByRole('button', { name: 'Add link' }).click()
      await main.getByRole('button', { name: 'More for Festive sale' }).click()
      await riya.getByRole('menuitem', { name: /^Move under / }).click()
      await main.getByRole('button', { name: 'Save main menu' }).click()
      await riya.getByText('Main menu saved').first().waitFor()
      const row = async () => (await db`select value from site_content where tenant_id = ${KESAR} and kind = 'menu' and key = 'main'`)[0]?.value ?? []
      await until(async () => (await row()).some((x) => x.children.some((c) => c.label === 'Festive sale' && c.icon === 'flame' && c.link === '/products')), 10_000)
      await riya.screenshot({ path: t.out('menus-main') })
      const tabs = riya.getByRole('region', { name: /Phone tabs/ })
      for (const [label, link, icon] of [['Home', '/', 'home'], ['Shop', '/products', 'grid'], ['Help', '/policies/contact', 'chat']]) {
        await tabs.getByRole('button', { name: 'Add a tab' }).click()
        const d = riya.getByRole('dialog', { name: 'Add a tab' })
        await d.getByLabel('Label').fill(label); await d.getByLabel('Opens').selectOption(link); await d.getByLabel('Icon').selectOption(icon)
        await d.getByRole('button', { name: 'Add tab' }).click()
      }
      await tabs.getByRole('button', { name: 'Save phone tabs' }).click()
      await riya.getByText('Phone tabs saved').first().waitFor()
      await riya.screenshot({ path: t.out('menus-tabs') })
      await until(async () => /Festive sale/.test(await shopHtml()) && /Help/.test(await shopHtml()), 45_000)
      assert.match(await shopHtml(), /aria-label="Shop tabs"/, 'the phone tabs')
    })

    await t.step('Undo last publish takes the look back; the menus stay (they are content)', async () => {
      await riya.goto(CONSOLE + '/console/look')
      await riya.getByRole('button', { name: 'More' }).click()
      await riya.getByRole('menuitem', { name: 'Undo last publish' }).click()
      await riya.getByRole('dialog', { name: /back on your store\?$/ }).getByRole('button', { name: 'Put it back' }).click()
      await until(async () => !/data-t-h2/.test(await shopHtml()), 15_000)
      assert.match(await shopHtml(), /Festive sale/, 'menus are the store’s content, not the look’s')
      await db`delete from site_content where tenant_id = ${KESAR} and kind = 'menu'`
    })
  },
}
