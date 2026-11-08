// =============================================================================
// FLOW: billing B1 — Console › Settings › Plan and billing (docs/specs/2026-11-08-billing.md § Design). The owner sees
// the plan and this month so far (a delivered order counted with its fee), checks billing details (a GSTIN decides
// the State; a mismatch is refused, then saved); staff never see money (no row in Settings, the page refuses);
// Admin's "Delivered this month" is the count the billing run drafted. Nothing is charged. Cleans up after itself.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const ym = (d) => { const i = new Date(d.getTime() + 330 * 60_000); return `${i.getUTCFullYear()}-${String(i.getUTCMonth() + 1).padStart(2, '0')}` }

export default {
  name: 'billing',
  async run(t) {
    const { db } = t
    const F = USERS.frata
    await db`insert into auth.users (id, email, email_confirmed_at) values (${F.id}, ${F.email}, now()) on conflict (id) do nothing`
    await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do nothing`
    // Arjun works at Kesar as staff (other flows add and remove him; this one does its own).
    await db`insert into auth.users (id, email, email_confirmed_at) values (${USERS.staff.id}, ${USERS.staff.email}, now()) on conflict (id) do nothing`
    await db`insert into members (tenant_id, user_id, role) values (${KESAR}, ${USERS.staff.id}, 'staff') on conflict do nothing`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${KESAR}`
    const N = top + 1
    // Delivered an hour ago: billable now, so it is on this month's count.
    await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, packed_at, invoice_number, shipped_at, delivered_at, customer_name, phone, city, pincode, state, subtotal, total, merchandise_net)
      values (${KESAR}, ${N}, 'cod', now() - interval '3 days', now() - interval '3 days', now() - interval '2 days', ${`KS/26-27/9${N}`.slice(0, 16)}, now() - interval '2 days', now() - interval '1 hour', 'Bill Riya', '9833300009', 'Jaipur', '302001', 'Rajasthan', 100000, 100000, 85714)`
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }
    try {
      const riya = await open('owner', { viewport: { width: 390, height: 844 } })
      await t.step('the owner: plan and this month so far, with the delivered order and its fee; no sideways scroll on a phone', async () => {
        await riya.goto(CONSOLE + '/console/settings')
        await riya.getByRole('link', { name: /Plan and billing/ }).click()
        await riya.getByRole('heading', { level: 1, name: 'Plan and billing' }).waitFor()
        await riya.locator('strong', { hasText: 'Launch' }).waitFor()
        await riya.getByText(/Estimated bill on|rolls to the next month/).waitFor()
        await riya.getByText('How it adds up').click()
        await riya.getByText(new RegExp(`-${N}$`)).waitFor()
        assert.equal(await riya.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll at 390 px')
        await riya.screenshot({ path: t.out('plan-and-billing'), fullPage: true })
      })

      await t.step('billing details: a GSTIN decides the State (a different one is refused), then they save', async () => {
        await riya.getByLabel('Legal name').fill('Kesar Studio LLP')
        await riya.getByLabel(/GSTIN/).fill('27AAPFU0939F1ZV')
        await riya.getByLabel('State').selectOption('08')
        await riya.getByLabel('Billing address').fill('12 MI Road, Jaipur 302001')
        await riya.getByLabel('Billing email').fill('accounts@kesarstudio.in')
        await riya.getByRole('button', { name: 'Save billing details' }).click()
        await riya.getByText(/registered in state 27/).waitFor()
        await riya.getByLabel('State').selectOption('27')
        await riya.getByRole('button', { name: 'Save billing details' }).click()
        await riya.getByText('Saved. Your next invoice is made out to these details.').waitFor()
        const [a] = await db`select legal_name, gstin, state_code, email from billing_accounts where tenant_id = ${KESAR}`
        assert.deepEqual([a.legal_name, a.gstin, a.state_code, a.email], ['Kesar Studio LLP', '27AAPFU0939F1ZV', '27', 'accounts@kesarstudio.in'])
      })

      await t.step('staff never see money: Settings is closed to them, and the billing page refuses a typed link', async () => {
        const arjun = await open('staff')
        await arjun.goto(CONSOLE + '/console/settings')
        await arjun.getByText('You can’t change this shop’s settings').waitFor()
        assert.equal(await arjun.getByRole('link', { name: /Plan and billing/ }).count(), 0)
        await arjun.goto(CONSOLE + '/console/settings/billing')
        await arjun.getByText('Only the shop’s owner or an admin can see its plan and bills').waitFor()
        assert.equal(await arjun.getByText(/Estimated bill|Fee so far/).count(), 0)
      })

      await t.step("Admin: Run drafts for next month, then Merchants shows the drafted count as Delivered this month", async () => {
        const meera = await open('frata', { viewport: { width: 1280, height: 900 } })
        const next = new Date(); next.setUTCDate(28); next.setUTCDate(next.getUTCDate() + 7)
        await meera.goto(CONSOLE + `/admin/billing?month=${ym(next)}`)
        await meera.getByRole('button', { name: /^Run drafts for/ }).click()
        await meera.getByText(/drafted/).first().waitFor()
        const [d] = await until(async () => { const r = await db`select orders_billed from frrata_invoices where tenant_id = ${KESAR} order by period_start desc limit 1`; return r.length && r })
        assert.ok(d.orders_billed >= 1, 'the delivered order is counted')
        await meera.goto(CONSOLE + '/admin/merchants')
        const row = meera.getByRole('row').filter({ hasText: 'Kesar' })
        await row.getByText(String(d.orders_billed)).first().waitFor()
      })
    } finally {
      await db`delete from frrata_invoices where tenant_id = ${KESAR} and issued_at is null` // cascades lines, fees, credits
      await db`delete from billing_accounts where tenant_id = ${KESAR}`
      await db`delete from orders where tenant_id = ${KESAR} and number = ${N}`
      await db`delete from members where tenant_id = ${KESAR} and user_id = ${USERS.staff.id}`
    }
  },
}
