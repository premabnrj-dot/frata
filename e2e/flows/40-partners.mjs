// =============================================================================
// FLOW: partners — the whole partner journey (docs/specs/2026-11-07-partner-foundations.md):
// the public page, apply, Frata approves, the partner builds a client store, hands it over,
// the brand accepts it, then removes the partner. Screen and database at each step.
// Guards: a handover claimed silently at sign-in, a partner reaching payments, a removed
// partner keeping access, the worked example drifting from the plan prices.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, signedIn } from '../lib.mjs'

export default {
  name: 'partners',
  async run(t) {
    const { db } = t
    const P = USERS.partner, B = USERS.brand, F = USERS.frata
    await db`insert into auth.users (id, email, email_confirmed_at) values (${P.id}, ${P.email}, now()), (${B.id}, ${B.email}, now()), (${F.id}, ${F.email}, now()) on conflict (id) do nothing`
    await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do nothing`
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }

    await t.step('the public page: graphics, numbers from the plans', async () => {
      const ctx = await t.browser.newContext(); const p = await ctx.newPage(); p.on('pageerror', (e) => t.errors.push(e.message))
      await p.goto(CONSOLE + '/partners')
      await p.getByRole('heading', { level: 1 }).getByText('Build brands’ shops.').waitFor()
      assert.ok(await p.locator('body svg[aria-hidden="true"]').count() >= 8, 'the drawings: the hero, the pictograms')
      // The page is static and the e2e build has no database, so the example is hidden here (the designed fallback:
      // no plans, no example, never ₹0). Its sum is unit-tested (src/domains/partners/__tests__); when shown it reads ₹875.80.
      const ex = p.getByRole('heading', { name: 'What you’d earn' })
      if (await ex.count()) await p.getByText('₹875.80').first().waitFor()
      assert.equal(await p.getByText(/₹0\.00|NaN/).count(), 0)
      await p.getByText('added to the brand’s price').waitFor()
      await p.screenshot({ path: t.out('public'), fullPage: true })
      const phone = await t.browser.newContext({ viewport: { width: 390, height: 844 } }); const q = await phone.newPage()
      await q.goto(CONSOLE + '/partners')
      assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
      await q.screenshot({ path: t.out('public-phone'), fullPage: true })
    })

    const pia = await open('partner')
    await t.step('apply: the form, then in review', async () => {
      await pia.goto(CONSOLE + '/partners/apply')
      await pia.getByLabel('Your name').fill('Pia Rao')
      await pia.getByLabel('Studio name').fill('Pia Studio')
      await pia.getByLabel('WhatsApp number').fill('98450 12345')
      await pia.getByLabel('City').fill('Jaipur')
      await pia.getByLabel('Store setup').check()
      await pia.getByLabel('1–4').check()
      await pia.getByRole('button', { name: 'Send application' }).click()
      await pia.getByText('Agree to the partner terms').waitFor() // the terms are required
      await pia.getByLabel('I agree to the partner terms', { exact: true }).check()
      await pia.getByRole('button', { name: 'Send application' }).click()
      await pia.getByText('In review').waitFor()
      const [row] = await db`select phone, approved_at from partners where user_id = ${P.id}`
      assert.equal(row.phone, '919845012345'); assert.equal(row.approved_at, null)
      await pia.goto(CONSOLE + '/partner')
      await pia.getByText('Your application is in review').waitFor()
    })

    await t.step('Frata approves in Admin', async () => {
      const meera = await open('frata')
      await meera.goto(CONSOLE + '/admin/partners')
      await meera.getByRole('button', { name: 'Approve Pia Studio' }).click()
      await meera.getByText('Approved.').waitFor()
      const [row] = await db`select approved_at from partners where user_id = ${P.id}`
      assert.ok(row.approved_at)
      await meera.screenshot({ path: t.out('admin') })
    })

    let T
    await t.step('the partner builds a client store', async () => {
      await pia.goto(CONSOLE + '/partner')
      await pia.getByText('Make your first client store').waitFor()
      await pia.getByRole('link', { name: 'New client store' }).first().click()
      await pia.getByLabel('Brand’s shop name').fill('Mitti Handloom')
      await pia.getByText('Free', { exact: true }).waitFor()
      await pia.getByLabel('Pickup pincode', { exact: true }).fill('302001')
      await pia.getByRole('button', { name: 'Create Mitti Handloom' }).click()
      await pia.getByText('Building for Mitti Handloom').waitFor()
      ;[{ id: T }] = await db`select id from tenants where slug = 'mitti-handloom'`
      const m = await db`select role from members where tenant_id = ${T}`
      assert.deepEqual(m.map((r) => r.role), ['partner'])
      const [l] = await db`select share_bps, share_months, notice_days, share_starts_at from partner_links where tenant_id = ${T}`
      assert.deepEqual([l.share_bps, l.share_months, l.notice_days, l.share_starts_at], [2000, 24, 90, null])
      await pia.screenshot({ path: t.out('building') })
    })

    await t.step('a partner never reaches payments or people', async () => {
      await pia.goto(CONSOLE + '/console/settings/online-payments')
      await pia.getByText('Only the shop’s owner can connect online payments').waitFor()
      await pia.goto(CONSOLE + '/console/settings/people')
      await pia.getByText('Only the owner or an admin can see people').waitFor()
      await pia.goto(CONSOLE + '/console/settings/brand')
      await pia.getByRole('heading', { name: 'Brand', level: 1 }).waitFor() // the look is the partner's to build
    })

    await t.step('while building, the partner sets the shop\'s shipping costs (seesCosts, owner 2026-11-08)', async () => {
      await pia.goto(CONSOLE + '/console/settings/shipping-costs')
      await pia.getByRole('button', { name: 'Confirm these costs' }).click()
      await pia.getByText('Shipping costs confirmed.').waitFor()
      const [c] = await db`select ship_costs_confirmed_at from shop_settings where tenant_id = ${T}`
      assert.ok(c.ship_costs_confirmed_at, 'confirmed by the partner')
    })

    await t.step('hand over: an invite, not claimed at sign-in', async () => {
      await pia.goto(CONSOLE + '/console')
      await pia.getByRole('button', { name: 'Hand over' }).click()
      await pia.getByLabel('Owner’s email').fill(B.email)
      await pia.getByRole('button', { name: 'Send invite' }).click()
      await pia.getByText(`Invite sent to ${B.email}`).waitFor()
      const inv = await db`select accepted_at from invites where tenant_id = ${T} and role = 'owner' and revoked_at is null`
      assert.equal(inv.length, 1); assert.equal(inv[0].accepted_at, null)
      const [{ n }] = await db`select app_claim_invites(${B.id}::uuid) n`
      assert.equal(n, 0, 'sign-in claimed the handover')
    })

    const neha = await open('brand')
    await t.step('the brand accepts its store', async () => {
      await neha.goto(CONSOLE + '/handover')
      await neha.getByText('Mitti Handloom is ready').waitFor()
      await neha.getByText('Built by Pia Studio').waitFor()
      await neha.screenshot({ path: t.out('handover') })
      await neha.getByRole('button', { name: 'Accept Mitti Handloom' }).click()
      await neha.waitForURL(CONSOLE + '/console')
      const roles = await db`select role from members where tenant_id = ${T} order by role`
      assert.deepEqual(roles.map((r) => r.role), ['owner', 'partner'])
      await pia.goto(CONSOLE + '/partner')
      await pia.getByText('With the owner').first().waitFor()
      await pia.screenshot({ path: t.out('clients') })
      // Handed over: the shop's costs are its owner's now ("Once handed over, no").
      await pia.goto(CONSOLE + '/console/settings/shipping-costs')
      await pia.getByText('Only the owner or an admin can see shipping costs').waitFor()
      assert.equal(await pia.getByLabel('A delivery').count(), 0)
    })

    await t.step('the owner removes the partner; access ends', async () => {
      await neha.goto(CONSOLE + '/console/settings/people')
      await neha.getByText('Built this store', { exact: false }).waitFor()
      await neha.getByRole('button', { name: 'Remove', exact: true }).click()
      await neha.getByRole('button', { name: 'Remove Pia Studio' }).click()
      await neha.getByRole('button', { name: 'Remove', exact: true }).waitFor({ state: 'detached' })
      const [l] = await db`select removed_at from partner_links where tenant_id = ${T}`
      assert.ok(l.removed_at)
      assert.equal((await db`select 1 from members where tenant_id = ${T} and user_id = ${P.id}`).length, 0)
      await pia.goto(CONSOLE + '/partner')
      await pia.getByText('Removed').first().waitFor()
      assert.equal(await pia.getByRole('button', { name: 'Open store' }).count(), 0)
    })
  },
}
