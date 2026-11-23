// =============================================================================
// FLOW: Admin › Cashflow (docs/plans/2026-11-23-admin-cashflow.md task 6; mockup docs/mockups/2026-11-23-admin-cashflow.html).
// A master admin adds the first account with its balance (one dialog), sees cash in the bank and the six months behind, adds money in and a
// planned payment, marks it paid, reads Movements and Accounts, and removes a balance with Undo. The audit holds the account and day, never the
// amount. Support staff see no Cashflow in the nav and a locked page. Every tab fits a 390 px phone. Cleans up.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, expectToast, signedIn, until } from '../lib.mjs'

export default {
  name: 'cashflow',
  async run(t) {
    const { db } = t
    const F = USERS.frata, S = USERS.staff
    await db`insert into auth.users (id, email, email_confirmed_at) values (${F.id}, ${F.email}, now()) on conflict (id) do nothing`
    await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do update set role = 'admin'`
    await db`insert into auth.users (id, email, email_confirmed_at) values (${S.id}, ${S.email}, now()) on conflict (id) do nothing`
    await db`insert into platform_staff (user_id, email, role) values (${S.id}, ${S.email}, 'support') on conflict (user_id) do update set role = 'support'`
    const clean = async () => {
      await db`delete from audit_events where action like 'cash.%'`
      await db`update cash_settings set floor_paise = null, main_account_id = null`
      await db`delete from cash_entries`
      await db`delete from cash_balances`
      await db`delete from cash_accounts`
    }
    await clean()
    const open = async (who, opts = { viewport: { width: 1280, height: 900 } }) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return { ctx, p } }
    try {
      await t.step('support staff: no Cashflow in the nav, and the page says who can open it', async () => {
        const { ctx, p } = await open('staff')
        await p.goto(CONSOLE + '/admin')
        await p.getByRole('heading', { level: 1, name: 'Today' }).waitFor()
        assert.equal(await p.getByRole('link', { name: /^Cashflow/ }).count(), 0, 'support staff are not shown Cashflow')
        await p.goto(CONSOLE + '/admin/cashflow')
        await p.getByText('Only a master admin can open Cashflow').waitFor()
        await ctx.close()
      })

      await t.step('first use: one dialog adds the account with its balance; the audit holds the account and day, never the amount', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/cashflow')
        await p.getByRole('heading', { level: 1, name: 'Cashflow' }).waitFor()
        await p.getByText('Add your cash in the bank').waitFor()
        await p.screenshot({ path: t.out('empty') })
        await p.getByRole('button', { name: 'Update balance' }).first().click()
        const dlg = p.getByRole('dialog', { name: 'Update balance' })
        await dlg.locator('input[name="balance"]').fill('1,75,000')
        await dlg.locator('input[name="floor"]').fill('2,50,000')
        await dlg.getByRole('button', { name: 'Save balance' }).click()
        await expectToast(p, 'Balance saved.', 'ok')
        const [a] = await db`select (select count(*)::int from cash_accounts) accounts, (select balance_paise::bigint::int from cash_balances limit 1) bal, (select floor_paise::bigint::int from cash_settings) floor, (select main_account_id is not null from cash_settings) has_main`
        assert.deepEqual([a.accounts, a.bal, a.floor, a.has_main], [1, 17_500_000, 25_000_000, true])
        const rows = await db`select action, detail::text d from audit_events where action like 'cash.%'`
        assert.ok(rows.some((r) => r.action === 'cash.balance.set'), 'the balance is audited')
        assert.ok(rows.every((r) => !r.d.includes('17500000')), 'no audit row holds the amount')
        await ctx.close()
      })

      await t.step('Overview: cash in the bank and the floor, and the six months behind', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/cashflow')
        await p.getByText('₹1,75,000').first().waitFor()
        await p.getByText('₹2,50,000').first().waitFor()
        await p.getByRole('heading', { name: 'Last six months' }).waitFor()
        await p.screenshot({ path: t.out('overview'), fullPage: true })
        await ctx.close()
      })

      await t.step('Add entry: money in, and a planned payment that is marked paid', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/cashflow?view=movements')
        await p.getByRole('button', { name: 'Add entry' }).click()
        let dlg = p.getByRole('dialog', { name: 'Add an entry' })
        await dlg.locator('input[name="amount"]').fill('5,00,000')
        await dlg.getByRole('button', { name: 'Add entry' }).click()
        await expectToast(p, 'Entry added.', 'ok')
        await p.getByRole('button', { name: 'Add entry' }).click()
        dlg = p.getByRole('dialog', { name: 'Add an entry' })
        await dlg.getByRole('radio', { name: 'Money out' }).click()
        await dlg.locator('select[name="kind"]').selectOption('gst_paid')
        await dlg.locator('input[name="amount"]').fill('4,000')
        await dlg.getByRole('switch', { name: 'Not paid yet' }).click()
        await dlg.getByRole('button', { name: 'Add entry' }).click()
        await expectToast(p, 'Planned entry added.', 'ok')
        const entries = await db`select kind, amount_paise::bigint::int a, happened_on is null planned from cash_entries order by created_at`
        assert.deepEqual(entries.map((e) => [e.kind, e.a, e.planned]), [['funding', 50_000_000, false], ['gst_paid', 400_000, true]])
        await p.getByText('Funding').first().waitFor()
        await p.getByText('Planned', { exact: true }).first().waitFor()
        await p.screenshot({ path: t.out('movements') })
        await p.getByRole('button', { name: 'Mark paid' }).click()
        await expectToast(p, 'Marked paid.', 'ok')
        const [e] = await db`select count(*) filter (where happened_on is null)::int planned from cash_entries`
        assert.equal(e.planned, 0, 'nothing is planned now')
        await ctx.close()
      })

      await t.step('Accounts: the main account, its balance, and Undo takes a balance away', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/cashflow?view=accounts')
        await p.getByText('Main', { exact: true }).waitFor()
        await p.getByText('₹1,75,000').first().waitFor()
        await p.screenshot({ path: t.out('accounts') })
        await p.getByRole('button', { name: 'Undo balance' }).click()
        await until(async () => (await db`select count(*)::int n from cash_balances`)[0].n === 0)
        assert.equal((await db`select count(*)::int n from audit_events where action = 'cash.balance.undo'`)[0].n, 1, 'the undo is audited')
        await ctx.close()
      })

      await t.step('a phone: Overview, Movements and Accounts fit 390 px', async () => {
        const { ctx, p } = await open('frata', { viewport: { width: 390, height: 844 } })
        for (const view of ['overview', 'movements', 'accounts']) {
          await p.goto(CONSOLE + `/admin/cashflow?view=${view}`)
          await p.getByRole('heading', { level: 1, name: 'Cashflow' }).waitFor()
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
