// =============================================================================
// FLOW: setup (plan docs/plans/2026-11-23-o2a-setup-card.md O2a·7–8, mockup § 2 "O2 · four steps"). A new store's Home
// is the setup card: the next step large with the ring, the four steps as rows, the store sketch beside them. Each step
// opens its popup; Esc, ✕, the backdrop and Back close it and keep what was typed; focus returns to the opener. A
// product without a photo stays a draft with what it needs; with one it goes Active (database). Business details leave
// the address and customer care as they were; payments save. Staff see one actionable row. Axe clean; both widths,
// and under reduced motion. The store is made in the database for the founder (the sign-up itself is 63-signup's).
// Screenshots: e2e/.out/99-setup-<state>-<width>.png, which the parity check pairs with the mockup's.
// =============================================================================
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { CONSOLE, USERS, fakeBlob, makePhotos, openStore, signedIn, until } from '../lib.mjs'

const T = '99999999-0000-4000-8000-0000000000a1'
const SLUG = 'mehr-setup-e2e'
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  return p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
}

export default {
  name: 'setup',
  async run(t) {
    const { db } = t
    const F = USERS.founder
    const cleanup = async () => {
      await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        for (const tbl of ['product_images', 'variants', 'price_history', 'products', 'product_types', 'audit_events', 'members', 'shop_settings', 'tenant_counters', 'tenant_modules']) await x.unsafe(`delete from ${tbl} where tenant_id = $1`, [T])
        await x`delete from tenants where id = ${T}`
      })
    }
    await cleanup()
    await db`insert into auth.users (id, email, email_confirmed_at) values (${F.id}, ${F.email}, now()) on conflict (id) do nothing`
    await db`insert into tenants (id, slug, name) values (${T}, ${SLUG}, 'Mehr Studio')`
    await db`insert into shop_settings (tenant_id, sells, support_email) values (${T}, ${['women']}, ${F.email})`
    await db`insert into members (tenant_id, user_id, role) values (${T}, ${F.id}, 'owner')`
    const open = async (who, viewport, more = {}) => {
      const ctx = await signedIn(t.browser, who, { viewport, ...more })
      await ctx.addCookies([{ name: 'frata_tenant', value: T, domain: 'localhost', path: '/' }])
      const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
      return { ctx, p }
    }
    const { ctx, p } = await open('founder', { width: 1280, height: 900 })
    const shot = async (name) => {
      await p.screenshot({ path: t.out(`${name}-1280`) })
      const settled = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      await p.setViewportSize({ width: 390, height: 844 }); await settled(); await p.screenshot({ path: t.out(`${name}-390`), fullPage: true })
      await p.setViewportSize({ width: 1280, height: 900 }); await settled()
    }
    /** A popup at both widths (the page's own viewport: a sheet on a phone). */
    const both = async (name) => {
      await p.screenshot({ path: t.out(`${name}-1280`) })
      await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300); await p.screenshot({ path: t.out(`${name}-390`) })
      await p.setViewportSize({ width: 1280, height: 900 }); await p.waitForTimeout(300)
    }
    const card = () => p.getByRole('region', { name: 'Setup' })
    const rowButtons = () => card().getByRole('listitem').getByRole('button')
    try {
      await t.step('a new store: Home is the setup card as drawn — Opening soon, 1 of 4, the first product next', async () => {
        await p.goto(CONSOLE + '/console')
        await p.getByRole('heading', { level: 1, name: 'Home' }).waitFor()
        await p.locator('main').getByText('Opening soon', { exact: true }).first().waitFor()
        await card().getByRole('img', { name: '1 of 4 done' }).waitFor()
        await card().getByRole('heading', { level: 2, name: 'Add your first product' }).waitFor()
        const rows = await card().getByRole('listitem').allInnerTexts()
        assert.equal(rows.length, 4, 'four steps')
        for (const [i, w] of ['Add your first product', 'Add business details', 'Choose how shoppers pay', 'Open your store'].entries()) assert.ok(rows[i].startsWith(w), `row ${i + 1}: ${rows[i]}`)
        assert.ok(rows[2].includes('Pay on delivery'), 'payments done, with its value')
        assert.equal(await rowButtons().count(), 4, 'every row is a button for the owner')
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
        assert.deepEqual(await audit(p), [])
        await shot('new')
      })

      await t.step('opening before the rest is done says what is left', async () => {
        await rowButtons().filter({ hasText: 'Open your store' }).click()
        await p.locator('[data-toast]').filter({ hasText: 'Finish 2 steps to open your store.' }).waitFor()
      })

      await t.step('the first-product popup as drawn; Esc, ✕ and the backdrop close it and keep what was typed', async () => {
        const opener = card().getByRole('button', { name: 'Add product' })
        await opener.click()
        const d = p.getByRole('dialog', { name: 'Add your first product' }); await d.waitFor()
        assert.equal(await p.evaluate(() => document.activeElement?.closest('label')?.textContent), 'Name', 'the name takes focus')
        // Before a name: the kurta's sizes, three pressed.
        const pressed = () => d.getByRole('group', { name: 'Sizes' }).locator('[aria-pressed="true"]').allInnerTexts()
        assert.deepEqual(await pressed(), ['S', 'M', 'L'])
        await d.getByLabel('Name').fill('Ivory kurta set'); await d.getByLabel('Price').fill('2,490'); await d.getByLabel('In stock, each size').fill('5')
        await d.getByRole('button', { name: 'XL', exact: true }).click()
        assert.deepEqual(await pressed(), ['S', 'M', 'L', 'XL'])
        assert.deepEqual(await audit(p), [])
        await both('product')
        await p.keyboard.press('Escape'); await d.waitFor({ state: 'hidden' })
        assert.equal(await p.evaluate(() => document.activeElement?.textContent), 'Add product', 'focus back on the opener')
        await opener.click(); await d.waitFor()
        assert.equal(await d.getByLabel('Name').inputValue(), 'Ivory kurta set', 'kept after Esc')
        await d.getByRole('button', { name: 'Close' }).click(); await d.waitFor({ state: 'hidden' })
        await opener.click(); await d.waitFor()
        assert.equal(await d.getByLabel('Price').inputValue(), '2,490', 'kept after ✕')
        await p.mouse.click(4, 4); await d.waitFor({ state: 'hidden' })
        await opener.click(); await d.waitFor()
        assert.deepEqual(await pressed(), ['S', 'M', 'L', 'XL'], 'kept after the backdrop')
        // A one-size name: no sizes, "In stock".
        await d.getByLabel('Name').fill('Silk saree')
        await d.getByLabel('In stock', { exact: true }).waitFor()
        assert.equal(await d.getByRole('group', { name: 'Sizes' }).count(), 0)
        await d.getByLabel('Name').fill('Ivory kurta set')
      })

      await t.step('without a photo it stays a draft and says what it needs', async () => {
        const d = p.getByRole('dialog', { name: 'Add your first product' })
        await d.getByRole('button', { name: 'Add product' }).click()
        await d.getByText('Saved as a draft.').waitFor()
        await d.getByText('At least one photo').waitFor()
        const [row] = await db`select status from products where tenant_id = ${T}`
        assert.equal(row.status, 'draft')
        await p.screenshot({ path: t.out('product-draft-1280') })
        await d.getByRole('button', { name: 'Close' }).click()
        await db`delete from variants where tenant_id = ${T}`; await db`delete from products where tenant_id = ${T}`
      })

      await t.step('with a photo it goes Active; the next step enters', async () => {
        await fakeBlob(ctx)
        await p.reload(); await card().getByRole('button', { name: 'Add product' }).click()
        const d = p.getByRole('dialog', { name: 'Add your first product' }); await d.waitFor()
        await d.getByLabel('Name').fill('Ivory kurta set'); await d.getByLabel('Price').fill('2490'); await d.getByLabel('In stock, each size').fill('5')
        const [photo] = await makePhotos(p, [{ name: 'kurta.jpg', w: 900, type: 'image/jpeg' }])
        await d.locator('input[type=file]').setInputFiles(photo)
        await d.getByRole('button', { name: 'Photo added. Change photo' }).waitFor({ timeout: 20_000 })
        await d.getByRole('button', { name: 'Add product' }).click()
        await p.locator('[data-toast]').filter({ hasText: 'Added Ivory kurta set.' }).waitFor()
        await d.waitFor({ state: 'hidden' })
        await until(async () => (await db`select status from products where tenant_id = ${T}`)[0]?.status === 'active', 10_000)
        const v = await db`select option_values, price, stock from variants where tenant_id = ${T} order by position`
        assert.deepEqual(v.map((x) => [x.option_values, Number(x.price), x.stock]), [[['S'], 249000, 5], [['M'], 249000, 5], [['L'], 249000, 5]])
        await card().getByRole('img', { name: '2 of 4 done' }).waitFor()
        await card().getByRole('heading', { level: 2, name: 'Add business details' }).waitFor()
        await card().getByRole('listitem').filter({ hasText: '1 product' }).waitFor()
        await shot('part')
      })

      await t.step('business details in two views; Back keeps them; saved, the address and customer care as they were', async () => {
        const before = (await db`select address, support_email from shop_settings where tenant_id = ${T}`)[0]
        const opener = card().getByRole('button', { name: 'Add details' })
        await opener.click()
        const d = p.getByRole('dialog', { name: 'Business details' }); await d.waitFor()
        await d.getByLabel('Legal name').fill('Mehr Studio LLP')
        await d.getByLabel('State').selectOption({ label: 'Rajasthan' })
        await both('details')
        await d.getByRole('button', { name: 'Add grievance officer' }).click()
        const g = p.getByRole('dialog', { name: 'Grievance officer' }); await g.waitFor()
        assert.equal(await g.getByLabel('Email').inputValue(), F.email, 'filled from customer care')
        await g.getByRole('button', { name: 'About the grievance officer' }).waitFor()
        await g.getByLabel('Name').fill('Aanya Rao')
        await g.getByRole('button', { name: 'Back' }).click()
        await d.waitFor(); assert.equal(await d.getByLabel('Legal name').inputValue(), 'Mehr Studio LLP', 'Back keeps view 1')
        await d.getByRole('button', { name: 'Add grievance officer' }).click()
        assert.equal(await g.getByLabel('Name').inputValue(), 'Aanya Rao', 'and view 2')
        await g.getByLabel('Phone').fill('98270 41009')
        await both('grievance')
        assert.deepEqual(await audit(p), [])
        await g.getByRole('button', { name: 'Save details' }).click()
        await p.locator('[data-toast]').filter({ hasText: 'Saved business details.' }).waitFor()
        const after = (await db`select legal_name, home_state, grievance_name, grievance_phone, grievance_email, address, support_email from shop_settings where tenant_id = ${T}`)[0]
        assert.deepEqual(after, { legal_name: 'Mehr Studio LLP', home_state: '08', grievance_name: 'Aanya Rao', grievance_phone: '9827041009', grievance_email: F.email, address: before.address, support_email: before.support_email })
        await card().getByRole('heading', { level: 2, name: 'Open your store' }).waitFor()
      })

      await t.step('payments: the switch and the limit, saved; Razorpay is its own page', async () => {
        await rowButtons().filter({ hasText: 'Choose how shoppers pay' }).click()
        const d = p.getByRole('dialog', { name: 'How shoppers pay' }); await d.waitFor()
        await until(async () => (await d.getByLabel('Pay on delivery up to').inputValue()) === '3,000', 5000) // read when it opens
        await d.getByRole('link', { name: 'Connect Razorpay' }).waitFor()
        await both('payments')
        await d.getByLabel('Pay on delivery up to').fill('5,000')
        await d.getByRole('button', { name: 'Save payment choices' }).click()
        await p.locator('[data-toast]').filter({ hasText: 'Saved payment choices.' }).waitFor()
        assert.equal(Number((await db`select cod_max from shop_settings where tenant_id = ${T}`)[0].cod_max), 500000)
      })

      await t.step('ready: Open your store is next, as drawn', async () => {
        await card().getByRole('img', { name: '3 of 4 done' }).waitFor()
        await card().getByRole('button', { name: 'Open store' }).waitFor()
        assert.deepEqual(await audit(p), [])
        await shot('ready')
      })

      await t.step('the phone: popups are sheets, the sketch hides, one column', async () => {
        await p.setViewportSize({ width: 390, height: 844 })
        assert.equal(await p.locator('[data-store-card]').isVisible(), false, 'no sketch on a phone')
        await rowButtons().filter({ hasText: 'Choose how shoppers pay' }).click()
        const d = p.getByRole('dialog', { name: 'How shoppers pay' }); await d.waitFor()
        await until(async () => (await d.getByLabel('Pay on delivery up to').inputValue()) === '5,000', 5000) // read on open
        await p.screenshot({ path: t.out('payments-phone-390') })
        await p.keyboard.press('Escape'); await d.waitFor({ state: 'hidden' })
        await p.setViewportSize({ width: 1280, height: 900 })
      })

      await t.step('reduced motion: the card and a popup', async () => {
        const r = await open('founder', { width: 1280, height: 900 }, { reducedMotion: 'reduce' })
        try {
          await r.p.goto(CONSOLE + '/console')
          await r.p.getByRole('region', { name: 'Setup' }).getByRole('listitem').getByRole('button').filter({ hasText: 'Choose how shoppers pay' }).click()
          await r.p.getByRole('dialog', { name: 'How shoppers pay' }).waitFor()
          await r.p.screenshot({ path: t.out('reduced-1280') })
        } finally { await r.ctx.close() }
      })
      await t.step('"Open your store?" as drawn, without the plan (§ Deviations 1): its pictogram, Not yet focused', async () => {
        await card().getByRole('button', { name: 'Open store', exact: true }).click()
        const d = p.getByRole('dialog', { name: 'Open your store?' }); await d.waitFor()
        await d.locator('[data-picto]').waitFor()
        assert.equal(await d.getByRole('button', { name: 'Close' }).count(), 0, 'no ✕')
        assert.equal(await p.evaluate(() => document.activeElement?.textContent), 'Not yet', 'the safe button takes focus')
        assert.deepEqual(await audit(p), [])
        await p.screenshot({ path: t.out('open-popup-1280') })
        await p.setViewportSize({ width: 390, height: 844 }); await p.screenshot({ path: t.out('open-popup-390') }); await p.setViewportSize({ width: 1280, height: 900 })
        await d.getByRole('button', { name: 'Not yet' }).click(); await d.waitFor({ state: 'hidden' })
        assert.equal((await db`select published_at from shop_settings where tenant_id = ${T}`)[0].published_at, null)
      })

      await t.step('the open moment over the whole frame: the drawn check, the address, Share on WhatsApp, Go to Home focused', async () => {
        await openStore(p, { moment: false })
        const m = p.getByRole('dialog', { name: 'Mehr Studio is open' }); await m.waitFor()
        await m.locator('svg .animate-draw-circle').waitFor()
        assert.ok(await p.evaluate(() => !!document.elementFromPoint(100, 120)?.closest('dialog')), 'the layer covers the sidebar')
        await until(async () => (await p.evaluate(() => document.activeElement?.textContent)) === 'Go to Home', 3000)
        assert.match(await m.getByRole('link', { name: 'Share on WhatsApp' }).getAttribute('href'), /^https:\/\/wa\.me\/\?text=Mehr%20Studio%20/)
        await m.getByText(`${SLUG}.frata.test`).waitFor()
        await m.getByRole('button', { name: 'Copy link' }).waitFor()
        await p.waitForTimeout(700) // the rise and the drawn check end (320 + 200 ms) before the picture
        assert.deepEqual(await audit(p), [])
        await p.screenshot({ path: t.out('moment-1280') })
        await p.setViewportSize({ width: 390, height: 844 }); await p.screenshot({ path: t.out('moment-390') }); await p.setViewportSize({ width: 1280, height: 900 })
        assert.ok((await db`select published_at from shop_settings where tenant_id = ${T}`)[0].published_at, 'open in the database')
      })

      await t.step('Go to Home: the open card in place of Today; Hide this card shows Today; a reload shows Today', async () => {
        await p.getByRole('button', { name: 'Go to Home' }).click()
        await p.getByRole('heading', { level: 1, name: 'Home' }).waitFor()
        await p.locator('main').getByText('Open', { exact: true }).first().waitFor()
        await card().getByRole('heading', { level: 2, name: 'Your store is open' }).waitFor()
        assert.equal(await card().getByRole('link', { name: 'See your store' }).getAttribute('href'), `https://${SLUG}.frata.test`)
        await shot('open')
        await card().getByRole('button', { name: 'Hide this card' }).click()
        await p.getByRole('heading', { level: 1, name: 'Today' }).waitFor()
        await p.reload(); await p.getByRole('heading', { level: 1, name: 'Today' }).waitFor()
        assert.equal(await p.getByText('Your store is open', { exact: true }).count(), 0)
      })

      await t.step('Staff: one actionable row (the product), the rest as text', async () => {
        await db`update shop_settings set published_at = null where tenant_id = ${T}`
        await db`delete from variants where tenant_id = ${T}`; await db`delete from product_images where tenant_id = ${T}`; await db`delete from products where tenant_id = ${T}`
        await db`insert into members (tenant_id, user_id, role) values (${T}, ${USERS.staff.id}, 'staff') on conflict do nothing`
        const s = await open('staff', { width: 1280, height: 900 })
        try {
          await s.p.goto(CONSOLE + '/console')
          const c = s.p.getByRole('region', { name: 'Setup' })
          await c.getByRole('heading', { level: 2, name: 'Add your first product' }).waitFor()
          assert.equal(await c.getByRole('listitem').getByRole('button').count(), 1, 'one row they may act on')
          assert.equal(await c.getByRole('listitem').count(), 4)
          await s.p.screenshot({ path: t.out('staff-1280') })
        } finally { await s.ctx.close() }
      })

    } finally {
      await ctx.close()
      await cleanup()
    }
  },
}
