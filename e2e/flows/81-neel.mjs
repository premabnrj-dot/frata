// =============================================================================
// FLOW: neel (Neel N0) — the console's primitives as drawn, on the test-only gallery /console/fixtures/neel
// (404 unless E2E_FIXTURES=1): axe finds nothing serious, the drawn values hold (a neel button with no thread, the
// badge's dot, 44 px on a phone, focus in neel 500), the segmented control moves by arrows, nothing scrolls sideways.
// Screenshots e2e/.out/81-neel-{desktop,phone}.png are what mockup-parity-reviewer compares with § Components.
// =============================================================================
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { CONSOLE, signedIn } from '../lib.mjs'

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  const r = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
  return r
}

export default {
  name: 'neel',
  async run(t) {
    for (const [size, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
      const ctx = await signedIn(t.browser, 'owner', { viewport })
      const p = await ctx.newPage(); p.setDefaultTimeout(8_000); p.on('pageerror', (e) => t.errors.push(e.message))
      await p.goto(CONSOLE + '/console/fixtures/neel'); await p.getByRole('heading', { name: 'Neel', exact: true }).waitFor()

      await t.step(`${size}: the drawn values hold`, async () => {
        const add = p.getByRole('button', { name: 'Add product' }).first()
        const look = await add.evaluate((b) => { const s = getComputedStyle(b), a = getComputedStyle(b, '::after'); return { bg: s.backgroundColor, h: b.getBoundingClientRect().height, radius: s.borderTopLeftRadius, thread: a.content } })
        assert.equal(look.bg, 'rgb(58, 68, 194)', 'primary is neel 600')
        assert.equal(look.thread, 'none', 'no thread on a console button')
        assert.equal(look.radius, '8px')
        assert.equal(Math.round(look.h), size === 'phone' ? 44 : 36)
        const dot = await p.locator('.badge', { hasText: 'Active' }).first().evaluate((b) => { const d = getComputedStyle(b, '::before'); return { w: d.width, bg: d.backgroundColor, h: b.getBoundingClientRect().height } })
        assert.deepEqual([dot.w, Math.round(dot.h)], ['6px', 22])
        const off = await p.getByRole('switch', { name: 'Off' }).evaluate((b) => [b.getBoundingClientRect().width, b.getBoundingClientRect().height])
        assert.deepEqual(off.map(Math.round), [34, 20])
        assert.equal(await p.locator('[role="region"][aria-label="Unsaved changes"] b').textContent(), '3 unsaved changes')
        // Parity review 2026-11-13: busy at full strength; the select white; the header 500; the reason tied to its button.
        assert.equal(await p.getByRole('button', { name: 'Saving' }).evaluate((b) => getComputedStyle(b).opacity), '1')
        assert.equal(await p.locator('select').first().evaluate((x) => getComputedStyle(x).backgroundColor), 'rgb(255, 255, 255)')
        assert.equal(await p.locator('thead th').first().evaluate((x) => getComputedStyle(x).fontWeight), '500')
        const publish = p.getByRole('button', { name: 'Publish' })
        assert.equal(await publish.getAttribute('aria-disabled'), 'true')
        // Parity re-check: the link is bare text; text is g950; a small button reads 15 px on a phone.
        const link = await p.getByRole('button', { name: 'View in store' }).evaluate((b) => [getComputedStyle(b).paddingLeft, b.getBoundingClientRect().height])
        assert.equal(link[0], '0px'); assert.ok(link[1] <= 28, `link ${link[1]} px tall`)
        assert.equal(await p.getByRole('heading', { name: 'Neel', exact: true }).evaluate((h) => getComputedStyle(h).color), 'rgb(23, 22, 21)')
        if (size === 'phone') assert.equal(await p.getByRole('button', { name: 'Edit' }).first().evaluate((b) => getComputedStyle(b).fontSize), '15px')
        const rid = await publish.getAttribute('aria-describedby')
        assert.equal(await p.evaluate((id) => document.getElementById(id)?.textContent, rid), 'Add a price first')
      })

      await t.step(`${size}: focus is neel 500, 2 px`, async () => {
        await p.getByRole('button', { name: 'Import' }).first().focus(); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab')
        await p.waitForTimeout(250) // outline-color is in transition-colors (120 ms)
        const [color, width, who] = await p.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e); return [s.outlineColor, s.outlineWidth, e.outerHTML.slice(0, 160)] })
        assert.deepEqual([color, width], ['rgb(76, 87, 214)', '2px'], who)
      })

      await t.step(`${size}: a field's focus and its mistake`, async () => {
        const wrong = p.getByLabel('Price')
        assert.deepEqual(await wrong.evaluate((x) => [getComputedStyle(x).borderTopColor, getComputedStyle(x).boxShadow]), ['rgb(220, 59, 59)', 'rgb(253, 236, 236) 0px 0px 0px 3px'])
        const name = p.getByLabel('Product name'); await name.click(); await p.waitForTimeout(250) // a text field shows focus on a click too
        assert.deepEqual(await name.evaluate((x) => [getComputedStyle(x).borderTopColor, getComputedStyle(x).outlineOffset]), ['rgb(76, 87, 214)', '1px'])
      })

      await t.step(`${size}: the segmented control moves by arrows`, async () => {
        const week = p.getByRole('radio', { name: 'Week' }); await week.focus(); await p.keyboard.press('ArrowRight')
        assert.equal(await p.getByRole('radio', { name: 'Month' }).getAttribute('aria-checked'), 'true')
        await p.waitForFunction(() => document.activeElement?.textContent === 'Month') // focus follows on the next frame
      })

      await t.step(`${size}: more components — picker, calendar, typed count, stepper, code, banner`, async () => {
        const pick = p.getByRole('combobox', { name: 'Category' }); await pick.fill('kurta')
        await p.getByRole('option', { name: /Kurtas/ }).waitFor()
        await pick.press('ArrowDown'); await pick.press('Enter')
        await p.getByText('Picked Kurtas', { exact: true }).waitFor()
        await pick.fill('silk'); await p.getByRole('option', { name: '+ Create “silk”' }).waitFor(); await pick.press('Escape')
        if (size === 'desktop') {
          await p.getByRole('button', { name: /Starts: Choose a day/ }).click()
          const cal = p.getByRole('dialog', { name: 'Starts' }); await cal.waitFor()
          await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter')
          await cal.waitFor({ state: 'hidden' })
          assert.doesNotMatch(await p.getByRole('button', { name: /^Starts:/ }).textContent(), /Choose a day/)
        }
        await p.getByRole('button', { name: 'One more' }).click()
        assert.equal(await p.getByRole('group', { name: 'Quantity' }).getByRole('textbox').inputValue(), '3')
        await p.getByRole('button', { name: 'Delete 12 products' }).first().click()
        const d = p.getByRole('dialog', { name: 'Delete 12 products?' }); await d.waitFor()
        const go = d.getByRole('button', { name: 'Delete 12 products' })
        assert.equal(await go.isDisabled(), true)
        await d.getByLabel('Type 12 to delete them').fill('12'); assert.equal(await go.isDisabled(), false)
        await d.getByRole('button', { name: 'Keep them' }).click(); await d.waitFor({ state: 'hidden' })
        assert.equal(await p.locator('[data-banner="support"]').evaluate((b) => getComputedStyle(b).backgroundColor), 'rgb(34, 32, 30)')
      })

      await t.step(`${size}: axe finds nothing serious, nothing scrolls sideways`, async () => {
        assert.deepEqual(await audit(p), [])
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll')
        await p.screenshot({ path: `e2e/.out/81-neel-${size}.png`, fullPage: true })
      })

      if (size === 'desktop') await t.step('the dialog and the menu as drawn', async () => {
        await p.getByRole('button', { name: 'Open a dialog' }).click()
        const d = p.getByRole('dialog', { name: 'Delete Mehr lehenga?' }); await d.waitFor()
        assert.equal(await d.evaluate((x) => getComputedStyle(x).borderTopLeftRadius), '16px')
        await p.screenshot({ path: 'e2e/.out/81-neel-dialog.png' })
        await p.keyboard.press('Escape'); await d.waitFor({ state: 'hidden' })
        await p.getByRole('button', { name: 'More', exact: true }).click()
        const m = p.getByRole('menu', { name: 'More' }); await m.waitFor()
        assert.equal(await m.evaluate((x) => getComputedStyle(x).borderTopLeftRadius), '12px')
        assert.deepEqual(await audit(p), [])
        await p.screenshot({ path: 'e2e/.out/81-neel-menu.png' })
        await p.keyboard.press('Escape')
      })
      await ctx.close()
    }
  },
}
