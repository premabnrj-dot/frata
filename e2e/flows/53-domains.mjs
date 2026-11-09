// =============================================================================
// FLOW: own domains D2·10 (mockup v2, rules 72–76) — the owner connects a domain in one dialog: the domain is tidied
// as typed, the records show at once, the dialog finds them by itself (or on Check now), secures and says Connected;
// Make main is a one-line confirm, the shop's canonical moves to the domain and the domain opens the shop; Undo puts
// the name back; Remove takes the row away. Vercel and DNS are e2e/fakes/domains.mjs. Restores the seed.
// Guards: a domain that never connects; Make main that doesn't move canonical; a removed domain still listed.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, SHOP, signedIn } from '../lib.mjs'
import { OWN_DOMAIN, PORTS, SHOP_DOMAIN } from '../constants.mjs'

const FAKE = `http://127.0.0.1:${PORTS.domains}`
const dns = (name, type, data) => fetch(`${FAKE}/_test/dns`, { method: 'POST', body: JSON.stringify({ name, type, data }) })

export default {
  name: 'domains',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    await fetch(`${FAKE}/_test/reset`)
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    try {
      const p = await owner.newPage(); p.setDefaultTimeout(20_000); p.on('pageerror', (e) => t.errors.push(e.message))
      await t.step('Connect: the domain is tidied as typed, the records show at once with Open DNS, Copy all and WhatsApp', async () => {
        await p.goto(CONSOLE + '/console/settings/address')
        await p.getByRole('button', { name: 'Connect a domain' }).click()
        const dlg = p.getByRole('dialog', { name: 'Connect a domain' })
        await dlg.getByLabel('Domain').fill(`https://www.${OWN_DOMAIN.toUpperCase()}/`)
        await dlg.getByText(OWN_DOMAIN, { exact: true }).waitFor()
        await dlg.getByRole('button', { name: 'Continue' }).click()
        await dlg.getByText('0 of 3 found').waitFor()
        for (const n of ['TXT _frrata', 'A @', 'CNAME www']) await dlg.getByText(n, { exact: true }).waitFor()
        await dlg.getByRole('link', { name: 'Open GoDaddy DNS' }).waitFor()
        await dlg.getByRole('button', { name: 'Copy all' }).waitFor()
        assert.match(await dlg.getByRole('link', { name: 'Send on WhatsApp' }).getAttribute('href'), /^https:\/\/wa\.me\/\?text=/)
        const added = await (await fetch(`${FAKE}/_test/added`)).json()
        assert.deepEqual(added, [], 'nothing reaches Vercel before the proof')
      })
      await t.step('the dialog finds the records by itself, secures and says Connected', async () => {
        const dlg = p.getByRole('dialog', { name: 'Connect a domain' })
        const [row] = await db`select token from shop_domains where tenant_id = ${T} and host = ${OWN_DOMAIN} and removed_at is null`
        await dns(`_frrata.${OWN_DOMAIN}`, 'TXT', [`"frrata-verify=${row.token}"`])
        await dns(OWN_DOMAIN, 'A', ['76.76.21.21'])
        await dns(`www.${OWN_DOMAIN}`, 'CNAME', ['e2e.vercel-dns-017.com.'])
        await dlg.getByText('3 of 3 found').or(dlg.getByText('Securing')).or(dlg.getByText('Connected', { exact: true })).waitFor({ timeout: 40_000 })
        await dlg.getByText('Connected', { exact: true }).waitFor({ timeout: 60_000 })
        await dlg.getByRole('link', { name: 'Open Razorpay' }).waitFor()
        await dlg.getByRole('button', { name: 'Done' }).click()
        await p.getByRole('listitem').filter({ hasText: OWN_DOMAIN }).getByText('Connected', { exact: true }).waitFor()
      })
      await t.step('Make main: one-line confirm, then the canonical moves and the domain opens the shop; Undo puts the name back', async () => {
        // Live payments: Make main waits for the merchant's word that Razorpay approved the domain (D1·8).
        const row = p.getByRole('listitem').filter({ hasText: OWN_DOMAIN })
        await row.getByText('Razorpay not approved').waitFor()
        await row.getByRole('button', { name: 'Razorpay approved it' }).click()
        await row.getByRole('button', { name: 'Make main' }).click()
        const c = p.getByRole('dialog', { name: `Make ${OWN_DOMAIN} your main address?` })
        await c.getByText('Bags in progress start empty.').waitFor()
        await c.getByRole('button', { name: 'Make it main' }).click()
        const popup = p.getByRole('status').filter({ hasText: `${OWN_DOMAIN} is your main address` })
        await popup.getByRole('link', { name: 'View your shop' }).waitFor()
        // Undo lives 8 s: used at once, it puts the name back.
        await popup.getByRole('button', { name: 'Undo' }).click()
        await row.getByRole('button', { name: 'Make main' }).waitFor()
        // Made main again (closed, no Undo): the canonical moves and the domain opens the shop.
        await row.getByRole('button', { name: 'Make main' }).click()
        await p.getByRole('dialog', { name: `Make ${OWN_DOMAIN} your main address?` }).getByRole('button', { name: 'Make it main' }).click()
        await popup.getByRole('button', { name: 'Close' }).click()
        const s = await t.browser.newContext(); const q = await s.newPage()
        await q.goto(SHOP + '/')
        assert.equal(await q.locator('link[rel="canonical"]').getAttribute('href'), `https://${OWN_DOMAIN}/`)
        const r = await q.goto(`http://${OWN_DOMAIN}/`)
        assert.equal(r?.status(), 200, 'the own domain opens the shop')
        await s.close()
        // Back to the frrata name from its own row (approved, so the server lets it be main again).
        await p.getByRole('listitem').filter({ hasText: `kesar-studio.${SHOP_DOMAIN}` }).getByRole('button', { name: 'Make main' }).click()
        await row.getByRole('button', { name: 'Make main' }).waitFor()
      })
      await t.step('Remove: confirmed, and the row leaves the list', async () => {
        await p.getByRole('listitem').filter({ hasText: OWN_DOMAIN }).getByRole('button', { name: 'Remove' }).click()
        await p.getByRole('dialog', { name: `Remove ${OWN_DOMAIN}?` }).getByRole('button', { name: `Remove ${OWN_DOMAIN}` }).click()
        await p.getByRole('listitem').filter({ hasText: OWN_DOMAIN }).first().waitFor({ state: 'detached' })
        const s = await t.browser.newContext(); const q = await s.newPage()
        assert.equal((await q.goto(`http://${OWN_DOMAIN}/`))?.status(), 404, 'a removed domain must stop opening the shop')
        await s.close()
      })
    } finally {
      await owner.close()
      if (process.env.E2E_DEBUG) console.log(JSON.stringify({ rows: await db`select host, proved_at, added_at, dns_ok_at, cert_ok_at, checked_at, removed_reason from shop_domains where tenant_id = ${T}`, outbox: await db`select kind, attempts, last_error, sent_at from outbox where kind like 'domain.%'`, added: await (await fetch(`${FAKE}/_test/added`)).json() }))
      await db`delete from outbox where kind like 'domain.%'`
      await db`delete from shop_domains where tenant_id = ${T}`
      await fetch(`${FAKE}/_test/reset`)
    }
  },
}
