// =============================================================================
// FLOW: partner-clients — P2 Clients (plan docs/plans/2026-11-16-p2-clients.md; mockup v2
// https://claude.ai/artifact/5ieqhb31Prax22Xe2UTtPX). The partner's owner opens Clients (one client: no tabs, no
// search), opens Kesar Studio's page, sets billing (a retainer), records an overdue bill (the list then says "₹12,000
// overdue · 11 days" with a Remind link that opens WhatsApp with no number), marks it paid and undoes, deletes it with a
// confirm; the share's month shows in rupees from a paid Frrata invoice. A Lead sees stages and next steps, never money;
// another partner's link is "not in your list". Phone and desktop.
// Guards: a Lead or Builder reaching bills or the share; Remind sending through Frrata; a write without the owner.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, expectToast, partnerOn, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const ist = (offsetDays) => new Date(Date.now() + 330 * 60_000 + offsetDays * 86_400_000).toISOString().slice(0, 10)

export default {
  name: 'partner-clients',
  async run(t) {
    const { db } = t
    const P = USERS.partner, L = USERS.lead
    await db`insert into auth.users (id, email, email_confirmed_at) values (${P.id}, ${P.email}, now()), (${L.id}, ${L.email}, now()) on conflict (id) do nothing`
    await partnerOn(db, KESAR, P)
    // Opened in January: the stage is Open and the share's window runs.
    await db`update partner_links set share_starts_at = '2026-01-12' where tenant_id = ${KESAR} and removed_at is null`
    const [link] = await db`select l.id, l.partner_id from partner_links l where l.tenant_id = ${KESAR} and l.removed_at is null`
    await db`delete from partner_client_bills where partner_id = ${link.partner_id}`
    await db`delete from partner_client_deals where partner_id = ${link.partner_id}`
    // A paid, issued Frrata invoice for last month: taxable ₹22,920 → the 20% share ₹4,584.
    await db`delete from frrata_invoices f where f.tenant_id = ${KESAR} and f.number = 'E2E87-1' and not exists (select 1 from frrata_payments p where p.invoice_id = f.id)`
    const [inv] = await db`insert into frrata_invoices (tenant_id, period_start, period_end, taxable, cgst, sgst, igst, total, number, issued_at)
      values (${KESAR}, (date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month') at time zone 'Asia/Kolkata',
              date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata', 2292000, 206280, 206280, 0, 2704560, 'E2E87-1', now())
      on conflict (tenant_id, period_start) do update set taxable = 2292000, total = 2704560, number = coalesce(frrata_invoices.number, 'E2E87-1'), issued_at = coalesce(frrata_invoices.issued_at, now()), test_mode = false, rolled = false
      returning id`
    await db`insert into frrata_payments (tenant_id, invoice_id, method, amount, captured_at)
      select ${KESAR}, ${inv.id}, 'upi', 2704560, now() where not exists (select 1 from frrata_payments where invoice_id = ${inv.id} and captured_at is not null)`
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }
    const pia = await open('partner', { viewport: { width: 1280, height: 900 } })

    await t.step('one client: no tabs, no search; the share in the header', async () => {
      await pia.goto(CONSOLE + '/partner')
      await pia.getByRole('heading', { name: 'Clients', level: 1 }).waitFor()
      const row = pia.getByRole('row').filter({ hasText: 'Kesar Studio' })
      await row.getByText('Open', { exact: true }).waitFor()
      assert.equal(await pia.getByRole('navigation', { name: 'Client views' }).count(), 0, 'one client shows no tabs')
      assert.equal(await pia.getByRole('searchbox').count(), 0, 'one client shows no search')
      await pia.getByText(/Your share ₹4,584 in [A-Z][a-z]{2}/).waitFor()
    })

    await t.step('the client page: set billing, record an overdue bill', async () => {
      await pia.getByRole('link', { name: 'Kesar Studio' }).click()
      await pia.waitForURL(`**/partner/clients/${link.id}`)
      await pia.getByRole('link', { name: 'Your billing' }).waitFor()
      await pia.getByText('No billing set').waitFor()
      await pia.getByRole('button', { name: 'Set billing' }).click()
      const d = pia.getByRole('dialog', { name: 'Change billing · Kesar Studio' })
      await d.getByLabel('Amount a month (₹)').fill('12,000')
      await d.getByLabel('Next bill').fill(ist(20))
      await d.getByRole('button', { name: 'Save billing' }).click()
      await expectToast(pia, 'Billing saved', 'ok')
      await pia.getByText('Retainer ·').waitFor()
      await pia.getByRole('button', { name: 'Record bill' }).click()
      const r = pia.getByRole('dialog', { name: 'Record bill · Kesar Studio' })
      await r.getByLabel('Amount (₹)').fill('')
      await r.getByRole('button', { name: 'Record bill' }).click()
      await r.getByText('Enter the amount.').waitFor()
      await r.getByLabel('Bill for').fill('October retainer')
      await r.getByLabel('Amount (₹)').fill('12000')
      await r.getByLabel('Due').fill(ist(-11))
      await r.getByLabel('Bill number (optional)').fill('PT-0412')
      await pia.screenshot({ path: t.out('record-bill') })
      await r.getByRole('button', { name: 'Record bill' }).click()
      await expectToast(pia, 'Recorded PT-0412 · ₹12,000', 'ok')
      const [b] = await db`select amount, due_on::text as due, paid_at from partner_client_bills where partner_id = ${link.partner_id}`
      assert.equal(Number(b.amount), 1200000); assert.equal(b.due, ist(-11)); assert.equal(b.paid_at, null)
      await pia.getByText('Overdue', { exact: true }).waitFor()
      await pia.screenshot({ path: t.out('client-billing') })
    })

    await t.step('the list: the overdue bill leads, Remind opens WhatsApp with no number', async () => {
      await pia.goto(CONSOLE + '/partner')
      const row = pia.getByRole('row').filter({ hasText: 'Kesar Studio' })
      await row.getByText('₹12,000 overdue · 11 days').waitFor()
      await pia.getByText(/Unpaid ₹12,000/).waitFor()
      const href = await row.getByRole('link', { name: 'Remind' }).getAttribute('href')
      assert.match(href, /^https:\/\/wa\.me\/\?text=/, 'Remind is the partner\'s own WhatsApp, no number')
      assert.match(decodeURIComponent(href), /₹12,000 was due on/)
      await pia.screenshot({ path: t.out('clients-owner') })
    })

    await t.step('mark paid, undo; delete asks first', async () => {
      await pia.goto(CONSOLE + `/partner/clients/${link.id}`)
      await pia.getByRole('button', { name: 'Mark paid' }).click()
      await expectToast(pia, 'Marked PT-0412 paid', 'ok')
      assert.notEqual((await db`select paid_at from partner_client_bills where partner_id = ${link.partner_id}`)[0].paid_at, null)
      await pia.locator('[data-toast="ok"]').getByRole('button', { name: 'Undo' }).click()
      await pia.getByRole('button', { name: 'Mark paid' }).waitFor()
      assert.equal((await db`select paid_at from partner_client_bills where partner_id = ${link.partner_id}`)[0].paid_at, null)
      await pia.getByRole('button', { name: 'More for PT-0412' }).click()
      await pia.getByRole('menuitem', { name: 'Delete bill' }).click()
      const d = pia.getByRole('dialog', { name: 'Delete 1 bill?' })
      await d.getByText('PT-0412 · ₹12,000. You can’t get it back.').waitFor()
      await d.getByRole('button', { name: 'Delete bill' }).click()
      await expectToast(pia, 'Bill deleted', 'ok')
      assert.equal((await db`select count(*)::int as n from partner_client_bills where partner_id = ${link.partner_id}`)[0].n, 0)
      await pia.getByRole('link', { name: 'Store' }).click()
      await pia.getByText(/20% · ₹4,584 in [A-Z][a-z]{2}/).waitFor()
    })

    await t.step('a Lead sees stages and next steps, never money', async () => {
      const [pm] = await db`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${link.partner_id}, ${L.id}, ${L.email}, 'lead', now())
        on conflict do nothing returning id`
      const mid = pm?.id ?? (await db`select id from partner_members where user_id = ${L.id} and removed_at is null`)[0].id
      await db`insert into partner_assignments (partner_member_id, tenant_id) values (${mid}, ${KESAR}) on conflict do nothing`
      await db`insert into members (tenant_id, user_id, role, partner_member_id) values (${KESAR}, ${L.id}, 'partner', ${mid}) on conflict (tenant_id, user_id) do nothing`
      const lead = await open('lead', { viewport: { width: 1280, height: 900 } })
      await lead.goto(CONSOLE + '/partner')
      await lead.getByRole('row').filter({ hasText: 'Kesar Studio' }).waitFor()
      for (const w of ['Your billing', 'Unpaid', 'Your share', '₹']) assert.equal(await lead.getByText(w).count(), 0, `a Lead sees "${w}"`)
      await lead.goto(CONSOLE + `/partner/clients/${link.id}`)
      await lead.getByText('Started').waitFor()
      for (const w of ['Your billing', 'Record bill', 'Your share', 'Mark paid']) assert.equal(await lead.getByText(w).count(), 0, `a Lead's client page shows "${w}"`)
      await lead.goto(CONSOLE + '/partner/clients/00000000-0000-4000-8000-000000000087')
      await lead.getByText('This client isn’t in your list').waitFor()
      await lead.context().close()
    })

    await t.step('phone: rows open the client; the page carries the action', async () => {
      const phone = await open('partner', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
      await phone.goto(CONSOLE + '/partner')
      await phone.getByRole('link', { name: 'Kesar Studio' }).waitFor()
      const wide = await phone.evaluate(() => document.documentElement.scrollWidth)
      assert.ok(wide <= 390, `Clients scrolls sideways on a phone (${wide}px)`)
      await phone.screenshot({ path: t.out('clients-phone') })
      await phone.getByRole('link', { name: 'Kesar Studio' }).click()
      await phone.getByRole('button', { name: 'Open store' }).waitFor()
      await phone.screenshot({ path: t.out('client-phone') })
      await phone.context().close()
    })
  },
}
