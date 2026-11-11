// =============================================================================
// FLOW: Admin › Infrastructure (docs/plans/2026-11-11-guardrails-infra-a2.md I·4; mockup 2026-11-10-infra-usage).
// Staff open it from the Admin nav; the Supabase tab reads the database's health live (admin_db_health, aggregates
// only): plan, size, connections, the outbox, and what needs them (on Free, the plan itself). A waiting outbox row older
// than 10 minutes becomes a "Now". Vercel and Mux say what connects them. A merchant gets no Admin. Phone: no sideways scroll.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, PORTS, USERS, signedIn } from '../lib.mjs'
import { MUX } from '../constants.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const FAKE = `http://127.0.0.1:${PORTS.domains}`
const cron = () => fetch(`${CONSOLE}/api/cron/infra`, { headers: { authorization: 'Bearer e2e-cron' } }).then((r) => r.json())
const setDelivery = (rows) => fetch(`http://127.0.0.1:${PORTS.mux}/_test/delivery`, { method: 'POST', body: JSON.stringify(rows) })
const setCharges = (charges, wide = false) => fetch(`${FAKE}/_test/charges`, { method: 'POST', body: JSON.stringify({ charges, wide }) })
/** FOCUS rows for each day of this month so far: frata steady, ekatanv2 large; yesterday a 5× spike on frata. */
function month(now = new Date()) {
  const rows = [], y = now.getUTCFullYear(), m = now.getUTCMonth(), today = now.getUTCDate()
  for (let d = 1; d <= today; d++) {
    const day = new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
    const frata = d === today - 1 ? 6 : 0.5
    rows.push({ ChargePeriodStart: `${day}T08:00:00.000Z`, ServiceName: 'Fluid Active CPU', ChargeCategory: 'Usage', EffectiveCost: frata, ConsumedQuantity: frata / 0.14, ConsumedUnit: 'Hours', Tags: { ProjectName: 'frata' } })
    rows.push({ ChargePeriodStart: `${day}T08:00:00.000Z`, ServiceName: 'Fluid Provisioned Memory', ChargeCategory: 'Usage', EffectiveCost: 1.2, ConsumedQuantity: 100, ConsumedUnit: 'GB-Hours', Tags: { ProjectName: 'ekatanv2' } })
  }
  return rows
}

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
        await p.getByRole('link', { name: /^Supabase/ }).click()
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

      await t.step('Vercel before the first read; Mux shows Frrata’s own videos before its first read', async () => {
        await db`delete from infra_usage_daily`; await db`delete from infra_pulls`
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/infrastructure?tab=vercel')
        await p.getByText('Vercel’s billing hasn’t been read yet').waitFor()
        await p.goto(CONSOLE + '/admin/infrastructure?tab=mux')
        await p.getByText('Live videos').waitFor()
        await ctx.close()
      })

      await t.step('The hourly read: month to date, the split, a spike and another project over 40%', async () => {
        await setCharges(month())
        assert.deepEqual(await cron(), { vercel: 'ok' })
        const [{ n }] = await db`select count(*)::int n from infra_usage_daily where source = 'vercel'`
        assert.ok(n >= 2, 'rows saved')
        assert.equal((await cron()).vercel, 'ok', 'a second read is idempotent')
        assert.equal((await db`select count(*)::int n from infra_usage_daily where source = 'vercel'`)[0].n, n)
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/infrastructure?tab=vercel')
        await p.getByText('Month to date').waitFor()
        if (new Date().getUTCDate() >= 5) {
          await p.getByText(/ekatanv2 is \d+% of this month’s usage/).waitFor()
          await p.getByText(/× a normal day/).waitFor()
        }
        await p.getByRole('cell', { name: 'Fluid Provisioned Memory' }).waitFor()
        await ctx.close()
      })

      await t.step('A token that can read env is refused; the tab keeps the last good numbers and says so', async () => {
        await setCharges(month(), true)
        assert.equal((await cron()).vercel, 'token_too_wide')
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/infrastructure?tab=vercel')
        await p.getByText('The token can do more than read billing, so it was refused', { exact: false }).waitFor()
        await p.getByText('Month to date').waitFor()
        await ctx.close()
        await setCharges(null)
      })

      await t.step('Mux: delivery read hourly with the read-only token; the product video, its shop and plan cap; one video over a quarter', async () => {
        const [prod] = await db`select id, title from products where tenant_id = ${KESAR} order by created_at limit 1`
        await db.begin(async (x) => {
          await x`set local session_replication_role = replica`
          const [vid] = await x`insert into videos (tenant_id, mux_env, created_by, use, upload_id, asset_id, playback_id, duration_ms, ready_at, mp4_ready_at)
            values (${KESAR}, ${MUX.env}, ${USERS.owner.id}, 'product', 'up_e2e_infra', 'assete2einfra', 'pbe2einfra', 24400, now(), now()) returning id`
          await x`insert into product_videos (tenant_id, product_id, video_id) values (${KESAR}, ${prod.id}, ${vid.id})`
        })
        await setDelivery([{ asset_id: 'assete2einfra', seconds: 1200 * 60 }])
        assert.equal((await cron()).mux, 'ok')
        const { ctx, p } = await open('frata')
        await p.goto(CONSOLE + '/admin/infrastructure?tab=mux')
        await p.getByText('Delivered · to 12 h ago').waitFor()
        await p.getByRole('cell', { name: prod.title }).first().waitFor()
        await p.getByText(/One video is \d+% of delivery/).waitFor()
        await p.getByRole('cell', { name: /\d+ \/ 1,000|\d+ \/ 300|\d+ \/ 50|\d+ \/ 3,000/ }).first().waitFor()
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
      await setCharges(null).catch(() => {}); await setDelivery([]).catch(() => {})
      await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        await x`delete from product_videos where video_id in (select id from videos where asset_id = 'assete2einfra')`
        await x`delete from videos where asset_id = 'assete2einfra'`
      }).catch(() => {})
    }
  },
}
