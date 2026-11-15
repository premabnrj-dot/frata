// =============================================================================
// FLOW: neel-editor (Neel N2a) — the product editor as drawn: header (Preview, More), the name-price-description card
// whose common price leaves a size priced on its own alone, Stock and prices (select rows, set; the SKU tab), a closed
// fold that opens itself on a save's mistake, the status card's Missing and Publish, the phone, axe. Leaves the seed
// product as it was (every change is discarded or put back).
// =============================================================================
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { CONSOLE, signedIn } from '../lib.mjs'

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  return p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
}

export default {
  name: 'neel-editor',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [prod] = await db`select id, handle, title, status, publish_at from products where tenant_id = ${T} and handle = 'chanderi-kurta-set'`
    const before = await db`select id, price, stock from variants where product_id = ${prod.id} and archived_at is null order by position`
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    const discard = async () => { await p.getByRole('region', { name: 'Unsaved changes' }).getByRole('button', { name: 'Discard' }).click(); await p.getByRole('region', { name: 'Unsaved changes' }).waitFor({ state: 'detached' }) }
    try {
      await t.step('the header and the name card, as drawn', async () => {
        await p.goto(`${CONSOLE}/console/products/${prod.handle}`)
        await p.getByRole('heading', { name: prod.title, level: 1 }).waitFor()
        await p.getByRole('link', { name: 'Preview', exact: true }).waitFor()
        await p.getByRole('button', { name: 'More' }).waitFor()
        await p.getByRole('heading', { name: 'Name, price, description' }).waitFor()
        assert.equal(await p.locator('#title').inputValue(), prod.title)
      })

      await t.step('the common price sets the sizes sharing it, never one priced on its own', async () => {
        const price = p.getByRole('table', { name: 'Price and stock' }).getByRole('textbox', { name: /^Price for / })
        const n = await price.count(); assert.ok(n >= 3, 'the seed has three or more variants')
        await price.nth(0).fill('3333') // one size on its own price
        const common = p.getByLabel('Price, ₹', { exact: true })
        await common.click(); await common.fill(''); await common.pressSequentially('2100'); await common.blur()
        assert.equal(await price.nth(0).inputValue(), '3333', 'the own price stays')
        for (let i = 1; i < n; i++) assert.equal(await price.nth(i).inputValue(), '2100', `variant ${i} took the common price`)
        await p.getByText(/^Sets \d+ of \d+ · .+ has its own price$/).waitFor()
        await discard()
      })

      await t.step('select two rows and set their stock; the SKU tab', async () => {
        const table = p.getByRole('table', { name: 'Price and stock' })
        const boxes = table.getByRole('checkbox', { name: /^Select / })
        await boxes.nth(1).check(); await boxes.nth(2).check()
        const bar = p.getByRole('group', { name: 'Set the selected rows' })
        await bar.getByLabel('Stock').fill('9'); await bar.getByLabel('Empty only').uncheck()
        await bar.getByRole('button', { name: 'Set' }).click()
        // Empty only (on by default) leaves a priced row alone: Set price changes nothing on priced rows.
        const priceBefore = await table.getByRole('textbox', { name: /^Price for / }).evaluateAll((els) => els.map((e) => e.value))
        await bar.getByLabel('Empty only').check(); await bar.getByLabel('Price').fill('1111'); await bar.getByRole('button', { name: 'Set' }).click()
        assert.deepEqual(await table.getByRole('textbox', { name: /^Price for / }).evaluateAll((els) => els.map((e) => e.value)), priceBefore, 'priced rows kept their price')
        const stock = table.getByRole('textbox', { name: /^Stock for / })
        // Row 0 is the first variant row: checkboxes count a group's own "Select <colour>" too, so read every stock.
        const values = await stock.evaluateAll((els) => els.map((e) => e.value))
        assert.ok(values.filter((v) => v === '9').length >= 1, `stock set: ${values.join(',')}`)
        await p.getByRole('tab', { name: 'SKU and barcode' }).click()
        await p.getByRole('table', { name: 'SKU and barcode' }).getByRole('textbox', { name: /^SKU for / }).first().waitFor()
        await p.getByRole('tab', { name: 'Price and stock' }).click()
        await discard()
      })

      await t.step('a closed fold opens itself on a save\'s mistake, its field focused', async () => {
        const fold = p.getByRole('button', { name: /^Search and sharing/ })
        await fold.click()
        await p.locator('#handle').fill('secret-draft')
        await fold.click()
        assert.equal(await p.locator('#handle').isVisible(), false, 'folded')
        await p.getByRole('region', { name: 'Unsaved changes' }).getByRole('button', { name: 'Save', exact: true }).click()
        await p.locator('#handle[aria-invalid="true"]').waitFor()
        assert.ok(await p.locator('#handle').isVisible(), 'the fold opened itself')
        await p.waitForFunction(() => document.activeElement?.id === 'handle', null, { timeout: 3000 })
        await discard()
      })

      await t.step('More › Archive, then Unarchive, then Publish from a draft', async () => {
        const status = async () => (await db`select status from products where id = ${prod.id}`)[0].status
        await p.getByRole('button', { name: 'More' }).click()
        await p.getByRole('menuitem', { name: 'Archive' }).click()
        await p.getByRole('button', { name: 'Unarchive' }).click()
        for (let i = 0; i < 40 && (await status()) !== 'draft'; i++) await p.waitForTimeout(250)
        assert.equal(await status(), 'draft', 'Unarchive makes it a draft')
        await p.getByRole('button', { name: 'Publish', exact: true }).click()
        for (let i = 0; i < 40 && (await status()) !== 'active'; i++) await p.waitForTimeout(250)
        assert.equal(await status(), 'active', 'Publish from a draft makes it active')
      })

      await t.step('the status card: Draft · Active · Unlisted', async () => {
        await p.getByRole('radiogroup', { name: 'Status' }).waitFor()
        await p.screenshot({ path: 'e2e/.out/85-editor-1280.png', fullPage: true })
        const v = await audit(p); assert.deepEqual(v, [], `axe: ${v.join('; ')}`)
      })

      await t.step('the phone: one column, nothing scrolls sideways', async () => {
        await p.setViewportSize({ width: 390, height: 844 }); await p.reload()
        await p.getByRole('heading', { name: 'Name, price, description' }).waitFor()
        const wide = await p.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > 391)
          .slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 50)} → ${Math.round(e.getBoundingClientRect().right)}`))
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 391), `nothing scrolls sideways: ${wide.join(' | ')}`)
        const h = await p.evaluate(() => document.documentElement.scrollHeight)
        console.log(`  editor page height on a phone: ${h} px`)
        await p.screenshot({ path: 'e2e/.out/85-editor-390.png', fullPage: true })
      })
    } finally {
      await owner.close()
      for (const v of before) await db`update variants set price = ${v.price}, stock = ${v.stock} where id = ${v.id}`
      await db`update products set status = ${prod.status}, publish_at = ${prod.publish_at} where id = ${prod.id}`
    }
  },
}
