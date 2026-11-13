// =============================================================================
// FLOW: neel-finding (Neel N1c, § Finding things) — on /console/orders: a filter as a chip that reads back as a
// sentence, × and Back, "+ Filter" with values and their counts and "Show N orders", a saved view with its count,
// renamed and removed with Undo; search as you type with the match marked (a name, phone digits, a tracking number),
// no page load per key; quick look (Space, ↓, Esc, Open order); the phone's two-line rows and its filter sheet.
// Seeds its own orders (Bihar and Kerala, COD and paid online, one with an AWB) and removes them at the end.
// =============================================================================
import assert from 'node:assert/strict'
import { todayAgo, CONSOLE, signedIn } from '../lib.mjs'

export default {
  name: 'neel-finding',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const [A, B, C] = [top + 1, top + 2, top + 3]
    // A: COD to Bihar · B: COD to Bihar · C: paid online, Kerala, shipped with an AWB.
    await db`insert into orders (tenant_id, number, payment_method, placed_at, customer_name, phone, address_line, city, state, subtotal, total, paid_at) values
      (${T}, ${A}, 'cod', ${todayAgo(40)}, 'Finder Sneha', '9845012345', '12 Boring Road', 'Patna', 'Bihar', 150800, 150800, null),
      (${T}, ${B}, 'cod', ${todayAgo(30)}, 'Finder Rahul', '9845677001', '3 Frazer Road', 'Patna', 'Bihar', 219000, 219000, null),
      (${T}, ${C}, 'prepaid', ${todayAgo(20)}, 'Finder Anu', '9447001122', '8 MG Road', 'Kochi', 'Kerala', 99000, 99000, now())`
    const [{ id: cId }] = await db`select id from orders where tenant_id = ${T} and number = ${C}`
    await db`update orders set confirmed_at = now(), packed_at = now(), shipped_at = now() where tenant_id = ${T} and number = ${C}`
    await db`insert into shipments (tenant_id, order_id, provider, courier_name, tracking_number) values (${T}, ${cId}, 'self', 'Delhivery', 'FND1490023381')`
    const [{ prefix }] = await db`select order_prefix as prefix from shop_settings where tenant_id = ${T}`
    const label = (n) => `${prefix || 'KS'}-${n}`

    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 860 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    const rows = () => p.locator('tbody tr')
    const rowOf = (n) => p.locator('tbody tr', { hasText: label(n) })

    try {
      await t.step('a filter is a chip that reads back; × and Back', async () => {
        await p.goto(CONSOLE + '/console/orders?tab=all&pay=cod&st=10')
        await p.getByText('Payment is COD').waitFor(); await p.getByText('State is Bihar').waitFor()
        await rowOf(A).waitFor(); await rowOf(B).waitFor(); assert.equal(await rowOf(C).count(), 0)
        await p.getByText(/\d+ of \d+ orders/).waitFor()
        await p.getByRole('link', { name: 'Remove State is Bihar' }).click()
        await p.waitForURL((u) => !u.searchParams.has('st')); assert.equal(await p.getByText('State is Bihar').count(), 0)
        await p.goBack(); await p.getByText('State is Bihar').waitFor()
      })

      await t.step('"+ Filter": values with counts, "Show N orders", then the chip', async () => {
        await p.goto(CONSOLE + '/console/orders?tab=all')
        await p.getByRole('button', { name: 'Filter', exact: true }).click()
        const panel = p.getByRole('dialog', { name: 'Filter orders' }); await panel.waitFor()
        await panel.getByRole('button', { name: 'State' }).click()
        const kerala = panel.getByRole('checkbox', { name: /Kerala/ }); await kerala.waitFor()
        assert.match(await panel.locator('label', { hasText: 'Kerala' }).innerText(), /Kerala\s*\d+/) // its count
        await kerala.check()
        const show = panel.getByRole('button', { name: /^Show \d+ orders?$/ }); await show.waitFor()
        await show.click()
        await p.waitForURL(/st=32/); await p.getByText('State is Kerala').waitFor(); await rowOf(C).waitFor()
      })

      await t.step('save the view: a tab with its count; rename; remove with Undo', async () => {
        await p.goto(CONSOLE + '/console/orders?tab=all&pay=cod&st=10')
        await p.getByRole('button', { name: '+ Save view' }).click()
        const d = p.getByRole('dialog', { name: 'Save view' }); await d.getByLabel('Name').fill('Bihar COD')
        await d.getByRole('button', { name: 'Save view' }).click()
        const tab = p.getByRole('navigation', { name: 'Order views' }).getByRole('link', { name: /Bihar COD/ })
        await tab.waitFor(); assert.equal(await tab.getAttribute('aria-current'), 'page')
        await p.waitForFunction(() => /Bihar COD\s*\d+/.test([...document.querySelectorAll('nav[aria-label="Order views"] a')].map((a) => a.textContent).join('|')))
        await p.getByRole('button', { name: 'Bihar COD: view options' }).click(); await p.getByRole('menuitem', { name: 'Rename' }).click()
        const r = p.getByRole('dialog', { name: 'Rename view' }); await r.getByLabel('Name').fill('Bihar'); await r.getByRole('button', { name: 'Rename' }).click()
        await p.getByRole('navigation', { name: 'Order views' }).getByRole('link', { name: /^Bihar\b/ }).waitFor()
        await p.getByRole('button', { name: 'Bihar: view options' }).click(); await p.getByRole('menuitem', { name: 'Remove' }).click()
        await p.locator('[data-toast]', { hasText: 'Removed “Bihar”.' }).getByRole('button', { name: 'Undo' }).click()
        await p.getByRole('navigation', { name: 'Order views' }).getByRole('link', { name: /^Bihar\b/ }).waitFor()
        // the view is the team's and stays a row: clean it up for the other flows
        await db`delete from saved_views where tenant_id = ${T}`
      })

      await t.step('search as you type: no page load per key, the match marked', async () => {
        await p.goto(CONSOLE + '/console/orders?tab=all')
        const loads = []; p.on('framenavigated', (f) => { if (f === p.mainFrame()) loads.push(f.url()) })
        const box = p.getByLabel('Search orders')
        await box.pressSequentially('Finder Sne', { delay: 40 })
        await p.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1)
        await rowOf(A).waitFor(); assert.equal(await rowOf(A).locator('mark').innerText(), 'Finder Sne')
        assert.ok(new URL(p.url()).searchParams.get('q') === 'Finder Sne', 'the address holds the search')
        assert.equal(loads.length, 0, `no page load while typing (${loads.join(', ')})`)
        await box.fill(''); await box.pressSequentially('98450', { delay: 30 })
        await rowOf(A).waitFor(); await p.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1)
        assert.equal(await rowOf(A).locator('mark').innerText(), '98450') // the phone shows, its digits marked
        await box.fill('FND1490023381')
        await rowOf(C).waitFor(); assert.equal(await rowOf(C).locator('mark').innerText(), 'FND1490023381') // an AWB
        await box.fill('nobody-like-this-xyz'); await p.getByText('No order matches “nobody-like-this-xyz”').waitFor()
      })

      await t.step('quick look: Space opens it beside the list, ↓ moves, Esc gives the row back', async () => {
        await p.goto(CONSOLE + `/console/orders?tab=all&st=10`)
        await rowOf(A).waitFor(); await rows().first().focus()
        await p.keyboard.press(' ')
        const look = p.getByRole('dialog', { name: /^Quick look: / }); await look.waitFor()
        const first = await look.getAttribute('aria-label')
        await look.getByText('Total').waitFor(); await look.getByText(/Finder (Sneha|Rahul)/).waitFor()
        assert.equal(await look.getByText(/cost/i).count(), 0)
        await p.keyboard.press('ArrowDown'); await p.waitForFunction((f) => document.querySelector('[data-quick-look]')?.getAttribute('aria-label') !== f, first)
        await p.screenshot({ path: 'e2e/.out/83-quick-look.png' })
        await p.keyboard.press('Escape'); await look.waitFor({ state: 'detached' })
        assert.equal(await p.evaluate(() => document.activeElement?.tagName), 'TR')
        await rows().nth(1).getByRole('button', { name: /^Quick look / }).click()
        await p.getByRole('dialog', { name: /^Quick look: / }).getByRole('link', { name: 'Open order' }).click()
        await p.waitForURL(/\/console\/orders\/\d+$/)
      })

      await t.step('phone: two-line rows, the to-confirm chip, the filter sheet counts first', async () => {
        await p.setViewportSize({ width: 390, height: 844 })
        await p.goto(CONSOLE + '/console/orders?tab=all&st=10')
        const row = rowOf(A); await row.waitFor()
        assert.match(await row.innerText(), new RegExp(`${label(A)} · Finder Sneha`))
        await p.getByText(/^\d+ to confirm$/).first().waitFor()
        await p.getByRole('button', { name: /^Filters/ }).click()
        const sheet = p.getByRole('dialog', { name: 'Filters' }); await sheet.waitFor()
        await sheet.getByRole('checkbox', { name: 'COD' }).check()
        await sheet.getByRole('button', { name: /^Show \d+ orders?$/ }).click()
        await p.waitForURL(/pay=cod/); await p.getByText('Payment is COD').waitFor()
        await p.screenshot({ path: 'e2e/.out/83-phone.png' })
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'nothing scrolls sideways')
      })
    } finally {
      await ctx.close()
      await db`delete from saved_views where tenant_id = ${T}`
      await db`delete from shipments where tenant_id = ${T} and order_id = ${cId}`
      await db`delete from orders where tenant_id = ${T} and number between ${A} and ${C}`
    }
  },
}
