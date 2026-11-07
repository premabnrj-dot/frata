// =============================================================================
// FLOW: orders-count — a shop past one page of orders. The Orders page once
// read only the newest 100 and counted "to confirm" from them: with 300 orders
// it said 14 while 43 waited (stress test 2026-11-07). The count must cover
// every order, and every order must be reachable.
// Leaves its orders behind, so it runs after checkout (10-) and cleans up last.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn } from '../lib.mjs'

export default {
  name: 'orders-count',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const ctx = await signedIn(t.browser, 'owner')
    const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    // What the page counts before: under one page of orders, so the old code counted it right too.
    await p.goto(CONSOLE + '/console/orders')
    const shown = async () => Number((await p.locator('main p').first().textContent())?.match(/([\d,]+) to confirm/)?.[1]?.replace(/,/g, '') ?? 0)
    const before = await shown()
    // 130 COD orders waiting to be confirmed (older than anything already there), 20 confirmed, 5 online and never paid.
    await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, customer_name, city, subtotal, total)
      select ${T}, ${top} + i, 'cod', now() - interval '30 days' - i * interval '1 minute',
        case when i > 130 then now() - interval '29 days' end, 'Stress ' || i, 'Jaipur', 249000, 249000
      from generate_series(1, 150) i`
    await db`insert into orders (tenant_id, number, payment_method, placed_at, pay_by, customer_name, subtotal, total)
      select ${T}, ${top} + 150 + i, 'prepaid', now() - interval '31 days', now() - interval '31 days' + interval '20 minutes', 'Unpaid ' || i, 99000, 99000
      from generate_series(1, 5) i`
    // A cancelled online order never paid: in neither list and neither count (the list and its count share one predicate).
    await db`insert into orders (tenant_id, number, payment_method, placed_at, pay_by, cancelled_at, customer_name, subtotal, total)
      values (${T}, ${top} + 156, 'prepaid', now() - interval '32 days', now() - interval '32 days' + interval '20 minutes', now() - interval '31 days', 'Cancelled unpaid', 99000, 99000)`
    // placedSql's rule, which is simple enough to restate here: not an online order still without payment or a switch to COD.
    const [{ placed }] = await db`select count(*)::int placed from orders where tenant_id = ${T} and not (payment_method = 'prepaid' and paid_at is null and switched_to_cod_at is null)`
    const toConfirm = before + 130
    assert.ok(placed > 100, `seeded past one page: ${placed} placed`)

    try {
    await t.step('the count covers every order, not the first page', async () => {
      await p.goto(CONSOLE + '/console/orders')
      assert.equal(await shown(), toConfirm)
      await p.getByText(`Showing 1–100 of ${placed.toLocaleString('en-IN')}, newest first`).waitFor()
      assert.equal(await p.locator('tbody tr').count(), 100)
      await p.getByRole('link', { name: '5 online orders not paid' }).waitFor()
      assert.equal(await p.getByText('Cancelled unpaid').count(), 0)
      await p.screenshot({ path: t.out('page1'), fullPage: false })
    })
    await t.step('older orders are reachable, page by page', async () => {
      const pages = Math.ceil(placed / 100)
      for (let n = 2; n <= pages; n++) {
        await p.getByRole('link', { name: 'Older' }).click()
        await p.getByText(`Showing ${(n - 1) * 100 + 1}–`).waitFor()
      }
      assert.equal(await p.getByRole('link', { name: 'Older' }).count(), 0)
      await p.getByText(`Stress 150`).waitFor()
      assert.equal(await p.locator('tbody tr').count(), placed - (pages - 1) * 100)
    })
    await t.step('unpaid online orders are listed apart and never counted to confirm', async () => {
      await p.goto(CONSOLE + '/console/orders?show=unpaid')
      await p.getByText('Unpaid 1').waitFor()
      assert.equal(await p.locator('tbody tr').count(), 5)
      assert.equal(await p.getByText('Cancelled unpaid').count(), 0)
      assert.equal(await shown(), toConfirm)
    })
    await t.step('a page number past the end or not a number shows a real page', async () => {
      await p.goto(CONSOLE + '/console/orders?page=1e400')
      await p.getByText('Showing 1–100 of').waitFor()
      await p.goto(CONSOLE + '/console/orders?page=99')
      await p.getByText(`Stress 150`).waitFor()
    })
    } finally {
      await ctx.close()
      await db`delete from orders where tenant_id = ${T} and number > ${top}`
    }
  },
}
