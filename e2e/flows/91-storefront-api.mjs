// =============================================================================
// FLOW: storefront-api (V1 Storefront API SA1·1; plan docs/plans/2026-11-15-v1-storefront-api.md; mockup
// docs/mockups/2026-11-15-storefront-keys.html). The owner points the store's Website at its connected domain, makes a
// live key (shown once), reads the store through the API host with it, and deletes it: the key stops. With no domain
// the page says to connect one. Staff never open it. Phone: no sideways scroll. Puts everything back.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { CONSOLE, OWN_DOMAIN, PORTS, expectToast, signedIn } from '../lib.mjs'

const API = 'api.localhost'
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  return p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
}
const get = (path) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port: PORTS.app, path, headers: { host: API } }, (m) => { let b = ''; m.on('data', (d) => (b += d)); m.on('end', () => res({ status: m.statusCode, body: b })) })
  r.on('error', rej); r.end()
})

export default {
  name: 'storefront-api',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const domain = '0f0f0f0f-0000-4000-8000-000000000091'
    await db`delete from storefront_keys where tenant_id = ${T}`
    await db`update shop_settings set site_origin = null, site_domain_id = null where tenant_id = ${T}`
    await db`delete from shop_domains where id = ${domain}`
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('no connected domain: the page says to connect one', async () => {
        await p.goto(`${CONSOLE}/console/settings/website`)
        await p.getByRole('heading', { level: 1, name: 'Website' }).waitFor()
        await p.getByRole('radio', { name: /Your own website/ }).click()
        await p.getByRole('link', { name: 'Connect domain' }).waitFor()
      })

      await db`insert into shop_domains (id, tenant_id, host, apex, with_www, claimed_by, proved_at, cert_ok_at) values (${domain}, ${T}, ${'shop.' + OWN_DOMAIN}, ${OWN_DOMAIN}, false, ${'cccccccc-0000-0000-0000-000000000001'}, now(), now())`

      await t.step('the owner points the Website at the domain and saves', async () => {
        await p.reload()
        await p.getByRole('radio', { name: /Your own website/ }).click()
        await p.getByRole('combobox', { name: 'Website address' }).waitFor()
        await p.getByText('From 1 Jan 2027').waitFor()
        await p.getByLabel('Unsaved changes').getByRole('button', { name: /^Save/ }).click()
        await expectToast(p, 'Saved', 'ok')
        await p.getByRole('heading', { name: 'Keys' }).waitFor()
        const [s] = await db`select site_origin from shop_settings where tenant_id = ${T}`
        assert.equal(s.site_origin, `https://${OWN_DOMAIN}`)
        await p.screenshot({ path: t.out('website-1280'), fullPage: true })
        const v = await audit(p); assert.deepEqual(v, [], `axe: ${v.join('; ')}`)
      })

      let key = ''
      await t.step('a live key is shown once, and reads the store through the API host', async () => {
        await p.getByRole('button', { name: 'Create key' }).click()
        const dialog = p.getByRole('dialog', { name: 'Create key' })
        await dialog.getByRole('button', { name: 'Create key' }).click()
        await dialog.getByText('Copy this key now. We show it once.').waitFor()
        key = (await dialog.textContent()).match(/frs_pub_[0-9A-Za-z]{38}/)?.[0] ?? ''
        assert.ok(key, 'the key is on screen once')
        await dialog.getByRole('button', { name: 'Done' }).click()
        await p.getByText(key.slice(0, 14)).waitFor()
        assert.ok(!(await p.content()).includes(key), 'the whole key never shows again')
        const shop = await get(`/2026-12/k/${key}/shop`)
        assert.equal(shop.status, 200, shop.body.slice(0, 200))
        assert.equal(JSON.parse(shop.body).siteOrigin, `https://${OWN_DOMAIN}`)
        assert.equal((await get(`/2026-12/k/${key}/content`)).status, 200)
      })

      await t.step('deleting the key stops it', async () => {
        await p.getByRole('button', { name: 'Delete', exact: true }).click()
        await p.getByRole('dialog').getByRole('button', { name: 'Delete key' }).click()
        await expectToast(p, 'deleted', 'ok')
        let status = 0
        for (let i = 0; i < 10 && status !== 404; i++) { status = (await get(`/2026-12/k/${key}/shop`)).status; if (status !== 404) await new Promise((r) => setTimeout(r, 500)) }
        assert.equal(status, 404, 'a deleted key still answers')
      })

      await t.step('a phone: no sideways scroll', async () => {
        await p.setViewportSize({ width: 390, height: 844 })
        await p.reload()
        await p.getByRole('heading', { level: 1, name: 'Website' }).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
        await p.screenshot({ path: t.out('website-390'), fullPage: true })
      })
    } finally {
      await owner.close()
      await db`delete from storefront_keys where tenant_id = ${T}`
      await db`update shop_settings set site_origin = null, site_domain_id = null where tenant_id = ${T}`
      await db`delete from shop_domains where id = ${domain}`
    }
  },
}
