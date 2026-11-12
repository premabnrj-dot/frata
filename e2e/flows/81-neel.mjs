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
        const add = p.getByRole('button', { name: 'Add product' })
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
      })

      await t.step(`${size}: focus is neel 500, 2 px`, async () => {
        await p.getByRole('button', { name: 'Import' }).focus(); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab')
        await p.waitForTimeout(250) // outline-color is in transition-colors (120 ms)
        const [color, width, who] = await p.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e); return [s.outlineColor, s.outlineWidth, e.outerHTML.slice(0, 160)] })
        assert.deepEqual([color, width], ['rgb(76, 87, 214)', '2px'], who)
      })

      await t.step(`${size}: the segmented control moves by arrows`, async () => {
        const week = p.getByRole('radio', { name: 'Week' }); await week.focus(); await p.keyboard.press('ArrowRight')
        assert.equal(await p.getByRole('radio', { name: 'Month' }).getAttribute('aria-checked'), 'true')
        await p.waitForFunction(() => document.activeElement?.textContent === 'Month') // focus follows on the next frame
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
        await p.getByRole('button', { name: 'More' }).click()
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
