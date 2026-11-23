// =============================================================================
// FLOW: partner-credits — C1 Studio credits and billing (plan docs/plans/2026-11-22-c1-credits.md; mockups
// docs/mockups/2026-11-22-four-screens.html § 1 and docs/mockups/2026-11-22-c1-undrawn.html, approved 2026-11-22).
// The partner owner opens Credits and billing from the workspace's menu: 20 free credits, the Partner plan; buying asks
// for invoice details first; after them, a pack bought through Checkout (TEST keys, the fake gateway) shows only once
// the server saw the payment, with its GST invoice (a test invoice) as a PDF; a client's budget set; usage as CSV. A
// Lead sees Client budgets only, no buying, no money. Phone and desktop. Cleans up after itself.
// Guards: credits shown before the server saw a payment; a Lead reaching purchases or invoices; a Builder in the menu.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, FAKE_CHECKOUT, USERS, expectToast, partnerOn, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'

export default {
  name: 'partner-credits',
  async run(t) {
    const { db } = t
    const P = USERS.partner, L = USERS.lead
    await db`insert into auth.users (id, email, email_confirmed_at) values (${P.id}, ${P.email}, now()), (${L.id}, ${L.email}, now()) on conflict (id) do nothing`
    await partnerOn(db, KESAR, P)
    const [link] = await db`select l.id, l.partner_id from partner_links l where l.tenant_id = ${KESAR} and l.removed_at is null`
    const pid = link.partner_id
    const clean = async () => {
      await db`delete from partner_credit_notices where partner_id = ${pid}`
      await db`delete from partner_invoices where partner_id = ${pid}`
      await db`delete from partner_credit_entries where partner_id = ${pid} and lot_id is not null`
      await db`delete from partner_credit_entries where partner_id = ${pid}`
      await db`delete from partner_credit_uses where partner_id = ${pid}`
      await db`delete from partner_client_budgets where partner_id = ${pid}`
      await db`delete from partner_credit_purchases where partner_id = ${pid}`
      await db`delete from partner_seats where partner_id = ${pid}`
      await db`delete from partner_credit_tries where user_id = ${P.id}`
      await db`insert into partner_billing (partner_id) values (${pid}) on conflict (partner_id) do update set legal_name = null, gstin = null, pan = null, state_code = null, address = null, details_at = null`
      await db`insert into partner_credit_entries (partner_id, kind, credits, expires_at) values (${pid}, 'grant', 20, now() + interval '90 days')`
    }
    await clean()
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }

    try {
      const pia = await open('partner', { viewport: { width: 1280, height: 900 } })
      await pia.context().route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_CHECKOUT }))

      await t.step('the menu opens Credits and billing: 20 free credits, the Partner plan', async () => {
        await pia.goto(CONSOLE + '/partner')
        await pia.getByRole('link', { name: 'Credits and billing' }).first().click()
        await pia.getByRole('heading', { level: 1, name: 'Credits and billing' }).waitFor()
        await pia.getByText('20 free credits').waitFor()
        await pia.getByText('20 credits, once').waitFor()
        for (const tab of ['Overview', 'Usage', 'Client budgets', 'Payments and invoices', 'Plan']) await pia.getByRole('link', { name: tab, exact: true }).waitFor()
        await pia.screenshot({ path: t.out('overview'), fullPage: true })
      })

      await t.step('buying asks for invoice details first; nothing is charged', async () => {
        await pia.getByRole('button', { name: 'Buy credits' }).first().click()
        const d = pia.getByRole('dialog', { name: 'Buy credits' })
        await d.getByText('₹2,358.82').first().waitFor()
        await d.getByRole('button', { name: 'Pay ₹2,358.82' }).click()
        await d.getByText('Add a name and a state.').waitFor()
        await d.getByRole('button', { name: 'Not now' }).click()
        assert.equal((await db`select count(*)::int n from partner_credit_purchases where partner_id = ${pid}`)[0].n, 0)
      })

      await t.step('invoice details: a wrong GSTIN at its field, then saved', async () => {
        await pia.goto(CONSOLE + '/partner/credits?tab=payments')
        await pia.getByRole('button', { name: 'Edit details' }).click()
        const d = pia.getByRole('dialog', { name: 'Invoices go to' })
        await d.getByLabel('Legal name').fill('Pia Studio LLP')
        await d.getByRole('textbox', { name: /GSTIN/ }).fill('27AAACP1234R1Z')
        await d.getByLabel('Address').fill('12 Hill Road, Mumbai')
        await d.getByRole('button', { name: 'Save details' }).click()
        await d.getByText(/A GSTIN has 15 characters/).first().waitFor()
        await d.getByRole('textbox', { name: /GSTIN/ }).fill('')
        await d.getByLabel('State').selectOption('Maharashtra')
        await d.getByRole('button', { name: 'Save details' }).click()
        await expectToast(pia, 'Saved.', 'ok')
        const [b] = await db`select legal_name, state_code from partner_billing where partner_id = ${pid}`
        assert.deepEqual([b.legal_name, b.state_code], ['Pia Studio LLP', '27'])
      })

      await t.step('a pack: credits arrive only after the server saw the payment; its invoice is a PDF', async () => {
        await pia.goto(CONSOLE + '/partner/credits')
        await pia.getByRole('button', { name: 'Buy credits' }).first().click()
        await pia.getByRole('dialog', { name: 'Buy credits' }).getByRole('button', { name: 'Pay ₹2,358.82' }).click()
        await expectToast(pia, '100 credits added.', 'ok')
        await pia.getByText('120 credits').waitFor()
        const [p] = await db`select paid_at, total, test, payment_id from partner_credit_purchases where partner_id = ${pid} and kind = 'pack'`
        assert.ok(p.paid_at, 'paid'); assert.equal(Number(p.total), 235882); assert.equal(p.test, true)
        await pia.goto(CONSOLE + '/partner/credits?tab=payments')
        const inv = pia.getByRole('link', { name: /^FRR\/T\d{2}-\d{2}\/\d{6}$/ })
        await inv.waitFor()
        await pia.getByText('Test', { exact: true }).waitFor()
        const pdf = await pia.context().request.get(CONSOLE + (await inv.getAttribute('href')))
        assert.equal(pdf.status(), 200); assert.match(pdf.headers()['content-type'] ?? '', /pdf/)
        await pia.screenshot({ path: t.out('payments'), fullPage: true })
      })

      await t.step('a client budget, and usage as CSV', async () => {
        await pia.goto(CONSOLE + '/partner/credits?tab=budgets')
        await pia.getByRole('button', { name: 'Set budget' }).first().click()
        const d = pia.getByRole('dialog', { name: /Kesar Studio’s budget/ })
        await d.getByRole('textbox').fill('300')
        await d.getByRole('button', { name: 'Save budget' }).click()
        await expectToast(pia, /budget is now 300 credits/, 'ok')
        await pia.getByText('0 of 300').waitFor()
        await pia.goto(CONSOLE + '/partner/credits?tab=usage')
        await pia.getByText('Free credits').first().waitFor()
        const month = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7)
        const csv = await pia.context().request.get(CONSOLE + `/partner/credits/usage.csv?month=${month}-01`)
        assert.equal(csv.status(), 200); assert.match(csv.headers()['content-type'] ?? '', /text\/csv/)
        assert.match(await csv.text(), /^"When","Client"/)
      })

      await t.step('phone: the tabs scroll, Buy credits is a sheet', async () => {
        const phone = await open('partner', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
        await phone.goto(CONSOLE + '/partner/credits')
        await phone.getByRole('heading', { level: 1, name: 'Credits and billing' }).waitFor()
        const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
        assert.equal(wide, false, 'no sideways page scroll')
        await phone.getByRole('button', { name: 'Buy credits' }).first().click()
        await phone.getByRole('dialog', { name: 'Buy credits' }).waitFor()
        await phone.screenshot({ path: t.out('phone-buy') })
        await phone.context().close()
      })

      await t.step('a Lead: Client budgets only, no buying, no money', async () => {
        const [pm] = await db`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${pid}, ${L.id}, ${L.email}, 'lead', now())
          on conflict do nothing returning id`
        const mid = pm?.id ?? (await db`select id from partner_members where user_id = ${L.id} and removed_at is null`)[0].id
        await db`insert into partner_assignments (partner_member_id, tenant_id) values (${mid}, ${KESAR}) on conflict do nothing`
        await db`insert into members (tenant_id, user_id, role, partner_member_id) values (${KESAR}, ${L.id}, 'partner', ${mid}) on conflict (tenant_id, user_id) do nothing`
        const lead = await open('lead', { viewport: { width: 1280, height: 900 } })
        await lead.goto(CONSOLE + '/partner/credits?tab=payments')
        await lead.getByText('0 of 300').waitFor()
        for (const w of ['Buy credits', 'Payments and invoices', 'Overview', 'FRR/', '₹']) assert.equal(await lead.getByText(w).count(), 0, `a Lead sees "${w}"`)
        const pdf = await lead.context().request.get(CONSOLE + `/partner/credits/usage.csv?month=2026-11-01`)
        assert.equal(pdf.status(), 403)
        await lead.context().close()
      })
      await pia.context().close()
    } finally {
      await db`delete from partner_assignments where partner_member_id in (select id from partner_members where user_id = ${L.id})`
      await db`delete from members where user_id = ${L.id} and tenant_id = ${KESAR}`
      await db`delete from partner_members where user_id = ${L.id}`
      await clean()
    }
  },
}
