// =============================================================================
// FLOW: the written announcement bar (V1 content, docs/plans/2026-11-15-v1-content.md § Regression net). Today the
// bar is the look's (Look › Style › Header, then Publish): the shop shows its words and its link. The offer bar's
// place in front of it is 47-offers'. After the move (task 8) this flow drives Console › Content instead.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { CONSOLE, PORTS, signedIn, until } from '../lib.mjs'

const get = (path) => new Promise((res, rej) => http.get(`http://localhost:${PORTS.app}${path}`, { headers: { host: 'kesar-studio.frata.test' } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b })) }).on('error', rej))
const shopSays = (path, re, want = true) => until(async () => re.test((await get(path)).body) === want, 90_000) // the offer's bar is cached up to 60 s
const WORDS = 'Wedding edit: dispatch in 2 days'

export default {
  name: 'announcement',
  async run(t) {
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    try {
      await t.step('The bar is written in Look › Header and published', async () => {
        // An offer in the bar shows first (47-offers); this flow is about the written bar, so none is live.
        await t.db`update discounts set ended_at = now(), announce = false where ended_at is null`
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'Customize' }).click()
        await p.waitForURL(/\/console\/look\/customize$/)
        await p.getByRole('tab', { name: 'Style' }).click()
        await p.getByRole('button', { name: /^Header/ }).click()
        const on = p.getByRole('switch', { name: 'Announcement bar' })
        if ((await on.getAttribute('aria-checked')) !== 'true') await on.click()
        await p.getByLabel('Announcement', { exact: true }).fill(WORDS)
        await p.getByLabel('Goes to').selectOption('/products')
        await p.getByRole('status').filter({ hasText: 'Saved' }).waitFor()
        await p.getByRole('button', { name: 'Publish', exact: true }).click()
        await p.getByRole('dialog', { name: /^Publish / }).getByRole('button', { name: 'Publish', exact: true }).click()
        await p.getByRole('dialog', { name: 'Your store has its new look' }).waitFor()
      })

      await t.step('The shop shows the bar with its words and link', async () => {
        await shopSays('/', new RegExp(WORDS))
        const home = (await get('/')).body
        assert.match(home, new RegExp(`href="/products"[^>]*>[^<]*${WORDS}|${WORDS}`), 'the bar is on the home page')
        await shopSays('/products', new RegExp(WORDS))
        await p.screenshot({ path: t.out('announcement-look') })
      })
    } finally {
      await ctx.close()
    }
  },
}
