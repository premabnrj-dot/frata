// =============================================================================
// FLOW: studio — the Studio workbench's shell (plan docs/plans/2026-11-22-studio-workbench.md WB·3, WB·7; mockup
// docs/mockups/2026-11-22-studio-workbench.html screen 1) on the test-only page /partner/fixtures/studio (404 unless
// E2E_FIXTURES=1). A partner folds and resizes the panels by button, edge and key; the layout survives a reload and a
// broken or missing browser store; single keys stay out of a text box and turn off by the one switch; F6 walks the
// regions; Code, Checks and Versions load when first opened. A narrow computer starts with the inspector folded. A
// phone shows one region at a time from its bar, with no Code tab. axe finds nothing serious at 1280 and 390, under
// reduced motion. Screenshots e2e/.out/96-studio-*.png are what mockup-parity-reviewer compares with screen 1.
// Guards: a panel that opens by itself; a key that fires while typing; a layout lost or a crash without storage.
// =============================================================================
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { CONSOLE, USERS, partnerOn, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const URL = CONSOLE + '/partner/fixtures/studio'
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  return p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
}
const width = (loc) => loc.evaluate((e) => Math.round(e.getBoundingClientRect().width))
/** A width after a change: React paints on the next frame, so wait for it (2 s), then say what it was. */
const isW = async (loc, want, why) => {
  const h = await loc.elementHandle()
  try { await h.evaluate((e, w) => new Promise((ok, no) => { const t0 = performance.now(); const f = () => Math.round(e.getBoundingClientRect().width) === w ? ok() : performance.now() - t0 > 2000 ? no() : requestAnimationFrame(f); f() }), want) }
  catch { assert.equal(await width(loc), want, why) }
}

