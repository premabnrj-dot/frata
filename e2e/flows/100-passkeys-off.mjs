// =============================================================================
// FLOW: passkeys off from Admin › Staff (owner-approved mockup 2026-11-23, docs/mockups/2026-11-23-admin-passkeys-switch.html;
// plan docs/plans/2026-11-23-passkeys-off.md). A master admin turns passkeys off with her own passkey (Chromium's
// virtual authenticator holds a real P-256 key her staff passkey row names); the banner shows on every Admin page and the
// row says Off since … by her. Support staff see both without a button. A partner with no passkey check opens the
// workspace; Partner › Passkeys says passkeys are off; Give key gives a key with no passkey. Turning them on from the
// banner asks for nothing; the partner is back behind the check. Every master admin is emailed each time. Phone width.
// Guards: off without a passkey, a Support button, a stale banner, the partner workspace open once passkeys are on.
// =============================================================================
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { CONSOLE, USERS, partnerOn, signedIn } from '../lib.mjs'

const T = 'dddddddd-0000-4000-8000-0000000000e1'
const SLUG = 'pk-off', STORE = 'House of Pankh'

/** A real staff passkey: a P-256 key in the page's virtual authenticator, and its public key on the staff passkey row. */
async function realStaffPasskey(page, db, user) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  const cose = Buffer.concat([Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]), Buffer.from(jwk.x, 'base64url'), Buffer.from([0x22, 0x58, 0x20]), Buffer.from(jwk.y, 'base64url')])
  const id = randomBytes(32)
  // The sign-in seed's id is not base64url, and the browser refuses an offer that names it (as 97-developer).
  await db`update staff_passkeys set credential_id = ${randomBytes(16).toString('base64url')} where user_id = ${user.id} and credential_id like 'e2e-seed-%'`
  await db`insert into staff_passkeys (user_id, credential_id, public_key, name) values (${user.id}, ${id.toString('base64url')}, ${cose.toString('base64url')}, 'This laptop')`
  await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: { credentialId: id.toString('base64'), isResidentCredential: true, rpId: 'localhost',
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'), userHandle: Buffer.from(user.id).toString('base64'), signCount: 0 } })
}
const start = async () => {
  const r = await fetch(CONSOLE + '/api/dev/device/start', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' }, body: JSON.stringify({ store: SLUG }) })
  assert.equal(r.status, 200, `start answered ${r.status}`)
  return r.json()
}
const poll = async (device) => {
  const r = await fetch(CONSOLE + '/api/dev/device/poll', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' }, body: JSON.stringify({ device }) })
  return { status: r.status, body: await r.json() }
}

export default {
  name: 'passkeys-off',
  async run(t) {
    const { db } = t
    const M = USERS.frata, S = USERS.staff, P = USERS.partner
    await db`delete from platform_switches where key = 'passkeys_off'`
    await db`insert into platform_staff (user_id, email, role) values (${M.id}, ${M.email}, 'admin') on conflict (user_id) do update set role = 'admin'`
    await db`insert into auth.users (id, email, email_confirmed_at) values (${P.id}, ${P.email}, now()), (${S.id}, ${S.email}, now()) on conflict (id) do nothing`
    await db`insert into tenants (id, slug, name) values (${T}, ${SLUG}, ${STORE}) on conflict (id) do nothing`
    await db`insert into shop_settings (tenant_id, pickup_pincode) values (${T}, '452009') on conflict (tenant_id) do nothing`
    await partnerOn(db, T, P)
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }
    const banner = (p) => p.locator('[data-banner="warn"]', { hasText: 'Passkeys are off' })
    try {
      const meera = await open('frata', { viewport: { width: 1280, height: 900 } })
      await realStaffPasskey(meera, db, M)

      await t.step('On: the Passkeys row says On; Turn passkeys off asks first, then her passkey, then the banner', async () => {
        await meera.goto(CONSOLE + '/admin/staff')
        const row = meera.getByRole('region', { name: 'Passkeys' })
        await row.getByText('On', { exact: true }).waitFor()
        assert.equal(await banner(meera).count(), 0, 'no banner while on')
        await row.getByRole('button', { name: 'Turn passkeys off' }).click()
        const dialog = meera.getByRole('dialog', { name: 'Turn passkeys off?' })
        await dialog.getByText('Staff and partners will sign in with an email code alone.', { exact: false }).waitFor()
        await meera.screenshot({ path: t.out('dialog') })
        const [before] = await db`select count(*)::int n from staff_passkeys where user_id = ${M.id} and last_used_at is not null`
        await dialog.getByRole('button', { name: 'Turn passkeys off' }).click()
        await banner(meera).waitFor()
        const [after] = await db`select count(*)::int n from staff_passkeys where user_id = ${M.id} and last_used_at is not null`
        assert.ok(after.n > before.n, 'turning off used her passkey')
        await row.getByText(/since \d+ \w+ by meera@frata\.test/).waitFor()
        await meera.getByRole('button', { name: 'Turn passkeys on' }).first().waitFor()
        const [sw] = await db`select until, set_by from platform_switches where key = 'passkeys_off'`
        assert.equal(sw?.until, null, 'off from Admin has no end date')
        assert.equal(sw?.set_by, M.email)
        const [n] = await db`select count(*)::int n from staff_notices where kind = 'passkeys_off' and about = ${M.email}`
        assert.ok(n.n >= 1, 'every master admin is emailed')
        await meera.screenshot({ path: t.out('off'), fullPage: true })
      })

      await t.step('the banner on every Admin page; phone width without sideways scroll', async () => {
        await meera.goto(CONSOLE + '/admin/merchants')
        await banner(meera).waitFor()
        await meera.setViewportSize({ width: 375, height: 812 })
        await meera.goto(CONSOLE + '/admin/staff')
        await banner(meera).waitFor()
        assert.ok(await meera.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll')
        await meera.screenshot({ path: t.out('off-phone'), fullPage: true })
        await meera.setViewportSize({ width: 1280, height: 900 })
      })

      await t.step('Support staff, with no passkey check at all, see the state and no button', async () => {
        await db`insert into platform_staff (user_id, email, role) values (${S.id}, ${S.email}, 'support') on conflict (user_id) do update set role = 'support'`
        const sup = await open('staff', { passkey: false, viewport: { width: 1280, height: 900 } })
        await sup.goto(CONSOLE + '/admin/staff')
        await banner(sup).waitFor()
        await sup.getByRole('region', { name: 'Passkeys' }).getByText('Off', { exact: true }).waitFor()
        assert.equal(await sup.getByRole('button', { name: /Turn passkeys/ }).count(), 0, 'no button for Support')
        await sup.context().close()
      })

      const pia = await open('partner', { passkey: false, viewport: { width: 1280, height: 900 } })
      await t.step('a partner with no passkey check: the workspace opens; Partner › Passkeys says they are off', async () => {
        await pia.goto(CONSOLE + '/partner/passkeys')
        await pia.getByRole('heading', { name: 'Passkeys are off' }).waitFor()
        assert.equal(await pia.getByRole('button', { name: /Add passkey/ }).count(), 0, 'no passkey made while off')
      })

      await t.step('Give key while off: Check code, then Give key with no passkey; the poll gets the key once', async () => {
        const s = await start()
        await pia.goto(CONSOLE + '/partner/developer')
        await pia.getByLabel('Code from your terminal').fill(s.code)
        await pia.getByRole('button', { name: 'Check code' }).click()
        const dialog = pia.getByRole('dialog', { name: 'Give this computer a Build key?' })
        await dialog.getByText(STORE).waitFor()
        assert.equal(await dialog.getByRole('link', { name: 'Add passkey' }).count(), 0, 'no passkey asked for')
        await dialog.getByRole('button', { name: 'Give key', exact: true }).click()
        await dialog.waitFor({ state: 'detached' })
        const got = await poll(s.device)
        assert.equal(got.status, 200, `poll answered ${got.status}`)
        assert.match(got.body.key, /^frs_build_/)
        const [a] = await db`select count(*)::int n from audit_events where tenant_id = ${T} and action = 'build_key.device_confirmed' and detail->>'passkeys' = 'off'`
        assert.equal(a.n, 1, 'the store\'s audit says passkeys were off')
      })

      await t.step('Turn passkeys on from the banner: no passkey asked; the banner goes; the partner is behind the check again', async () => {
        await meera.goto(CONSOLE + '/admin/merchants')
        await banner(meera).getByRole('button', { name: 'Turn passkeys on' }).click()
        await banner(meera).waitFor({ state: 'detached' })
        assert.equal((await db`select 1 from platform_switches where key = 'passkeys_off'`).length, 0)
        const [n] = await db`select count(*)::int n from staff_notices where kind = 'passkeys_on' and about = ${M.email}`
        assert.ok(n.n >= 1, 'every master admin is emailed')
        await pia.goto(CONSOLE + '/partner/passkeys')
        await pia.waitForLoadState('networkidle')
        assert.equal(await pia.getByRole('heading', { name: 'Passkeys are off' }).count(), 0, 'no stale "off"')
        assert.equal(await pia.getByRole('heading', { name: 'Passkeys', exact: true }).count(), 0, 'the workspace is behind the check again')
        await pia.screenshot({ path: t.out('on-again') })
      })
    } finally {
      await db`delete from platform_switches where key = 'passkeys_off'`
      await db`delete from platform_staff where user_id = ${S.id}`
      // Pia is the shared partner of 97-developer and 99-studio-agent: leave her no key, no code and no extra store.
      await db`delete from storefront_keys where tenant_id = ${T}`
      await db`delete from build_key_device_codes where store_slug = ${SLUG}`
      await db`delete from members where tenant_id = ${T}`
      await db`delete from partner_links where tenant_id = ${T}`
    }
  },
}
