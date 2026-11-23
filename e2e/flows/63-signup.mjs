// =============================================================================
// FLOW: sign-up (trials TR1's regression net, written before app_create_shop changes — plan rule 5). A person with no
// shop signs in, makes one through /start (name, address, plan, WhatsApp code, what they sell) and lands in the console, owner of
// a shop on the plan chosen (trials TR1: Growth preselected, a trial with frozen terms, the email claimed). Cleans up.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { CONSOLE, PORTS, SHOP_DOMAIN, USERS, signedIn } from '../lib.mjs'

const SLUG = 'noor-threads-e2e'
const ANON_SLUG = 'noor-anon-e2e' // the signed-out path's store (O1·9)

export default {
  name: 'signup',
  async run(t) {
    const { db } = t
    const F = USERS.founder
    await db`insert into auth.users (id, email, email_confirmed_at) values (${F.id}, ${F.email}, now()) on conflict (id) do nothing`
    const cleanup = async () => {
      const ts = await db`select id from tenants where slug in (${SLUG}, ${ANON_SLUG})`
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
      // O1·9: signed out, the name comes first; email and the code on one screen; the name survives a reload, never in
      // the URL or localStorage. The first store is removed so the founder can make this one.
      await cleanup()
      const anon = await t.browser.newContext({ viewport: { width: 390, height: 844 } })
      try {
        const a = await anon.newPage(); a.setDefaultTimeout(10_000); a.on('pageerror', (e) => t.errors.push(e.message))
        const urls = []; a.on('framenavigated', (f) => { if (f === a.mainFrame()) urls.push(f.url()) })
        await t.step('O1·9 signed out: the name first, then email and code; the name is kept, never in the URL', async () => {
          await a.goto(CONSOLE + '/start')
          await a.getByRole('heading', { name: 'What is your brand called?' }).waitFor()
          await a.getByRole('img', { name: 'Step 1 of 5' }).waitFor()
          await a.getByRole('link', { name: 'Sign in' }).waitFor()
          await a.getByText('Stuck?').waitFor()
          await a.getByLabel('Brand name').fill('Noor Anon')
          await a.getByRole('button', { name: 'Change web address' }).click()
          await a.getByRole('dialog', { name: 'Your web address' }).getByLabel('Web address').fill(ANON_SLUG)
          await a.getByRole('dialog').getByText('Available', { exact: true }).waitFor()
          await a.getByRole('dialog').getByRole('button', { name: 'Use this address' }).click()
          await a.getByRole('button', { name: 'Use this name' }).click()
          await a.getByRole('heading', { name: 'Your email' }).waitFor()
          await a.getByRole('img', { name: 'Step 2 of 5' }).waitFor()
          await a.screenshot({ path: t.out('email-390'), fullPage: true })
          await a.getByLabel('Email', { exact: true }).fill(F.email)
          await a.getByRole('button', { name: 'Send code' }).click()
          await a.getByRole('group', { name: 'Code from your email' }).waitFor()
          await a.getByRole('button', { name: /^Send again in \d+ s$/ }).waitFor()
          const asked = await (await fetch(`http://localhost:${PORTS.auth}/_test/otp`)).json()
          assert.ok(asked.includes(F.email), 'the code was emailed')
          for (const [i, d] of [...'135791'].entries()) await a.getByLabel(`Digit ${i + 1}`).fill(d)
          await a.getByText('That code is wrong or has expired. Check the newest email, or ask for another.').waitFor()
          assert.equal(await a.getByLabel('Digit 1').inputValue(), '', 'the boxes are cleared')
          await a.screenshot({ path: t.out('email-wrong-390'), fullPage: true })
          await a.setViewportSize({ width: 1280, height: 800 }); await a.screenshot({ path: t.out('email-wrong-1280'), fullPage: true }); await a.setViewportSize({ width: 390, height: 844 })
          for (const [i, d] of [...'246810'].entries()) await a.getByLabel(`Digit ${i + 1}`).fill(d)
          await a.getByRole('heading', { name: 'Choose your plan' }).waitFor()
          await a.getByRole('img', { name: 'Step 3 of 5' }).waitFor() // the dots do not recount once signed in
          assert.equal(await a.locator('.su-store-nm').textContent(), 'Noor Anon', 'the name is still in the preview')
          await a.reload()
          await a.locator('.su-store-nm', { hasText: 'Noor Anon' }).waitFor()
          assert.ok(urls.every((u) => !/noor/i.test(u)), `the name never reaches the URL: ${urls.join(' ')}`)
          assert.equal(await a.evaluate(() => localStorage.length), 0, 'nothing in localStorage')
        })
        await t.step('O1·9 signed out: on to Create store and the console; the store records "/start → created"', async () => {
          // A reload starts the questions again with the answers kept: the name step, filled.
          assert.equal(await a.getByLabel('Brand name').inputValue(), 'Noor Anon')
          await a.getByRole('button', { name: 'Use this name' }).click()
          await a.getByRole('heading', { name: 'Choose your plan' }).waitFor()
          await a.getByRole('button', { name: 'Continue' }).click()
          await a.getByLabel('Mobile number').fill('9829043212')
          await a.getByRole('button', { name: 'Send code' }).click()
          await a.getByLabel('Code from WhatsApp').waitFor()
          const sent = await (await fetch(`http://localhost:${PORTS.meta}/_test/code?to=919829043212`)).json()
          await a.getByLabel('Code from WhatsApp').fill(sent.code)
          await a.getByRole('button', { name: 'Verify' }).click()
          await a.getByRole('button', { name: 'Create store' }).click()
          await a.getByRole('heading', { name: 'Noor Anon is ready to set up' }).waitFor()
          await a.getByRole('link', { name: 'Set up store' }).click()
          await a.waitForURL(/\/console$/)
          const [row] = await db`select t.id, s.pickup_pincode from tenants t join shop_settings s on s.tenant_id = t.id where t.slug = ${ANON_SLUG}`
          assert.ok(row, 'the store exists'); assert.equal(row.pickup_pincode, null)
          // O1·10: "/start → created", from the first arrival in this tab to Create store, on the audit row only.
          const [{ ms }] = await db`select (detail->>'signup_ms')::int ms from audit_events where tenant_id = ${row.id} and action = 'shop.created'`
          assert.ok(ms > 0 && ms < 86_400_000, `signup_ms ${ms}`)
          assert.equal(await a.evaluate(() => sessionStorage.getItem('frrata:signup')), null, 'the answers are cleared after creation')
        })
      } finally { await anon.close() }

      await t.step('O1·9: an owner signs in from the email step and lands on the console', async () => {
        const o = await t.browser.newContext({ viewport: { width: 390, height: 844 } })
        try {
          const a = await o.newPage(); a.setDefaultTimeout(10_000)
          await a.goto(CONSOLE + '/start')
          await a.getByLabel('Brand name').fill('Riya Again')
          await a.getByText('Available', { exact: true }).waitFor()
          await a.getByRole('button', { name: 'Use this name' }).click()
          await a.getByLabel('Email', { exact: true }).fill(USERS.owner.email)
          await a.getByRole('button', { name: 'Send code' }).click()
          for (const [i, d] of [...'246810'].entries()) await a.getByLabel(`Digit ${i + 1}`).fill(d)
          await a.waitForURL(/\/console$/)
        } finally { await o.close() }
      })

      await t.step('O1·9: with the check limited, nothing is said and the name goes on; creation still refuses a taken address', async () => {
        const windowMs = 600_000, start = new Date(Math.floor(Date.now() / windowMs) * windowMs)
        const key = createHash('sha256').update('address_open:all:all').digest('hex')
        await db`insert into rate_limits (key, window_start, n) values (${key}, ${start}, 3000) on conflict (key, window_start) do update set n = 3000`
        await db`delete from members where tenant_id in (select id from tenants where slug = ${ANON_SLUG})` // the founder has no store again
        try {
          const ctx2 = await signedIn(t.browser, 'founder', { viewport: { width: 390, height: 844 } })
          const a = await ctx2.newPage(); a.setDefaultTimeout(10_000)
          await a.goto(CONSOLE + '/start')
          // seeded kesar-studio: taken, but the limited check says nothing. Wait for its answer, not a time.
          const answered = a.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/start')
          await a.getByLabel('Brand name').fill('Kesar Studio')
          await answered
          assert.equal(await a.locator('#su-addr .badge').count(), 0, 'no chip while limited')
          assert.equal(await a.getByRole('button', { name: 'Use this name' }).isEnabled(), true)
          await a.getByRole('button', { name: 'Use this name' }).click()
          await a.getByRole('button', { name: 'Continue' }).click()
          await a.getByLabel('Mobile number').fill('9829043213')
          await a.getByRole('button', { name: 'Send code' }).click()
          await a.getByLabel('Code from WhatsApp').waitFor()
          const sent = await (await fetch(`http://localhost:${PORTS.meta}/_test/code?to=919829043213`)).json()
          await a.getByLabel('Code from WhatsApp').fill(sent.code)
          await a.getByRole('button', { name: 'Verify' }).click()
          await a.getByRole('button', { name: 'Create store' }).click()
          await a.getByRole('heading', { name: 'What is your brand called?' }).waitFor()
          await a.getByText('Someone just took that address. Try another.').waitFor()
          assert.equal(await a.getByLabel('Brand name').inputValue(), 'Kesar Studio', 'the name is kept')
          await ctx2.close()
        } finally { await db`delete from rate_limits where key = ${key}` }
      })
      await cleanup() // the signed-in path below makes the founder's store again

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
        assert.ok(Number(created.detail.signup_ms) > 0, 'the time from /start to created is kept (O1·10)')
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
