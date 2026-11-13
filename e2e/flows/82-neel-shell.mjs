// =============================================================================
// FLOW: neel-shell (Neel N1) — the shell as drawn (§ Layout): the 232 px sidebar at 1280 with the store's address and the
// current item white with a neel icon; the 64 px rail at 1024, its links still named, a count as a dot with its words;
// "[" makes the rail at 1280 and the choice is kept (cookie) across a reload; the phone's bottom bar with the active tab
// in neel. Screenshots e2e/.out/82-shell-{1280,1024,rail,390}.png for the parity review.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn } from '../lib.mjs'

export default {
  name: 'neel-shell',
  async run(t) {
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 860 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(8_000); p.on('pageerror', (e) => t.errors.push(e.message))
    const aside = p.locator('[data-shell-aside]')
    const width = () => aside.evaluate((a) => Math.round(a.getBoundingClientRect().width))

    await t.step('1280: the sidebar as drawn', async () => {
      await p.goto(CONSOLE + '/console/products'); await p.getByRole('heading', { name: 'Products', level: 1 }).waitFor()
      assert.equal(await width(), 232)
      await aside.getByText(/\.frata\.test|\.in$/).first().waitFor() // the store's address under its name
      const cur = aside.getByRole('link', { name: 'Products' })
      assert.equal(await cur.getAttribute('aria-current'), 'page')
      const look = await cur.evaluate((a) => ({ bg: getComputedStyle(a).backgroundColor, h: Math.round(a.getBoundingClientRect().height), icon: getComputedStyle(a.querySelector('svg')).color }))
      assert.deepEqual(look, { bg: 'rgb(255, 255, 255)', h: 34, icon: 'rgb(58, 68, 194)' })
      await p.screenshot({ path: 'e2e/.out/82-shell-1280.png' })
    })

    await t.step('1024: the rail, named links, a count as a dot', async () => {
      await p.setViewportSize({ width: 1024, height: 800 }); await p.waitForTimeout(100)
      assert.equal(await width(), 64)
      const orders = aside.getByRole('link', { name: /^Orders/ })
      // The count streams in after the page, and only when there is something to confirm (the ux flow seeds orders).
      await p.waitForLoadState('networkidle')
      if (await orders.locator('[data-nav-count]').count()) {
        assert.match(await orders.evaluate((a) => a.textContent), /Orders.*to confirm/)
        const dot = await orders.locator('[data-nav-count]').evaluate((d) => [Math.round(d.getBoundingClientRect().width), getComputedStyle(d).fontSize])
        assert.deepEqual(dot, [7, '0px'])
      }
      await orders.focus(); await p.waitForTimeout(200)
      assert.equal(await orders.locator('[data-nav-label]').evaluate((l) => getComputedStyle(l).opacity), '1') // the tooltip on focus
      await p.screenshot({ path: 'e2e/.out/82-shell-1024.png' })
    })

    await t.step('1280: "[" makes the rail, and it is kept across a reload', async () => {
      await p.setViewportSize({ width: 1280, height: 860 }); await p.locator('body').click({ position: { x: 700, y: 400 } })
      await p.keyboard.press('[')
      await p.waitForFunction(() => Math.round(document.querySelector('[data-shell-aside]').getBoundingClientRect().width) === 64)
      await p.reload(); await p.getByRole('heading', { name: 'Products', level: 1 }).waitFor()
      assert.equal(await width(), 64)
      await p.screenshot({ path: 'e2e/.out/82-shell-rail.png' })
      await p.getByRole('button', { name: 'Collapse sidebar' }).click()
      await p.waitForFunction(() => Math.round(document.querySelector('[data-shell-aside]').getBoundingClientRect().width) === 232)
      await p.reload(); assert.equal(await width(), 232)
    })

    await t.step('390: the bottom bar, the active tab in neel', async () => {
      await p.setViewportSize({ width: 390, height: 844 }); await p.goto(CONSOLE + '/console/orders')
      const tab = p.getByRole('navigation', { name: 'Console' }).last().getByRole('link', { name: /^Orders/ })
      assert.equal(await tab.getAttribute('aria-current'), 'page')
      assert.equal(await tab.evaluate((a) => getComputedStyle(a).color), 'rgb(58, 68, 194)')
      await p.screenshot({ path: 'e2e/.out/82-shell-390.png' })
    })
    await ctx.close()
  },
}
