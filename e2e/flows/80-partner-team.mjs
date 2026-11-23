// =============================================================================
// FLOW: partner-team — partner teams T1a and passkeys T1b (docs/plans/2026-11-12-studio-build.md; partner sign-in
// mockup). The partner's owner invites a lead to one store; the lead signs in and joins; their first passkey needs the
// owner: a code the lead reads out, declined once ("Did you start this call yourself?" No), then approved; the lead
// creates the passkey with Chromium's virtual authenticator and sees only that store; the owner gives another, then
// removes them; Frrata suspends the partner and reinstates it. Screen and database at each step.
// Guards: a lead seeing every store, a lead running the team, a removed lead keeping access, a suspended partner
// keeping access, an invite field mistake leaving the dialog.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, PORTS, USERS, expectToast, partnerOn, signedIn, until, withAuthenticator } from '../lib.mjs'

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
      await pia.getByText(/^Lead · invited · \d+ days? left$/).first().waitFor()
      const asked = async () => (await (await fetch(`http://localhost:${PORTS.auth}/_test/otp`)).json()).filter((e) => e === L.email).length
      assert.equal(await asked(), 1, 'the invite emails a sign-in link')
      await pia.getByRole('listitem').filter({ hasText: L.email }).getByRole('button', { name: 'Send invite again' }).click()
      await expectToast(pia, `Sent again to ${L.email}.`, 'ok')
      assert.equal(await asked(), 2, 'Send again emails it again')
      await pia.screenshot({ path: t.out('team-invited') })
    })

    const lead = await open('lead', { viewport: { width: 1280, height: 900 } })
    await withAuthenticator(lead)
    const readCode = async () => lead.locator('[data-code]').getAttribute('data-code')
    const leadRow = () => pia.getByRole('listitem').filter({ hasText: L.email })
    await t.step('the lead joins: step 1, then a code to read to the owner (step 2)', async () => {
      await lead.goto(CONSOLE + '/join')
      await lead.getByRole('heading', { name: `Join ${partnerName}` }).waitFor()
      await lead.getByText('Clients: Amber Looms').waitFor()
      assert.equal(await lead.getByLabel('Work email').inputValue(), L.email)
      await lead.screenshot({ path: t.out('join') })
      await lead.getByRole('button', { name: 'Accept invite' }).click()
      await expectToast(lead, 'Joined the team.', 'ok')
      await lead.waitForURL(/\/partner$/)
      await lead.getByRole('heading', { name: /^Ask .+ to call you$/ }).waitFor()
      assert.equal((await readCode()).length, 6)
      const [m] = await db`select count(*)::int as n from members where user_id = ${L.id} and role = 'partner' and partner_member_id is not null`
      assert.equal(m.n, 1)
      const [acc] = await db`select app_access_for(${L.id}::uuid, ${lead.context().frrataSession}::uuid, null, null) as a`
      assert.equal(acc.a.memberships.length, 0, 'no store opens before a passkey')
      assert.equal(acc.a.partnerHeld.length, 1, 'the store waits for the check')
      await lead.screenshot({ path: t.out('ask-owner') })
    })

    await t.step('the owner declines a call they did not start; the lead asks again', async () => {
      await pia.goto(CONSOLE + '/partner/team')
      await leadRow().getByText('Lead · waiting for your approval').waitFor()
      await leadRow().getByRole('button', { name: /^Approve / }).click()
      const card = pia.getByRole('dialog', { name: 'Approve a passkey' })
      await card.getByText('Chrome on Linux').waitFor()
      await card.getByRole('radio', { name: 'No' }).click()
      await card.getByText(/^Hang up and call .+ on a number you know\.$/).waitFor()
      await card.getByRole('button', { name: 'Decline request' }).click()
      await expectToast(pia, 'Request declined.', 'ok')
      await lead.getByRole('heading', { name: /declined the request$/ }).waitFor({ timeout: 15_000 })
      await lead.getByRole('button', { name: 'Get a new code' }).click()
      await lead.getByRole('heading', { name: /^Ask .+ to call you$/ }).waitFor()
    })

    await t.step('the owner approves; the lead creates a passkey and sees only that store', async () => {
      const code = await readCode()
      await pia.goto(CONSOLE + '/partner/team')
      await leadRow().getByRole('button', { name: /^Approve / }).click()
      const card = pia.getByRole('dialog', { name: 'Approve a passkey' })
      await card.getByRole('radio', { name: 'Yes' }).click()
      await card.getByLabel(/^Code .+ reads out$/).fill(code)
      await pia.screenshot({ path: t.out('approve-card') })
      await card.getByRole('button', { name: /^Approve / }).click()
      await expectToast(pia, /^Approved\./, 'ok')
      await lead.getByRole('heading', { name: 'Sign in faster next time' }).waitFor({ timeout: 15_000 })
      await lead.getByRole('button', { name: 'Create a passkey' }).click()
      await lead.getByRole('heading', { name: 'You’re in' }).waitFor()
      await lead.screenshot({ path: t.out('youre-in') })
      await lead.getByRole('button', { name: 'Open your clients' }).click()
      await lead.getByRole('table', { name: 'Clients' }).getByText('Amber Looms', { exact: true }).waitFor()
      assert.equal((await db`select count(*)::int n from partner_passkeys k join partner_members pm on pm.id = k.partner_member_id where pm.user_id = ${L.id}`)[0].n, 1)
      assert.equal((await db`select count(*)::int n from staff_notices where kind = 'partner_passkey_added' and about = ${L.email}`)[0].n >= 1, true, 'the owner and the lead are emailed')
      assert.equal(await lead.getByText('Basil Prints').count(), 0, 'a lead sees only the stores given')
      await lead.goto(CONSOLE + '/partner/team')
      await lead.getByText('Only the partner’s owner manages the team').waitFor()
      const [m] = await db`select count(*)::int as n from members where user_id = ${L.id} and role = 'partner' and partner_member_id is not null`
      assert.equal(m.n, 1)
    })

    await t.step('Passkeys: a backup passkey; a check older than 5 minutes asks again before a delete', async () => {
      await lead.goto(CONSOLE + '/partner/passkeys')
      await lead.getByRole('heading', { name: 'Passkeys', exact: true }).waitFor()
      await lead.getByText('Add a backup passkey on another device').waitFor()
      await lead.getByText('This device').waitFor()
      await lead.getByRole('button', { name: 'Add passkey' }).click()
      await expectToast(lead, /^Passkey saved/, 'ok')
      await until(async () => (await db`select count(*)::int n from partner_passkeys k join partner_members pm on pm.id = k.partner_member_id where pm.user_id = ${L.id}`)[0].n === 2, 10_000)
      await lead.reload()
      assert.equal(await lead.getByText('Add a backup passkey on another device').count(), 0, 'two passkeys: no backup prompt')
      // The check is now 6 minutes old: deleting asks for the passkey again (freshly), then deletes.
      await db`update partner_stepups set created_at = now() - interval '6 minutes' where user_id = ${L.id}`
      const before = (await db`select count(*)::int n from partner_stepups where user_id = ${L.id}`)[0].n
      await lead.getByRole('button', { name: 'Delete', exact: true }).first().click()
      await lead.getByRole('dialog').getByRole('button', { name: 'Delete passkey' }).click()
      await expectToast(lead, 'Passkey deleted.', 'ok')
      assert.equal((await db`select count(*)::int n from partner_passkeys k join partner_members pm on pm.id = k.partner_member_id where pm.user_id = ${L.id}`)[0].n, 1)
      assert.ok((await db`select count(*)::int n from partner_stepups where user_id = ${L.id} and created_at > now() - interval '1 minute'`)[0].n >= 1 && before >= 1, 'a fresh check was made first')
      await lead.screenshot({ path: t.out('passkeys') })
    })

    await t.step('Passkeys, simpler P0: No passkey here? → No passkey on this browser → Ask for a new passkey → Use my passkey → in', async () => {
      await db`delete from partner_stepups where user_id = ${L.id}`
      await lead.goto(CONSOLE + '/partner')
      await lead.getByRole('heading', { name: 'Confirm it’s you' }).waitFor()
      await lead.getByRole('button', { name: 'No passkey here?' }).click()
      await lead.getByRole('heading', { name: 'No passkey on this browser' }).waitFor()
      assert.equal(await lead.evaluate(() => document.activeElement?.textContent), 'No passkey on this browser', 'focus moves to the new heading')
      await lead.screenshot({ path: t.out('no-passkey-here') })
      await lead.getByRole('button', { name: 'Ask for a new passkey' }).click()
      await lead.getByRole('heading', { name: /^Ask .+ to call you$/ }).waitFor()
      await lead.getByRole('button', { name: 'Use my passkey' }).click()
      await lead.getByRole('heading', { name: 'Confirm it’s you' }).waitFor()
      await lead.getByRole('button', { name: 'Use passkey' }).click()
      await lead.getByRole('table', { name: 'Clients' }).waitFor()
    })

    await t.step('the owner gives another store, deletes the lead\'s passkeys (a lost phone), then removes the lead', async () => {
      await pia.goto(CONSOLE + '/partner/team')
      const row = pia.getByRole('listitem').filter({ hasText: L.email })
      await row.getByRole('button', { name: 'Basil Prints' }).click()
      await expectToast(pia, 'Added to Basil Prints.', 'ok')
      await lead.goto(CONSOLE + '/partner')
      await lead.getByRole('table', { name: 'Clients' }).getByText('Basil Prints', { exact: true }).waitFor()
      // A lost phone: every passkey goes and the lead is signed out of the workspace and the stores.
      await row.getByRole('button', { name: 'Delete passkeys' }).click()
      await pia.getByRole('dialog').getByRole('button', { name: /^Delete (passkey|\d+ passkeys)$/ }).click()
      await expectToast(pia, /is signed out everywhere\.$/, 'ok')
      assert.equal((await db`select count(*)::int n from partner_passkeys k join partner_members pm on pm.id = k.partner_member_id where pm.user_id = ${L.id}`)[0].n, 0)
      await lead.goto(CONSOLE + '/console')
      await lead.getByText('Confirm it’s you in the partner workspace').waitFor()
      await lead.goto(CONSOLE + '/partner')
      await lead.getByRole('heading', { name: /^Ask .+ to call you$/ }).waitFor()
      await pia.goto(CONSOLE + '/partner/team')
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
      // Rare and final: the partner's More, a dialog with the reason and the typed name (Neel N4).
      await meera.getByRole('button', { name: 'More' }).click()
      await meera.getByRole('menuitem', { name: 'Suspend…' }).click()
      const sus = meera.getByRole('dialog', { name: `Suspend ${partnerName}?` })
      await sus.getByLabel('Reason to suspend').fill('Proof: suspension')
      await sus.getByLabel(`Type ${partnerName} to confirm`).fill(partnerName)
      await sus.getByRole('button', { name: `Suspend ${partnerName}` }).click()
      await expectToast(meera, 'Suspended. Access ended', 'ok')
      await pia.goto(CONSOLE + '/partner')
      await pia.getByText('Frrata has paused this partner account').waitFor()
      const [n] = await db`select count(*)::int as n from notices where tenant_id = ${A} and source_kind = 'admin' and title like 'Frrata paused your partner%'`
      assert.ok(n.n >= 1, 'the brand is told')
      await meera.goto(CONSOLE + `/admin/partners?view=approved&id=${partnerId}`)
      await meera.getByRole('button', { name: 'More' }).click()
      await meera.getByRole('menuitem', { name: 'Reinstate…' }).click()
      const back = meera.getByRole('dialog', { name: `Reinstate ${partnerName}?` })
      await back.getByLabel(`Type ${partnerName} to confirm`).fill(partnerName)
      await back.getByRole('button', { name: `Reinstate ${partnerName}` }).click()
      await expectToast(meera, 'Reinstated.', 'ok')
      await pia.goto(CONSOLE + '/partner')
      await pia.getByRole('table', { name: 'Clients' }).getByText('Amber Looms', { exact: true }).waitFor()
    })

    await t.step('signed out: the partner sign-in, back to the same page; sign-out lands there too', async () => {
      // A session cookie that no longer works (the fake auth knows no "nobody"): the partner sign-in says so.
      const ctx = await t.browser.newContext({ viewport: { width: 1280, height: 900 } })
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
      const dead = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: 'x', who: 'nobody', exp: Math.floor(Date.now() / 1000) + 60 })}.sig`, refresh_token: 'r', token_type: 'bearer', expires_in: 60, expires_at: Math.floor(Date.now() / 1000) + 60, user: { id: 'x' } }
      await ctx.addCookies([{ name: 'sb-localhost-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(dead)).toString('base64url'), domain: 'localhost', path: '/' }])
      const p = await ctx.newPage(); p.on('pageerror', (e) => t.errors.push(e.message))
      await p.goto(CONSOLE + '/partner/team')
      await p.waitForURL(/\/partner\/sign-in\?/)
      await p.getByRole('heading', { name: 'You’ve been signed out' }).waitFor()
      await p.getByText('Back to Team').waitFor()
      await p.getByRole('button', { name: 'Sign in again' }).click()
      await p.getByLabel('Work email').waitFor()
      await p.getByRole('button', { name: 'Continue with email' }).waitFor()
      await p.screenshot({ path: t.out('sign-in') })
      const out = await open('partner', { viewport: { width: 1280, height: 900 } })
      await out.goto(CONSOLE + '/partner')
      await out.getByRole('button', { name: 'Sign out' }).first().click()
      await out.waitForURL(/\/partner\/sign-in$/)
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
