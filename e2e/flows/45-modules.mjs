// =============================================================================
// FLOW: modules — the foundation (docs/specs/2026-11-07-modules-foundation.md): the shop's
// Apps page lists every module with its badge and opens the details dialog; Admin offers no
// trial of a module not built yet and ends a trial; Admin pauses a module for everyone, then resumes it.
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
    await t.step('Apps: a gallery by job, your apps first, filters and search', async () => {
      await riya.goto(CONSOLE + '/console/apps')
      await riya.getByRole('heading', { level: 1, name: 'Apps' }).waitFor()
      for (const g of ['Talk to shoppers', 'Get paid and ship', 'Sell more', 'Run the books']) await riya.getByRole('heading', { name: g }).waitFor()
      for (const k of ['communication', 'reviews', 'true_profit']) await riya.locator(`a[href="/console/apps/${k}"]`).first().waitFor()
      assert.ok(await riya.getByText('Coming next', { exact: true }).count() >= 1, 'apps not built yet say Coming next')
      await riya.screenshot({ path: t.out('apps'), fullPage: true })
      await riya.getByRole('button', { name: /^Coming next/ }).click()
      assert.equal(await riya.locator('a[href="/console/apps/communication"]').count(), 0, 'a built app is filtered out')
      await riya.getByRole('button', { name: /^All/ }).click()
      await riya.getByRole('searchbox', { name: 'Search apps' }).fill('zzz')
      await riya.getByText('No app matches that search.').waitFor()
      await riya.getByRole('button', { name: 'Clear search' }).click()
      await riya.locator('a[href="/console/apps/reviews"]').first().waitFor()
    })

    await t.step('an app\'s page: features, questions, the price, and "Tell me when it\'s ready" that sticks', async () => {
      await riya.locator('a[href="/console/apps/reviews"]').first().click()
      await riya.waitForURL(/\/console\/apps\/reviews$/)
      await riya.getByRole('heading', { level: 1, name: 'Reviews' }).waitFor()
      await riya.getByRole('heading', { name: 'Questions' }).waitFor()
      await riya.getByText('₹499').first().waitFor()
      await riya.screenshot({ path: t.out('details'), fullPage: true })
      await riya.getByRole('button', { name: 'Tell me when it’s ready' }).click()
      await riya.getByRole('button', { name: 'We’ll tell you when it’s ready' }).waitFor()
      const rows = await db`select module from app_interest where tenant_id = ${KESAR}`
      assert.deepEqual(rows.map((r) => r.module), ['reviews'])
      await riya.reload()
      await riya.getByRole('button', { name: 'We’ll tell you when it’s ready' }).waitFor()
      assert.equal((await riya.goto(CONSOLE + '/console/apps/not-an-app')).status(), 404, 'an unknown app is a 404')
    })

    await t.step('Apps on a phone: no sideways scroll', async () => {
      const q = await open('owner', { viewport: { width: 390, height: 844 } })
      await q.goto(CONSOLE + '/console/apps')
      await q.getByRole('heading', { level: 1, name: 'Apps' }).waitFor()
      assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
      await q.screenshot({ path: t.out('apps-phone'), fullPage: true })
    })

    const meera = await open('frata')
    await t.step('Admin: no trial of a module not built yet; a trial shows and can be ended', async () => {
      await meera.goto(CONSOLE + `/admin/merchants/${KESAR}/modules`)
      await meera.getByRole('link', { name: 'Modules', exact: true }).first().waitFor()
      // Only a built module a plan or add-on grants can be trialled — GST alone today; none for a module not built yet
      // (its days would run out unused) nor one off its plans (Reviews: Growth and Scale).
      assert.equal(await meera.getByRole('button', { name: /Give a 30-day trial/ }).count(), 1)
      assert.equal(await meera.getByRole('button', { name: /Give a 30-day trial of (Reviews|True Profit)/ }).count(), 0)
      // AD·0: giving one writes one row on the action's own transaction (under its lock), then it can be ended.
      await meera.getByRole('button', { name: 'Give a 30-day trial of GST' }).click()
      await meera.getByText('GST: 30-day trial started.').waitFor()
      assert.equal((await db`select count(*)::int n from tenant_addons where tenant_id = ${KESAR} and module = 'gst' and ends_at is null`)[0].n, 1)
      assert.equal(await meera.getByRole('button', { name: /Give a 30-day trial/ }).count(), 0)
      await meera.getByRole('button', { name: 'End trial' }).click()
      await meera.getByText('GST ended.').waitFor()
      // A trial granted before (the row Admin writes when a module ships) shows its end and can be ended.
      await db`insert into tenant_addons (tenant_id, module, trial_ends_at, reason, created_by) values (${KESAR}, 'true_profit', now() + interval '30 days', '30-day trial', ${F.id})`
      await meera.reload()
      await meera.getByText(/Trial until/).waitFor()
      await meera.screenshot({ path: t.out('admin-trial') })
      await meera.getByRole('button', { name: 'End trial' }).click()
      await meera.getByText('True Profit ended.').waitFor()
      const [b] = await db`select ends_at from tenant_addons where tenant_id = ${KESAR} and module = 'true_profit'`
      assert.ok(b.ends_at)
      const audit = await db`select action from audit_events where tenant_id = ${KESAR} and action like 'module.%' order by at`
      assert.deepEqual(audit.map((r) => r.action), ['module.trial', 'module.end', 'module.end'])
    })

    await t.step('Admin pauses a module for everyone, then resumes it', async () => {
      await meera.goto(CONSOLE + '/admin/modules')
      await meera.getByRole('heading', { name: 'Asked to be told' }).waitFor() // the owner asked for Reviews above
      await meera.getByText('1 shop asked').first().waitFor()
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
