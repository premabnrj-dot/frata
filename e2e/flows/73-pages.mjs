// =============================================================================
// FLOW: Theme Studio TS1a (docs/plans/2026-11-11-theme-studio-ts1.md; board v2). In Look: add an About page, write its
// words (examples block Publish until then), give Contact its line, add the FAQ (its pay-on-delivery, delivery and
// returns answers come from Settings), publish: the shop shows /pages/<handle> and the line at /policies/contact, the
// sitemap lists the pages; nothing showed before Publish. Undo takes the FAQ back off the shop.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { CONSOLE, PORTS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const FRAME = 'iframe[title="Your shop with this look"]'
const get = (path) => new Promise((res, rej) => http.get(`http://localhost:${PORTS.app}${path}`, { headers: { host: 'kesar-studio.frata.test' } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b })) }).on('error', rej))
const shopSays = (path, re, want = true) => until(async () => { const r = await get(path); return re.test(r.body) === want }, 15_000)

export default {
  name: 'pages',
  async run(t) {
    const { db } = t
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    const pick = (label) => p.locator('#page-pick').selectOption({ label })
    const frame = () => p.frameLocator(FRAME)
    try {
      await t.step('Add a page: About opens with its examples marked; nothing is on the shop yet', async () => {
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'Customize' }).click()
        await p.waitForURL(/\/console\/look\/customize$/)
        await p.locator('#page-pick').selectOption('+page')
        const add = p.getByRole('dialog', { name: 'Add a page' })
        await add.getByRole('button', { name: /^About/ }).click()
        await p.getByRole('heading', { name: 'Our story', level: 2 }).waitFor()
        await frame().getByRole('heading', { name: 'Our story', level: 1 }).waitFor()
        await frame().locator('[data-example]').first().waitFor({ state: 'attached' })
        await p.screenshot({ path: t.out('pages-about') })
        assert.equal((await get('/pages/our-story')).status, 404, 'a draft page is not on the shop')
      })

      await t.step('Its words written, Contact given a line, the FAQ added with answers from Settings', async () => {
        await p.getByLabel(/^Your story/).fill('Kesar began in 2019 with two looms in Sanganer.')
        for (const n of [1, 2, 3]) {
          await p.getByLabel(new RegExp(`^Card ${n}: title`)).fill(['Handloom', 'Natural dyes', 'Hand-finished'][n - 1])
          await p.getByLabel(new RegExp(`^Card ${n}: words`)).fill(['A metre a day.', 'Indigo and madder.', 'Hemmed by hand.'][n - 1])
        }
        await frame().getByText('Kesar began in 2019 with two looms in Sanganer.').waitFor()
        await pick('Contact')
        await p.getByLabel('A line above (optional)').fill('We reply on WhatsApp within the day.')
        await frame().getByText('We reply on WhatsApp within the day.').waitFor()
        await p.locator('#page-pick').selectOption('+page')
        await p.getByRole('dialog', { name: 'Add a page' }).getByRole('button', { name: /^FAQ/ }).click()
        await p.getByText('From your settings').first().waitFor()
        await p.getByLabel('Answer 4').fill('Hand wash cold, dry in the shade.')
        await p.getByLabel('Answer 5').fill('Some pieces are made when you order: their page says how long.')
        await frame().getByText('Can I pay on delivery?').waitFor()
        await p.screenshot({ path: t.out('pages-faq') })
        await until(async () => { const r = await db`select count(*)::int n from shop_pages where tenant_id = ${KESAR} and draft::text like ${'%Some pieces are made%'}`; return r[0].n === 1 }, 10_000)
      })

      await t.step('Published: the pages and Contact\'s line are on the shop, and in the sitemap', async () => {
        await p.getByRole('button', { name: 'Publish', exact: true }).click()
        await p.getByRole('dialog', { name: /^Publish / }).getByRole('button', { name: 'Publish', exact: true }).click()
        await p.getByRole('dialog', { name: 'Your shop has its new look' }).waitFor()
        await shopSays('/pages/our-story', /Kesar began in 2019 with two looms in Sanganer\./)
        const about = (await get('/pages/our-story')).body
        assert.ok(!/\/themes\/samples\/|data-example|Tell shoppers how your brand began/.test(about), 'no sample or example on the shop')
        assert.match(about, /<h1[^>]*>Our story/)
        const faq = (await get('/pages/faq')).body
        assert.match(faq, /Pay on delivery is available/, 'the pay-on-delivery answer comes from Settings')
        assert.match(faq, /Hand wash cold, dry in the shade\./)
        await shopSays('/policies/contact', /We reply on WhatsApp within the day\./)
        assert.match((await get('/policies/contact')).body, /Chat on WhatsApp/)
        await shopSays('/sitemap.xml', /\/pages\/our-story<\/loc>/)
      })

      await t.step('Undo last publish: the pages and Contact’s line leave the shop with it', async () => {
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'More' }).click()
        await p.getByRole('menuitem', { name: 'Undo last publish' }).click()
        await p.getByRole('dialog', { name: /back on your shop\?$/ }).getByRole('button', { name: 'Put it back' }).click()
        await until(async () => (await get('/pages/faq')).status === 404, 15_000)
        assert.equal((await get('/pages/our-story')).status, 404)
        await shopSays('/policies/contact', /We reply on WhatsApp within the day\./, false)
      })
    } finally {
      await ctx.close()
      await db.begin(async (x) => { await x`set local session_replication_role = replica`; await x`delete from shop_pages where tenant_id = ${KESAR}` })
    }
  },
}
