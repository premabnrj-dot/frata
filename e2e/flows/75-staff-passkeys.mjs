// =============================================================================
// FLOW: Staff passkeys (docs/specs/2026-11-12-staff-passkeys.md; mockup https://claude.ai/artifact/Xng3BV15YZpDQi9MoYLGsZ).
// The real check, with Chromium's virtual authenticator (no switch in the app): a staff member with no passkey asks,
// the owner's SQL break-glass approves, they add a passkey on that browser and Admin opens. A second admin asks; the
// first approves from Staff by typing the code (confirming with her own passkey first); the second adds a passkey.
// Removing it sends the second admin back to the gate. The route answers only on the console host and origin; sign-out
// ends the step-up. Phone: no sideways scroll on the gate.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, SHOP, USERS, signedIn, until } from '../lib.mjs'

/** A page with its own virtual platform authenticator (user verification on, resident keys, auto presence). */
async function withAuthenticator(t, who, opts = {}) {
  const ctx = await signedIn(t.browser, who, { passkey: false, viewport: { width: 1280, height: 900 }, ...opts })
  const p = await ctx.newPage()
  p.setDefaultTimeout(15_000)
  p.on('pageerror', (e) => t.errors.push(e.message))
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  return { ctx, p }
}
const codeOn = async (p) => (await p.getByText(/^\d{3} \d{3}$/).textContent()).replace(/\D/g, '')

