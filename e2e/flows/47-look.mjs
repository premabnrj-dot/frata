// =============================================================================
// FLOW: look — themes T1 (docs/specs/2026-11-08-themes.md): Console › Look shows today's look (Classic, recorded by
// the migration), the gallery, a theme's details; Try opens a draft that shoppers don't see; the customizer saves
// (style, brand colour refused when too light, sections added, moved, hidden); Publish lists the changes and the
// shop changes; History restores; Undo puts the old look back. A partner edits but can't publish; another shop's
// revision can't be previewed; only the preview may be framed, and only by the console.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { CONSOLE, PORTS, USERS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const shopHtml = (path = '/') => new Promise((res, rej) => http.get(`http://localhost:${PORTS.app}${path}`, { headers: { host: 'kesar-studio.frata.test' } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(b)) }).on('error', rej))
// The shop is cached: a publish revalidates it, and the next requests read fresh (warm until it changes).
const shopSays = (re, want = true) => until(async () => re.test(await shopHtml()) === want, 15_000)

export default {
  name: 'look',
  async run(t) {
    const { db } = t
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }
    const riya = await open('owner', { viewport: { width: 1280, height: 900 } })

    await t.step('Look: today’s look is Classic, recorded; five themes, free', async () => {
      // Production shops got their look recorded by the migration; this seed shop is made after the migrations, so it
      // has none yet and renders Classic from its settings (its first publish records it: checked under History).
      const [{ n }] = await db`select count(*)::int n from shop_theme_publishes where tenant_id = ${KESAR}`
      assert.equal(n, 0, 'the seed shop has no publish row before its first publish')
      await riya.goto(CONSOLE + '/console/look')
      await riya.getByRole('heading', { level: 1, name: 'Look' }).waitFor()
      await riya.getByRole('heading', { name: 'Classic · Oxide' }).waitFor()
      for (const name of ['Classic', 'Editorial', 'Bazaar', 'Minimal', 'Atelier']) await riya.getByRole('button', { name, exact: true }).waitFor()
      await riya.screenshot({ path: t.out('look'), fullPage: true })
      const phone = await open('owner', { viewport: { width: 390, height: 844 } })
      await phone.goto(CONSOLE + '/console/look')
      await phone.getByRole('heading', { level: 1, name: 'Look' }).waitFor()
      assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
    })

    let rev
    await t.step('Details, then Try Bazaar: a draft opens; shoppers still see Classic', async () => {
      await riya.getByRole('button', { name: 'Bazaar', exact: true }).click()
      const d = riya.getByRole('dialog', { name: 'Bazaar' })
      await d.getByText('Category circles under the header').waitFor()
      await d.getByRole('button', { name: 'Try Bazaar in a draft' }).click()
      await riya.waitForURL(/\/console\/look\/customize$/)
      ;[{ id: rev }] = await db`select id from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'bazaar'`
      assert.ok(!/Shop tabs/.test(await shopHtml()), 'shoppers see no draft')
      await riya.frameLocator('iframe[title="Your shop with this look"]').getByRole('navigation', { name: 'Shop tabs' }).waitFor()
      await riya.screenshot({ path: t.out('customizer') })
    })

    await t.step('Theme settings: a style, a brand colour (a too-light one refused), saved', async () => {
      await riya.getByRole('tab', { name: 'Theme settings' }).click()
      await riya.getByText('Genda', { exact: true }).click()
      await riya.getByRole('switch', { name: 'My own brand colour' }).click()
      await riya.getByLabel('Brand colour', { exact: true }).fill('#f2e6c8')
      await riya.getByText('Too light on this background. Pick a deeper shade.').first().waitFor()
      await riya.getByLabel('Brand colour', { exact: true }).fill('#7a1f2b')
      await until(async () => { const [r] = await db`select style_key, settings from shop_theme_revisions where id = ${rev}`; return r.style_key === 'genda' && r.settings.settings?.brandColour === '#7A1F2B' }, 10_000)
      await riya.getByRole('status').getByText('Saved').waitFor()
    })

    await t.step('Sections: add Rich text, move it up, hide New in; every change saved', async () => {
      await riya.getByRole('tab', { name: 'Sections' }).click()
      await riya.getByRole('button', { name: '+ Add a section' }).click()
      await riya.getByRole('dialog', { name: 'Add a section' }).getByRole('button', { name: /^Rich text/ }).click()
      await riya.getByLabel('Text (a blank line starts a new paragraph)').fill('Every piece is hand-finished in Jaipur.')
      // T1·0: from the autosave landing to the preview showing it (budget 1 s p75 on a laptop; 2 s here, a busy CI box).
      await until(async () => { const [r] = await db`select settings from shop_theme_revisions where id = ${rev}`; return JSON.stringify(r.settings).includes('hand-finished in Jaipur') }, 10_000)
      const t0 = Date.now()
      await riya.frameLocator('iframe[title="Your shop with this look"]').getByText('Every piece is hand-finished in Jaipur.').waitFor()
      const ms = Date.now() - t0
      console.log(`     look › preview refreshed ${ms} ms after the save`)
      assert.ok(ms < 2000, `preview refresh took ${ms} ms`)
      await riya.getByRole('button', { name: '‹ Sections' }).click()
      await riya.getByRole('button', { name: 'Move Rich text up' }).click()
      await riya.getByRole('button', { name: 'Hide Products' }).last().click()
      await until(async () => { const [r] = await db`select settings from shop_theme_revisions where id = ${rev}`; const h = r.settings.home ?? []; return h.some((s) => s.key === 'rich_text' && s.body?.[0]?.[0]?.text?.includes('Jaipur')) && h.some((s) => s.key === 'products' && s.hidden) }, 10_000)
      // Undo and redo are steps, each saved.
      await riya.getByRole('button', { name: 'Undo' }).click()
      await until(async () => { const [r] = await db`select settings from shop_theme_revisions where id = ${rev}`; return !(r.settings.home ?? []).some((s) => s.key === 'products' && s.hidden) }, 10_000)
      await riya.getByRole('button', { name: 'Redo' }).click()
      await until(async () => { const [r] = await db`select settings from shop_theme_revisions where id = ${rev}`; return (r.settings.home ?? []).some((s) => s.key === 'products' && s.hidden) }, 10_000)
    })

    await t.step('Publish: the change list, then the shop changes; Undo is offered', async () => {
      await riya.getByRole('button', { name: 'Publish', exact: true }).click()
      const d = riya.getByRole('dialog', { name: /Publish Bazaar · Genda/ })
      await d.getByText('Theme: Bazaar · Genda').waitFor()
      await riya.screenshot({ path: t.out('publish') })
      await d.getByRole('button', { name: 'Publish', exact: true }).click()
      await riya.getByRole('heading', { level: 1, name: 'Published' }).waitFor()
      // The first publish recorded the look before it (lazy baseline): two rows, the older one Classic.
      const pubs = await db`select r.theme_key from shop_theme_publishes p join shop_theme_revisions r on r.id = p.revision_id where p.tenant_id = ${KESAR} order by p.published_at, p.id`
      assert.deepEqual(pubs.map((x) => x.theme_key), ['classic', 'bazaar'])
      await shopSays(/Shop tabs/)
      assert.ok(/hand-finished in Jaipur/.test(await shopHtml()), 'the published sections are on the shop')
      const audit = await db`select action from audit_events where tenant_id = ${KESAR} and action = 'look.publish'`
      assert.equal(audit.length, 1)
      await riya.getByRole('link', { name: 'Back to Look' }).click()
      await riya.getByRole('heading', { name: 'Bazaar · Genda' }).waitFor()
    })

    await t.step('History: both looks; Restore makes Classic a draft (the shop doesn’t change)', async () => {
      await riya.goto(CONSOLE + '/console/look/history')
      await riya.getByText('Bazaar · Genda').waitFor()
      await riya.getByText('Classic · Oxide').waitFor()
      await riya.getByRole('button', { name: 'Restore' }).first().click()
      await riya.waitForURL(/\/console\/look\/customize$/)
      assert.ok(/Shop tabs/.test(await shopHtml()), 'restoring makes a draft, not a publish')
    })

    await t.step('Undo last publish: Classic is live again; the open draft stays', async () => {
      await riya.goto(CONSOLE + '/console/look')
      await riya.getByRole('button', { name: 'More' }).click()
      await riya.getByRole('menuitem', { name: 'Undo last publish' }).click()
      await riya.getByRole('heading', { name: 'Classic · Oxide' }).waitFor()
      await shopSays(/Shop tabs/, false)
      await riya.getByText('You have unpublished changes').waitFor()
    })

    await t.step('A partner edits the draft but can’t publish; staff only look', async () => {
      const P = USERS.partner, S = USERS.staff
      await db`insert into auth.users (id, email, email_confirmed_at) values (${P.id}, ${P.email}, now()), (${S.id}, ${S.email}, now()) on conflict (id) do nothing`
      await db`insert into members (tenant_id, user_id, role) values (${KESAR}, ${P.id}, 'partner'), (${KESAR}, ${S.id}, 'staff') on conflict do nothing`
      const pia = await open('partner', { viewport: { width: 1280, height: 900 } })
      await pia.goto(CONSOLE + '/console/look')
      await pia.getByText('You can edit the draft; the owner or an admin publishes it.').waitFor()
      await pia.getByRole('button', { name: 'Customize' }).click()
      await pia.waitForURL(/\/console\/look\/customize$/)
      await pia.getByText('Ask the owner to publish').waitFor()
      const arjun = await open('staff')
      await arjun.goto(CONSOLE + '/console/look')
      await arjun.getByText('Ask the owner to change the shop’s look.').waitFor()
      await db`delete from members where tenant_id = ${KESAR} and user_id in (${P.id}, ${S.id})`
    })

    await t.step('Another shop’s revision: not found; only the look preview can be framed, by the console', async () => {
      const OTHER = 'abababab-0000-4000-8000-0000000000b1'
      await db`insert into tenants (id, slug, name) values (${OTHER}, 'look-other-shop', 'Other') on conflict do nothing`
      const [{ id: theirs }] = await db`insert into shop_theme_revisions (tenant_id, theme_key, theme_version, style_key, settings, created_by, updated_by) values (${OTHER}, 'minimal', '1.0.0', 'ink', '{}', ${USERS.owner.id}, ${USERS.owner.id}) returning id`
      const res = await riya.goto(CONSOLE + `/console/theme-preview/${theirs}`)
      assert.equal(res.status(), 404)
      const [{ id: mine }] = await db`select id from shop_theme_revisions where tenant_id = ${KESAR} order by created_at desc limit 1`
      const own = await fetch(CONSOLE + `/console/theme-preview/${mine}`, { redirect: 'manual' })
      assert.equal(own.headers.get('x-frame-options'), 'SAMEORIGIN')
      assert.match(own.headers.get('content-security-policy') ?? '', /frame-ancestors 'self'/)
      assert.equal((await fetch(CONSOLE + '/console/look', { redirect: 'manual' })).headers.get('x-frame-options'), 'DENY')
      await db`delete from shop_theme_revisions where tenant_id = ${OTHER}`
      await db`delete from tenants where id = ${OTHER}`
    })
  },
}
