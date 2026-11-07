// =============================================================================
// FLOW: modules — the foundation (docs/specs/2026-11-07-modules-foundation.md): the shop's
// Apps page lists every module with its badge and opens the details dialog; Frata gives a
// 30-day trial in Admin and ends it; Frata pauses a module for everyone and resumes it.
// Guards: an Apps page that drops a module, a details dialog with no price or no way out,
// a trial or pause that leaves no row or no audit, a phone that scrolls sideways.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'

export default {
  name: 'modules',
  async run(t) {
    const { db } = t
    const F = USERS.frata
    await db`insert into auth.users (id, email, email_confirmed_at) values (${F.id}, ${F.email}, now()) on conflict (id) do nothing`
    await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do nothing`
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }

    const riya = await open('owner')
    await t.step('Apps: every module, grouped, with its badge', async () => {
      await riya.goto(CONSOLE + '/console/apps')
      await riya.getByRole('heading', { level: 1, name: 'Apps' }).waitFor()
      for (const name of ['Messages', 'Reviews', 'True Profit']) await riya.getByRole('button', { name, exact: true }).waitFor()
      assert.ok(await riya.getByText('Next', { exact: true }).count() >= 1, 'modules not built yet say Next')
      await riya.screenshot({ path: t.out('apps'), fullPage: true })
    })

    await t.step('the details dialog: what you get, the price, a way out', async () => {
      await riya.getByRole('button', { name: 'Reviews', exact: true }).click()
      const d = riya.getByRole('dialog', { name: 'Reviews' })
      await d.getByRole('heading', { name: 'What you get' }).waitFor()
      await d.getByText('₹499').first().waitFor()
      await riya.screenshot({ path: t.out('details') })
      await d.getByRole('button', { name: 'Not now' }).click()
      await d.waitFor({ state: 'hidden' })
    })

    await t.step('Apps on a phone: no sideways scroll', async () => {
      const q = await open('owner', { viewport: { width: 390, height: 844 } })
      await q.goto(CONSOLE + '/console/apps')
      await q.getByRole('heading', { level: 1, name: 'Apps' }).waitFor()
      assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
      await q.screenshot({ path: t.out('apps-phone'), fullPage: true })
    })

    const meera = await open('frata')
    await t.step('Admin gives a 30-day trial, then ends it', async () => {
      await meera.goto(CONSOLE + `/admin/merchants/${KESAR}/modules`)
      await meera.getByRole('link', { name: 'Modules', exact: true }).first().waitFor()
      await meera.getByRole('button', { name: 'Give a 30-day trial of Reviews' }).click()
      await meera.getByText('Reviews: 30-day trial started.').waitFor()
      const [a] = await db`select trial_ends_at, ends_at from tenant_addons where tenant_id = ${KESAR} and module = 'reviews'`
      assert.ok(a.trial_ends_at > new Date(Date.now() + 29 * 86_400_000)); assert.equal(a.ends_at, null)
      await meera.getByText(/Trial until/).waitFor()
      await meera.screenshot({ path: t.out('admin-trial') })
      await meera.getByRole('button', { name: 'End trial' }).click()
      await meera.getByText('Reviews ended.').waitFor()
      const [b] = await db`select ends_at from tenant_addons where tenant_id = ${KESAR} and module = 'reviews'`
      assert.ok(b.ends_at)
      const audit = await db`select action from audit_events where tenant_id = ${KESAR} and action like 'module.%' order by at`
      assert.deepEqual(audit.map((r) => r.action), ['module.trial', 'module.end'])
    })

    await t.step('Admin pauses a module for everyone, then resumes it', async () => {
      await meera.goto(CONSOLE + '/admin/modules')
      await meera.getByLabel('Why pause Messages').fill('Meta outage')
      await meera.getByRole('button', { name: 'Pause Messages for everyone' }).click()
      await meera.getByText('Messages paused for every shop.').waitFor()
      const [p] = await db`select reason, resumed_at from module_pauses where module = 'communication'`
      assert.equal(p.reason, 'Meta outage'); assert.equal(p.resumed_at, null)
      await meera.screenshot({ path: t.out('admin-pause') })
      await meera.getByRole('button', { name: 'Resume Messages' }).click()
      await meera.getByText(/Messages running again/).waitFor()
      const [r] = await db`select resumed_at from module_pauses where module = 'communication'`
      assert.ok(r.resumed_at)
    })
  },
}
