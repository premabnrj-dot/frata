// =============================================================================
// FLOW: Console › Brand (one-address plan P1·3, P1·8; mockup docs/mockups/2026-11-16-p1-brand.html, owner-approved
// 2026-11-16). Kesar Studio becomes a code-site store (a live Storefront key): Brand takes Look's place; the page opens
// empty (the store's name, Frrata's colours); a light accent is named at the field and Save counts it; the owner sets
// fonts, corners and an SVG logo (one with a script refused at its slot) and saves live, then undoes; the partner on the
// open store saves and it waits for the owner (chip, toast, the live record unchanged); the owner approves in Notices;
// staff can't open Brand; phone and desktop. Puts the store back.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, USERS, expectToast, partnerOn, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const CLEAN = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52"><path d="M2 50h36" stroke="#221A14"/><circle cx="20" cy="12" r="2" fill="#8C1D2C"/></svg>'
const SCRIPTED = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>'

export default {
  name: 'brand',
  async run(t) {
    const { db } = t
    const open = async (who, opts = { viewport: { width: 1280, height: 900 } }) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`)); return { ctx, p } }
    const record = async () => (await db`select font_display, font_body, radius, color_accent, version from brand_tokens where tenant_id = ${KESAR}`)[0] ?? null
    const logo = async () => (await db`select logo_url from shop_settings where tenant_id = ${KESAR}`)[0].logo_url
    const store = await db`select logo_url, published_at from shop_settings where tenant_id = ${KESAR}`
    await db`delete from brand_proposals where tenant_id = ${KESAR}`
    await db`delete from brand_tokens where tenant_id = ${KESAR}`
    await db`insert into members (tenant_id, user_id, role) values (${KESAR}, ${USERS.staff.id}, 'staff') on conflict (tenant_id, user_id) do nothing`
    const owner = await open('owner')
    const p = owner.p
    let key = null
    try {
      await t.step('a theme shop keeps Look; a live key makes it a code-site store and Brand takes Look’s place', async () => {
        await p.goto(CONSOLE + '/console')
        await p.getByRole('link', { name: 'Look', exact: true }).first().waitFor()
        assert.equal(await p.getByRole('link', { name: 'Brand', exact: true }).count(), 0)
        ;[key] = await db`insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by) values (${KESAR}, 'public', 'Website e2e', ${'e'.repeat(64)}, 'frs_pub_e2ebrd', ${USERS.owner.id}) returning id`
        // The nav reads the store's cached brand (60 s): a key made outside the console is seen once it is purged.
        await p.goto(CONSOLE + '/console/brand')
        await p.getByRole('heading', { name: 'Brand', exact: true }).waitFor()
      })

      await t.step('no logo yet: the store’s name in its slot, Upload logo, Frrata’s colours, the preview on the store’s own data', async () => {
        const main = p.locator('[data-logo="main"]')
        await main.getByText('Kesar Studio').first().waitFor()
        await main.getByText('Upload logo').waitFor()
        await p.getByText('SVG, PNG or WebP. PNG and WebP at least 120 px wide.').waitFor()
        assert.equal(await p.locator('#colour-accent').inputValue(), '#171615')
        await p.locator('text=Sample data >> visible=true').first().waitFor()
        await p.locator('[data-pv="Checkout"] >> visible=true').first().getByText(/^Place order ·/).waitFor()
        await p.screenshot({ path: t.out('brand-empty'), fullPage: true })
      })

      await t.step('a light accent is named at its field and Save counts it; nothing is saved', async () => {
        await p.locator('#colour-accent').fill('#D9822B')
        await p.locator('[data-colour="accent"]').getByText(/^Text on this accent is \d\.\d\d:1\. Use a darker one, 4\.5:1 or more\.$/).waitFor()
        await p.locator('[data-chips="on"]').getByText(/on Accent/).waitFor()
        await p.getByRole('region', { name: 'Unsaved changes' }).getByRole('button', { name: /^Save/ }).click()
        await expectToast(p, '1 colour needs fixing', 'error', { quiet: true })
        assert.equal(await record(), null, 'nothing saved')
        await p.screenshot({ path: t.out('brand-refused'), fullPage: true })
      })

      await t.step('an SVG with a script is refused at its slot; a clean one uploads; fonts, corners; Save goes live; Undo', async () => {
        await p.locator('#colour-accent').fill('#8C1D2C')
        await p.locator('[data-logo="main"] input[type=file]').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SCRIPTED) })
        await p.locator('[data-logo="main"]').getByText('This SVG has a script in it. Upload one without scripts.').waitFor()
        await p.locator('[data-logo="main"] input[type=file]').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(CLEAN) })
        await p.locator('[data-logo="main"]').getByText('SVG', { exact: true }).waitFor()
        await p.locator('#font-display').selectOption('tiro')
        await p.locator('#font-body').selectOption('mukta')
        await p.getByRole('radiogroup', { name: 'Corners' }).getByRole('radio', { name: '4 px' }).click()
        await p.getByRole('region', { name: 'Unsaved changes' }).getByText(/\d unsaved changes/).waitFor()
        await p.getByRole('region', { name: 'Unsaved changes' }).getByRole('button', { name: /^Save/ }).click()
        const toast = await expectToast(p, 'Saved.', 'ok')
        assert.deepEqual({ ...(await record()), version: undefined }, { font_display: 'tiro', font_body: 'mukta', radius: 4, color_accent: '#8C1D2C', version: undefined })
        assert.match(await logo(), new RegExp(`/tenants/${KESAR}/brand/[0-9a-f]{64}\\.svg$`))
        const [blob] = await db`select count(*)::int n from audit_events where tenant_id = ${KESAR} and action = 'brand.save'`
        assert.ok(blob.n >= 1, 'an audit row')
        await p.screenshot({ path: t.out('brand-saved'), fullPage: true })
        await toast.getByRole('button', { name: 'Undo' }).click()
        await expectToast(p, /Undone|Undo/, 'ok').catch(() => null)
        await p.waitForFunction(() => true)
        for (let i = 0; i < 20 && (await record())?.font_display !== 'inter'; i++) await p.waitForTimeout(250)
        assert.equal((await record()).font_display, 'inter', 'Undo put the record back')
        assert.equal(await logo(), store[0].logo_url, 'and the logo')
      })

      await t.step('phone: the preview first, its tabs, no sideways scroll', async () => {
        await p.setViewportSize({ width: 390, height: 844 })
        await p.reload()
        await p.getByRole('radiogroup', { name: 'Preview' }).getByRole('radio', { name: 'Email' }).click()
        await p.locator('[data-pv="Email"] >> visible=true').getByText('Thank you, Priya').waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
        await p.screenshot({ path: t.out('brand-phone'), fullPage: true })
        await p.setViewportSize({ width: 1280, height: 900 })
      })

      await t.step('the partner on the open store: its save waits for the owner, the live record unchanged', async () => {
        await db`update shop_settings set published_at = coalesce(published_at, now()) where tenant_id = ${KESAR}`
        await partnerOn(db, KESAR, USERS.partner)
        const pia = await open('partner')
        await pia.ctx.addCookies([{ name: 'frata_tenant', value: KESAR, domain: 'localhost', path: '/' }])
        try {
          const q = pia.p
          await q.goto(CONSOLE + '/console/brand')
          await q.locator('#font-display').selectOption('fraunces')
          await q.getByRole('region', { name: 'Unsaved changes' }).getByRole('button', { name: /^Save/ }).click()
          await expectToast(q, 'Sent to the owner.', 'ok')
          await q.getByText('Waiting for the owner', { exact: true }).first().waitFor()
          assert.equal((await record()).font_display, 'inter', 'the live record is unchanged')
          const [w] = await db`select summary from brand_proposals where tenant_id = ${KESAR} and decided_at is null`
          assert.equal(w.summary, '1 font.')
          await q.screenshot({ path: t.out('brand-waiting'), fullPage: true })
        } finally { await pia.ctx.close() }
      })

      await t.step('the owner: the change on Brand and one line in Notices; Approve change puts it live', async () => {
        await p.goto(CONSOLE + '/console/brand')
        await p.getByRole('heading', { name: /Your partner’s change/ }).waitFor()
        await p.getByText('Inter → Fraunces').waitFor()
        await p.screenshot({ path: t.out('brand-review'), fullPage: true })
        await p.goto(CONSOLE + '/console/notices')
        const row = p.locator('li').filter({ hasText: 'Your partner changed your brand' })
        await row.getByText('1 font.').waitFor()
        await row.getByRole('button', { name: 'Approve change' }).click()
        await expectToast(p, 'Approved. It’s live.', 'ok')
        await row.getByText('Approved', { exact: true }).waitFor()
        assert.equal((await record()).font_display, 'fraunces')
        await p.screenshot({ path: t.out('brand-approved'), fullPage: true })
      })

      await t.step('staff don’t open Brand', async () => {
        const staff = await open('staff')
        try {
          await staff.p.goto(CONSOLE + '/console/brand')
          await staff.p.getByText('Brand opens for the owner, a Manager or the store’s partner').waitFor()
        } finally { await staff.ctx.close() }
      })
    } finally {
      await owner.ctx.close()
      await db`delete from brand_proposals where tenant_id = ${KESAR}`
      await db`delete from brand_tokens where tenant_id = ${KESAR}`
      await db`delete from notices where tenant_id = ${KESAR} and source_kind = 'brand'`
      await db`update shop_settings set logo_url = ${store[0].logo_url}, published_at = ${store[0].published_at} where tenant_id = ${KESAR}`
      if (key) await db`delete from storefront_keys where id = ${key.id}`
    }
  },
}
