// =============================================================================
// FLOW: sign-up (trials TR1's regression net, written before app_create_shop changes — plan rule 5). A person with no
// shop signs in, makes one through /start (name, address, plan, WhatsApp code, what they sell) and lands in the console, owner of
// a shop on the plan chosen (trials TR1: Growth preselected, a trial with frozen terms, the email claimed). Cleans up.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { CONSOLE, PORTS, SHOP_DOMAIN, USERS, signedIn } from '../lib.mjs'

const SLUG = 'noor-threads-e2e'

export default {
  name: 'signup',
  async run(t) {
    const { db } = t
    const F = USERS.founder
    await db`insert into auth.users (id, email, email_confirmed_at) values (${F.id}, ${F.email}, now()) on conflict (id) do nothing`
    const cleanup = async () => {
      const ts = await db`select id from tenants where slug = ${SLUG}`
      for (const { id } of ts) await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        await x`delete from signup_codes where user_id = ${F.id}`
        for (const tbl of ['audit_events', 'tenant_plans', 'shop_trials', 'trial_claims', 'members', 'shop_settings', 'tenant_domains', 'tenant_counters', 'tenant_modules']) await x.unsafe(`delete from ${tbl} where tenant_id = $1`, [id]).catch(() => undefined)
        await x`delete from tenants where id = ${id}`
      })
    }
    await cleanup()
    try {
      const ctx = await signedIn(t.browser, 'founder', { viewport: { width: 390, height: 844 } })
      const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
      // Both widths of each step, for the parity check against mockup § 1 (O1·8).
      const shot = async (name) => {
        await p.screenshot({ path: t.out(`${name}-390`), fullPage: true })
        await p.setViewportSize({ width: 1280, height: 800 }); await p.screenshot({ path: t.out(`${name}-1280`), fullPage: true })
        await p.setViewportSize({ width: 390, height: 844 })
      }
      await t.step('the name step: a taken address waits; the address is checked as the name is typed', async () => {
        await p.goto(CONSOLE + '/start')
        await p.getByRole('heading', { name: 'What is your brand called?' }).waitFor()
        await p.getByRole('img', { name: 'Step 1 of 4' }).waitFor() // name, plan, WhatsApp code, what you sell
        assert.equal(await p.getByRole('button', { name: 'Use this name' }).isDisabled(), true, 'waits for a name')
        await shot('name-empty')
        await p.getByLabel('Brand name').fill('Kesar Studio')
        await p.getByText('Taken', { exact: true }).waitFor()
        assert.equal(await p.getByRole('button', { name: 'Use this name' }).isDisabled(), true, 'a taken address waits')
        await shot('name-taken')
      })
      await t.step('a person with no shop makes one through /start and lands in the console as its owner', async () => {
        await p.getByLabel('Brand name').fill('Noor Threads')
        await p.locator('#su-addr').getByText(`noor-threads.${SHOP_DOMAIN}`, { exact: true }).waitFor()
        await p.getByText('Available', { exact: true }).waitFor() // the address check runs as you type
        await shot('name-available')
        await p.getByRole('button', { name: 'Change web address' }).click()
        const dlg = p.getByRole('dialog', { name: 'Your web address' })
        await dlg.getByRole('button', { name: 'Close' }).waitFor()
        await dlg.getByLabel('Web address').fill(SLUG)
        await dlg.getByText('Available', { exact: true }).waitFor()
        await shot('change-address')
        await dlg.getByRole('button', { name: 'Use this address' }).click()
        await p.locator('#su-addr').getByText(`${SLUG}.${SHOP_DOMAIN}`, { exact: true }).waitFor()
        assert.equal(await p.evaluate(() => document.activeElement?.textContent), 'Change web address', 'focus returns to the button')
        await p.getByRole('button', { name: 'Use this name' }).click()
        // Trials TR1: the plan step — Growth is chosen; the trial length is Admin's setting.
        await p.getByRole('heading', { name: 'Choose your plan' }).waitFor()
        await p.getByRole('img', { name: 'Step 2 of 4' }).waitFor()
        await p.getByText(/^\d+ days free from going live$/).waitFor()
        assert.equal(await p.getByRole('radio', { name: /Growth/ }).isChecked(), true)
        await shot('plan-step')
        await p.getByRole('button', { name: 'Continue' }).click()
        // The WhatsApp code (on: Frrata's own number is configured in the stack). A wrong code is refused first.
        await p.getByRole('heading', { name: 'Your WhatsApp number' }).waitFor()
        await shot('phone')
        await p.getByLabel('Mobile number').fill('9829043211')
        await p.getByRole('button', { name: 'Send code' }).click()
        await p.getByLabel('Code from WhatsApp').waitFor()
        const sent = await (await fetch(`http://localhost:${PORTS.meta}/_test/code?to=919829043211`)).json()
        assert.match(sent.code ?? '', /^\d{6}$/)
        await p.getByLabel('Code from WhatsApp').fill(sent.code === '000000' ? '111111' : '000000')
        await p.getByRole('button', { name: 'Verify' }).click()
        await p.getByText('That code is not right, or has expired.').waitFor()
        await p.getByLabel('Code from WhatsApp').fill(sent.code)
        await p.getByRole('button', { name: 'Verify' }).click()
        await p.getByRole('heading', { name: 'What do you sell?' }).waitFor()
        await p.getByRole('button', { name: 'Women', exact: true }).click()
        await shot('sells')
        await p.getByRole('button', { name: 'Create store' }).click()
        await p.getByRole('heading', { name: 'Creating your store' }).waitFor()
        await p.getByRole('heading', { name: 'Noor Threads is ready to set up' }).waitFor()
        await shot('done')
        await p.getByRole('link', { name: 'Set up store' }).click()
        await p.waitForURL(/\/console$/)
        const [s] = await db`select t.id, m.role from tenants t join members m on m.tenant_id = t.id where t.slug = ${SLUG} and m.user_id = ${F.id}`
        assert.equal(s?.role, 'owner')
        const [plan] = await db`select p.code from tenant_plans tp join plan_versions v on v.id = tp.plan_version_id join plans p on p.id = v.plan_id where tp.tenant_id = ${s.id}`
        assert.equal(plan?.code, 'growth')
        // A first sign-up gets a trial with the terms frozen, and its verified email is claimed (keyed, never stored).
        const [trial] = await db`select days, started_at from shop_trials where tenant_id = ${s.id}`
        assert.ok(trial && trial.started_at === null, 'a trial, not started until the website goes live')
        assert.equal((await db`select count(*)::int n from trial_claims where tenant_id = ${s.id} and kind in ('email', 'phone')`)[0].n, 2)
        assert.equal((await db`select count(*)::int n from signup_codes where user_id = ${F.id} and consumed_at is not null`)[0].n, 1)
        assert.equal((await db`select count(*)::int n from trial_claims where key_hmac = ${F.email}`)[0].n, 0)
        // O1: no pickup PIN code at sign-up (Settings › Store asks for it), and none in the audit.
        assert.equal((await db`select pickup_pincode from shop_settings where tenant_id = ${s.id}`)[0].pickup_pincode, null)
        const [created] = await db`select detail from audit_events where tenant_id = ${s.id} and action = 'shop.created'`
        assert.ok(created && !('pickup' in created.detail), 'the audit has no pickup')
        await p.screenshot({ path: t.out('new-shop'), fullPage: true })
      })

      await t.step('TR1·7: the trial in the console — building; ending (banner, two equal choices); 7 more days once; grace', async () => {
        const [{ id }] = await db`select id from tenants where slug = ${SLUG}`
        await p.goto(CONSOLE + '/console/settings/billing')
        await p.getByText('Trial starts when your store goes live').waitFor()
        // Live 25 days ago: 5 days left, so the banner asks — and declining is as visible as accepting.
        await db`update shop_trials set signed_up_at = now() - interval '26 days', started_at = now() - interval '25 days' where tenant_id = ${id}`
        await db`select app_trial_recompute(${id})`
        await p.goto(CONSOLE + '/console')
        await p.getByText(/^Trial ends .* · then ₹5,899\/mo incl\. GST$/).waitFor()
        await p.getByRole('link', { name: 'Set up autopay' }).waitFor()
        await p.getByRole('button', { name: 'Not now' }).click()
        await p.getByText(/^Trial ends/).waitFor({ state: 'detached' })
        await p.goto(CONSOLE + '/console/settings/billing')
        await p.getByRole('button', { name: 'Take 7 more days' }).click()
        await p.getByText(/^Trial · \d+ days left/).waitFor()
        await p.getByRole('button', { name: 'Take 7 more days' }).waitFor({ state: 'detached' }) // once only
        // Past the end without autopay: grace, then the pause date.
        await db`update shop_trials set started_at = now() - interval '40 days', signed_up_at = now() - interval '41 days' where tenant_id = ${id}`
        await db`select app_trial_recompute(${id})`
        await p.goto(CONSOLE + '/console')
        await p.getByText(/^Trial ended · store pauses /).waitFor()
        await p.screenshot({ path: t.out('trial-grace'), fullPage: false })
      })

      await t.step('TR1·9: past the grace without autopay the shop pauses — "Back soon", no new orders; the console says so', async () => {
        const [{ id }] = await db`select id from tenants where slug = ${SLUG}`
        // Live (the clock already started above), and 50 days on: trial + extension + grace all over.
        await db`update shop_settings set published_at = now() - interval '50 days' where tenant_id = ${id}`
        await db`update shop_trials set started_at = now() - interval '50 days', signed_up_at = now() - interval '51 days' where tenant_id = ${id}`
        await db`select app_trial_recompute(${id})`
        const shop = await t.browser.newContext({ viewport: { width: 390, height: 844 } })
        const s = await shop.newPage()
        await s.goto(`http://${SLUG}.frata.test/`)
        await s.getByText('Back soon').waitFor()
        await s.screenshot({ path: t.out('paused-shop'), fullPage: false })
        // node:http, not fetch: undici drops a Host header (frata-gotchas).
        const quote = await new Promise((done) => {
          const r = http.request({ host: '127.0.0.1', port: 3077, path: '/api/shop/quote', method: 'POST', headers: { host: `${SLUG}.frata.test`, origin: `http://${SLUG}.frata.test`, 'content-type': 'application/json' } },
            (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => done({ status: res.statusCode, body: b })) })
          r.end(JSON.stringify({ bag: [{ variantId: '00000000-0000-4000-8000-000000000001', qty: 1 }] }))
        })
        assert.equal(quote.status, 404)
        assert.match(quote.body, /not taking orders right now/)
        await shop.close()
        await p.goto(CONSOLE + '/console')
        await p.getByText('Store paused · no new orders').waitFor()
      })
    } finally {
      await cleanup()
    }
  },
}
