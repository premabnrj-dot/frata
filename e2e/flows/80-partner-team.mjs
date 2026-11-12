// =============================================================================
// FLOW: partner-team — partner teams T1a (docs/plans/2026-11-12-studio-build.md § T1a). The partner's owner invites a
// lead to one store; the lead signs in, joins and sees only that store; the owner gives another, then removes them;
// Frrata suspends the partner and reinstates it. Screen and database at each step.
// Guards: a lead seeing every store, a lead running the team, a removed lead keeping access, a suspended partner
// keeping access, an invite field mistake leaving the dialog.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, PORTS, USERS, expectToast, partnerOn, signedIn } from '../lib.mjs'

const A = 'dddddddd-0000-4000-8000-0000000000a1', B = 'dddddddd-0000-4000-8000-0000000000b1' // RFC 4122 shape: the form's z.uuid() checks it

export default {
  name: 'partner-team',
  async run(t) {
    const { db } = t
    const P = USERS.partner, L = USERS.lead, F = USERS.frata
    await db`insert into auth.users (id, email, email_confirmed_at) values (${P.id}, ${P.email}, now()), (${L.id}, ${L.email}, now()), (${F.id}, ${F.email}, now()) on conflict (id) do nothing`
    await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do nothing`
    await db`insert into tenants (id, slug, name) values (${A}, 'team-amber', 'Amber Looms'), (${B}, 'team-basil', 'Basil Prints') on conflict (id) do nothing`
    await partnerOn(db, A, P)
    await partnerOn(db, B, P)
    const [{ id: partnerId, n: partnerName }] = await db`select id, coalesce(nullif(business_name, ''), name) as n from partners where user_id = ${P.id}`
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }

    const pia = await open('partner', { viewport: { width: 1280, height: 900 } })
    await t.step('the owner invites a lead to one store; a mistake stays in the dialog', async () => {
      await pia.goto(CONSOLE + '/partner/team')
      await pia.getByRole('heading', { name: 'Team', exact: true }).waitFor()
      await pia.getByRole('button', { name: 'Invite' }).click()
      const dialog = pia.getByRole('dialog', { name: 'Invite to your team' })
      await dialog.getByRole('button', { name: 'Send invite' }).click()
      await dialog.getByText('Enter their work email').waitFor()
      await dialog.getByLabel('Work email').fill(L.email)
      await dialog.getByLabel('Amber Looms').check()
      await dialog.getByRole('button', { name: 'Send invite' }).click()
      await expectToast(pia, `Invited ${L.email}. We emailed them a sign-in link.`, 'ok')
      await pia.getByText('Invited', { exact: true }).first().waitFor()
      const asked = async () => (await (await fetch(`http://localhost:${PORTS.auth}/_test/otp`)).json()).filter((e) => e === L.email).length
      assert.equal(await asked(), 1, 'the invite emails a sign-in link')
      await pia.getByRole('listitem').filter({ hasText: L.email }).getByRole('button', { name: 'Send again' }).click()
      await expectToast(pia, `Sent again to ${L.email}.`, 'ok')
      assert.equal(await asked(), 2, 'Send again emails it again')
      await pia.screenshot({ path: t.out('team-invited') })
    })

    const lead = await open('lead', { viewport: { width: 1280, height: 900 } })
    await t.step('the lead joins and sees only that store; the team is not theirs', async () => {
      await lead.goto(CONSOLE + '/join')
      await lead.getByRole('heading', { name: `Join ${partnerName}` }).waitFor()
      await lead.getByText('Amber Looms').waitFor()
      await lead.getByRole('button', { name: `Join ${partnerName}` }).click()
      await expectToast(lead, 'Joined the team.', 'ok')
      await lead.waitForURL(/\/partner$/)
      await lead.getByRole('region', { name: 'Client stores' }).getByText('Amber Looms').waitFor()
      assert.equal(await lead.getByText('Basil Prints').count(), 0, 'a lead sees only the stores given')
      await lead.goto(CONSOLE + '/partner/team')
      await lead.getByText('Only the partner’s owner manages the team').waitFor()
      const [m] = await db`select count(*)::int as n from members where user_id = ${L.id} and role = 'partner' and partner_member_id is not null`
      assert.equal(m.n, 1)
    })

    await t.step('the owner gives another store, then removes the lead', async () => {
      await pia.goto(CONSOLE + '/partner/team')
      const row = pia.getByRole('listitem').filter({ hasText: L.email })
      await row.getByRole('button', { name: 'Basil Prints' }).click()
      await expectToast(pia, 'Added to Basil Prints.', 'ok')
      await lead.goto(CONSOLE + '/partner')
      await lead.getByRole('region', { name: 'Client stores' }).getByText('Basil Prints').waitFor()
      await row.getByRole('button', { name: 'Remove' }).click()
      const dialog = pia.getByRole('dialog', { name: `Remove ${L.email}?` })
      await dialog.getByText('Their access to every store ends now.').waitFor()
      await dialog.getByRole('button', { name: `Remove ${L.email}` }).click()
      await expectToast(pia, `${L.email} removed.`, 'ok')
      await lead.goto(CONSOLE + '/partner')
      await lead.getByText('This email is not a Frrata partner').waitFor()
      const [m] = await db`select count(*)::int as n from members where user_id = ${L.id}`
      assert.equal(m.n, 0, 'a removed lead keeps no store')
    })

    await t.step('Frrata suspends the partner, then reinstates it', async () => {
      const meera = await open('frata', { viewport: { width: 1280, height: 900 } })
      await meera.goto(CONSOLE + `/admin/partners?view=approved&id=${partnerId}`)
      await meera.getByLabel('Reason to suspend').fill('Proof: suspension')
      await meera.getByLabel(`Type ${partnerName} to confirm`).fill(partnerName)
      await meera.getByRole('button', { name: 'Suspend' }).click()
      await expectToast(meera, 'Suspended. Access ended', 'ok')
      await pia.goto(CONSOLE + '/partner')
      await pia.getByText('Frrata has paused this partner account').waitFor()
      const [n] = await db`select count(*)::int as n from notices where tenant_id = ${A} and source_kind = 'admin' and title like 'Frrata paused your partner%'`
      assert.ok(n.n >= 1, 'the brand is told')
      await meera.goto(CONSOLE + `/admin/partners?view=approved&id=${partnerId}`)
      await meera.getByLabel(`Type ${partnerName} to confirm`).fill(partnerName)
      await meera.getByRole('button', { name: 'Reinstate' }).click()
      await expectToast(meera, 'Reinstated.', 'ok')
      await pia.goto(CONSOLE + '/partner')
      await pia.getByRole('region', { name: 'Client stores' }).getByText('Amber Looms').waitFor()
    })

    await t.step('the team on a phone', async () => {
      const phone = await open('partner', { viewport: { width: 390, height: 844 } })
      await phone.goto(CONSOLE + '/partner/team')
      await phone.getByRole('heading', { name: 'Team', exact: true }).waitFor()
      assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
      await phone.screenshot({ path: t.out('team-phone'), fullPage: true })
    })
  },
}
