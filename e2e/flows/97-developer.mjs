// =============================================================================
// FLOW: developer — G·3's page (four screens § 2, owner-approved 2026-11-22): the CLI starts a sign-in; the Partner
// owner, at Partner workspace › Developer, checks the code (a typo, an ended code, then theirs), sees the store, when
// and that it started on their network, and gives the key with a passkey made for that code (Chromium's virtual
// authenticator holds a real P-256 key the partner's passkey row names); the CLI's poll gets the key once; Your
// computers lists it and Delete key ends it at once. A code started on another network is marked and Don't give key is
// the main button. A Builder's page says who may sign a computer in. Phone width, screenshots and axe.
// Guards: a key given without a passkey for this code, a code accepted from anyone, the code in a URL.
// =============================================================================
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { CONSOLE, USERS, expectToast, partnerOn, signedIn } from '../lib.mjs'

const T = 'dddddddd-0000-4000-8000-0000000000d9'
const SLUG = 'dev-ayuda', STORE = 'House of Ayuda'
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

/** The CLI's two calls, from a network of our choosing (x-forwarded-for, as Vercel's edge sets it). */
const start = async (ip = '127.0.0.1') => {
  const r = await fetch(CONSOLE + '/api/dev/device/start', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ store: SLUG }) })
  assert.equal(r.status, 200, `start answered ${r.status}`)
  return r.json()
}
const poll = async (device) => {
  const r = await fetch(CONSOLE + '/api/dev/device/poll', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' }, body: JSON.stringify({ device }) })
  return { status: r.status, body: await r.json() }
}

/** A real passkey: a P-256 key in the page's virtual authenticator, and its public key on the person's partner passkey row. */
async function realPasskey(page, db, user) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  const cose = Buffer.concat([Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]), Buffer.from(jwk.x, 'base64url'), Buffer.from([0x22, 0x58, 0x20]), Buffer.from(jwk.y, 'base64url')])
  const id = randomBytes(32)
  const [me] = await db`select member_id from app_pm_live(${user.id}::uuid)`
  // The sign-in seed's passkey id (e2e-seed-partner-…) is not base64url, and the browser refuses an offer that names it:
  // give it a well-formed id (a real passkey's always is).
  await db`update partner_passkeys set credential_id = ${randomBytes(16).toString('base64url')} where user_id = ${user.id} and credential_id like 'e2e-seed-partner-%'`
  await db`insert into partner_passkeys (partner_member_id, user_id, credential_id, public_key, name) values (${me.member_id}, ${user.id}, ${id.toString('base64url')}, ${cose.toString('base64url')}, 'This laptop')`
  await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: { credentialId: id.toString('base64'), isResidentCredential: true, rpId: 'localhost',
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'), userHandle: Buffer.from(`partner:${me.member_id}`).toString('base64'), signCount: 0 } })
}

/** The dialog's entrance finished, so a screenshot shows its real state (not the fade). */
const settled = (dialog) => dialog.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))

