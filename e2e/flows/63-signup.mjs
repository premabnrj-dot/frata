// =============================================================================
// FLOW: sign-up (trials TR1's regression net, written before app_create_shop changes — plan rule 5). A person with no
// shop signs in, makes one through /start (name, address, pincode, what they sell) and lands in the console, owner of
// a shop on the plan chosen (trials TR1: Growth preselected, a trial with frozen terms, the email claimed). Cleans up.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, PORTS, USERS, signedIn } from '../lib.mjs'

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
      await t.step('a person with no shop makes one through /start and lands in the console as its owner', async () => {
        await p.goto(CONSOLE + '/start')
        await p.getByLabel('Shop name').fill('Noor Threads')
        await p.getByLabel('Shop address').fill(SLUG)
        await p.getByText('Available', { exact: true }).waitFor() // the address check runs as you type
        await p.getByRole('button', { name: 'Continue' }).click()
        await p.getByLabel('Pincode').fill('452009')
        await p.getByRole('button', { name: 'Continue' }).click()
        // Trials TR1: the plan step — Growth is chosen; the trial length is Admin's setting.
        await p.getByRole('heading', { name: 'Choose your plan' }).waitFor()
        await p.getByText(/^\d+ days free from going live$/).waitFor()
        assert.equal(await p.getByRole('radio', { name: /Growth/ }).isChecked(), true)
        await p.screenshot({ path: t.out('plan-step'), fullPage: true })
        await p.getByRole('button', { name: 'Continue' }).click()
        // The WhatsApp code (on: Frrata's own number is configured in the stack). A wrong code is refused first.
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
        await p.getByRole('button', { name: /create my shop/i }).click()
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
        await p.screenshot({ path: t.out('new-shop'), fullPage: true })
      })
    } finally {
      await cleanup()
    }
  },
}
