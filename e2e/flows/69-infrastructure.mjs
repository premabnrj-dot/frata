// =============================================================================
// FLOW: Admin › Infrastructure (docs/plans/2026-11-11-guardrails-infra-a2.md I·4; mockup 2026-11-10-infra-usage).
// Staff open it from the Admin nav; the Supabase tab reads the database's health live (admin_db_health, aggregates
// only): plan, size, connections, the outbox, and what needs them (on Free, the plan itself). A waiting outbox row older
// than 10 minutes becomes a "Now". Vercel and Mux say what connects them. A merchant gets no Admin. Phone: no sideways scroll.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'

export default {
  name: 'infrastructure',
  async run(t) {
    const { db } = t
    const F = USERS.frata
    await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do nothing`
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return { ctx, p } }
    let stuck
    try {
      await t.step('Staff: Infrastructure in the nav; Supabase shows plan, size, connections and the Free plan as a Soon', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin')
        await p.getByRole('link', { name: 'Infrastructure' }).first().click()
        await p.getByRole('heading', { name: 'Infrastructure' }).waitFor()
        await p.getByText('Database', { exact: true }).waitFor()
        await p.getByText('The database is on Supabase’s Free plan').waitFor()
        await p.getByText('Biggest tables').waitFor()
        assert.equal(await p.getByText(/9845012345/).count(), 0)
        await ctx.close()
      })

      await t.step('An outbox row waiting 15 minutes is a Now, with its count', async () => {
        ;[stuck] = await db`insert into outbox (tenant_id, kind, dedupe_key, payload, created_at, next_attempt_at)
          values (${KESAR}, 'e2e.stuck', 'e2e.stuck:1', '{}', now() - interval '15 minutes', now() + interval '1 day') returning id`
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/infrastructure?tab=supabase')
        await p.getByText('Outbox waiting 15 minutes').waitFor()
        await ctx.close()
      })

      await t.step('Vercel and Mux say what connects them', async () => {
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/infrastructure?tab=vercel')
        await p.getByText('A billing-only Vercel token connects this tab.', { exact: false }).waitFor()
        await p.goto(CONSOLE + '/admin/infrastructure?tab=mux')
        await p.getByText('A read-only Mux token connects this tab.', { exact: false }).waitFor()
        await ctx.close()
      })

      await t.step('A merchant gets no Admin page', async () => {
        const { ctx, p } = await open('owner')
        await p.goto(CONSOLE + '/admin/infrastructure')
        assert.equal(await p.getByText('Biggest tables').count(), 0)
        await ctx.close()
      })

      await t.step('Phone: no sideways scroll', async () => {
        const { ctx, p } = await open('frata', { viewport: { width: 390, height: 844 } })
        await p.goto(CONSOLE + '/admin/infrastructure?tab=supabase')
        await p.getByText('Database', { exact: true }).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll')
        await ctx.close()
      })
    } finally {
      if (stuck) await db`delete from outbox where id = ${stuck.id}`
    }
  },
}
