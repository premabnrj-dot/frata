// =============================================================================
// FLOW: Theme Studio TS0b (docs/plans/2026-11-11-theme-studio-ts0b.md; board v2). Signal 1.4's designs in Look: Size
// help is added from the library, its preview shows the theme's sample photo and example words (marked); Publish
// waits until the owner writes their own; once published, the shop shows the owner's words and never a sample or an
// example. Undo puts the shop back; the flow removes its revisions, publishes and release rows.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { CONSOLE, PORTS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const FRAME = 'iframe[title="Your shop with this look"]'
const shopHtml = (path = '/') => new Promise((res, rej) => http.get(`http://localhost:${PORTS.app}${path}`, { headers: { host: 'kesar-studio.frata.test' } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(b)) }).on('error', rej))
const shopSays = (re, want = true) => until(async () => re.test(await shopHtml()) === want, 15_000)

export default {
  name: 'designs',
  async run(t) {
    const { db } = t
    const [{ sells }] = await db`select sells from shop_settings where tenant_id = ${KESAR}`
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    const frame = () => p.frameLocator(FRAME)
    try {
      await t.step('Signal 1.4 in a draft: Size help from the library, the preview shows its sample and examples, marked', async () => {
        // A release decision is final (the trigger): an earlier flow's Signal rows go first, as 65-signal does.
        await db.begin(async (x) => { await x`set local session_replication_role = replica`; await x`delete from theme_versions where theme_key = 'signal'` })
        await db`insert into theme_versions (theme_key, version, released_at) values ('signal', '1.0.0', now()), ('signal', '1.1.0', now()), ('signal', '1.2.0', now()), ('signal', '1.3.0', now()), ('signal', '1.4.0', now()) on conflict (theme_key, version) do update set released_at = now(), recalled_at = null, withdrawn_at = null`
        await db`update shop_settings set sells = '{accessories}' where tenant_id = ${KESAR}`
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'Signal', exact: true }).click()
        await p.getByRole('dialog', { name: 'Signal' }).getByRole('button', { name: 'Try Signal in a draft' }).click()
        const ask = p.getByRole('dialog', { name: 'Try Signal?' })
        await Promise.race([ask.waitFor().then(() => ask.getByRole('button', { name: 'Try Signal' }).click()), p.waitForURL(/\/console\/look\/customize$/)])
        await p.waitForURL(/\/console\/look\/customize$/)
        const [rev] = await db`select theme_version from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' order by updated_at desc limit 1`
        assert.equal(rev.theme_version, '1.4.0')
        // An empty home, so only the design decides Publish (Signal's own Hero and Image with text want photos).
        await db`update shop_theme_revisions set settings = jsonb_set(settings, '{home}', '[]'::jsonb) where tenant_id = ${KESAR} and theme_key = 'signal' and id not in (select revision_id from shop_theme_publishes)`
        await p.reload()
        await p.getByRole('tab', { name: 'Sections' }).click()
        await p.getByRole('button', { name: 'Add a section', exact: true }).click()
        const lib = p.getByRole('dialog', { name: 'Add a section' })
        await lib.getByRole('button', { name: /^Designs/ }).click()
        await lib.getByRole('button', { name: /^Made by hand/ }).waitFor()
        await p.screenshot({ path: t.out('designs-library') })
        await lib.getByRole('button', { name: /^Size help/ }).click()
        await p.getByRole('heading', { name: 'Size help', level: 2 }).waitFor()
        const d = frame().locator('[data-design="size-help"]')
        await d.waitFor()
        await d.locator('[data-example]').first().waitFor({ state: 'attached' })
        assert.match(await d.locator('img').first().getAttribute('src') ?? '', /\/themes\/samples\/tan-loafer-b/, 'the preview shows the theme\'s sample photo')
        await p.screenshot({ path: t.out('designs-fill') })
      })

      await t.step('Publish waits for the owner\'s own words, and names what to write', async () => {
        await p.getByRole('button', { name: 'Publish', exact: true }).click()
        await p.getByRole('alert').getByText('Size help: write your own words for “How your sizes run”').waitFor()
        await p.screenshot({ path: t.out('designs-blocked') })
        await p.keyboard.press('Escape')
      })

      await t.step('Written: the preview follows; published, the shop shows the owner\'s words, never a sample or an example', async () => {
        await p.getByLabel(/^How your sizes run/).fill('Our sizes run true. Between two? Go up one.')
        for (const [i, a] of [[1, 'Measure in cm at the end of the day.'], [2, 'Go up one size.'], [3, 'Yes, within 7 days, unworn.']]) await p.getByLabel(`Answer ${i}`).fill(a)
        await frame().getByText('Our sizes run true. Between two? Go up one.').waitFor()
        await until(async () => { const [r] = await db`select settings from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' order by updated_at desc limit 1`; return JSON.stringify(r.settings).includes('Yes, within 7 days, unworn.') }, 10_000)
        await p.getByRole('button', { name: 'Publish', exact: true }).click()
        await p.getByRole('dialog', { name: 'Publish Signal?' }).getByRole('button', { name: 'Publish', exact: true }).click()
        await p.getByRole('dialog', { name: 'Your shop has its new look' }).waitFor()
        await shopSays(/Our sizes run true/)
        const html = await shopHtml()
        assert.ok(html.includes('data-design="size-help"'), 'the design is on the shop')
        assert.ok(html.includes('Yes, within 7 days, unworn.'), 'the owner\'s answers are on the shop')
        assert.ok(!/\/themes\/samples\//.test(html), 'no sample photo on the shop')
        assert.ok(!/leather gives a little|data-example/.test(html), 'no example words on the shop')
        assert.ok(/<h2[^>]*>.*Find your size/.test(html), 'the design\'s heading is an h2')
      })

      await t.step('Undo last publish: the design leaves the shop', async () => {
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'More' }).click()
        await p.getByRole('menuitem', { name: 'Undo last publish' }).click()
        await p.getByRole('dialog', { name: /back on your shop\?$/ }).getByRole('button', { name: 'Put it back' }).click()
        await shopSays(/data-design="size-help"/, false)
      })
    } finally {
      await ctx.close()
      await db`update shop_settings set sells = ${sells} where tenant_id = ${KESAR}`
      await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        await x`delete from shop_theme_publishes where tenant_id = ${KESAR} and revision_id in (select id from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal')`
        await x`delete from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal'`
        await x`delete from theme_versions where theme_key = 'signal'`
      })
    }
  },
}