async function axe(p, t, label) {
  await p.addScriptTag({ content: AXE })
  const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id}: ${x.nodes.length}`))
  assert.deepEqual(v, [], `${label}: axe found ${v.join(', ')}`)
  t.note?.(`${label}: axe clean`)
}

export default {
  name: 'developer',
  async run(t) {
    const { db } = t
    const P = USERS.partner, B = USERS.builder
    await db`insert into auth.users (id, email, email_confirmed_at) values (${P.id}, ${P.email}, now()), (${B.id}, ${B.email}, now()) on conflict (id) do nothing`
    await db`insert into tenants (id, slug, name) values (${T}, ${SLUG}, ${STORE}) on conflict (id) do nothing`
    await db`insert into shop_settings (tenant_id, pickup_pincode) values (${T}, '452009') on conflict (tenant_id) do nothing`
    await partnerOn(db, T, P)
    const [{ id: partnerId }] = await db`select id from partners where user_id = ${P.id}`
    const open = async (who, viewport) => { const ctx = await signedIn(t.browser, who, { viewport }); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }

    const pia = await open('partner', { width: 1280, height: 900 })
    pia.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') t.errors.push(`console: ${m.text()}`) })
    await realPasskey(pia, db, P)
    const field = () => pia.getByLabel('Code from your terminal')
    const check = async (code) => { await field().fill(code); await pia.getByRole('button', { name: 'Check code' }).click() }

    await t.step('the page: nothing signed in yet; a typo and an ended code each say so at the field', async () => {
      await pia.goto(CONSOLE + '/partner/developer')
      await pia.getByRole('heading', { name: 'Developer', exact: true }).waitFor()
      await pia.getByRole('link', { name: 'Developer' }).first().waitFor()
      await pia.getByText('No computers signed in').waitFor()
      await check('HXKT')
      await pia.getByText('Type the 8 characters from your terminal.').waitFor()
      assert.equal(await field().getAttribute('aria-invalid'), 'true')
      await check('BCDF-GHJK')
      await pia.getByText('This code has ended. Run the command again for a new one.').waitFor()
      assert.ok(!pia.url().includes('BCDF'), 'a code in the address')
      await pia.screenshot({ path: t.out('developer-1280') })
      await axe(pia, t, 'developer 1280')
    })

    let s
    await t.step('the CLI starts; the terminal’s words come with it, the verify link names the page and no code', async () => {
      s = await start()
      assert.match(s.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      assert.match(s.verify, /\/partner\/developer$/)
      assert.equal(s.message, `Open ${s.verify.replace(/^https?:\/\//, '')}\nCode ${s.code} ends in 10 minutes`)
      assert.equal((await poll(s.device)).status, 202)
    })

    await t.step('Check code: the store, the code, started just now on your network, the key; Give key with the passkey', async () => {
      await check(s.code.toLowerCase().replace('-', ''))
      const dialog = pia.getByRole('dialog', { name: 'Give this computer a Build key?' })
      await dialog.getByText(STORE).waitFor()
      await dialog.getByText(s.code).waitFor()
      await dialog.getByText('Your network').waitFor()
      await dialog.getByText('Reads the store’s products, drafts too. Ends in 24 hours.').waitFor()
      await dialog.getByText('Frrata never asks you for a code. Type only one from your own screen.').waitFor()
      assert.equal(await dialog.getByLabel('This is my computer').count(), 0, 'the box shows on the person’s own network')
      await settled(dialog); await pia.screenshot({ path: t.out('developer-confirm-1280') })
      await axe(pia, t, 'confirm dialog')
      await dialog.getByRole('button', { name: 'Give key', exact: true }).click()
      await expectToast(pia, 'Signed in. This computer has a key for 24 hours.', 'ok')
      const got = await poll(s.device)
      assert.equal(got.status, 200, JSON.stringify(got.body))
      assert.match(got.body.key, /^frs_build_/)
      assert.equal((await poll(s.device)).status, 404, 'a key given twice')
      const [k] = await db`select name, purpose, created_by, partner_id from storefront_keys where hash = ${createHash('sha256').update(got.body.key).digest('hex')}`
      assert.deepEqual(k, { name: `${P.email}’s computer`, purpose: 'developer', created_by: P.id, partner_id: partnerId })
      const [a] = await db`select count(*)::int n from audit_events where tenant_id = ${T} and action = 'build_key.device_confirmed' and actor_user_id = ${P.id}`
      assert.equal(a.n, 1)
    })

    await t.step('Your computers lists it; Delete key asks once, and it is gone at once', async () => {
      await pia.reload()
      const row = pia.getByRole('listitem').filter({ hasText: STORE })
      await row.getByText(/^Confirmed Today, .+ · ends in 2[34] hours$/).waitFor()
      await row.getByText('Build', { exact: true }).waitFor()
      await row.getByRole('button', { name: 'Delete key' }).click()
      const dlg = pia.getByRole('dialog', { name: 'Delete this computer’s key?' })
      await dlg.getByText('That computer is signed out at once.').waitFor()
      await settled(dlg); await pia.screenshot({ path: t.out('developer-delete-1280') })
      await dlg.getByRole('button', { name: 'Delete key' }).click()
      await expectToast(pia, 'Key deleted.', 'ok')
      await pia.getByText('No computers signed in').waitFor()
      const [r] = await db`select count(*)::int n from storefront_keys where tenant_id = ${T} and purpose = 'developer' and revoked_at is null`
      assert.equal(r.n, 0)
    })

    await t.step('a code started on another network is marked, and Don’t give key is the main button', async () => {
      const far = await start('203.0.113.7')
      await check(far.code)
      const dialog = pia.getByRole('dialog', { name: 'Give this computer a Build key?' })
      await dialog.getByText('Another network').waitFor()
      await dialog.getByText('This code was not started from your network. Frrata never asks you for a code.').waitFor()
      const box = dialog.getByLabel('This is my computer')
      const give = dialog.getByRole('button', { name: 'Give key', exact: true })
      assert.equal(await give.getAttribute('aria-disabled'), 'true', 'Give key is on before This is my computer')
      await dialog.getByText('Tick This is my computer first.').waitFor()
      await box.check()
      assert.equal(await give.getAttribute('aria-disabled'), null, 'Give key stays off once ticked')
      await box.uncheck()
      const dont = dialog.getByRole('button', { name: 'Don’t give key' })
      assert.match(await dont.getAttribute('class'), /(^| )bg-primary( |$)/, 'Don’t give key is not the main button')
      await settled(dialog); await pia.screenshot({ path: t.out('developer-elsewhere-1280') })
      await dont.click()
      await dialog.waitFor({ state: 'detached' })
      assert.equal((await poll(far.device)).status, 202, 'a code not given is still waiting')
    })

    await t.step('a network Frrata can’t tell reads as another; ticked, Give key gives the key', async () => {
      const blind = await start('unknown')
      await check(blind.code)
      const dialog = pia.getByRole('dialog', { name: 'Give this computer a Build key?' })
      await dialog.getByText('Another network').waitFor()
      await dialog.getByLabel('This is my computer').check()
      assert.equal(await dialog.getByRole('button', { name: 'Give key', exact: true }).getAttribute('aria-disabled'), null)
      await settled(dialog); await pia.screenshot({ path: t.out('developer-mine-1280') })
      await dialog.getByRole('button', { name: 'Give key', exact: true }).click()
      await expectToast(pia, 'Signed in. This computer has a key for 24 hours.', 'ok')
      assert.equal((await poll(blind.device)).status, 200, 'the key after This is my computer')
    })

    await t.step('phone: the same cards, stacked; the field asks for capitals', async () => {
      const phone = await open('partner', { width: 390, height: 844 })
      await phone.goto(CONSOLE + '/partner/developer')
      await phone.getByRole('heading', { name: 'Developer', exact: true }).waitFor()
      assert.equal(await phone.getByLabel('Code from your terminal').getAttribute('autocapitalize'), 'characters')
      assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the page scrolls sideways')
      await phone.screenshot({ path: t.out('developer-390'), fullPage: true })
      await axe(phone, t, 'developer 390')
    })

    await t.step('a Builder reads who may sign a computer in', async () => {
      await db`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${partnerId}, ${B.id}, ${B.email}, 'builder', now())
        on conflict do nothing`
      const bp = await open('builder', { width: 1280, height: 900 })
      await bp.goto(CONSOLE + '/partner/developer')
      await bp.getByText('Only a Partner owner or a Lead can sign in a computer.').waitFor()
      assert.equal(await bp.getByLabel('Code from your terminal').count(), 0)
      await bp.screenshot({ path: t.out('developer-builder-1280') })
    })

    await t.step('no passkey at all (undrawn, ruling 6): Give key is off with its reason, and Add passkey opens Passkeys', async () => {
      const [b] = await db`select id from partner_members where user_id = ${B.id} and removed_at is null`
      const [me] = await db`select member_id from app_pm_live(${P.id}::uuid)`
      await db`update partner_passkeys set partner_member_id = ${b.id} where partner_member_id = ${me.member_id}`
      try {
        const none = await start()
        await pia.goto(CONSOLE + '/partner/developer')
        await check(none.code)
        const dialog = pia.getByRole('dialog', { name: 'Give this computer a Build key?' })
        await dialog.getByText('Add a passkey to give a key.').waitFor()
        assert.equal(await dialog.getByRole('button', { name: 'Give key', exact: true }).getAttribute('aria-disabled'), 'true', 'Give key is on with no passkey')
        await settled(dialog); await pia.screenshot({ path: t.out('developer-no-passkey-1280') })
        await dialog.getByRole('link', { name: 'Add passkey' }).click()
        await pia.waitForURL(/\/partner\/passkeys$/)
      } finally {
        await db`update partner_passkeys set partner_member_id = ${me.member_id} where user_id = ${P.id}`
      }
    })
  },
}
