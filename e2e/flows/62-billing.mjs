// =============================================================================
// FLOW: billing B1 — Console › Settings › Plan and billing (docs/specs/2026-11-08-billing.md § Design). The owner sees
// the plan and this month so far (a delivered order counted with its fee), checks billing details (a GSTIN decides
// the State; a mismatch is refused, then saved); staff never see money (no row in Settings, the page refuses);
// Admin's "Delivered this month" is the count the billing run drafted. Nothing is charged. Cleans up after itself.
// =============================================================================
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { BILLING_KEYS, CONSOLE, FAKE_CHECKOUT, RZP, USERS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
// The IST month after the one `d` falls in, as "YYYY-MM" (month ends are IST, not UTC).
const nextYm = (d) => { const i = new Date(d.getTime() + 330 * 60_000); const n = new Date(Date.UTC(i.getUTCFullYear(), i.getUTCMonth() + 1, 1)); return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}` }

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
        const audit = await db`select detail from audit_events where tenant_id = ${KESAR} and action = 'billing.details' order by at desc limit 1`
        assert.deepEqual(audit[0]?.detail, { gstin: true, state: '27' }, 'audited, without the GSTIN itself')
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
        await meera.goto(CONSOLE + `/admin/billing?month=${nextYm(new Date())}`)
        await meera.getByRole('button', { name: /^Run drafts for/ }).click()
        await meera.getByText(/drafted/).first().waitFor()
        const [d] = await until(async () => { const r = await db`select orders_billed from frrata_invoices where tenant_id = ${KESAR} order by period_start desc limit 1`; return r.length && r })
        assert.ok(d.orders_billed >= 1, 'the delivered order is counted')
        await meera.goto(CONSOLE + '/admin/merchants')
        const row = meera.getByRole('row').filter({ hasText: 'Kesar' })
        await row.getByText(String(d.orders_billed), { exact: true }).first().waitFor()
        assert.equal(await row.getByText('—', { exact: true }).count(), 0, 'a drafted shop shows its count, not a dash')
      })

      await t.step('B2: Admin issues this month (typed confirmation) in the TEST series; the shop sees it as a test and downloads it; never collected by hand; a credit note; never in the GST export', async () => {
        const meera = await open('frata', { viewport: { width: 1280, height: 900 } })
        const now = new Date(); const i = new Date(now.getTime() + 330 * 60_000)
        const thisYm = `${i.getUTCFullYear()}-${String(i.getUTCMonth() + 1).padStart(2, '0')}`
        await meera.goto(CONSOLE + `/admin/billing?month=${thisYm}`)
        await meera.getByRole('button', { name: /^Run drafts for/ }).click()
        await meera.getByText(/drafted/).first().waitFor()
        const issue = meera.getByRole('button', { name: /^Issue \d+ invoices?$/ })
        await issue.waitFor()
        const n = Number((await issue.textContent()).match(/\d+/)[0])
        await meera.getByLabel(/Type ISSUE/).fill('ISSUE 999')
        await issue.click()
        await meera.getByText(`Type ISSUE ${n} to issue.`).waitFor()
        await meera.getByLabel(/Type ISSUE/).fill(`ISSUE ${n}`)
        await meera.getByRole('button', { name: /^Issue \d+ invoices?$/ }).click()
        await meera.getByText(/issued.*test mode/).waitFor()
        const [inv] = await db`select id, number, total from frrata_invoices where tenant_id = ${KESAR} and number is not null order by issued_at desc limit 1`
        assert.match(inv.number, /^FRR\/T\d\d-\d\d\/\d{6}$/)
        // The shop: the test invoice says so, with its PDF (named TEST).
        await riya.goto(CONSOLE + '/console/settings/billing')
        await riya.getByText(inv.number).waitFor()
        await riya.getByText(/^Test · due/).first().waitFor()
        const pdf = await riya.context().request.get(CONSOLE + `/console/settings/billing/invoice/${inv.id}`)
        assert.equal(pdf.status(), 200); assert.equal(pdf.headers()['content-type'], 'application/pdf')
        assert.match(pdf.headers()['content-disposition'], /Frrata TEST Tax invoice FRR-T/)
        // Admin: a test invoice is never collected by hand; a credit note is issued in the test series.
        await meera.goto(CONSOLE + `/admin/billing/invoice/${inv.id}`)
        await meera.getByText('A test invoice is never collected by hand.').waitFor()
        assert.equal(await meera.getByRole('button', { name: 'Record payment' }).count(), 0)
        await meera.getByLabel(/Taxable value to credit/).fill('10')
        await meera.getByLabel(/Reason/).fill('Goodwill for a slow week')
        await meera.getByRole('button', { name: 'Issue credit note' }).click()
        await meera.getByText(/Credit note FRR\/T\d\d-\d\d\/C\d{5} issued/).waitFor()
        await riya.reload(); await riya.getByText(/^Credit note FRR\/T/).first().waitFor()
        assert.equal(await riya.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'the invoices table fits a 390 px phone')
        await riya.screenshot({ path: t.out('invoices-test'), fullPage: true })
        // The CA's export never lists a test document.
        const csv = await meera.context().request.get(CONSOLE + `/admin/billing/export?month=${thisYm}`)
        assert.equal(csv.status(), 200)
        assert.ok(!(await csv.text()).includes(inv.number), 'test documents stay out of the GST export')
      })

      await t.step('B3: UPI Autopay set up through Checkout (verified on the server); a notice, then a debit 25 h later; a failure shows the banner, the retry after a fresh notice settles it; a signed webhook turns autopay off', async () => {
        await riya.context().route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_CHECKOUT }))
        await riya.goto(CONSOLE + '/console/settings/billing')
        await riya.getByRole('button', { name: 'UPI Autopay' }).click()
        await riya.getByText('Active', { exact: true }).waitFor()
        const meera = await open('frata', { viewport: { width: 1280, height: 900 } })
        const run = async () => { await meera.goto(CONSOLE + '/admin/billing'); await meera.getByRole('button', { name: 'Run collection now' }).click(); await meera.getByText(/notices?, \d+ debits? started/).waitFor() }
        const [inv] = await db`select id from frrata_invoices where tenant_id = ${KESAR} and number is not null order by issued_at desc limit 1`
        // 26 hours pass: notices and failures move back together, so their order (a fresh notice after a failure) holds.
        const age = async () => {
          await db`update billing_notices set created_at = created_at - interval '26 hours', debit_at = debit_at - interval '26 hours' where invoice_id = ${inv.id}`
          await db`update frrata_payments set failed_at = failed_at - interval '26 hours' where invoice_id = ${inv.id} and failed_at is not null`
        }
        // 1. A notice first; no debit yet.
        await run()
        assert.equal((await db`select count(*)::int n from billing_notices where invoice_id = ${inv.id} and kind = 'debit_notice'`)[0].n, 1)
        assert.equal((await db`select count(*)::int n from frrata_payments where invoice_id = ${inv.id} and attempt > 0`)[0].n, 0, 'no debit before the notice has stood 25 h')
        // 2. The notice has stood; the bank declines the debit: the banner, on every page, for the owner.
        await age(); await fetch(`${RZP}/_test/fail-next`, { method: 'POST' })
        await run()
        await until(async () => (await db`select failed_at from frrata_payments where invoice_id = ${inv.id} and attempt = 1`)[0]?.failed_at, 15_000)
        await riya.goto(CONSOLE + '/console'); await riya.getByText(/didn.t go through/).waitFor()
        // 3. A fresh notice, then the retry: captured; the banner goes.
        await run(); await age(); await run()
        await until(async () => (await db`select captured_at from frrata_payments where invoice_id = ${inv.id} and attempt = 2`)[0]?.captured_at, 15_000)
        await riya.reload(); assert.equal(await riya.getByText(/didn.t go through/).count(), 0)
        // 4. The billing webhook: a bad signature is refused; a signed token.cancelled turns autopay off.
        const [{ tok }] = await db`select mandate_token_id tok from billing_accounts where tenant_id = ${KESAR}`
        const body = JSON.stringify({ event: 'token.cancelled', created_at: 1, payload: { token: { entity: { id: tok, status: 'cancelled' } } } })
        const sig = createHmac('sha256', BILLING_KEYS.webhook).update(body).digest('hex')
        assert.equal((await fetch(CONSOLE + '/api/webhooks/billing', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': '0'.repeat(64) }, body })).status, 401)
        assert.equal((await fetch(CONSOLE + '/api/webhooks/billing', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig }, body })).status, 200)
        await until(async () => (await db`select mandate_revoked_at from billing_accounts where tenant_id = ${KESAR}`)[0].mandate_revoked_at)
        await riya.goto(CONSOLE + '/console/settings/billing'); await riya.getByRole('button', { name: 'UPI Autopay' }).waitFor()
        await riya.screenshot({ path: t.out('autopay-off'), fullPage: true })
      })
      await t.step('B4: the owner upgrades to Growth now (the difference by days, in words); a switch back waits for the 1st, and Keep my plan cancels it', async () => {
        await riya.goto(CONSOLE + '/console/settings/billing')
        await riya.getByRole('button', { name: 'Upgrade to Growth' }).click()
        await riya.getByRole('dialog').getByText(/is added to your next bill/).waitFor()
        await riya.getByRole('button', { name: 'Upgrade now' }).click()
        await riya.getByText('You are on Growth now.').waitFor()
        await riya.locator('strong', { hasText: 'Growth' }).first().waitFor()
        await riya.getByRole('button', { name: /^Switch to Launch on / }).click()
        await riya.getByRole('button', { name: 'Switch on the 1st' }).click()
        await riya.getByText(/^Moving to/).waitFor()
        await riya.screenshot({ path: t.out('plan-change'), fullPage: true })
        await riya.getByRole('button', { name: 'Keep my plan' }).click()
        await riya.getByText('The change is cancelled.').waitFor()
        await until(async () => (await db`select count(*)::int n from tenant_plans where tenant_id = ${KESAR} and starts_at > now()`)[0].n === 0)
      })
      await t.step('TR0: Admin sets the trial terms for new sign-ups (with a reason); gives a live shop a 14-day trial, sees it on Merchants, then ends it', async () => {
        const meera = await open('frata', { viewport: { width: 1280, height: 900 } })
        await meera.goto(CONSOLE + '/admin/plans#trials')
        await meera.getByLabel(/^Length for new sign-ups/).fill('45')
        await meera.getByLabel(/^Why \(kept/).fill('Festive campaign')
        await meera.getByRole('button', { name: 'Save trial terms' }).click()
        await meera.getByText('New sign-ups get 45 days from going live.').waitFor()
        await meera.goto(CONSOLE + `/admin/merchants/${KESAR}/plan`)
        await meera.getByText('No trial.').waitFor()
        await meera.getByLabel(/^Days, 7 to 90/).fill('14')
        await meera.locator('#trial').getByLabel(/^Why$/).fill('Partner deal')
        await meera.getByRole('button', { name: 'Give a trial' }).click()
        await meera.getByText(/^\d+ days left · 14 days/).waitFor() // Kesar is live: the clock starts now
        await meera.screenshot({ path: t.out('admin-trial'), fullPage: true })
        await meera.goto(CONSOLE + '/admin/merchants?q=Kesar')
        await meera.getByText(/Trial(?: ending)? · \d+ days left/).first().waitFor()
        await meera.goto(CONSOLE + `/admin/merchants/${KESAR}/plan`)
        await meera.getByLabel(/^Why end it now/).fill('Test over')
        await meera.getByRole('button', { name: 'End the trial now' }).click()
        await meera.getByText('Trial ended.').waitFor()
        assert.equal((await db`select count(*)::int n from audit_events where tenant_id = ${KESAR} and action in ('trial.set', 'trial.end')`)[0].n, 2)
      })
    } finally {
      // Issued invoices, payments and credit notes are final (triggers): the test's own are removed with triggers off.
      await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        await x`delete from billing_notices where tenant_id = ${KESAR}`
        await x`delete from billing_mandate_setups where tenant_id = ${KESAR}`
        await x`delete from billing_events`
        await x`delete from frrata_payments where tenant_id = ${KESAR}`
        await x`delete from frrata_credit_notes where tenant_id = ${KESAR}`
        await x`delete from frrata_invoices where tenant_id = ${KESAR}`
        await x`delete from frrata_invoice_lines where tenant_id = ${KESAR}`
        await x`delete from frrata_invoice_fees where tenant_id = ${KESAR}`
      })
      await db`delete from tenant_plans where tenant_id = ${KESAR} and reason = 'Changed by the shop'`
      await db`delete from shop_trials where tenant_id = ${KESAR}`
      await db`update tenant_plans set trial_ends_at = null where tenant_id = ${KESAR}`
      await db`update trial_settings set days = 30, open_window_days = 15 where id = 1`
      await db`delete from billing_accounts where tenant_id = ${KESAR}`
      await db`delete from audit_events where tenant_id = ${KESAR} and action in ('billing.details', 'billing.plan.change', 'billing.plan.cancel', 'trial.set', 'trial.end')`
      await db`delete from orders where tenant_id = ${KESAR} and number = ${N}`
      await db`delete from members where tenant_id = ${KESAR} and user_id = ${USERS.staff.id}`
    }
  },
}
