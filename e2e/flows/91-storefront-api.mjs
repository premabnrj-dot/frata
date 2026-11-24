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
import { createHash, randomInt } from 'node:crypto'
import { crc32 } from 'node:zlib'
import { CONSOLE, OWN_DOMAIN, PORTS, expectToast, openStore, signedIn } from '../lib.mjs'

const API = 'api.localhost'
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  return p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
}
const get = (path, more = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port: PORTS.app, path, headers: { host: API, ...more } }, (m) => { let b = ''; m.on('data', (d) => (b += d)); m.on('end', () => res({ status: m.statusCode, body: b, headers: m.headers })) })
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
      await t.step('no connected domain: the frrata name and Connect my domain (D0·1)', async () => {
        await p.goto(`${CONSOLE}/console/settings/website`)
        await p.getByRole('heading', { level: 1, name: 'Website' }).waitFor()
        await p.getByRole('radio', { name: /Your own website/ }).click()
        await p.getByRole('link', { name: 'Connect my domain' }).waitFor()
        await p.getByText(/^kesar-studio\./).first().waitFor()
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

      await t.step('twenty live keys on a phone: the count, Create key held, its reason, still no sideways scroll', async () => {
        for (let i = 0; i < 20; i++) await db`insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by) values
          (${T}, 'public', ${'Site ' + i}, ${String(i).padStart(64, 'a')}, ${'frs_pub_' + String(i).padStart(6, '0')}, ${'cccccccc-0000-0000-0000-000000000001'})`
        await p.reload()
        await p.getByText('20 of 20').waitFor()
        await p.getByText('Delete a key to make another.').waitFor()
        assert.equal(await p.getByRole('button', { name: 'Create key' }).getAttribute('aria-disabled'), 'true')
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll with 20 keys')
        await p.screenshot({ path: t.out('website-20-390'), fullPage: true })
      })

      // Test keys before a domain (owner 2026-11-16; migration 0149; security review HIGH-1): Run on Frrata deletes the
      // store's test keys, and with no Website at all a test key answers on a store never opened.
      // A key as newKey makes one (src/domains/storefront-api/keys.ts): 32 base62 characters, then a 6-character CRC-32
      // checksum in base62, so keyShape lets it through to the lookup.
      const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
      const testKey = (kind = 'frs_test_') => {
        const head = kind + Array.from({ length: 32 }, () => B62[randomInt(62)]).join('')
        let n = crc32(head), check = ''
        for (let i = 0; i < 6; i++) { check = B62[n % 62] + check; n = Math.floor(n / 62) }
        return head + check
      }
      const addTest = async (k) => db`insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by, expires_at) values
        (${T}, 'test', ${'Preview ' + k.slice(9, 13)}, ${createHash('sha256').update(k).digest('hex')}, ${k.slice(0, 15)}, ${'cccccccc-0000-0000-0000-000000000001'}, now() + interval '30 days')`
      const [{ first_opened_at: opened }] = await db`select first_opened_at from tenants where id = ${T}`
      await db`delete from storefront_keys where tenant_id = ${T} and kind = 'public'`
      await db`update tenants set first_opened_at = null where id = ${T}`
      try {
        await t.step('Run on Frrata deletes the test keys; with no Website a test key answers before the store opens', async () => {
          const k1 = testKey(); await addTest(k1)
          assert.equal((await get(`/2026-12/k/${k1}/shop`)).status, 200, 'a test key with the Website set')
          await p.setViewportSize({ width: 1280, height: 900 })
          await p.reload()
          await p.getByRole('radio', { name: /Runs on Frrata/ }).click()
          await p.getByLabel('Unsaved changes').getByRole('button', { name: /^Save/ }).click()
          const confirm = p.getByRole('dialog', { name: 'Run your website on Frrata?' })
          await confirm.getByText('Test and build keys are deleted.', { exact: false }).waitFor()
          await confirm.getByRole('button', { name: 'Run on Frrata' }).click()
          await expectToast(p, 'Saved', 'ok')
          const [r] = await db`select revoked_at, revoked_by from storefront_keys where hash = ${createHash('sha256').update(k1).digest('hex')}`
          assert.ok(r.revoked_at && r.revoked_by, 'Run on Frrata deleted the test key')
          let status = 0
          for (let i = 0; i < 10 && status !== 404; i++) { status = (await get(`/2026-12/k/${k1}/shop`)).status; if (status !== 404) await new Promise((res) => setTimeout(res, 500)) }
          assert.equal(status, 404, 'a test key deleted by Run on Frrata still answers')
          const k2 = testKey(); await addTest(k2)
          assert.equal((await get(`/2026-12/k/${k2}/shop`)).status, 200, 'a test key with no Website, store not open')
          await p.reload()
          await p.getByRole('heading', { name: 'Keys' }).waitFor()
          await p.getByText(k2.slice(0, 14)).waitFor()
        })

        // G·2 (Studio plan; ADR-0018's build-key amendment): a build key travels in the Frrata-Key header to the header
        // tree only, reads drafts, is never cached and carries no CORS header; the owner sees it with its end and deletes it,
        // and it stops at once (looked up uncached).
        await t.step('a build key reads drafts in the Frrata-Key header only, never cached, no CORS; the owner deletes it and it stops at once', async () => {
          const bk = testKey('frs_build_'), k3 = testKey(); await addTest(k3)
          await db`insert into storefront_keys (tenant_id, kind, purpose, name, hash, prefix, created_by, expires_at) values
            (${T}, 'build', 'developer', 'Kabir’s computer', ${createHash('sha256').update(bk).digest('hex')}, ${bk.slice(0, 16)}, ${'cccccccc-0000-0000-0000-000000000001'}, now() + interval '24 hours')`
          const [draft] = await db`select handle from products where tenant_id = ${T} and status = 'draft' limit 1`
          const H = { 'frrata-key': bk, origin: 'http://localhost:3000' }
          const shop = await get('/2026-12/shop', H)
          assert.equal(shop.status, 200, shop.body.slice(0, 200))
          assert.equal(shop.headers['cache-control'], 'private, no-store')
          assert.deepEqual(Object.keys(shop.headers).filter((h) => h.startsWith('access-control-')), [], 'no CORS header on the header tree')
          if (draft) assert.equal((await get(`/2026-12/products/${draft.handle}`, H)).status, 200, 'a build key reads a draft product')
          // the header never reaches a cached route, and a build key never answers in a path or without its header
          assert.equal((await get(`/2026-12/k/${k3}/shop`, { 'frrata-key': bk })).status, 404, 'a key path with the header matched a key tree')
          assert.equal((await get(`/2026-12/k/${k3}/shop`)).status, 200, 'the test key itself still reads')
          assert.equal((await get(`/2026-12/k/${bk}/shop`)).status, 404, 'a build key answered in the path')
          assert.equal((await get('/2026-12/shop', { 'frrata-key': k3 })).status, 404, 'a test key answered in the header')
          assert.equal((await get('/2026-12/shop')).status, 404, 'the header tree answered with no header')
          await p.reload()
          const row = p.getByRole('listitem').filter({ hasText: 'Kabir’s computer' })
          await row.getByText(/^Build · ends /).waitFor()
          await row.getByText(bk.slice(0, 14)).waitFor()
          await p.screenshot({ path: t.out('website-build-key-1280'), fullPage: true })
          await row.getByRole('button', { name: 'Delete', exact: true }).click()
          const dlg = p.getByRole('dialog', { name: 'Delete the key “Kabir’s computer”?' })
          await dlg.getByText('Websites using it stop working within a minute. This can’t be undone.').waitFor()
          await dlg.getByRole('button', { name: 'Delete key' }).click()
          await expectToast(p, 'Key “Kabir’s computer” deleted', 'ok')
          assert.equal((await get('/2026-12/shop', H)).status, 404, 'a deleted build key still answers')
          await row.getByText('Deleted', { exact: true }).waitFor()
        })

        // D0 (Studio workbench plan; mockup docs/mockups/2026-11-22-studio-workbench.html screen 2): no domain is asked for
        // (the frrata name and Connect my domain), a Test key's last week shows as days left, and opening the store refuses
        // while a Test key builds a website with no proved address, then opens once the domain is the Website.
        const [{ published_at: pub }] = await db`select published_at from shop_settings where tenant_id = ${T}`
        try {
          await t.step('D0: the frrata name, days left, and opening refuses until the domain is the Website', async () => {
            const k4 = testKey(); await addTest(k4)
            await db`update storefront_keys set created_at = now() - interval '24 days', expires_at = now() + interval '6 days' - interval '1 hour'
              where hash = ${createHash('sha256').update(k4).digest('hex')}`
            await db`update shop_settings set published_at = null, site_origin = null, site_domain_id = null where tenant_id = ${T}`
            await db`delete from shop_domains where id = ${domain}` // no domain connected yet: the case D0·1 draws
            await p.goto(`${CONSOLE}/console/settings/website`)
            await p.getByRole('heading', { name: 'Website Building' }).waitFor()
            assert.equal(await p.getByRole('radio', { name: /Your own website/ }).getAttribute('aria-checked'), 'true')
            await p.getByText(/^kesar-studio\./).first().waitFor()
            await p.getByRole('link', { name: 'Connect my domain' }).waitFor()
            assert.equal(await p.getByText('Connect a domain first').count(), 0, 'the disabled select is gone')
            assert.equal(await p.getByLabel('Unsaved changes').count(), 0, 'nothing to save with no domain')
            await p.getByRole('listitem').filter({ hasText: k4.slice(0, 14) }).getByText('Test · 6 days left').waitFor()
            await p.getByRole('button', { name: 'Create key' }).click()
            const create = p.getByRole('dialog', { name: 'Create key' })
            await create.getByRole('radio', { name: /^Test/ }).click()
            await create.getByText('A Test key also reads products not yet published.').waitFor()
            await create.getByRole('button', { name: 'Not now' }).click()
            await p.screenshot({ path: t.out('website-d0-1280'), fullPage: true })
            const v = await audit(p); assert.deepEqual(v, [], `axe: ${v.join('; ')}`)

            await p.goto(`${CONSOLE}/console/setup`)
            await openStore(p, { moment: false })
            const dlg = p.getByRole('dialog', { name: 'Your store is still closed' })
            await dlg.getByText('Your website runs on a Test key. Test keys stop when the store opens.').waitFor()
            await dlg.getByRole('link', { name: 'Connect my domain' }).waitFor()
            await p.screenshot({ path: t.out('open-refused-1280') })
            await dlg.getByRole('button', { name: 'Keep it closed' }).click()
            const [s1] = await db`select published_at from shop_settings where tenant_id = ${T}`
            assert.equal(s1.published_at, null, 'the store opened with its website on a Test key')

            // Connect my domain, then pick it as the Website (as the second step above does): the store opens.
            await db`insert into shop_domains (id, tenant_id, host, apex, with_www, claimed_by, proved_at, cert_ok_at) values (${domain}, ${T}, ${'shop.' + OWN_DOMAIN}, ${OWN_DOMAIN}, false, ${'cccccccc-0000-0000-0000-000000000001'}, now(), now())`
            await db`update shop_settings set site_origin = ${'https://' + OWN_DOMAIN}, site_domain_id = ${domain} where tenant_id = ${T}`
            await p.reload()
            await openStore(p, { moment: false })
            let opened = null
            for (let i = 0; i < 20 && !opened; i++) { opened = (await db`select published_at from shop_settings where tenant_id = ${T}`)[0].published_at; if (!opened) await new Promise((r) => setTimeout(r, 250)) }
            assert.ok(opened, 'the store did not open once its domain was the Website')
            // Closed again with its Website gone: its Test keys ended at the first opening, so opening again is never refused.
            await db`update shop_settings set published_at = null, site_origin = null, site_domain_id = null where tenant_id = ${T}`
            await p.reload()
            await openStore(p, { moment: false })
            let again = null
            for (let i = 0; i < 20 && !again; i++) { again = (await db`select published_at from shop_settings where tenant_id = ${T}`)[0].published_at; if (!again) await new Promise((r) => setTimeout(r, 250)) }
            assert.ok(again, 'a store that opened once was refused when opened again')
            assert.equal(await p.getByRole('dialog', { name: 'Your store is still closed' }).count(), 0)
          })
        } finally {
          await db`update shop_settings set published_at = ${pub} where tenant_id = ${T}`
        }
      } finally {
        await db`update tenants set first_opened_at = ${opened} where id = ${T}`
      }
    } finally {
      await owner.close()
      await db`delete from storefront_keys where tenant_id = ${T}`
      await db`update shop_settings set site_origin = null, site_domain_id = null where tenant_id = ${T}`
      await db`delete from shop_domains where id = ${domain}`
    }
  },
}
