// =============================================================================
// FLOW: Frrata Admin in Neel (docs/plans/2026-11-15-neel-n4-admin.md; mockup docs/mockups/2026-11-15-neel-admin).
// Today lists what needs someone, oldest first, one action each, and the nav counts it. A store that paid too much is
// an item for a master admin: its invoice leads with the over-payment and Record refund records it once, through the
// definer, audited; the band and the item go. Support staff see no money item and no billing row in Activity. Activity
// filters by kind and says each action in words. On a phone, Today fits.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, expectToast, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const UTR = 'E2EREFUND91'

export default {
  name: 'neel-admin',
  async run(t) {
    const { db } = t
    const F = USERS.frata, S = USERS.staff
    await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do update set role = 'admin'`
    const open = async (who, opts = { viewport: { width: 1280, height: 900 } }) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return { ctx, p } }
    // An issued invoice from long ago that Kesar paid ₹1,180 too much on, by UPI two days back.
    let inv, pay
    await db.begin(async (x) => {
      await x`set local session_replication_role = replica`
      ;[inv] = await x`insert into frrata_invoices (tenant_id, period_start, period_end, taxable, cgst, sgst, igst, total, number, issued_at, test_mode)
        values (${KESAR}, '2024-01-01T00:00:00+05:30', '2024-02-01T00:00:00+05:30', 500000, 45000, 45000, 0, 590000, 'E2E-N4-1', now() - interval '20 days', false) returning id`
      await x`insert into frrata_invoice_lines (tenant_id, invoice_id, position, kind, description, period_start, period_end, quantity, rate_bps, taxable)
        values (${KESAR}, ${inv.id}, 1, 'plan', 'Launch plan', '2024-01-01T00:00:00+05:30', '2024-02-01T00:00:00+05:30', 1, null, 500000)`
      ;[pay] = await x`insert into frrata_payments (tenant_id, invoice_id, method, amount, utr, captured_at, over_paid, created_at)
        values (${KESAR}, ${inv.id}, 'upi', 708000, 'E2EPAYN4', now() - interval '2 days', 118000, now() - interval '2 days') returning id`
    })
    try {
      await t.step('Today: the over-payment is an item, its count in the nav; one action opens the invoice', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin')
        await p.getByRole('heading', { level: 1, name: 'Today' }).waitFor()
        const item = p.getByRole('region', { name: 'Needs you' }).locator('div').filter({ hasText: 'Kesar Studio paid ₹1,180 too much' }).first()
        await item.waitFor()
        assert.match(await p.getByRole('link', { name: /^Today/ }).first().textContent(), /\d/, 'the nav counts what Today lists')
        await p.screenshot({ path: t.out('today') })
        await item.getByRole('link', { name: 'Record refund' }).click()
        await p.waitForURL(new RegExp(`/admin/billing/invoice/${inv.id}$`))
        await p.getByRole('region', { name: 'Needs you' }).getByText('Kesar Studio paid ₹1,180 too much by UPI').waitFor()
        await ctx.close()
      })

      await t.step('Record refund: a dialog, recorded once through the definer, audited; the band and the item go', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + `/admin/billing/invoice/${inv.id}`)
        await p.getByRole('button', { name: 'Record refund' }).click()
        const dlg = p.getByRole('dialog', { name: /^Record the ₹1,180 refund to Kesar Studio/ })
        await dlg.getByLabel('Bank reference (UTR)').fill(UTR)
        await dlg.getByRole('button', { name: 'Record refund' }).click()
        await expectToast(p, 'Refund recorded.', 'ok')
        const [r] = await db`select refund_amount::int a, refund_utr, refunded_by from frrata_payments where id = ${pay.id}`
        assert.deepEqual([r.a, r.refund_utr, r.refunded_by], [118000, UTR, F.id])
        assert.equal((await db`select count(*)::int n from audit_events where action = 'billing.refund' and target = ${pay.id}`)[0].n, 1, 'the refund is audited')
        await p.reload()
        assert.equal(await p.getByRole('region', { name: 'Needs you' }).count(), 0, 'the band goes once refunded')
        await p.getByText(/₹1,180 refunded/).waitFor()
        await p.goto(CONSOLE + '/admin')
        assert.equal(await p.getByText('Kesar Studio paid ₹1,180 too much').count(), 0, 'and so does the Today item')
        // Recorded once: the definer refuses a second refund on the same payment.
        await assert.rejects(db`select app_record_frrata_refund(${pay.id}::uuid, 'E2EAGAIN91', current_date, ${F.id}::uuid)`, /already recorded/)
        await ctx.close()
      })

      await t.step('Activity: by kind, in words; support staff see no money in Today or Activity', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/activity?kind=billing')
        await p.getByRole('cell', { name: 'recorded a refund' }).first().waitFor()
        assert.equal(await p.getByText('billing.refund').count(), 0, 'an action is said in words, never its code')
        await ctx.close()
        await db`insert into platform_staff (user_id, email, role) values (${S.id}, ${S.email}, 'support') on conflict (user_id) do update set role = 'support'`
        await db`update frrata_payments set refund_amount = null, refund_utr = null, refunded_at = null, refunded_by = null where id = ${pay.id}`
        const sup = await open('staff')
        await sup.p.goto(CONSOLE + '/admin')
        await sup.p.getByRole('heading', { level: 1, name: 'Today' }).waitFor()
        assert.equal(await sup.p.getByText('Kesar Studio paid ₹1,180 too much').count(), 0, 'a money item is for a master admin')
        await sup.p.goto(CONSOLE + '/admin/activity')
        await sup.p.getByRole('heading', { level: 1, name: 'Activity' }).waitFor()
        assert.equal(await sup.p.getByRole('cell', { name: 'recorded a refund' }).count(), 0, 'billing rows are for a master admin')
        assert.equal(await sup.p.locator('select[name="kind"] option[value="billing"]').count(), 0)
        await sup.ctx.close()
      })

      await t.step('Phone: Today fits at 390 px', async () => {
        const { ctx, p } = await open('frata', { viewport: { width: 390, height: 844 } })
        await p.goto(CONSOLE + '/admin')
        await p.getByRole('heading', { level: 1, name: 'Today' }).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
        await p.screenshot({ path: t.out('today-phone') })
        await ctx.close()
      })
    } finally {
      await db`delete from platform_staff where user_id = ${S.id}`
      await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        await x`delete from frrata_payments where invoice_id = ${inv.id}`
        await x`delete from frrata_invoice_lines where invoice_id = ${inv.id}`
        await x`delete from frrata_invoices where id = ${inv.id}`
      })
    }
  },
}
