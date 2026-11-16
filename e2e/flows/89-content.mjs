// =============================================================================
// FLOW: who may change a store's content (V1 content, docs/plans/2026-11-15-v1-content.md; owner 2026-11-15): staff
// read it and can't edit; the store's partner saves after handover and the owner is told in Notices; the owner saves, and a save on a stale copy is refused in words naming who changed it,
// as a role. The Look's Header shows the bar as a link to Content. Phone and desktop.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, partnerOn, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'

export default {
  name: 'content',
  async run(t) {
    const { db } = t
    const open = async (who, opts = { viewport: { width: 1280, height: 900 } }) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`)); return { ctx, p } }
    const contact = async () => (await db`select value, version from site_content where tenant_id = ${KESAR} and kind = 'contact'`)[0] ?? null
    await db`delete from site_content where tenant_id = ${KESAR} and kind = 'contact'`
    const owner = await open('owner')
    try {
      await t.step('The owner saves the Contact line; every tab is there; no sideways scroll on a phone', async () => {
        await owner.p.goto(CONSOLE + '/console/content?tab=contact')
        for (const name of ['Announcement', 'Menus', 'Pages', 'FAQ', 'Contact line']) await owner.p.getByRole('link', { name, exact: true }).waitFor()
        await owner.p.getByLabel(/^Line/).fill('We reply within the day.')
        await owner.p.getByRole('button', { name: 'Save' }).click()
        await owner.p.getByText('Contact line saved').first().waitFor()
        assert.deepEqual((await contact()).value, { line: 'We reply within the day.' })
        await owner.p.setViewportSize({ width: 390, height: 844 })
        await owner.p.reload()
        assert.ok(await owner.p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
        await owner.p.screenshot({ path: t.out('content-contact-phone') })
        await owner.p.setViewportSize({ width: 1280, height: 900 })
      })

      await t.step('A save on a stale copy is refused in words; nothing changes', async () => {
        await owner.p.goto(CONSOLE + '/console/content?tab=contact')
        await owner.p.getByLabel(/^Line/).fill('A stale line.')
        // Someone else saved meanwhile (a Manager, written straight in).
        const admin = (await db`select user_id from members where tenant_id = ${KESAR} and role = 'admin' limit 1`)[0]?.user_id ?? null
        await db`update site_content set value = '{"line":"Theirs."}', version = version + 1, updated_by = ${admin}, updated_at = now() where tenant_id = ${KESAR} and kind = 'contact'`
        await owner.p.getByRole('button', { name: 'Save' }).click()
        await owner.p.getByRole('alert').filter({ hasText: /changed this .* Reload to see it\./ }).waitFor()
        assert.deepEqual((await contact()).value, { line: 'Theirs.' }, 'the stale save changed nothing')
        await owner.p.screenshot({ path: t.out('content-stale') })
      })

      await t.step('Staff read Content and can’t edit', async () => {
        await db`insert into members (tenant_id, user_id, role) values (${KESAR}, ${USERS.staff.id}, 'staff') on conflict do nothing`
        const staff = await open('staff')
        try {
          await staff.p.goto(CONSOLE + '/console/content?tab=contact')
          await staff.p.screenshot({ path: t.out('content-staff-contact') })
          // Only roles the store has: an earlier flow (86-builders) can leave a partner on it, so ask the database which.
          const [{ n: partners }] = await db`select count(*)::int as n from members where tenant_id = ${KESAR} and role = 'partner'`
          await staff.p.getByText(partners ? 'Only the owner, a Manager or the partner can edit' : 'Only the owner or a Manager can edit', { exact: true }).first().waitFor()
          assert.equal(await staff.p.getByRole('button', { name: 'Save' }).count(), 0, 'no Save for staff')
          assert.ok(await staff.p.getByLabel(/^Line/).isDisabled())
          await staff.p.goto(CONSOLE + '/console/content')
          await staff.p.screenshot({ path: t.out('content-staff') })
        } finally { await staff.ctx.close(); await db`delete from members where tenant_id = ${KESAR} and user_id = ${USERS.staff.id}` }
      })

      await t.step('The store’s partner saves after handover, and the owner is told in Notices (owner, 2026-11-15)', async () => {
        await partnerOn(db, KESAR, USERS.partner)
        await db`delete from notices where tenant_id = ${KESAR} and source_kind = 'content' and source_id is not null`
        const pia = await open('partner')
        // Pia may build other stores (earlier flows): this step is about Kesar Studio.
        await pia.ctx.addCookies([{ name: 'frata_tenant', value: KESAR, domain: 'localhost', path: '/' }])
        try {
          await pia.p.goto(CONSOLE + '/console/content?tab=contact')
          await pia.p.getByLabel(/^Line/).fill('Pia’s line: we reply within the hour.')
          await pia.p.getByRole('button', { name: 'Save' }).click()
          await pia.p.getByText('Contact line saved').first().waitFor()
          await pia.p.screenshot({ path: t.out('content-partner-after-handover') })
        } finally { await pia.ctx.close(); await db`delete from members where tenant_id = ${KESAR} and user_id = ${USERS.partner.id}` }
        assert.deepEqual((await contact()).value, { line: 'Pia’s line: we reply within the hour.' })
        await owner.p.goto(CONSOLE + '/console/notices')
        await owner.p.getByText('Your partner changed the Contact line').first().waitFor()
        await owner.p.screenshot({ path: t.out('content-partner-notice') })
      })

      await t.step('The Look’s Header shows the bar as a link to Content', async () => {
        await owner.p.goto(CONSOLE + '/console/look')
        await owner.p.getByRole('button', { name: 'Customize' }).click()
        await owner.p.waitForURL(/\/console\/look\/customize$/)
        await owner.p.getByRole('tab', { name: 'Style' }).click()
        await owner.p.getByRole('button', { name: /^Header/ }).click()
        const link = owner.p.getByRole('link', { name: /Announcement.*Edit in Content/ })
        await link.waitFor()
        assert.match(await link.getAttribute('href') ?? '', /\/console\/content\?tab=announcement$/)
        assert.equal(await owner.p.getByRole('switch', { name: 'Announcement bar' }).count(), 0, 'the Look no longer edits the bar')
        await owner.p.screenshot({ path: t.out('content-look-link') })
      })
    } finally {
      await owner.ctx.close()
      await db`delete from site_content where tenant_id = ${KESAR} and kind = 'contact'`
    }
  },
}