export default {
  name: 'staff-passkeys',
  async run(t) {
    const { db } = t
    const F = USERS.frata, O = USERS.owner
    await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do update set role = 'admin'`
    await db`delete from staff_passkeys where user_id in (${F.id}, ${O.id})`
    let riya, meeraCode
    try {
      const meera = await withAuthenticator(t, 'frata')

      await t.step('No passkey: Admin shows only "Add a passkey"; asking shows a 6-digit code', async () => {
        await meera.p.goto(CONSOLE + '/admin/merchants')
        await meera.p.getByRole('heading', { name: 'Add a passkey' }).waitFor()
        assert.equal(await meera.p.getByRole('link', { name: 'Merchants' }).count(), 0, 'no Admin page behind the gate')
        await meera.p.getByRole('button', { name: 'Ask to add a passkey' }).click()
        meeraCode = await codeOn(meera.p)
        assert.match(meeraCode, /^\d{6}$/)
        await meera.p.screenshot({ path: t.out('ask') })
      })

      await t.step('The owner\'s break-glass approves; she adds a passkey on this browser and Admin opens', async () => {
        // Without the code on her screen the break-glass refuses (someone else holding her sign-in could have asked).
        await assert.rejects(db`select app_staff_bootstrap(${F.email}, ${meeraCode === '000000' ? '111111' : '000000'}) as r`, /no_request_with_that_code/)
        const [{ r }] = await db`select app_staff_bootstrap(${F.email}, ${meeraCode}) as r`
        assert.match(r, /approved/)
        await meera.p.getByRole('heading', { name: 'Add a passkey' }).waitFor()
        await meera.p.getByLabel('Name').waitFor({ timeout: 15_000 })
        await meera.p.getByLabel('Name').fill('Meera laptop')
        await meera.p.getByRole('button', { name: 'Add passkey' }).click()
        await meera.p.getByRole('link', { name: 'Merchants' }).first().waitFor()
        const [k] = await db`select count(*)::int n from staff_passkeys where user_id = ${F.id}`
        assert.equal(k.n, 1)
        const [a] = await db`select count(*)::int n from audit_events where actor_user_id = ${F.id} and action in ('staff.passkey.bootstrap', 'staff.passkey.add', 'staff.passkey.confirm')`
        assert.ok(a.n >= 3, 'bootstrap, add and confirm audited')
      })

      await t.step('A second admin asks; Meera approves from Staff with the code, confirming with her passkey first', async () => {
        await db`insert into platform_staff (user_id, email, role) values (${O.id}, ${O.email}, 'admin') on conflict (user_id) do update set role = 'admin'`
        riya = await withAuthenticator(t, 'owner')
        await riya.p.goto(CONSOLE + '/admin')
        await riya.p.getByRole('button', { name: 'Ask to add a passkey' }).click()
        const code = await codeOn(riya.p)
        await meera.p.goto(CONSOLE + '/admin/staff')
        await meera.p.getByText('Asking to add a passkey').waitFor()
        await meera.p.getByRole('button', { name: 'Approve' }).click()
        await meera.p.getByLabel(/Code .* reads to you/).fill('000000' === code ? '111111' : '000000')
        await meera.p.getByRole('button', { name: 'Confirm with passkey and approve' }).click()
        await meera.p.getByRole('alert').filter({ hasText: 'doesn\'t match' }).waitFor()
        await meera.p.getByLabel(/Code .* reads to you/).fill(code)
        await meera.p.getByRole('button', { name: 'Confirm with passkey and approve' }).click()
        await until(async () => (await db`select 1 from staff_enrolment_requests where user_id = ${O.id} and approved_by = ${F.id}`).length > 0, 10_000)
        await meera.p.screenshot({ path: t.out('staff') })
      })

      await t.step('The second admin adds a passkey on her own browser (the approval was for that session) and Admin opens', async () => {
        await riya.p.getByLabel('Name').waitFor({ timeout: 15_000 })
        await riya.p.getByLabel('Name').fill('Riya phone')
        await riya.p.getByRole('button', { name: 'Add passkey' }).click()
        await riya.p.getByRole('link', { name: 'Merchants' }).first().waitFor()
      })

      await t.step('Every approval and new passkey emailed the person and every admin (rows written with the change)', async () => {
        const rows = await db`select to_email, kind from staff_notices where about = ${O.email} order by created_at`
        assert.ok(rows.some((r) => r.kind === 'request_approved' && r.to_email === F.email), 'the approver (an admin) is told')
        assert.ok(rows.some((r) => r.kind === 'request_approved' && r.to_email === O.email), 'the person is told')
        assert.ok(rows.some((r) => r.kind === 'passkey_added' && r.to_email === F.email), 'a new passkey reaches the admins')
      })

      await t.step('A second device confirms first; a confirmation older than 5 minutes is refused for staff changes', async () => {
        await meera.p.goto(CONSOLE + '/admin/staff')
        await meera.p.getByRole('button', { name: 'Add a passkey' }).click()
        await meera.p.getByLabel('Name').fill('Meera phone')
        await meera.p.getByRole('button', { name: 'Confirm with passkey and add' }).click()
        await until(async () => (await db`select count(*)::int n from staff_passkeys where user_id = ${F.id}`)[0].n === 2, 10_000)
        // A stale step-up (made 10 minutes ago) cannot add staff; the form's own passkey prompt makes it fresh again.
        await db`update staff_stepups set created_at = now() - interval '10 minutes' where user_id = ${F.id} and session_id = ${meera.ctx.frrataSession}`
        const cookie = (await meera.ctx.cookies(CONSOLE)).map((c) => `${c.name}=${c.value}`).join('; ')
        const stale = await fetch(CONSOLE + '/admin/passkey', { method: 'POST', redirect: 'manual', headers: { cookie, origin: CONSOLE, 'content-type': 'application/json' }, body: JSON.stringify({ op: 'remove', passkeyId: '00000000-0000-4000-8000-000000000000' }) })
        assert.equal(stale.status, 409)
        assert.match((await stale.json()).error, /Confirm with your passkey first/)
        await db`insert into auth.users (id, email, email_confirmed_at) values (${USERS.accountant.id}, ${USERS.accountant.email}, now()) on conflict (id) do nothing`.catch(() => {})
        await meera.p.goto(CONSOLE + '/admin/staff')
        await meera.p.getByLabel('Add by email').fill(USERS.accountant.email)
        await meera.p.getByRole('button', { name: 'Add staff' }).click()
        await until(async () => (await db`select 1 from platform_staff where email = ${USERS.accountant.email}`).length > 0, 10_000)
        await meera.p.getByRole('button', { name: `Remove ${USERS.accountant.email}` }).click()
        await until(async () => (await db`select 1 from platform_staff where email = ${USERS.accountant.email}`).length === 0, 10_000)
        const mail = await db`select kind from staff_notices where about = ${USERS.accountant.email}`
        assert.ok(mail.some((r) => r.kind === 'staff_added') && mail.some((r) => r.kind === 'staff_removed'), 'adding and removing staff emailed the admins')
      })

      await t.step('Passkeys may be asked for on Admin only: /admin allows this origin, the console allows none', async () => {
        const h = async (path) => (await fetch(CONSOLE + path, { redirect: 'manual' })).headers.get('permissions-policy') ?? ''
        assert.match(await h('/admin'), /publickey-credentials-get=\(self\)/)
        assert.match(await h('/console'), /publickey-credentials-get=\(\)/)
        assert.match(await h('/login'), /publickey-credentials-create=\(\)/)
      })

      await t.step('Removing her passkey sends her back to the gate', async () => {
        await meera.p.goto(CONSOLE + '/admin/staff')
        await meera.p.getByRole('button', { name: 'Remove Riya phone' }).click()
        await meera.p.getByRole('button', { name: 'Confirm with passkey and remove' }).click()
        await until(async () => (await db`select 1 from staff_passkeys where user_id = ${O.id}`).length === 0, 10_000)
        await riya.p.goto(CONSOLE + '/admin/merchants')
        await riya.p.getByRole('heading', { name: 'Add a passkey' }).waitFor()
      })

      await t.step('The passkey route answers on the console host and origin only', async () => {
        const fromShop = await meera.p.evaluate(async (shop) => (await fetch(shop + '/admin/passkey', { method: 'POST', body: '{"op":"confirm-options"}' }).catch(() => ({ status: 0 }))).status, SHOP)
        assert.ok(fromShop === 0 || fromShop === 403 || fromShop === 404, `a shop host answered ${fromShop}`)
        // Signed in as Meera (her cookies), from another origin: refused before anything is read.
        const cookie = (await meera.ctx.cookies(CONSOLE)).map((c) => `${c.name}=${c.value}`).join('; ')
        const forged = await fetch(CONSOLE + '/admin/passkey', { method: 'POST', redirect: 'manual', headers: { cookie, origin: 'https://evil.test', 'content-type': 'application/json' }, body: '{"op":"confirm-options"}' })
        assert.equal(forged.status, 403)
        const same = await fetch(CONSOLE + '/admin/passkey', { method: 'POST', redirect: 'manual', headers: { cookie, origin: CONSOLE, 'content-type': 'application/json' }, body: '{"op":"confirm-options"}' })
        assert.equal(same.status, 200, 'the same request from the console origin is answered')
        const big = await fetch(CONSOLE + '/admin/passkey', { method: 'POST', redirect: 'manual', headers: { cookie, origin: CONSOLE, 'content-type': 'application/json' }, body: JSON.stringify({ op: 'confirm-options', name: 'x'.repeat(20_000) }) })
        assert.equal(big.status, 413)
      })

      await t.step('Sign-out ends the step-up; phone width: the gate fits', async () => {
        const before = (await db`select count(*)::int n from staff_stepups where user_id = ${F.id}`)[0].n
        assert.ok(before >= 1)
        await meera.p.goto(CONSOLE + '/admin')
        await meera.p.getByRole('button', { name: /Sign out|Account/ }).first().click().catch(() => {})
        await meera.p.getByRole('button', { name: 'Sign out' }).first().click()
        await until(async () => (await db`select count(*)::int n from staff_stepups where user_id = ${F.id} and session_id = ${meera.ctx.frrataSession}`)[0].n === 0, 10_000)
        const phone = await withAuthenticator(t, 'frata', { viewport: { width: 390, height: 844 } })
        await phone.p.goto(CONSOLE + '/admin')
        await phone.p.getByRole('heading', { name: 'Confirm it\'s you' }).waitFor()
        assert.ok(await phone.p.evaluate(() => document.documentElement.scrollWidth <= 390))
        await phone.p.screenshot({ path: t.out('phone') })
      })
    } finally {
      await db`delete from platform_staff where user_id in (${O.id}, ${USERS.accountant.id})`
      await db`delete from staff_passkeys where user_id = ${F.id}`
    }
  },
}
