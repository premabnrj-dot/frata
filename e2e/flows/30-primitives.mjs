// =============================================================================
// FLOW: primitives (1D·3) — the info tip, dialog, menu, toast with Undo, view
// tabs and the queue's keys, in a real browser, by keyboard and pointer, on the
// test-only page /console/fixtures/ui (404 unless E2E_FIXTURES=1). Phone and
// desktop: nothing scrolls the page sideways.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn } from '../lib.mjs'

export default {
  name: 'primitives',
  async run(t) {
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 800 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(5_000); p.on('pageerror', (e) => t.errors.push(e.message))
    const log = async () => (await p.locator('[data-testid="log"] li').allTextContents())
    await p.goto(CONSOLE + '/console/fixtures/ui'); await p.getByText('row 0').waitFor()

    await t.step('info tip: opens on click, says so, closes on Esc with focus kept', async () => {
      const b = p.getByRole('button', { name: 'About bill of supply' })
      await b.click(); await p.getByText('What a shop without a GSTIN').waitFor()
      assert.equal(await b.getAttribute('aria-expanded'), 'true')
      await p.keyboard.press('Escape'); await p.getByText('What a shop without a GSTIN').waitFor({ state: 'hidden' })
      assert.equal(await b.getAttribute('aria-expanded'), 'false')
      assert.equal(await p.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'About bill of supply')
    })

    await t.step('dialog: the marked safe button has focus (it comes second), Esc keeps the order, focus returns to the opener', async () => {
      await p.getByRole('button', { name: 'Cancel order…' }).click()
      const d = p.getByRole('dialog', { name: 'Cancel KS-1001?' }); await d.waitFor()
      assert.equal(await p.evaluate(() => document.activeElement?.textContent), 'Keep the order')
      await p.keyboard.press('j') // a queue key under a dialog does nothing
      assert.equal(await p.getByTestId('row').textContent(), 'row 0')
      await p.keyboard.press('Escape'); await d.waitFor({ state: 'hidden' })
      assert.deepEqual(await log(), ['kept'])
      assert.equal(await p.evaluate(() => document.activeElement?.textContent), 'Cancel order…')
      await p.getByRole('button', { name: 'Cancel order…' }).click(); await p.getByRole('button', { name: 'Cancel order', exact: true }).click()
      assert.deepEqual((await log()).at(-1), 'cancelled')
    })

    await t.step('menu: opens on the first item, arrows move, Enter runs, Esc returns focus', async () => {
      const more = p.getByRole('button', { name: 'More' })
      await more.click(); await p.getByRole('menu', { name: 'More' }).waitFor()
      // Focus moves on the popover's toggle event, a task after it shows: wait for it, as a person would see it.
      await p.waitForFunction(() => document.activeElement?.textContent === 'Hold', null, { timeout: 2000 })
      await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter')
      assert.equal((await log()).at(-1), 'print')
      await more.click(); await p.keyboard.press('Escape'); await p.getByRole('menu').waitFor({ state: 'hidden' })
      await p.waitForFunction(() => document.activeElement?.textContent?.trim() === 'More', null, { timeout: 2000 })
      assert.equal(await more.getAttribute('aria-expanded'), 'false')
      // A click elsewhere closes it without pulling focus back (typing into a field is not interrupted).
      await more.click(); await p.getByLabel('Search').click(); await p.getByRole('menu').waitFor({ state: 'hidden' })
      assert.equal(await p.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Search')
    })

    await t.step('menu item opens a dialog; Esc there returns focus to More', async () => {
      await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: 'Cancel order' }).click()
      const d = p.getByRole('dialog', { name: 'Cancel KS-1001?' }); await d.waitFor()
      assert.equal(await p.evaluate(() => document.activeElement?.textContent), 'Keep the order')
      await p.keyboard.press('Escape'); await d.waitFor({ state: 'hidden' })
      assert.equal(await p.evaluate(() => document.activeElement?.textContent?.trim()), 'More')
    })

    await t.step('toast: says what happened, Undo runs once and says so', async () => {
      await p.getByRole('button', { name: 'Confirm', exact: true }).click()
      await p.locator('[data-toast]', { hasText: 'KS-1001 confirmed.' }).waitFor()
      // Spoken through the shell's one live region (when the shell is there), with how to undo.
      if (await p.locator('#shell-announcer').count()) await p.waitForFunction(() => document.getElementById('shell-announcer')?.textContent === 'KS-1001 confirmed. Undo for 8 seconds.', null, { timeout: 2000 })
      await p.getByRole('button', { name: 'Undo' }).click()
      await p.locator('[data-toast]', { hasText: 'Undone.' }).waitFor()
      if (await p.locator('#shell-announcer').count()) await p.waitForFunction(() => document.getElementById('shell-announcer')?.textContent === 'Undone.', null, { timeout: 2000 })
      // One region of ours (Next's own route announcer lives in its shadow DOM and is not counted).
      assert.equal(await p.evaluate(() => document.querySelectorAll('[aria-live]').length), 1, 'one live region on the page')
      assert.equal(await p.locator('[data-toast]').count(), 1, 'one toast at a time')
      assert.equal((await log()).filter((l) => l === 'undo').length, 1)
      assert.equal(await p.getByRole('button', { name: 'Undo' }).count(), 0)
      // Keyboard focus stays with the toast, which now says what happened.
      assert.equal(await p.evaluate(() => document.activeElement?.hasAttribute('data-toast')), true)
    })

    await t.step('toast: a failed undo says why; an undo that finishes after a newer toast leaves the newer one alone', async () => {
      await p.getByRole('button', { name: 'Confirm slowly' }).click(); await p.getByText('KS-1002 confirmed.').waitFor()
      await p.getByRole('button', { name: 'Undo' }).click()
      await p.locator('[data-toast]', { hasText: 'Already packed — cancel it instead.' }).waitFor()
      await p.getByRole('button', { name: 'Confirm slowly' }).click(); await p.getByRole('button', { name: 'Undo' }).click()
      await p.getByRole('button', { name: 'Hold', exact: true }).click() // a newer toast while the undo still runs
      await p.locator('[data-toast]', { hasText: 'KS-1003 on hold.' }).waitFor()
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="log"] li').length && [...document.querySelectorAll('[data-testid="log"] li')].filter((l) => l.textContent === 'slow undo').length === 2, null, { timeout: 3000 })
      assert.equal(await p.locator('[data-toast]').textContent(), 'KS-1003 on hold.')
    })

    await t.step('keys: j moves; never while typing; ? shows the list; off means off, but ? still works', async () => {
      await p.locator('body').click({ position: { x: 5, y: 700 } })
      await p.keyboard.press('j'); await p.keyboard.press('j'); assert.equal(await p.getByTestId('row').textContent(), 'row 2')
      await p.getByLabel('Search').fill(''); await p.getByLabel('Search').press('c'); await p.getByLabel('Search').press('j')
      assert.equal(await p.getByTestId('row').textContent(), 'row 2'); assert.ok(!(await log()).includes('confirm'))
      await p.locator('body').click({ position: { x: 5, y: 700 } })
      await p.keyboard.press('?'); await p.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
      await p.getByLabel('Use single-key shortcuts on this device').uncheck(); await p.keyboard.press('Escape')
      // Its 200 ms exit must finish first: a ? pressed while it fades out finds the closing sheet, which then goes (race under load).
      await p.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor({ state: 'hidden' })
      await p.keyboard.press('j'); assert.equal(await p.getByTestId('row').textContent(), 'row 2')
      await p.keyboard.press('?'); await p.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
      await p.getByLabel('Use single-key shortcuts on this device').check(); await p.keyboard.press('Escape')
    })

    await t.step('tabs: the current view is marked, counts in Indian grouping; phone: nothing scrolls sideways', async () => {
      assert.equal(await p.getByRole('link', { name: /To confirm/ }).getAttribute('aria-current'), 'page')
      await p.getByText('1,043').waitFor()
      await p.screenshot({ path: t.out('desktop') })
      await p.setViewportSize({ width: 390, height: 800 })
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll at 390')
      // By name: the shortcuts sheet closed just before may still be fading out (200 ms exit).
      await p.getByRole('button', { name: 'Cancel order…' }).click(); const dialog = p.getByRole('dialog', { name: 'Cancel KS-1001?' }); await dialog.waitFor()
      // Its entrance has finished (no running transition), so the box is its real size.
      await p.waitForFunction(() => document.querySelector('dialog[open]')?.getAnimations().length === 0, null, { timeout: 2000 })
      // A phone dialog is a sheet along the bottom (rule 22, U·3): the full width, its bottom the viewport's.
      const box = await dialog.boundingBox(); assert.ok(box && Math.abs(box.width - 390) <= 1 && Math.abs(box.y + box.height - 800) <= 1, `dialog is a sheet on a phone (${JSON.stringify(box)})`)
      await p.screenshot({ path: t.out('phone-dialog') }); await p.keyboard.press('Escape')
    })

    await ctx.close()
  },
}
