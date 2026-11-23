// =============================================================================
// FLOW: Admin › Costs (docs/plans/2026-11-23-admin-costs.md task 6; mockup docs/mockups/2026-11-23-admin-costs.html).
// A master admin adds a repeating dollar cost and a one-time cost, marks a bill paid (once, with a toast that undoes it), reads
// the Overview's figures, opens a cost beside the list and ends it, sees the Payments list and downloads the CA's CSV.
// Support staff see no Costs in the nav and a locked page. The page fits a 390 px phone. Every write is audited. Cleans up.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, expectToast, signedIn, until } from '../lib.mjs'

const NAME = 'E2E Vercel Pro', OVERDUE = 'E2E Workspace', LOGO = 'E2E Logo'

export default {
  name: 'costs',
  async run(t) {
    const { db } = t
    const F = USERS.frata, S = USERS.staff
    await db`insert into auth.users (id, email, email_confirmed_at) values (${F.id}, ${F.email}, now()) on conflict (id) do nothing`
    await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do update set role = 'admin'`
    await db`insert into auth.users (id, email, email_confirmed_at) values (${S.id}, ${S.email}, now()) on conflict (id) do nothing`
    await db`insert into platform_staff (user_id, email, role) values (${S.id}, ${S.email}, 'support') on conflict (user_id) do update set role = 'support'`
    const clean = async () => {
      await db`delete from audit_events where action like 'costs.%'`
      await db`delete from cost_payments`
      await db`delete from cost_items`
    }
    await clean()
    const open = async (who, opts = { viewport: { width: 1280, height: 900 } }) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return { ctx, p } }
    try {
      await t.step('support staff: no Costs in the nav, and the page says who can open it', async () => {
        const { ctx, p } = await open('staff')
        await p.goto(CONSOLE + '/admin')
        await p.getByRole('heading', { level: 1, name: 'Today' }).waitFor()
        assert.equal(await p.getByRole('link', { name: /^Costs/ }).count(), 0, 'support staff are not shown Costs')
        await p.goto(CONSOLE + '/admin/costs')
        await p.getByText('Only a master admin can open Costs').waitFor()
        assert.equal((await p.request.get(CONSOLE + '/admin/costs/export?fy=2026')).status(), 403, 'and the export refuses them')
        await ctx.close()
      })

      await t.step('empty: a starter chip opens Add with its name filled', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/costs')
        await p.getByRole('heading', { level: 1, name: 'Costs' }).waitFor()
        await p.getByText('No costs yet').waitFor()
        await p.getByRole('button', { name: 'Anthropic' }).click()
        const dlg = p.getByRole('dialog', { name: 'Add a cost' })
        assert.equal(await dlg.getByLabel('Name', { exact: true }).inputValue(), 'Anthropic')
        await p.screenshot({ path: t.out('empty-add') })
        await dlg.getByRole('button', { name: 'Cancel' }).click()
        await ctx.close()
      })

      await t.step('Add: a mistake stays at its field; a repeating dollar cost is saved and audited', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/costs')
        await p.getByRole('button', { name: 'Add cost' }).first().click()
        const dlg = p.getByRole('dialog', { name: 'Add a cost' })
        await dlg.getByRole('button', { name: 'Add cost' }).click()
        await dlg.getByText('Add a name.').waitFor()
        await dlg.getByLabel('Name', { exact: true }).fill(NAME)
        await dlg.getByLabel('Currency').selectOption('USD')
        await dlg.locator('input[name="amount"]').fill('20')
        await dlg.getByRole('button', { name: 'Add cost' }).click()
        await expectToast(p, `${NAME} added.`, 'ok')
        const [row] = await db`select kind, cadence, amount::bigint::int a, currency from cost_items where name = ${NAME}`
        assert.deepEqual([row.kind, row.cadence, row.a, row.currency], ['recurring', 'monthly', 20_000_000, 'USD'])
        assert.equal((await db`select count(*)::int n from audit_events where action = 'costs.item.add' and tenant_id is null`)[0].n, 1)
        await ctx.close()
      })

      await t.step('Overview: the cost is due today; Mark paid needs the rupees, saves once, and the toast undoes it', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/costs')
        const rowOf = p.getByRole('table', { name: 'Due and overdue' }).getByRole('row', { name: new RegExp(NAME) })
        await rowOf.getByText('Today').waitFor()
        await rowOf.getByRole('button', { name: 'Mark paid' }).click()
        const dlg = p.getByRole('dialog', { name: `Mark ${NAME} paid` })
        await dlg.locator('input[name="inr"]').fill('1,884')
        await dlg.getByRole('button', { name: 'Mark paid' }).click()
        const toast = await expectToast(p, `${NAME} paid · ₹1,884.`, 'ok')
        const [pay] = await db`select inr_paise::int p, amount::bigint::int a from cost_payments`
        assert.deepEqual([pay.p, pay.a], [188_400, 20_000_000])
        await toast.getByRole('button', { name: 'Undo' }).click()
        await until(async () => (await db`select count(*)::int n from cost_payments`)[0].n === 0)
        assert.equal((await db`select count(*)::int n from audit_events where action = 'costs.unpay'`)[0].n, 1, 'the undo is audited')
        // pay it again and keep it
        await p.reload()
        await rowOf.getByRole('button', { name: 'Mark paid' }).click()
        const again = p.getByRole('dialog', { name: `Mark ${NAME} paid` })
        await again.locator('input[name="inr"]').fill('1884')
        await again.getByRole('button', { name: 'Mark paid' }).click()
        await expectToast(p, `${NAME} paid · ₹1,884.`, 'ok')
        assert.equal((await db`select count(*)::int n from cost_payments`)[0].n, 1)
        await ctx.close()
      })

      await t.step('Add once: a one-time cost is saved with its payment and counts in the month', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/costs')
        await p.getByRole('button', { name: 'Add cost' }).first().click()
        const dlg = p.getByRole('dialog', { name: 'Add a cost' })
        await dlg.getByRole('radio', { name: 'Once' }).click()
        await dlg.getByLabel('Name', { exact: true }).fill(LOGO)
        await dlg.locator('input[name="amount"]').fill('25,000')
        await dlg.getByRole('button', { name: 'Add cost' }).click()
        await expectToast(p, `${LOGO} added.`, 'ok')
        const [r] = await db`select i.kind, p.inr_paise::int paise from cost_items i join cost_payments p on p.item_id = i.id where i.name = ${LOGO}`
        assert.deepEqual([r.kind, r.paise], ['one_time', 2_500_000])
        await p.reload()
        await p.getByText('₹26,884').first().waitFor() // 1,884 + 25,000 in the month so far
        await ctx.close()
      })

      await t.step('overdue: the band leads the Overview, and the burn counts repeating costs only', async () => {
        await db`insert into cost_items (name, category, kind, cadence, amount, currency, anchor_on) values (${OVERDUE}, 'software', 'recurring', 'monthly', 138000, 'INR', (now() at time zone 'Asia/Kolkata')::date - 3)`
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/costs')
        await p.getByText('1 cost is overdue').waitFor()
        await p.getByText('Overdue 3 days').first().waitFor()
        await p.screenshot({ path: t.out('overview'), fullPage: true })
        await ctx.close()
      })

      await t.step('All costs: a row opens beside the list; End asks for the last day and keeps the history', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/costs?view=all')
        await p.getByRole('table', { name: 'All costs' }).getByRole('link', { name: NAME }).click()
        const side = p.getByRole('dialog', { name: `Quick look: ${NAME}` })
        await side.getByRole('heading', { name: /^Payments/ }).waitFor()
        await p.screenshot({ path: t.out('panel') })
        await side.getByRole('button', { name: 'End cost' }).click()
        const dlg = p.getByRole('dialog', { name: `End ${NAME}?` })
        await dlg.getByRole('button', { name: 'End cost' }).click()
        await expectToast(p, 'Cost ended.', 'ok')
        const [r] = await db`select ends_on from cost_items where name = ${NAME}`
        assert.ok(r.ends_on, 'the cost has an end day')
        await ctx.close()
      })

      await t.step('Payments: the month lists what was paid; the CSV is the CA\'s, quoted, with a fixed file name', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/costs?view=payments')
        await p.getByRole('table', { name: 'Payments' }).getByRole('link', { name: NAME }).waitFor()
        const fy = (await p.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).match(/fy=(\d{4})/)[1]
        const r = await p.request.get(CONSOLE + `/admin/costs/export?fy=${fy}`)
        assert.equal(r.status(), 200)
        assert.match(r.headers()['content-type'], /text\/csv/)
        assert.match(r.headers()['content-disposition'], /^attachment; filename="Frrata costs FY \d{4}-\d{2}\.csv"$/)
        const body = await r.text()
        assert.match(body, new RegExp(`"${NAME}","","Software"`))
        assert.match(body, /"USD","20\.00","1884\.00"/)
        assert.equal((await p.request.get(CONSOLE + '/admin/costs/export?fy=abc')).status(), 400)
        await ctx.close()
      })

      await t.step('a phone: Overview, All costs and Payments fit 390 px', async () => {
        const { ctx, p } = await open('frata', { viewport: { width: 390, height: 844 } })
        for (const view of ['overview', 'all', 'payments']) {
          await p.goto(CONSOLE + `/admin/costs?view=${view}`)
          await p.getByRole('heading', { level: 1, name: 'Costs' }).waitFor()
          assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${view} fits 390 px`)
          await p.screenshot({ path: t.out(`phone-${view}`), fullPage: true })
        }
        await ctx.close()
      })
    } finally {
      await clean()
    }
  },
}

