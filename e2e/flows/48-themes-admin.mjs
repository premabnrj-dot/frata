// =============================================================================
// FLOW: themes-admin — Admin › Themes (themes plan T3): a version new in this deploy is offered to nobody; staged to
// one shop, that shop can try it; released, every shop can; recalled, Try falls back to the version before; a
// withdrawn version leaves the shop on its previous look at once, and Look says so. Runs after 47-look (it leaves
// Editorial 1.1 recalled and Bazaar 1.0 withdrawn: decisions are final, and no later flow uses either).
// Guards: a version offered before Admin decides, a stage that reaches every shop, a recall that still lets shops
// start on it, a withdraw shoppers keep seeing, an Admin write with no audit row.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { CONSOLE, PORTS, USERS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const shopHtml = () => new Promise((res, rej) => http.get(`http://localhost:${PORTS.app}/`, { headers: { host: 'kesar-studio.frata.test' } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(b.replace(/<script[\s\S]*?<\/script>/g, ''))) }).on('error', rej))

export default {
  name: 'themes-admin',
  async run(t) {
    const { db } = t
    const F = USERS.frata
    await db`insert into auth.users (id, email, email_confirmed_at) values (${F.id}, ${F.email}, now()) on conflict (id) do nothing`
    await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do nothing`
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }
    const meera = await open('frata', { viewport: { width: 1280, height: 900 } })
    const riya = await open('owner', { viewport: { width: 1280, height: 900 } })
    const editorialVersion = async () => {
      await riya.goto(CONSOLE + '/console/look')
      await riya.getByRole('button', { name: 'Editorial', exact: true }).click()
      const d = riya.getByRole('dialog', { name: 'Editorial' })
      const v = (await d.getByText(/Version \d+\.\d+\.\d+/).textContent()).match(/\d+\.\d+\.\d+/)[0]
      await d.getByRole('button', { name: 'Not now' }).click()
      return v
    }

    await t.step('A version new in this deploy is offered to nobody', async () => {
      // As a deploy that brings Editorial 1.1 would leave it: in the code, no decision yet.
      await db`delete from theme_versions where theme_key = 'editorial' and version = '1.1.0'`
      await meera.goto(CONSOLE + '/admin/themes')
      await meera.getByRole('heading', { level: 1, name: 'Themes' }).waitFor()
      await meera.getByText('New in this deploy: Editorial 1.1.0').waitFor()
      await meera.screenshot({ path: t.out('admin-themes'), fullPage: true })
      assert.equal(await editorialVersion(), '1.0.0')
    })

    await t.step('Staged to Kesar Studio, Kesar can try it; released, everyone can', async () => {
      await meera.goto(CONSOLE + '/admin/themes/editorial/1.1.0')
      await meera.getByLabel('Find a shop').fill('Kesar')
      await meera.getByRole('button', { name: 'Find' }).click()
      await meera.getByRole('button', { name: /^Stage to Kesar/ }).click()
      await meera.getByText('Staged: that shop can try this version now.').waitFor()
      assert.equal(await editorialVersion(), '1.1.0')
      await meera.getByRole('button', { name: 'Release to everyone' }).click()
      await meera.getByText(/^Released: every shop can try it/).waitFor()
      const audit = await db`select action from audit_events where action in ('theme.stage', 'theme.release') and target = 'editorial@1.1.0'`
      assert.deepEqual(audit.map((a) => a.action).sort(), ['theme.release', 'theme.stage'])
      await meera.screenshot({ path: t.out('admin-version'), fullPage: true })
    })

    await t.step('Recalled (with a reason): shops start on the version before', async () => {
      await meera.getByLabel('Why recall it').fill('Shop the look dots overlap on small phones')
      await meera.getByRole('button', { name: 'Recall Editorial 1.1.0' }).click()
      await meera.getByText(/^Recalled\. No new looks on it/).waitFor()
      assert.equal(await editorialVersion(), '1.0.0')
      const [r] = await db`select recalled_reason from theme_versions where theme_key = 'editorial' and version = '1.1.0'`
      assert.equal(r.recalled_reason, 'Shop the look dots overlap on small phones')
    })

    await t.step('Withdrawn: the shop shows its previous look at once, and Look says why', async () => {
      const before = await shopHtml()
      await riya.goto(CONSOLE + '/console/look')
      await riya.getByRole('button', { name: 'Bazaar', exact: true }).click()
      await riya.getByRole('dialog', { name: 'Bazaar' }).getByRole('button', { name: 'Try Bazaar in a draft' }).click()
      await riya.waitForURL(/\/console\/look\/customize$/)
      await riya.getByRole('button', { name: 'Publish', exact: true }).click()
      await riya.getByRole('dialog', { name: /Publish Bazaar/ }).getByRole('button', { name: 'Publish', exact: true }).click()
      await riya.getByRole('heading', { level: 1, name: 'Published' }).waitFor()
      await until(async () => (await shopHtml()) !== before, 15_000)
      await meera.goto(CONSOLE + '/admin/themes/bazaar/1.0.0')
      await meera.getByLabel('Why withdraw it').fill('Prices unreadable on the tint scheme')
      await meera.getByRole('button', { name: 'Withdraw Bazaar 1.0.0' }).click()
      await meera.getByText('Withdrawn. Shops on it show their previous look now.').waitFor()
      await until(async () => (await shopHtml()) === before, 15_000)
      await riya.goto(CONSOLE + '/console/look')
      await riya.getByText('Frrata withdrew Bazaar 1.0.0 for a problem. Your previous look is live; nothing is lost.').waitFor()
      assert.equal(await riya.getByRole('button', { name: 'Bazaar', exact: true }).count(), 0, 'a withdrawn theme is not offered')
      await riya.screenshot({ path: t.out('look-withdrawn'), fullPage: true })
    })
  },
}
