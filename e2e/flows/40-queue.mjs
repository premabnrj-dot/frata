// =============================================================================
// FLOW: queue (1D·4b) — the merchant's morning on /console/orders: tabs with
// counts, keys (j/k, c confirm, h hold, z undo, ? the list), Undo from the
// toast, bulk confirm that skips a high-risk order (worked out on the server),
// two people confirming the same order, search, and the phone layout.
// Seeds its own orders (a phone with three COD orders today: the third is
// High) and removes them at the end.
// =============================================================================
import assert from 'node:assert/strict'
import { todayAgo, CONSOLE, signedIn, until } from '../lib.mjs'

export default {
  name: 'queue',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const [{ prefix }] = await db`select order_prefix as prefix from shop_settings where tenant_id = ${T}`
    const label = (n) => `${prefix || 'KS'}-${n}`
    const A = top + 1, B = top + 2, C = top + 3, D = top + 4
    // A, B, C: one phone, today, COD — C is the third: High. D: another customer, an ordinary repeat buyer.
    await db`insert into orders (tenant_id, number, payment_method, placed_at, customer_name, phone, address_line, city, subtotal, total) values
      (${T}, ${A}, 'cod', ${todayAgo(30)}, 'Queue Aarti', '9811100001', 'B-14, Tilak Marg', 'Jaipur', 249000, 249000),
      (${T}, ${B}, 'cod', ${todayAgo(20)}, 'Queue Aarti', '9811100001', 'B-14, Tilak Marg', 'Jaipur', 249000, 249000),
      (${T}, ${C}, 'cod', ${todayAgo(10)}, 'Queue Aarti', '9811100001', 'B-14, Tilak Marg', 'Jaipur', 249000, 249000),
      (${T}, ${D}, 'cod', ${todayAgo(5)}, 'Queue Dev', ${'981110' + String(B).padStart(4, '0').slice(-4)}, 'Flat 22, Shanti Nagar', 'Jaipur', 199000, 199000)`
    // D's phone contains B's number on purpose: searching "KS-<B>" must find B alone (review 2026-11-07).
    const state = async (n) => (await db`select confirmed_at is not null as confirmed, held_at is not null as held from orders where tenant_id = ${T} and number = ${n}`)[0]
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    const tabs = () => p.getByRole('navigation', { name: 'Order views' })
    const count = async (name) => Number((await tabs().getByRole('link', { name: new RegExp(`^${name}`) }).textContent())?.replace(/\D/g, '') || 0)
    const row = (n) => p.getByRole('row').filter({ hasText: label(n) })
    try {
      await t.step('opens on To confirm, newest first, with counts; only Medium and High risk shown', async () => {
        await p.goto(CONSOLE + '/console/orders')
        assert.equal(await tabs().getByRole('link', { name: /^To confirm/ }).getAttribute('aria-current'), 'page')
        await row(D).waitFor()
        assert.ok((await count('To confirm')) >= 4)
        await row(C).getByText('High risk').waitFor()
        assert.equal(await row(D).getByText(/High|Medium/).count(), 0)
        await p.screenshot({ path: t.out('desktop') })
      })

      await t.step('keys: j/k move between rows, c confirms at once with Undo; z undoes', async () => {
        const before = await count('To confirm')
        // Other flows' orders may be newer: start from this flow's own row, then move.
        await row(D).getByRole('cell').nth(2).click()
        await p.keyboard.press('j'); await p.waitForFunction((t) => !document.activeElement?.textContent?.includes(t), label(D))
        await p.keyboard.press('k'); await p.waitForFunction((t) => document.activeElement?.textContent?.includes(t), label(D))
        await p.keyboard.press('c')
        await p.locator('[data-toast]', { hasText: `${label(D)} confirmed.` }).waitFor()
        await until(async () => (await state(D)).confirmed)
        await row(D).waitFor({ state: 'detached' }) // it left To confirm
        assert.equal(await count('To confirm'), before - 1)
        await p.keyboard.press('z')
        await until(async () => !(await state(D)).confirmed)
        await row(D).waitFor()
      })

      await t.step('h holds; the On hold tab counts it', async () => {
        const held = await count('On hold')
        await row(D).getByRole('cell').nth(2).click() // focus the row without opening it
        await p.keyboard.press('h')
        await until(async () => (await state(D)).held)
        await p.locator('[data-toast]', { hasText: `${label(D)} put on hold.` }).waitFor()
        await p.reload(); assert.equal(await count('On hold'), held + 1)
        await db`update orders set held_at = null where tenant_id = ${T} and number = ${D}`
      })

      await t.step('bulk confirm skips the high-risk order and says so; the server decides, not the page', async () => {
        await p.goto(CONSOLE + '/console/orders')
        for (const n of [A, B, C]) await row(n).getByRole('checkbox').check()
        await p.getByRole('region', { name: 'Selected orders' }).getByRole('button', { name: 'Confirm' }).click()
        await p.locator('[data-toast]', { hasText: 'Confirmed 2. Skipped 1 high-risk order — open it to decide.' }).waitFor()
        assert.deepEqual([(await state(A)).confirmed, (await state(B)).confirmed, (await state(C)).confirmed], [true, true, false])
        // Undo the bulk confirm: one request (undoMany), both back in To confirm (impact review 2026-11-07).
        await p.locator('[data-toast]', { hasText: 'Confirmed 2.' }).getByRole('button', { name: 'Undo' }).click()
        await until(async () => !(await state(A)).confirmed && !(await state(B)).confirmed)
        // Confirm them again: the next steps start from here.
        await p.goto(CONSOLE + '/console/orders')
        for (const n of [A, B]) await row(n).getByRole('checkbox').check()
        await p.getByRole('region', { name: 'Selected orders' }).getByRole('button', { name: 'Confirm' }).click()
        await until(async () => (await state(A)).confirmed && (await state(B)).confirmed)
      })

      await t.step('c on a high-risk order opens it instead of confirming', async () => {
        await p.goto(CONSOLE + '/console/orders')
        await row(C).getByRole('cell').nth(2).click()
        await p.keyboard.press('c')
        await p.waitForURL(new RegExp(`/console/orders/${C}$`))
        assert.equal((await state(C)).confirmed, false)
      })

      await t.step('two people, one order: the second is told who confirmed it', async () => {
        const other = await signedIn(t.browser, 'owner')
        const q = await other.newPage()
        await p.goto(CONSOLE + '/console/orders'); await q.goto(CONSOLE + '/console/orders')
        await row(D).waitFor(); await q.getByRole('row').filter({ hasText: label(D) }).waitFor()
        await row(D).getByRole('cell').nth(2).click(); await p.keyboard.press('c')
        await until(async () => (await state(D)).confirmed)
        await q.getByRole('row').filter({ hasText: label(D) }).getByRole('cell').nth(2).click(); await q.keyboard.press('c')
        await q.locator('[data-toast]', { hasText: /Already confirmed by riya@kesarstudio\.in at/ }).waitFor()
        await other.close()
      })

      await t.step('search by name, by the last digits of a phone, by number; nothing found says so', async () => {
        await p.goto(CONSOLE + '/console/orders?tab=all')
        await p.getByLabel('Search orders').fill('Queue Aarti'); await p.getByLabel('Search orders').press('Enter')
        await p.waitForURL(/q=Queue/); assert.equal(await p.locator('tbody tr').count(), 3)
        await p.getByLabel('Search orders').fill('9811100001'); await p.getByLabel('Search orders').press('Enter')
        await p.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3); await row(A).waitFor() // a phone: that customer's orders
        await p.getByLabel('Search orders').fill(label(B)); await p.getByLabel('Search orders').press('Enter')
        // Results follow the keys (N1c): wait for the list to become the one order, not for a row already on screen.
        await p.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1); await row(B).waitFor() // the number, not D's phone that contains it
        // A search link past its last page (results shrank): its first page, and the pager says so.
        await p.goto(CONSOLE + `/console/orders?tab=all&q=${encodeURIComponent('Queue Aarti')}&page=3`)
        await row(A).waitFor(); assert.equal(await p.locator('tbody tr').count(), 3)
        assert.equal(await p.getByText(/Showing 4–/).count(), 0)
        await p.getByLabel('Search orders').fill('nobody-like-this'); await p.getByLabel('Search orders').press('Enter')
        await p.getByText('No order matches “nobody-like-this”').waitFor() // says what it searched (N1c, as drawn)
      })

      await t.step('? lists only the keys this screen has', async () => {
        await p.goto(CONSOLE + '/console/orders'); await p.locator('main').click({ position: { x: 5, y: 5 } })
        await p.keyboard.press('?'); const sheet = p.getByRole('dialog', { name: 'Keyboard shortcuts' }); await sheet.waitFor()
        assert.equal(await sheet.getByText('Print the packing slip').count(), 0) // not wired until 1D·5
        await p.keyboard.press('Escape')
      })

      await t.step('phone: rows, nothing scrolls sideways, an empty tab says what lands there', async () => {
        await p.setViewportSize({ width: 390, height: 844 })
        await p.goto(CONSOLE + '/console/orders?tab=on_hold')
        if (await count('On hold') === 0) await p.getByText('Nothing on hold').waitFor()
        await p.goto(CONSOLE + '/console/orders?tab=all')
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll at 390')
        await p.screenshot({ path: t.out('phone'), fullPage: false })
      })
    } catch (e) {
      await p.screenshot({ path: t.out('FAILED'), fullPage: true }).catch(() => {}) // before the context closes below
      throw e
    } finally {
      await owner.close()
      await db`delete from orders where tenant_id = ${T} and number between ${A} and ${D}`
    }
  },
}
