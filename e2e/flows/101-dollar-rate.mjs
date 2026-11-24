// =============================================================================
// FLOW: dollar-rate — Admin › Money › Dollar rate (V3b K2; mockup docs/mockups/2026-11-24-v3b-first.html § 1, approved by
// the owner 2026-11-24; plan docs/plans/2026-11-24-v3b-first.md). The banner on every Admin page: none yet, ageing from
// the third day (the last working day, then "tomorrow"), lapsed. A master admin types a mistake (its line at the field),
// then the day's rate: a toast, the row with who typed it, the banner gone. Support staff: no menu item, the page says
// who may, the banner without its button. Phone width. Screenshots e2e/.out/101-dollar-rate-*.png are what
// mockup-parity-reviewer compares with § 1.
// Guards: a rate saved by Support staff; a banner left after a fresh rate; a sideways scroll at 390.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, expectToast, signedIn } from '../lib.mjs'

export default {
  name: 'dollar-rate',
  async run(t) {
    const { db } = t
    const M = USERS.frata, S = USERS.staff
    await db`insert into platform_staff (user_id, email, role) values (${M.id}, ${M.email}, 'admin') on conflict (user_id) do update set role = 'admin'`
    await db`insert into auth.users (id, email, email_confirmed_at) values (${S.id}, ${S.email}, now()) on conflict (id) do nothing`
    const wasStaff = await db`select role from platform_staff where user_id = ${S.id}` // later flows meet Arjun as before
    await db`insert into platform_staff (user_id, email, role) values (${S.id}, ${S.email}, 'support') on conflict (user_id) do update set role = 'support'`
    const kept = await db`select day, rate_e4, source, fetched_at from fx_rates`
    const today = (await db`select (now() at time zone 'Asia/Kolkata')::date::text as d`)[0].d
    const setNewest = async (daysAgo) => {
      await db`delete from fx_rates`
      if (daysAgo !== null) await db`insert into fx_rates (day, rate_e4, source) values (${today}::date - ${daysAgo}::int, 940350, 'manual')`
    }
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }
    try {
      const meera = await open('frata', { viewport: { width: 1280, height: 900 } })

      await t.step('the banner: none yet, ageing with its last day, the last day, lapsed', async () => {
        await setNewest(null)
        await meera.goto(CONSOLE + '/admin')
        const bad = meera.locator('[data-banner="bad"]')
        await bad.getByText('Studio is stopped').waitFor()
        await bad.getByText('No dollar rate yet').waitFor()
        await bad.getByRole('link', { name: 'Enter rate' }).waitFor()
        await meera.screenshot({ path: 'e2e/.out/101-dollar-rate-none.png' })
        await setNewest(3)
        await meera.reload()
        await meera.locator('[data-banner="warn"]').getByText(/^Studio stops after \d{1,2} [A-Z][a-z]{2}$/).waitFor()
        await meera.screenshot({ path: 'e2e/.out/101-dollar-rate-ageing.png' })
        await setNewest(4)
        await meera.reload()
        await meera.locator('[data-banner="warn"]').getByText('Studio stops tomorrow').waitFor()
        await setNewest(6)
        await meera.reload()
        await meera.locator('[data-banner="bad"]').getByText(/^The newest dollar rate is from /).waitFor()
        await meera.screenshot({ path: 'e2e/.out/101-dollar-rate-lapsed.png' })
      })

      await t.step('a master admin: a mistake at its field, then today’s rate saved; the row names her; the banner leaves', async () => {
        await meera.locator('[data-banner="bad"]').getByRole('link', { name: 'Enter rate' }).click()
        await meera.waitForURL(/\/admin\/rate$/)
        await meera.getByRole('heading', { name: 'Dollar rate' }).waitFor()
        const field = meera.getByLabel(/^Rupees per dollar · /)
        await field.fill('9.41997')
        await meera.getByRole('button', { name: 'Save rate' }).click()
        await meera.getByText('Type rupees with up to 4 decimals, like 94.1997.').first().waitFor()
        assert.equal(await field.getAttribute('aria-invalid'), 'true')
        await meera.screenshot({ path: 'e2e/.out/101-dollar-rate-wrong.png' })
        await field.fill('94.1997')
        await meera.getByRole('button', { name: 'Save rate' }).click()
        await expectToast(meera, /^Rate saved for \d{1,2} [A-Z][a-z]{2}\.$/, 'ok')
        const row = meera.getByRole('row').filter({ hasText: '94.1997' })
        await row.waitFor()
        await row.getByText(M.email).waitFor()
        const [r] = await db`select rate_e4 from fx_rates where day = ${today}::date`
        assert.equal(r.rate_e4, 941997)
        assert.equal(await meera.locator('[data-banner]').count(), 0, 'no banner once today’s rate is in')
        await meera.screenshot({ path: 'e2e/.out/101-dollar-rate-fresh.png' })
        await meera.setViewportSize({ width: 390, height: 844 })
        await meera.reload()
        assert.equal(await meera.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll at 390')
        await meera.screenshot({ path: 'e2e/.out/101-dollar-rate-phone.png' })
      })

      await t.step('Support staff: no menu item, the page says who may, the banner without its button', async () => {
        await setNewest(4)
        const sam = await open('staff', { viewport: { width: 1280, height: 900 } })
        await sam.goto(CONSOLE + '/admin')
        const warn = sam.locator('[data-banner="warn"]')
        await warn.getByText('Studio stops tomorrow').waitFor()
        await warn.getByText('Ask a master admin to enter today’s dollar rate').waitFor()
        assert.equal(await warn.getByRole('link').count(), 0, 'no Enter rate for Support staff')
        assert.equal(await sam.getByRole('link', { name: 'Dollar rate' }).count(), 0, 'no menu item for Support staff')
        await sam.goto(CONSOLE + '/admin/rate')
        await sam.getByText('Only a master admin can enter the dollar rate').waitFor()
        assert.equal(await sam.getByRole('button', { name: 'Save rate' }).count(), 0)
        await sam.screenshot({ path: 'e2e/.out/101-dollar-rate-support.png' })
        await sam.context().close()
      })
      await meera.context().close()
    } finally {
      if (wasStaff.length) await db`update platform_staff set role = ${wasStaff[0].role} where user_id = ${S.id}`
      else await db`delete from platform_staff where user_id = ${S.id}`
      await db`delete from fx_rates`
      for (const k of kept) await db`insert into fx_rates (day, rate_e4, source, fetched_at) values (${k.day}, ${k.rate_e4}, ${k.source}, ${k.fetched_at}) on conflict (day) do nothing`
    }
  },
}
