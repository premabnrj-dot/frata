// =============================================================================
// FLOW: modules — the foundation (docs/specs/2026-11-07-modules-foundation.md): the shop's
// Apps page lists every module with its badge and opens the details dialog; Admin offers no
// trial of a module not built yet and ends a trial; Admin pauses a module for everyone, then resumes it.
// Guards: an Apps page that drops a module, a details dialog with no price or no way out,
// a trial or pause that leaves no row or no audit, a phone that scrolls sideways.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, expectToast, signedIn } from '../lib.mjs'

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
      // Only a built module a plan or add-on grants can be trialled — GST and Delivery Zones today; none for a module not built yet
      // (its days would run out unused) nor one off its plans (Reviews: Growth and Scale).
      assert.equal(await meera.getByRole('button', { name: /Give a 30-day trial/ }).count(), 2)
      await meera.getByRole('button', { name: 'Give a 30-day trial of Delivery Zones' }).waitFor()
      assert.equal(await meera.getByRole('button', { name: /Give a 30-day trial of (Reviews|True Profit)/ }).count(), 0)
      // AD·0: giving one writes one row on the action's own transaction (under its lock), then it can be ended.
      await meera.getByRole('button', { name: 'Give a 30-day trial of GST' }).click()
      await expectToast(meera, 'GST: 30-day trial started.', 'ok')
      // The form refreshes the page after its toast (ActionForm; it used to be a whole new page): wait for it.
      await meera.getByRole('button', { name: 'End trial' }).waitFor()
      assert.equal((await db`select count(*)::int n from tenant_addons where tenant_id = ${KESAR} and module = 'gst' and ends_at is null`)[0].n, 1)
      assert.equal(await meera.getByRole('button', { name: /Give a 30-day trial/ }).count(), 1) // Delivery Zones still offered
      await meera.getByRole('button', { name: 'End trial' }).click()
      await expectToast(meera, 'GST ended.', 'ok')
      // A trial granted before (the row Admin writes when a module ships) shows its end and can be ended.
      await db`insert into tenant_addons (tenant_id, module, trial_ends_at, reason, created_by) values (${KESAR}, 'true_profit', now() + interval '30 days', '30-day trial', ${F.id})`
      await meera.reload()
      await meera.getByText(/Trial until/).waitFor()
      await meera.screenshot({ path: t.out('admin-trial') })
      await meera.getByRole('button', { name: 'End trial' }).click()
      await expectToast(meera, 'True Profit ended.', 'ok')
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
      await expectToast(meera, 'Messages paused for every shop.', 'ok')
      const [p] = await db`select reason, resumed_at from module_pauses where module = 'communication'`
      assert.equal(p.reason, 'Meta outage'); assert.equal(p.resumed_at, null)
      await meera.screenshot({ path: t.out('admin-pause') })
      await meera.getByRole('button', { name: 'Resume Messages' }).click()
      await expectToast(meera, /Messages running again/, 'ok')
      const [r] = await db`select resumed_at from module_pauses where module = 'communication'`
      assert.ok(r.resumed_at)
    })

    await t.step('A result never comes from the URL: words in ?error= / ?ok= show nowhere on an Admin page (security review 2026-11-12)', async () => {
      for (const [path, heading] of [['/admin/modules?error=Call+us+on+999', 'Modules'], [`/admin/merchants/${KESAR}?ok=Call+us+on+999`, 'Kesar Studio'], [`/admin/merchants/${KESAR}/modules?error=Call+us+on+999`, 'Kesar Studio']]) {
        await meera.goto(CONSOLE + path)
        await meera.getByRole('heading', { level: 1, name: heading }).waitFor()
        assert.ok(!(await meera.evaluate(() => document.body.innerText)).includes('Call us on 999'), `${path} shows the URL's words`)
        assert.equal(await meera.locator('[data-toast]').count(), 0, `${path} raised a toast from the URL`)
      }
    })

    await t.step('A2 featured card: two issued Launch invoices that Growth beats; the owner sees it in rupees, staff never; Not now sticks; See Growth carries the source', async () => {
      // Two issued, non-test invoices on Launch: 10 orders at a ₹1,00,000 base each month (₹10 L). Launch: plan + 2%;
      // Growth: ₹4,999 + 1% = ₹6,500 less; Scale: ₹14,999 + 0.5% = ₹1,500 less, so Growth is named.
      const [launch] = await db`select v.monthly_price::bigint p from plan_versions v join plans p on p.id = v.plan_id where p.code = 'launch' order by v.version desc limit 1`
      const month = (k) => db`select (date_trunc('month', now() at time zone 'Asia/Kolkata') + ${k} * interval '1 month') at time zone 'Asia/Kolkata' as at`
      const [[m0], [m1], [m2]] = await Promise.all([month(0), month(-1), month(1)])
      const ids = []
      await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        for (const [n, from, to] of [[1, m1.at, m0.at], [2, m0.at, m2.at]]) {
          const taxable = Number(launch.p) + 10 * 200_000
          const [inv] = await x`insert into frrata_invoices (tenant_id, period_start, period_end, taxable, cgst, sgst, igst, total, number, issued_at, test_mode)
            values (${KESAR}, ${from}, ${to}, ${taxable}, 0, 0, 0, ${taxable}, ${'E2E-A2-' + n}, now(), false) returning id`
          ids.push(inv.id)
          await x`insert into frrata_invoice_lines (tenant_id, invoice_id, position, kind, description, period_start, period_end, quantity, rate_bps, taxable) values
            (${KESAR}, ${inv.id}, 1, 'plan', 'Launch plan', ${from}, ${to}, 1, null, ${Number(launch.p)}),
            (${KESAR}, ${inv.id}, 2, 'fee', 'Fee on delivered orders', ${from}, ${to}, 10, 200, ${10 * 200_000})`
          await x`insert into frrata_invoice_fees (tenant_id, invoice_id, order_id, billable_at, base, fee_bps, fee) select ${KESAR}, ${inv.id}, gen_random_uuid(), ${from}, 10000000, 200, 200000 from generate_series(1, 10)`
        }
      })
      try {
        const own = await open('owner')
        await own.evaluate(() => localStorage.removeItem('frrata.featured.dismissed')).catch(() => {})
        await own.goto(CONSOLE + '/console/apps')
        await own.getByRole('heading', { name: /^On Growth your .+ invoice would have been ₹6,500 less$/ }).waitFor()
        await own.getByText(/on Launch · .+ on Growth · both \+ 18% GST/).waitFor()
        await own.screenshot({ path: t.out('featured') })
        // Staff never see the shop's bill.
        await db`insert into auth.users (id, email, email_confirmed_at) values (${USERS.staff.id}, ${USERS.staff.email}, now()) on conflict (id) do nothing`
        await db`insert into members (tenant_id, user_id, role) values (${KESAR}, ${USERS.staff.id}, 'staff') on conflict do nothing`
        const arjun = await open('staff')
        await arjun.goto(CONSOLE + '/console/apps')
        await arjun.getByRole('heading', { name: 'Your apps' }).or(arjun.getByRole('heading', { name: 'Talk to shoppers' })).first().waitFor()
        assert.equal(await arjun.getByText(/invoice would have been/).count(), 0, 'staff see no featured card')
        // See Growth: the billing page; an upgrade from there records where it came from.
        await own.getByRole('link', { name: 'See Growth' }).click()
        await own.waitForURL(/\/console\/settings\/billing\?from=featured$/)
        await own.getByRole('button', { name: 'Upgrade to Growth' }).click()
        await own.getByRole('button', { name: 'Upgrade now' }).click()
        await expectToast(own, 'You are on Growth now.', 'ok')
        const src = await db`select detail->>'source' s from audit_events where tenant_id = ${KESAR} and action = 'billing.plan.source'`
        assert.deepEqual(src.map((r) => r.s), ['featured'])
        // On Growth now: no card. Back on Launch for the dismiss check.
        await own.goto(CONSOLE + '/console/apps')
        await own.getByRole('heading', { name: 'Talk to shoppers' }).waitFor()
        assert.equal(await own.getByText(/invoice would have been/).count(), 0, 'no card once on Growth')
        await db`delete from tenant_plans where tenant_id = ${KESAR} and reason = 'Changed by the shop'`
        await own.reload()
        await own.getByRole('button', { name: 'Not now' }).click()
        await own.reload()
        await own.getByRole('heading', { name: 'Talk to shoppers' }).waitFor()
        assert.equal(await own.getByText(/invoice would have been/).count(), 0, 'Not now hides it until the next invoice')
      } finally {
        await db.begin(async (x) => {
          await x`set local session_replication_role = replica`
          await x`delete from frrata_invoice_fees where tenant_id = ${KESAR} and invoice_id = any(${ids})`
          await x`delete from frrata_invoice_lines where tenant_id = ${KESAR} and invoice_id = any(${ids})`
          await x`delete from frrata_invoices where tenant_id = ${KESAR} and id = any(${ids})`
        })
        await db`delete from tenant_plans where tenant_id = ${KESAR} and reason = 'Changed by the shop'`
        await db`delete from audit_events where tenant_id = ${KESAR} and action in ('billing.plan.change', 'billing.plan.source')`
        await db`delete from members where tenant_id = ${KESAR} and user_id = ${USERS.staff.id}`
      }
    })
  },
}
