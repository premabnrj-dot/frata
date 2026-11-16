// =============================================================================
// FLOW: owner-only settings after handover (partner publishing PP1, docs/specs/2026-11-16-partner-publishing.md § PP1
// plan; mockup docs/mockups/2026-11-16-pp1-owner-only.html, approved 2026-11-16). On 89-content's partner-after-handover
// store: the partner sees Policies, Business and GST, the grievance officer and the invoice signatory and series as
// facts with the chip; customer care still saves; Ask the owner tells the owner (and not staff) once, then reads "Asked
// today"; a save from a tab opened before handover is refused in words with Reload, nothing changed; the owner edits all
// of it. Phone and desktop. Puts the store back.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, expectToast, partnerOn, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const CHIP = 'Only the owner or a Manager can edit'

export default {
  name: 'owner-only',
  async run(t) {
    const { db } = t
    const open = async (who, opts = { viewport: { width: 1280, height: 900 } }) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`)); return { ctx, p } }
    const settings = async () => (await db`select legal_name, grievance_name, grievance_phone, instagram, doc_signatory, invoice_series, order_prefix, version from shop_settings where tenant_id = ${KESAR}`)[0]
    const before = await settings()
    await db`delete from notices where tenant_id = ${KESAR} and source_kind = 'ask_owner'`
    await partnerOn(db, KESAR, USERS.partner)
    const pia = await open('partner')
    // Pia may build other stores (earlier flows): this flow is about Kesar Studio.
    await pia.ctx.addCookies([{ name: 'frata_tenant', value: KESAR, domain: 'localhost', path: '/' }])
    const owner = await open('owner')
    try {
      await t.step('Contact: the grievance officer reads as facts with the chip and Ask the owner; customer care still saves', async () => {
        const p = pia.p
        await p.goto(CONSOLE + '/console/settings/contact')
        const card = p.locator('section').filter({ has: p.getByRole('heading', { name: 'Grievance officer' }) })
        await card.getByText(CHIP, { exact: true }).waitFor()
        await card.getByRole('button', { name: 'Ask the owner' }).waitFor()
        await card.getByText(before.grievance_name, { exact: true }).waitFor()
        assert.equal(await card.getByRole('textbox').count(), 0, 'no field for the grievance officer')
        assert.equal(await p.getByRole('textbox', { name: 'Name' }).count(), 0)
        await p.screenshot({ path: t.out('owner-only-contact'), fullPage: true })
        await p.getByRole('textbox', { name: /^Instagram handle/ }).fill('kesar.partner')
        await p.getByRole('button', { name: /^Save/ }).click()
        await expectToast(p, 'Saved. Your store shows it now.', 'ok')
        const now = await settings()
        assert.equal(now.instagram, 'kesar.partner')
        assert.equal(now.grievance_name, before.grievance_name, 'the grievance officer is never written by the partner')
        assert.equal(now.grievance_phone, before.grievance_phone)
        await p.setViewportSize({ width: 390, height: 844 })
        await p.reload()
        await card.getByText(CHIP, { exact: true }).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
        await p.screenshot({ path: t.out('owner-only-contact-phone'), fullPage: true })
        await p.setViewportSize({ width: 1280, height: 900 })
      })

      await t.step('Policies: the chip and Ask the owner in the header; no Rewrite, Edit, Follow or save bar; the pages still pick the preview', async () => {
        const p = pia.p
        await p.goto(CONSOLE + '/console/settings/policies')
        await p.getByRole('heading', { level: 1, name: 'Policies' }).waitFor()
        await p.locator('header').getByText(CHIP, { exact: true }).waitFor()
        await p.locator('header').getByRole('button', { name: 'Ask the owner' }).waitFor()
        for (const name of ['Rewrite', 'Edit', 'Follow my settings again']) assert.equal(await p.getByRole('button', { name, exact: true }).count(), 0, `no ${name}`)
        assert.equal(await p.locator('main#content').getByRole('combobox').count(), 0, 'the return choices are facts')
        await p.getByText('What shoppers can ask for', { exact: true }).waitFor()
        await p.getByRole('button', { name: 'Shipping', exact: true }).click()
        assert.equal(await p.getByRole('tab', { name: 'Shipping' }).getAttribute('aria-selected'), 'true', 'a page still picks the preview')
        assert.equal(await p.locator('[role="region"][aria-label="Unsaved changes"]').count(), 0)
        await p.screenshot({ path: t.out('owner-only-policies'), fullPage: true })
        await p.setViewportSize({ width: 390, height: 844 })
        await p.reload()
        await p.getByRole('heading', { level: 1, name: 'Policies' }).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
        await p.screenshot({ path: t.out('owner-only-policies-phone'), fullPage: true })
        await p.setViewportSize({ width: 1280, height: 900 })
      })

      await t.step('Business and GST: every card as facts, its legal line kept; Invoices and slips: the signatory and series as facts', async () => {
        const p = pia.p
        await p.goto(CONSOLE + '/console/settings/business')
        await p.locator('header').getByText(CHIP, { exact: true }).waitFor()
        await p.locator('main#content form').getByText(before.legal_name, { exact: true }).waitFor()
        await p.getByText('Shown on your store’s Contact page and footer, as the Consumer Protection (E-Commerce) Rules ask.').waitFor()
        assert.equal(await p.locator('main#content').getByRole('textbox').count(), 0, 'no fields on a locked page')
        assert.equal(await p.locator('main#content').getByRole('radio').count(), 0, 'no radio cards on a locked page')
        await p.screenshot({ path: t.out('owner-only-business'), fullPage: true })
        await p.setViewportSize({ width: 390, height: 844 })
        await p.reload()
        await p.locator('header').getByText(CHIP, { exact: true }).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
        await p.screenshot({ path: t.out('owner-only-business-phone'), fullPage: true })
        await p.setViewportSize({ width: 1280, height: 900 })
        await p.goto(CONSOLE + '/console/settings/invoices')
        await p.getByRole('textbox', { name: /^Order number prefix/ }).waitFor()
        assert.equal(await p.getByRole('textbox', { name: /^Series prefix/ }).count(), 0)
        assert.equal(await p.getByRole('textbox', { name: /^Authorised signatory/ }).count(), 0)
        assert.equal(await p.locator('main#content form').getByText(CHIP, { exact: true }).count(), 2, 'the chip by the signatory and by the series')
        await p.locator('header').getByRole('button', { name: 'Ask the owner' }).waitFor()
        await p.screenshot({ path: t.out('owner-only-invoices'), fullPage: true })
      })

      await t.step('Ask the owner: an ok toast, then Off with "Asked today", still so after a reload; one line to the owner, not to staff', async () => {
        const p = pia.p
        await p.goto(CONSOLE + '/console/settings/contact')
        await p.getByRole('button', { name: 'Ask the owner' }).click()
        await expectToast(p, 'Asked the owner.', 'ok')
        const off = p.getByRole('button', { name: 'Ask the owner' })
        assert.equal(await off.getAttribute('aria-disabled'), 'true')
        await p.getByText('Asked today', { exact: true }).waitFor()
        await p.screenshot({ path: t.out('owner-only-asked') })
        await p.reload()
        await p.getByText('Asked today', { exact: true }).waitFor()
        await off.click({ force: true }) // Off: pressing it asks nothing
        const lines = await db`select href, by, title from notices where tenant_id = ${KESAR} and source_kind = 'ask_owner'`
        assert.deepEqual(lines.map((r) => ({ ...r })), [{ href: '/console/settings/contact', by: USERS.partner.id, title: null }])
        await owner.p.goto(CONSOLE + '/console/notices')
        const row = owner.p.locator('li').filter({ hasText: 'Your partner asks you to update the grievance officer' })
        await row.waitFor()
        await row.getByText('See it in Settings.').waitFor()
        assert.match(await row.getByRole('link', { name: 'Open' }).getAttribute('href') ?? '', /\/console\/settings\/contact$/)
        await owner.p.screenshot({ path: t.out('owner-only-notices') })
        await db`insert into members (tenant_id, user_id, role) values (${KESAR}, ${USERS.staff.id}, 'staff') on conflict do nothing`
        const staff = await open('staff')
        try {
          await staff.p.goto(CONSOLE + '/console/notices')
          await staff.p.getByRole('heading', { level: 1, name: 'Notices' }).waitFor()
          assert.equal(await staff.p.getByText(/Your partner asks you/).count(), 0, 'staff are not shown a partner’s ask')
        } finally { await staff.ctx.close(); await db`delete from members where tenant_id = ${KESAR} and user_id = ${USERS.staff.id}` }
        await pia.p.goto(CONSOLE + '/console/notices')
        await pia.p.getByRole('heading', { level: 1, name: 'Notices' }).waitFor()
        assert.equal(await pia.p.getByText(/Your partner asks you/).count(), 0, 'the partner is not shown its own ask')
      })

      await t.step('A save from a tab opened before handover is refused in words, with Reload; nothing changes', async () => {
        const p = pia.p
        // Before handover: the store's owner is, for a moment, a Manager.
        await db`update members set role = 'admin' where tenant_id = ${KESAR} and user_id = ${USERS.owner.id}`
        try {
          await p.goto(CONSOLE + '/console/settings/business')
          await p.getByRole('textbox', { name: /^Legal business name/ }).waitFor()
        } finally { await db`update members set role = 'owner' where tenant_id = ${KESAR} and user_id = ${USERS.owner.id}` }
        await p.getByRole('textbox', { name: /^Legal business name/ }).fill('Someone Else Pvt Ltd')
        await p.getByRole('button', { name: /^Save/ }).click()
        const toast = await expectToast(p, 'Only the owner or a Manager can change this now.')
        await toast.getByText('Nothing was changed.').waitFor()
        await toast.getByRole('button', { name: 'Reload' }).waitFor()
        assert.equal(await p.getByRole('textbox', { name: /^Legal business name/ }).inputValue(), 'Someone Else Pvt Ltd', 'nothing typed is cleared until Reload')
        await p.screenshot({ path: t.out('owner-only-stale') })
        assert.equal((await settings()).legal_name, before.legal_name, 'the stale save changed nothing')
        await toast.getByRole('button', { name: 'Reload' }).click()
        await p.locator('header').getByText(CHIP, { exact: true }).waitFor()
      })

      await t.step('The owner edits all of it, as today', async () => {
        const p = owner.p
        await p.goto(CONSOLE + '/console/settings/contact')
        assert.equal(await p.getByText(CHIP, { exact: true }).count(), 0)
        assert.equal(await p.getByRole('button', { name: 'Ask the owner' }).count(), 0)
        await p.getByRole('textbox', { name: /^Name/ }).fill('Riya M. Mehta')
        await p.getByRole('button', { name: /^Save/ }).click()
        await expectToast(p, 'Saved. Your store shows it now.', 'ok')
        assert.equal((await settings()).grievance_name, 'Riya M. Mehta')
        await p.goto(CONSOLE + '/console/settings/policies')
        await p.getByRole('button', { name: 'Rewrite' }).first().waitFor()
        await p.goto(CONSOLE + '/console/settings/business')
        await p.getByRole('textbox', { name: /^Legal business name/ }).waitFor()
      })
    } finally {
      await pia.ctx.close(); await owner.ctx.close()
      await db`delete from members where tenant_id = ${KESAR} and user_id = ${USERS.partner.id}`
      await db`delete from notices where tenant_id = ${KESAR} and source_kind = 'ask_owner'`
      await db`update shop_settings set legal_name = ${before.legal_name}, grievance_name = ${before.grievance_name}, instagram = ${before.instagram} where tenant_id = ${KESAR}`
    }
  },
}