export default {
  name: 'studio',
  async run(t) {
    const P = USERS.partner
    await t.db`insert into auth.users (id, email, email_confirmed_at) values (${P.id}, ${P.email}, now()) on conflict (id) do nothing`
    await partnerOn(t.db, KESAR, P)
    const open = async (viewport, init) => {
      const ctx = await signedIn(t.browser, 'partner', { viewport, reducedMotion: 'reduce' })
      if (init) await ctx.addInitScript(init)
      const p = await ctx.newPage(); p.setDefaultTimeout(8_000); p.on('pageerror', (e) => t.errors.push(e.message))
      await p.goto(URL); await p.getByRole('link', { name: 'Back to Clients' }).waitFor()
      return { ctx, p }
    }

    const { ctx, p } = await open({ width: 1280, height: 860 })
    const chat = p.getByRole('complementary', { name: 'Chat' }), insp = p.getByRole('complementary', { name: 'Inspector' })
    const status = p.locator('[role="status"][aria-live="polite"]')

    await t.step('1280: three named regions as drawn, the step named Website', async () => {
      await isW(chat, 340); await isW(insp, 320)
      await p.locator('li[aria-current="step"]', { hasText: 'Website' }).waitFor()
      await p.getByRole('button', { name: 'Publish v8' }).waitFor()
      await chat.getByRole('heading', { name: 'Frrata agent' }).waitFor()
      await chat.getByRole('region', { name: 'Words for Content' }).getByText('3 to apply').waitFor()
      await chat.getByRole('button', { name: 'Stop the agent' }).waitFor()
      await p.getByText('Building v8 · about 1–2 min').first().waitFor()
      await p.getByText('Preview · v7').waitFor()
      assert.deepEqual(await insp.getByRole('tab').allTextContents(), ['Design', 'Code', 'Checks 1 to fix', 'Versions'])
      assert.equal(await p.locator('[role="status"][aria-live]').count(), 1, 'one polite region')
      assert.match(await status.textContent(), /Building v8/)
      await insp.getByText('Home hero', { exact: true }).waitFor()
    })

    await t.step('1280, both panels open: the preview bar and the tab row fit, nothing overlaps', async () => {
      const fit = await p.evaluate(() => {
        const bar = document.querySelector('[data-bar]'), b = bar.getBoundingClientRect()
        const kids = [...bar.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => c.getBoundingClientRect())
        const overlaps = kids.slice(1).filter((r, i) => r.left < kids[i].right - 0.5).length
        const row = document.querySelector('[role="tablist"][aria-label="Inspector"]').getBoundingClientRect()
        const fold = document.querySelector('button[aria-label="Hide inspector"]').getBoundingClientRect()
        const list = document.querySelector('[role="tablist"][aria-label="Inspector"]')
        // Room to spare: what the bar's controls need (their widths, the gaps between them and the bar's padding) against
        // its width. The status's ml-auto takes up the rest, so scrollWidth alone cannot show the margin.
        const cs = getComputedStyle(bar), gap = parseFloat(cs.columnGap) || 0
        const need = kids.reduce((n, r) => n + r.width, 0) + gap * (kids.length - 1) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
        return { scrolls: bar.scrollWidth > bar.clientWidth, room16: need <= bar.clientWidth - 16, lastIn: kids.at(-1).right <= b.right, overlaps, gap: Math.round(fold.left - row.right), tabsScroll: list.scrollWidth > list.clientWidth }
      })
      assert.deepEqual(fit, { scrolls: false, room16: true, lastIn: true, overlaps: 0, gap: 8, tabsScroll: false })
      assert.equal(await p.getByRole('button', { name: 'Preview only' }).isVisible(), true)
      // The status keeps its words for a screen reader even when only its spinner shows.
      assert.equal(await p.locator('[data-building]').textContent(), 'Building v8 · about 1–2 min')
    })

    await t.step('1280: a panel folds to its rail by its button and opens only when asked', async () => {
      const hide = chat.getByRole('button', { name: 'Hide chat' })
      assert.equal(await hide.getAttribute('aria-expanded'), 'true')
      await hide.click()
      const rail = chat.getByRole('button', { name: 'Show chat. 1 new' })
      assert.equal(await rail.getAttribute('aria-expanded'), 'false')
      await isW(chat, 44)
      assert.equal(await status.textContent(), 'Chat hidden')
      await p.waitForTimeout(300); await isW(chat, 44, 'a panel never opens by itself')
      await rail.click(); await isW(chat, 340)
      await insp.getByRole('button', { name: 'Hide inspector' }).click()
      await insp.getByRole('button', { name: 'Checks. 1 to fix' }).click()
      await isW(insp, 320)
      assert.equal(await insp.getByRole('tab', { name: /Checks/ }).getAttribute('aria-selected'), 'true')
      await insp.getByText('Photo has no description.').waitFor() // loaded on first open
      await insp.getByText('components/hero.tsx:14').waitFor()
    })

    await t.step('1280: the keys fold, open and switch tabs; never in a text box', async () => {
      await p.locator('body').click({ position: { x: 640, y: 30 } })
      await p.keyboard.press('['); await isW(chat, 44)
      await p.keyboard.press('['); await isW(chat, 340)
      await p.keyboard.press(']'); await isW(insp, 44)
      await p.keyboard.press('2'); await isW(insp, 320, 'a tab key opens the inspector')
      await insp.getByText('npx frrata dev house-of-ayuda').waitFor()
      await p.keyboard.press('\\')
      await isW(chat, 44); await isW(insp, 44)
      assert.equal(await p.getByRole('button', { name: 'Preview only' }).getAttribute('aria-pressed'), 'true')
      await p.keyboard.press('\\')
      await isW(chat, 340); await isW(insp, 320)
      const box = chat.getByRole('textbox', { name: 'Ask for a change' })
      await box.click(); await p.keyboard.type('[]\\4?')
      assert.equal(await box.inputValue(), '[]\\4?')
      await isW(chat, 340); await isW(insp, 320)
      assert.equal(await p.getByRole('dialog').count(), 0)
      await box.fill('')
    })

    await t.step('1280: F6 walks the regions, Shift+F6 back', async () => {
      const at = () => p.evaluate(() => document.activeElement?.closest('[data-region]')?.getAttribute('aria-label'))
      await p.keyboard.press('F6'); assert.equal(await at(), 'Preview') // from the composer
      await p.keyboard.press('F6'); assert.equal(await at(), 'Inspector')
      await p.keyboard.press('F6'); assert.equal(await at(), 'Chat')
      await p.keyboard.press('Shift+F6'); assert.equal(await at(), 'Inspector')
    })

    await t.step('1280: the edges resize by arrows and drag, within their limits, and the layout is kept', async () => {
      const edge = p.getByRole('separator', { name: 'Resize chat' })
      assert.deepEqual(await edge.evaluate((e) => ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'].map((a) => e.getAttribute(a))), ['340', '280', '480'])
      await edge.focus(); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight')
      await isW(chat, 372)
      await p.keyboard.press('End'); await isW(chat, 480)
      await p.keyboard.press('Home'); await isW(chat, 280)
      const ie = p.getByRole('separator', { name: 'Resize inspector' })
      const b = await ie.boundingBox()
      await p.mouse.move(b.x + b.width / 2, b.y + 200); await p.mouse.down(); await p.mouse.move(b.x + b.width / 2 - 60, b.y + 200, { steps: 4 }); await p.mouse.up()
      await isW(insp, 380, 'dragging the inspector edge left widens it')
      await insp.getByRole('button', { name: 'Hide inspector' }).click()
      await p.reload(); await p.getByRole('main', { name: 'Preview' }).waitFor()
      await p.waitForFunction(() => document.querySelector('aside[aria-label="Chat"]').getBoundingClientRect().width === 280)
      await isW(insp, 44, 'folded stays folded')
      await insp.getByRole('button', { name: 'Show inspector' }).click(); await isW(insp, 380)
      // A stored layout that does not parse is ignored: the defaults draw.
      await p.evaluate(() => localStorage.setItem('frrata.studio.layout', '{nope'))
      await p.reload(); await p.getByRole('main', { name: 'Preview' }).waitFor()
      await p.waitForFunction(() => document.querySelector('aside[aria-label="Chat"]').getBoundingClientRect().width === 340)
      await isW(insp, 320)
    })

    await t.step('1280: pick a part, a case and a width', async () => {
      await p.getByRole('button', { name: 'New in · heading' }).click()
      await insp.getByText('New in · heading', { exact: true }).waitFor()
      await p.waitForFunction(() => document.querySelector('aside[aria-label="Inspector"] input')?.value === 'New in')
      await p.getByRole('radio', { name: '1280' }).click()
      const dev = p.locator('[data-device]')
      assert.equal(await dev.getAttribute('data-device'), '1280')
      const fits = await dev.evaluate((d) => { const s = d.parentElement.getBoundingClientRect(); return d.getBoundingClientRect().width <= s.width })
      assert.ok(fits, 'a computer width is scaled to fit the stage')
      await p.getByRole('combobox', { name: 'Case' }).selectOption('empty')
      await p.locator('[data-device]').getByText('No products yet').waitFor()
      await p.getByRole('combobox', { name: 'Case' }).selectOption('soldout')
      await p.locator('[data-device]').getByText('Sold out', { exact: true }).waitFor()
      await p.getByRole('combobox', { name: 'Case' }).selectOption('normal')
      await p.getByRole('radio', { name: '390' }).click()
    })

    await t.step('1280: ? lists the keys; the one switch turns single keys off', async () => {
      await p.locator('body').click({ position: { x: 640, y: 30 } })
      await p.keyboard.press('?')
      const d = p.getByRole('dialog', { name: 'Keyboard shortcuts' }); await d.waitFor()
      assert.equal(await d.locator('kbd').count(), 7)
      await d.getByRole('checkbox', { name: 'Use single-key shortcuts on this device' }).uncheck()
      await d.getByRole('button', { name: 'Close shortcuts' }).click(); await d.waitFor({ state: 'hidden' })
      await p.keyboard.press('['); await isW(chat, 340, 'off: [ does nothing')
      await p.keyboard.press('?'); await d.waitFor()
      await d.getByRole('checkbox', { name: 'Use single-key shortcuts on this device' }).check()
      await d.getByRole('button', { name: 'Close shortcuts' }).click(); await d.waitFor({ state: 'hidden' })
      await p.keyboard.press('['); await isW(chat, 44)
      await p.keyboard.press('[')
    })

    await t.step('1280: axe finds nothing serious; nothing scrolls sideways', async () => {
      for (const tab of ['Versions', 'Code', 'Design']) {
        await insp.getByRole('tab', { name: new RegExp(tab) }).click()
        if (tab === 'Versions') await insp.getByRole('button', { name: 'Restore v6' }).waitFor()
        assert.deepEqual(await audit(p), [], tab)
      }
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll')
      await p.screenshot({ path: 'e2e/.out/96-studio-desktop.png' })
      await p.keyboard.press('['); await p.screenshot({ path: 'e2e/.out/96-studio-desktop-folded.png' }); await p.keyboard.press('[')
    })
    await t.step('1280: the Brand row opens the Brand book in place; Esc and Design go back to the row', async () => {
      await insp.getByRole('tab', { name: 'Design' }).click()
      const row = insp.getByRole('button', { name: 'Brand', exact: true })
      await row.click()
      const book = insp.getByRole('region', { name: 'Brand book' }); await book.waitFor()
      assert.deepEqual(await book.locator('dt').allTextContents(), ['In one line', 'Voice', 'Who buys', 'Words we use', 'Never', 'Logo', 'Look · Sindoor paper', 'Type'])
      await book.getByText('House of Ayuda · from the console').waitFor()
      await book.getByRole('button', { name: 'Change in Brand' }).waitFor()
      assert.equal(await book.getByText('Waiting for the owner').count(), 0)
      assert.equal(await p.evaluate(() => document.activeElement?.textContent), 'Design', 'focus lands on the way back')
      assert.equal(await insp.getByRole('button', { name: 'Replace photo' }).count(), 0, 'the book takes the tab')
      assert.deepEqual(await audit(p), [], 'Brand book')
      await p.screenshot({ path: 'e2e/.out/96-studio-brand-book.png' })
      await p.keyboard.press('Escape')
      await row.waitFor()
      await p.waitForFunction(() => document.activeElement?.hasAttribute('data-brand-row'))
      await row.press('Enter')
      await book.getByRole('button', { name: 'Design' }).click()
      await p.waitForFunction(() => document.activeElement?.hasAttribute('data-brand-row'))
    })
    await ctx.close()

    await t.step('1280: the Brand book for a Builder, a change waiting for the owner, and no logo yet', async () => {
      const n = await open({ width: 1280, height: 860 })
      const i = n.p.getByRole('complementary', { name: 'Inspector' })
      const book = i.getByRole('region', { name: 'Brand book' })
      await n.p.goto(URL + '?builder=1&waiting=1'); await i.getByRole('button', { name: 'Brand', exact: true }).click(); await book.waitFor()
      await book.getByText('Waiting for the owner').waitFor()
      assert.equal(await book.getByRole('button', { name: /in Brand/ }).count(), 0, 'a Builder reads the book only')
      await n.p.goto(URL + '?nologo=1'); await i.getByRole('button', { name: 'Brand', exact: true }).click(); await book.waitFor()
      await book.getByText('None yet', { exact: true }).waitFor()
      await book.getByRole('button', { name: 'Add a logo in Brand' }).waitFor()
      assert.deepEqual(await audit(n.p), [], 'no logo')
      await n.ctx.close()
    })

    await t.step('800: a narrow computer starts with the inspector folded', async () => {
      const n = await open({ width: 800, height: 800 })
      await isW(n.p.getByRole('complementary', { name: 'Inspector' }), 44)
      await isW(n.p.getByRole('complementary', { name: 'Chat' }), 340)
      await n.ctx.close()
    })

    await t.step('1280: no browser storage at all, the workbench still draws and folds', async () => {
      const n = await open({ width: 1280, height: 860 }, () => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage off') } })
      })
      const c = n.p.getByRole('complementary', { name: 'Chat' })
      await isW(c, 340)
      await c.getByRole('button', { name: 'Hide chat' }).click(); await isW(c, 44)
      await n.ctx.close()
    })

    await t.step('390: one region at a time from the bar; no Code tab; single keys off', async () => {
      const n = await open({ width: 390, height: 844 })
      const q = n.p
      const bar = q.getByRole('navigation', { name: 'Studio sections' })
      await bar.getByRole('button', { name: 'Chat' }).waitFor() // the phone bar appears once the page knows its width
      assert.deepEqual(await bar.getByRole('button').allTextContents(), ['Chat', 'Website', 'More'])
      assert.equal(await bar.getByRole('button', { name: 'Chat' }).getAttribute('aria-pressed'), 'true')
      await q.getByRole('complementary', { name: 'Chat' }).waitFor()
      assert.equal(await q.getByRole('main', { name: 'Preview' }).isVisible(), false)
      assert.equal(await q.getByRole('button', { name: 'Hide chat' }).count(), 0)
      assert.equal(await q.getByRole('button', { name: 'Publish v8' }).count(), 0)
      assert.deepEqual(await q.locator('ol[aria-label="Progress"] li').allTextContents(), ['4Website'])
      await q.keyboard.press('['); assert.equal(await q.getByRole('complementary', { name: 'Chat' }).isVisible(), true)
      assert.deepEqual(await audit(q), [], 'chat')
      await q.screenshot({ path: 'e2e/.out/96-studio-phone-chat.png' })
      await bar.getByRole('button', { name: 'Website' }).click()
      await q.getByRole('main', { name: 'Preview' }).waitFor()
      assert.deepEqual(await q.getByRole('radiogroup', { name: 'Width' }).getByRole('radio').allTextContents(), ['390'])
      assert.equal(await q.getByRole('button', { name: 'Preview only' }).count(), 0)
      assert.deepEqual(await audit(q), [], 'website')
      await q.screenshot({ path: 'e2e/.out/96-studio-phone-website.png' })
      await q.getByRole('button', { name: 'Home hero' }).click() // picking a part opens Design
      const i = q.getByRole('complementary', { name: 'Inspector' }); await i.waitFor()
      assert.deepEqual(await i.getByRole('tab').allTextContents(), ['Design', 'Checks 1 to fix', 'Versions'])
      assert.equal(await bar.getByRole('button', { name: 'More' }).getAttribute('aria-pressed'), 'true')
      assert.deepEqual(await audit(q), [], 'design')
      assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll')
      await q.screenshot({ path: 'e2e/.out/96-studio-phone-design.png' })
      // The Brand book under More › Design, the same row and view.
      await i.getByRole('button', { name: 'Brand', exact: true }).click()
      await i.getByRole('region', { name: 'Brand book' }).getByText('Warm · English').waitFor()
      assert.deepEqual(await audit(q), [], 'Brand book on a phone')
      assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll')
      await q.screenshot({ path: 'e2e/.out/96-studio-phone-brand-book.png' })
      await q.keyboard.press('Escape'); await i.getByRole('button', { name: 'Brand', exact: true }).waitFor()
      await n.ctx.close()
    })
  },
}
