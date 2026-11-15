// =============================================================================
// FLOW: the store's announcement bars (V1 content, docs/plans/2026-11-15-v1-content.md § Regression net). Written in
// Console › Content › Announcement and live at once: a bar with a link and a colour shows on the shop; a bar that starts
// tomorrow waits (its chip says when) and the live one stays; End now takes the bar off, its Undo puts it back; the
// database holds what the screen says. (The offer bar's place in front of a written one is 47-offers' and bar.ts's.)
// Before V1 this flow drove Look › Header and Publish; its shop assertions are unchanged.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { CONSOLE, PORTS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const get = (path) => new Promise((res, rej) => http.get(`http://localhost:${PORTS.app}${path}`, { headers: { host: 'kesar-studio.frata.test' } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b })) }).on('error', rej))
// A save purges the store's content at once, or within 30 s when another save just did; pages regenerate within 60 s.
const shopSays = (path, re, want = true) => until(async () => re.test((await get(path)).body) === want, 90_000)
const WORDS = 'Wedding edit: dispatch in 2 days'
const LATER = 'Winter linens are here'
const local = (ms) => new Date(Date.now() + ms + 330 * 60_000).toISOString().slice(0, 16) // India time, for datetime-local

export default {
  name: 'announcement',
  async run(t) {
    const { db } = t
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    const bars = p.getByRole('region', { name: 'Bars' })
    try {
      await t.step('A bar is written in Content › Announcement and saved live', async () => {
        // An offer in the bar shows first (47-offers); this flow is about the written bar, so none is live.
        await db`update discounts set ended_at = now(), announce = false where ended_at is null`
        await db`delete from site_content where tenant_id = ${KESAR} and kind = 'announcement'`
        await p.goto(CONSOLE + '/console/content')
        await bars.getByRole('button', { name: 'Add a bar' }).first().click()
        const d = p.getByRole('dialog', { name: 'Add a bar' })
        await d.getByLabel(/^Text/).fill(WORDS)
        await d.getByLabel('Link').selectOption('/products')
        await d.getByRole('radio', { name: 'Ink' }).click()
        await d.getByRole('button', { name: 'Save' }).click()
        await p.getByText('Bar saved').waitFor()
        await bars.getByText('Live now').waitFor()
        const [row] = await db`select value, starts_at from site_content where tenant_id = ${KESAR} and kind = 'announcement'`
        assert.deepEqual(row.value, { text: WORDS, link: '/products', scheme: 'ink' })
      })

      await t.step('The shop shows the bar with its words and link', async () => {
        await shopSays('/', new RegExp(WORDS))
        assert.match((await get('/')).body, /href="\/products"/, 'the bar links to Shop all')
        await shopSays('/products', new RegExp(WORDS))
        await p.screenshot({ path: t.out('announcement-content') })
      })

      await t.step('A bar that starts tomorrow waits, with its start as its chip; an end before its start is refused at the field', async () => {
        await bars.getByRole('button', { name: 'Add a bar' }).click()
        const d = p.getByRole('dialog', { name: 'Add a bar' })
        await d.getByLabel(/^Text/).fill(LATER)
        await d.getByLabel('Starts').fill(local(86_400_000))
        await d.getByLabel('Ends').fill(local(3_600_000))
        await d.getByRole('button', { name: 'Save' }).click()
        await d.getByText('End is before the start. Pick a later end.').waitFor()
        await d.getByLabel('Ends').fill(local(3 * 86_400_000))
        await d.getByRole('button', { name: 'Save' }).click()
        await p.getByText('Bar saved').waitFor()
        await bars.getByText(/^Starts /).waitFor()
        assert.ok(!new RegExp(LATER).test((await get('/')).body), 'a bar that starts later is not on the shop')
        await p.screenshot({ path: t.out('announcement-scheduled') })
      })

      await t.step('End now takes the bar off the shop; Undo puts it back', async () => {
        await bars.getByRole('button', { name: `More for ${WORDS}` }).click()
        await p.getByRole('menuitem', { name: 'End now' }).click()
        await p.getByText('Bar ended').waitFor()
        await shopSays('/', new RegExp(WORDS), false)
        // A second purge inside 30 s trails the first: the Undo reaches the shop within the window.
        await p.getByRole('button', { name: 'Undo' }).click()
        await bars.getByText('Live now').waitFor()
        await shopSays('/', new RegExp(WORDS))
      })

      await t.step('On a phone: the bars and the edit sheet', async () => {
        await p.setViewportSize({ width: 390, height: 844 })
        await p.goto(CONSOLE + '/console/content')
        await bars.getByText(WORDS).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll')
        await p.screenshot({ path: t.out('announcement-phone') })
        await bars.getByRole('button', { name: `Edit ${WORDS}` }).click()
        await p.getByRole('dialog', { name: 'Edit a bar' }).waitFor()
        await p.screenshot({ path: t.out('announcement-phone-sheet') })
      })
    } finally {
      await ctx.close()
      await db`delete from site_content where tenant_id = ${KESAR} and kind = 'announcement'`
    }
  },
}
