// =============================================================================
// FLOW: neel-analytics (Neel N1b) — Analytics with the kit, as drawn: the period picker (presets, Custom, an old
// ?period=90 link), the four figures with their words, the trend's tooltip by keyboard, paid/COD by week, when orders
// come, came back by state (and its table), shoppers who come back; staff without ₹ kept; the phone; axe.
// Seeds its own orders (Bihar comes back, Kerala is delivered, one phone that orders again) and removes them at the end.
// =============================================================================
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { CONSOLE, signedIn, USERS } from '../lib.mjs'

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  return p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
}

export default {
  name: 'neel-analytics',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const days = (n) => new Date(Date.now() - n * 86_400_000)
    const first = top + 1
    const rows = []
    // 12 Bihar COD orders, 6 came back; 12 Kerala paid online, delivered; a phone that first ordered 70 days ago and again 35 days ago.
    for (let i = 0; i < 12; i++) rows.push({ n: first + i, method: 'cod', paid: null, placed: days(3 + (i % 20)), state: 'Bihar', phone: `98111${String(70000 + i)}`, rto: i % 2 === 0 ? days(1) : null, delivered: i % 2 === 0 ? null : days(1) })
    for (let i = 0; i < 12; i++) rows.push({ n: first + 12 + i, method: 'prepaid', paid: days(4 + (i % 20)), placed: days(4 + (i % 20)), state: 'Kerala', phone: `98222${String(70000 + i)}`, rto: null, delivered: days(1) })
    rows.push({ n: first + 24, method: 'cod', paid: null, placed: days(70), state: 'Kerala', phone: '9833370000', rto: null, delivered: days(65) })
    rows.push({ n: first + 25, method: 'cod', paid: null, placed: days(35), state: 'Kerala', phone: '9833370000', rto: null, delivered: days(30) })
    for (const r of rows) {
      await db`insert into orders (tenant_id, number, payment_method, paid_at, placed_at, confirmed_at, shipped_at, delivered_at, rto_initiated_at, state, phone, customer_name, address_line, city, subtotal, total)
        values (${T}, ${r.n}, ${r.method}, ${r.paid}, ${r.placed}, ${r.placed}, ${r.placed}, ${r.delivered}, ${r.rto}, ${r.state}, ${r.phone}, 'Kit Shopper', '1 Test Road', 'Patna', 150000, 150000)`
    }
    const last = first + rows.length - 1

    try {
      const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
      const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))

      await t.step('the picker: 30 days by default, each preset, Custom, and an old 90-day link', async () => {
        await p.goto(CONSOLE + '/console/analytics')
        const period = p.getByRole('navigation', { name: 'Period' })
        assert.equal(await period.getByRole('link', { name: '30 days' }).getAttribute('aria-current'), 'page')
        await p.locator('header').getByText('vs previous 30 days').waitFor()
        await period.getByRole('link', { name: '7 days' }).click(); await p.waitForURL(/period=7/); await p.locator('header').getByText('vs previous 7 days').waitFor()
        await period.getByRole('link', { name: 'Today' }).click(); await p.waitForURL(/period=today/); await p.locator('header').getByText('vs yesterday at this time').waitFor()
        await p.getByRole('button', { name: 'Custom' }).click()
        const d = p.getByRole('dialog', { name: 'Custom dates' })
        const ymd = (x) => new Date(x.getTime() + 330 * 60_000).toISOString().slice(0, 10)
        await d.getByLabel('From').fill(ymd(days(9))); await d.getByLabel('To').fill(ymd(days(0)))
        await d.getByRole('button', { name: 'Show' }).click(); await p.waitForURL(/from=.*to=/); await p.locator('header').getByText('vs the 10 days before').waitFor()
        await p.goto(CONSOLE + '/console/analytics?period=90')
        assert.equal(await p.getByRole('button', { name: 'Custom' }).getAttribute('aria-current'), 'page')
      })

      await t.step('figures say their change in words; the trend reads by keyboard', async () => {
        await p.goto(CONSOLE + '/console/analytics?period=30')
        const figures = p.getByRole('region', { name: 'Figures' })
        for (const name of ['Sales', 'Orders', 'Came back (RTO)', '₹ kept after returns']) await figures.getByText(name, { exact: true }).waitFor()
        await figures.getByText(/with an outcome/).waitFor()
        const chart = p.getByRole('img', { name: /^Sales a day/ })
        await chart.focus(); await p.keyboard.press('End')
        const tip = p.getByRole('status').filter({ hasText: 'This period' }); await tip.waitFor()
        await p.keyboard.press('Escape'); await tip.waitFor({ state: 'detached' })
      })

      await t.step('paid/COD by week, when orders come, came back by state (and its table), shoppers who come back', async () => {
        await p.getByRole('heading', { name: 'Paid online and COD, by week' }).waitFor()
        await p.getByText(/^Busiest: /).waitFor()
        const state = p.getByRole('region', { name: 'Came back, by state' })
        await state.getByRole('img', { name: /highest Bihar/ }).waitFor()
        await state.getByRole('button', { name: 'See as a table' }).click()
        await state.getByRole('row', { name: /Bihar/ }).waitFor()
        await p.getByRole('heading', { name: 'Shoppers who come back' }).waitFor()
        await p.screenshot({ path: 'e2e/.out/84-analytics-1280.png', fullPage: true })
        const v = await audit(p); assert.deepEqual(v, [], `axe: ${v.join('; ')}`)
      })

      await t.step('the phone: figures two by two, nothing scrolls sideways', async () => {
        await p.setViewportSize({ width: 390, height: 844 }); await p.goto(CONSOLE + '/console/analytics?period=30')
        const boxes = await p.locator('[data-figure]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top))
        assert.equal(Math.round(boxes[0]), Math.round(boxes[1]), 'two figures a row'); assert.ok(boxes[2] > boxes[0])
        const wide = await p.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > 391)
          .slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 50)} → ${Math.round(e.getBoundingClientRect().right)}`))
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), `nothing scrolls sideways: ${wide.join(' | ')}`)
        await p.screenshot({ path: 'e2e/.out/84-analytics-390.png', fullPage: true })
      })
      await owner.close()

      await t.step('staff see the same page without ₹ kept', async () => {
        // Staff of this shop for this step only (as 51-analytics does).
        await db`insert into members (tenant_id, user_id, role) values (${T}, ${USERS.staff.id}, 'staff') on conflict do nothing`
        const staff = await signedIn(t.browser, 'staff', { viewport: { width: 1280, height: 900 } })
        const s = await staff.newPage(); await s.goto(CONSOLE + '/console/analytics?period=30')
        await s.getByRole('region', { name: 'Figures' }).getByText('Sales', { exact: true }).waitFor()
        assert.equal(await s.getByText('₹ kept after returns').count(), 0)
        assert.equal(await s.getByText('₹ kept an order').count(), 0)
        await staff.close()
        await db`delete from members where tenant_id = ${T} and user_id = ${USERS.staff.id}`
      })
    } finally {
      await db`delete from orders where tenant_id = ${T} and number between ${first} and ${last}`
    }
  },
}
