// =============================================================================
// FLOW: pages, the FAQ and the Contact line, saved live from Console › Content (V1 content, plan
// docs/plans/2026-11-15-v1-content.md; was Theme Studio TS1a's Look flow). Add an About page (hidden while its example
// words stand: showing it is refused until they are the store's own), write its words and show it; give Contact its
// line; add the FAQ (its pay-on-delivery answer comes from Settings) with a question of the store's own: the shop shows
// /pages/<handle>, the line at /policies/contact and the FAQ, the sitemap lists the pages. Hiding a page takes it off.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { CONSOLE, PORTS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const get = (path) => new Promise((res, rej) => http.get(`http://localhost:${PORTS.app}${path}`, { headers: { host: 'kesar-studio.frata.test' } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b })) }).on('error', rej))
const shopSays = (path, re, want = true) => until(async () => { const r = await get(path); return re.test(r.body) === want }, 45_000)

export default {
  name: 'pages',
  async run(t) {
    const { db } = t
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    try {
      await t.step('Add a page: About starts hidden; showing it with example words is refused', async () => {
        await p.goto(CONSOLE + '/console/content?tab=pages')
        await p.getByRole('region', { name: 'Pages' }).getByRole('button', { name: 'Add a page' }).first().click()
        const add = p.getByRole('dialog', { name: 'Add a page' })
        await add.getByLabel('Title').fill('Our story')
        await add.getByRole('button', { name: 'Add page' }).click()
        await p.getByText('Our story added').waitFor()
        await p.getByRole('region', { name: 'Pages' }).getByText('Hidden').waitFor()
        assert.equal((await get('/pages/our-story')).status, 404, 'a hidden page is not on the shop')
        await p.getByRole('button', { name: 'Edit Our story' }).click()
        const d = p.getByRole('dialog', { name: 'Our story' })
        await d.getByRole('switch', { name: 'Show on your store' }).click()
        await d.getByRole('button', { name: 'Save' }).click()
        await d.locator('[role="alert"], [data-dialog-error]').first().waitFor()
        await p.screenshot({ path: t.out('pages-example-refused') })
      })

      await t.step('Its words written and shown: the page is on the shop at once', async () => {
        const d = p.getByRole('dialog', { name: 'Our story' })
        await d.getByLabel(/^Your story/).fill('Kesar began in 2019 with two looms in Sanganer.')
        for (const n of [1, 2, 3]) {
          await d.getByLabel(new RegExp(`^Card ${n}: title`)).fill(['Handloom', 'Natural dyes', 'Hand-finished'][n - 1])
          await d.getByLabel(new RegExp(`^Card ${n}: words`)).fill(['A metre a day.', 'Indigo and madder.', 'Hemmed by hand.'][n - 1])
        }
        await d.getByRole('button', { name: 'Save' }).click()
        await p.getByText('Our story saved').waitFor()
        await shopSays('/pages/our-story', /Kesar began in 2019 with two looms in Sanganer\./)
        const about = (await get('/pages/our-story')).body
        assert.ok(!/\/themes\/samples\/|data-example|Tell shoppers how your brand began/.test(about), 'no sample or example on the shop')
        assert.match(about, /<h1[^>]*>Our story/)
        await shopSays('/sitemap.xml', /\/pages\/our-story<\/loc>/)
      })

      await t.step('The Contact line, saved live', async () => {
        await p.goto(CONSOLE + '/console/content?tab=contact')
        await p.getByLabel(/^Line/).fill('We reply on WhatsApp within the day.')
        await p.getByRole('button', { name: 'Save' }).click()
        await p.getByText('Contact line saved').waitFor()
        await shopSays('/policies/contact', /We reply on WhatsApp within the day\./)
        assert.match((await get('/policies/contact')).body, /Chat on WhatsApp/)
      })

      await t.step('The FAQ: an answer from Settings and one of the store’s own', async () => {
        await p.goto(CONSOLE + '/console/content?tab=faq')
        await p.getByRole('button', { name: /^Add “Can I pay on delivery/ }).click()
        await p.getByText('Question added').waitFor()
        await p.getByRole('region', { name: 'Questions' }).getByRole('button', { name: 'Add a question' }).click()
        const d = p.getByRole('dialog', { name: 'Add a question' })
        await d.getByLabel(/^Question/).fill('How do I care for it?')
        await d.getByLabel(/^Answer/).fill('Hand wash cold, dry in the shade.')
        await d.getByRole('button', { name: 'Save' }).click()
        await p.getByRole('region', { name: 'Questions' }).getByText('How do I care for it?').waitFor()
        await p.screenshot({ path: t.out('pages-faq') })
        await shopSays('/pages/faq', /Hand wash cold, dry in the shade\./)
        assert.match((await get('/pages/faq')).body, /Pay on delivery is available/, 'the pay-on-delivery answer comes from Settings')
      })

      await t.step('Hidden: the page leaves the shop', async () => {
        await p.goto(CONSOLE + '/console/content?tab=pages')
        await p.getByRole('button', { name: 'Edit Our story' }).click()
        const d = p.getByRole('dialog', { name: 'Our story' })
        await d.getByRole('switch', { name: 'Show on your store' }).click()
        await d.getByRole('button', { name: 'Save' }).click()
        await p.getByText('Our story saved').waitFor()
        await until(async () => (await get('/pages/our-story')).status === 404, 45_000)
      })
    } finally {
      await ctx.close()
      await db.begin(async (x) => { await x`set local session_replication_role = replica`; await x`delete from shop_pages where tenant_id = ${KESAR}`; await x`delete from site_content where tenant_id = ${KESAR} and kind = 'contact'` })
    }
  },
}
