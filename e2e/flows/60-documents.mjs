// =============================================================================
// FLOW: documents (1D·5) — the packing slip and the tax invoice as print pages.
// Mark packed issues the invoice number once; the order page's primary action
// then becomes Print packing slip and More offers Print invoice; a reprint
// shows the same number; CGST + SGST inside the seller's state, IGST outside;
// COD says what to collect, prepaid says collect nothing; the number fits 16
// characters; the queue prints a selection and `p` prints one; another shop's
// number prints nothing; never cached, no referrer. Seeds its own orders and
// removes them at the end.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn, until } from '../lib.mjs'

export default {
  name: 'documents',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const [{ prefix, gstin }] = await db`select order_prefix as prefix, gstin from shop_settings where tenant_id = ${T}`
    const [v] = await db`select id, product_id from variants where tenant_id = ${T} and option_values = '{M,Rust}'`
    const label = (n) => `${prefix || 'KS'}-${n}`
    const A = top + 1, B = top + 2 // A: COD in Rajasthan (the seller's state), confirmed; B: paid online, Maharashtra
    await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, customer_name, phone, address_line, area, city, pincode, state, supply_state, seller_gstin, subtotal, gst_total, total, merchandise_net) values
      (${T}, ${A}, 'cod', now() - interval '50 minutes', now() - interval '40 minutes', 'Doc Riya', '9833300001', 'B-14, Tilak Marg', 'C-Scheme', 'Jaipur', '302001', 'Rajasthan', 'Rajasthan', ${gstin}, 249000, 11857, 249000, 249000)`
    await db`insert into orders (tenant_id, number, payment_method, placed_at, paid_at, customer_name, phone, address_line, area, city, pincode, state, supply_state, seller_gstin, subtotal, gst_total, total, merchandise_net) values
      (${T}, ${B}, 'prepaid', now() - interval '30 minutes', now() - interval '29 minutes', 'Doc Kabir', '9833300002', '9, Rose Villa, Linking Road', 'Bandra West', 'Mumbai', '400050', 'Maharashtra', 'Maharashtra', ${gstin}, 249000, 11857, 249000, 249000)`
    for (const n of [A, B]) {
      const [{ id }] = await db`select id from orders where tenant_id = ${T} and number = ${n}`
      await db`insert into order_lines (tenant_id, order_id, variant_id, product_id, title, option_values, sku, qty, unit_price, taxable_value, gst_bps, gst, kind, charge_taxable, charge_gst, stock_taken_at)
        values (${T}, ${id}, ${v.id}, ${v.product_id}, 'Chanderi kurta set', '{M,Rust}', 'KS-M-RUST', 1, 249000, 237143, 500, 11857, 'in_stock', 0, 0, now())`
    }
    const invoiceOf = async (n) => (await db`select invoice_number from orders where tenant_id = ${T} and number = ${n}`)[0].invoice_number
    // Another shop's order: its number in the print link must print nothing.
    const OTHER = 'abababab-0000-4000-8000-00000000000b'
    await db`insert into tenants (id, slug, name) values (${OTHER}, 'flow-docs-other', 'Other Shop') on conflict do nothing`
    await db`insert into orders (tenant_id, number, payment_method, placed_at, customer_name, phone, subtotal, total) values (${OTHER}, ${top + 900}, 'cod', now(), 'Someone Else', '9833309999', 100, 100)`

    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    const pack = async (n) => {
      await p.goto(CONSOLE + `/console/orders/${n}`)
      await p.getByRole('button', { name: 'Mark packed' }).first().click()
      return until(() => invoiceOf(n))
    }
    try {
      let invA
      await t.step('Mark packed issues the invoice number once, ≤ 16 characters; the primary action becomes Print packing slip', async () => {
        invA = await pack(A)
        assert.ok(invA.length <= 16, `${invA} is over 16 characters`)
        assert.match(invA, /^[A-Z0-9]{1,4}\/\d\d-\d\d\/\d{5}$/, 'a tax invoice (registered shop): no B in the counter')
        await p.getByRole('link', { name: 'Print packing slip' }).first().click()
        await p.waitForURL(new RegExp(`/console/orders/print\\?kind=slip&n=${A}$`))
      })

      await t.step('the slip: the order number with its barcode, what to collect, who it goes to; not cached, no referrer', async () => {
        const r = await p.reload()
        assert.match(r.headers()['cache-control'] ?? '', /no-store/)
        assert.equal(await p.locator('meta[name="referrer"]').getAttribute('content'), 'no-referrer')
        await p.getByRole('heading', { name: 'Packing slip' }).waitFor()
        await p.getByRole('img', { name: `Barcode ${label(A)}` }).waitFor()
        await p.getByText('Collect ₹2,490').waitFor()
        const to = p.getByRole('region', { name: 'Deliver to' })
        await to.getByText('Doc Riya').waitFor(); await to.getByText('9833300001').waitFor()
        await p.getByRole('cell', { name: 'KS-M-RUST' }).waitFor()
        await p.screenshot({ path: t.out('slip'), fullPage: true })
        // On paper: the slip alone — no nav, no Print button.
        await p.emulateMedia({ media: 'print' })
        assert.equal(await p.getByRole('button', { name: 'Print' }).isVisible(), false)
        assert.equal(await p.getByRole('link', { name: 'Orders' }).first().isVisible(), false)
        await p.getByRole('img', { name: `Barcode ${label(A)}` }).waitFor()
        await p.screenshot({ path: t.out('slip-print'), fullPage: true })
        await p.emulateMedia({ media: 'screen' })
      })

      await t.step('More → Print invoice: a tax invoice with CGST and SGST (same state); reprinting shows the same number', async () => {
        await p.goto(CONSOLE + `/console/orders/${A}`)
        await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: 'Print invoice' }).click()
        await p.waitForURL(new RegExp(`kind=invoice&n=${A}$`))
        await p.getByRole('heading', { name: 'Tax invoice' }).waitFor()
        await p.getByText(invA, { exact: true }).waitFor()
        await p.getByRole('columnheader', { name: 'CGST' }).waitFor(); await p.getByRole('columnheader', { name: 'SGST' }).waitFor()
        assert.equal(await p.getByRole('columnheader', { name: 'IGST' }).count(), 0)
        await p.screenshot({ path: t.out('invoice-intra'), fullPage: true })
        await p.reload(); await p.getByText(invA, { exact: true }).waitFor()
        assert.equal(await invoiceOf(A), invA, 'printing never issues a second number')
      })

      await t.step('paid online, another state: the slip says collect nothing; the invoice charges IGST', async () => {
        const invB = await pack(B)
        assert.notEqual(invB, invA)
        await p.goto(CONSOLE + `/console/orders/print?kind=slip&n=${B}`)
        await p.getByText('Prepaid — collect nothing').waitFor()
        assert.equal(await p.getByText(/^Collect ₹/).count(), 0)
        await p.goto(CONSOLE + `/console/orders/print?kind=invoice&n=${B}`)
        await p.getByRole('columnheader', { name: 'IGST' }).waitFor()
        assert.equal(await p.getByRole('columnheader', { name: 'CGST' }).count(), 0)
        await p.getByText('Place of supply: Maharashtra (27)').waitFor()
      })

      await t.step('PDFs (Documents D1): the slip and the invoice download branded, never cached; the same invoice number every time', async () => {
        await p.goto(CONSOLE + `/console/orders/${A}`)
        await p.getByRole('button', { name: 'More' }).click()
        const link = p.getByRole('menuitem', { name: 'Download invoice (PDF)' })
        assert.equal(await link.getAttribute('download'), '', 'the menu item downloads')
        const get = (q) => p.context().request.get(CONSOLE + `/console/orders/pdf?${q}`)
        const inv1 = await get(`kind=invoice&n=${A}`)
        assert.equal(inv1.status(), 200)
        assert.equal(inv1.headers()['content-type'], 'application/pdf')
        assert.match(inv1.headers()['cache-control'], /no-store/)
        assert.match(inv1.headers()['content-disposition'], new RegExp(`Tax invoice ${invA.replaceAll('/', '-')}\\.pdf`))
        const body = await inv1.body()
        assert.equal(body.subarray(0, 5).toString(), '%PDF-')
        const inv2 = await get(`kind=invoice&n=${A}`)
        assert.equal(inv2.headers()['content-disposition'], inv1.headers()['content-disposition'], 'a second download is the same invoice')
        assert.equal(await invoiceOf(A), invA, 'a download never issues a number')
        const slips = await get(`kind=slip&size=label&n=${A},${B}`)
        assert.equal(slips.status(), 200)
        assert.match((await slips.body()).toString('latin1'), /MediaBox \[0 0 288 432\]/, 'a 4×6 label')
        assert.match(slips.headers()['content-disposition'], /Packing slips \d{4}-\d{2}-\d{2} \(2\)\.pdf/)
        assert.equal((await get(`kind=slip&n=${top + 900}`)).status(), 404, "another shop's number makes nothing")
      })

      await t.step('the queue: select two, Print 2 slips opens both in order; p on a row prints its slip', async () => {
        await p.goto(CONSOLE + '/console/orders?tab=all')
        await p.getByRole('checkbox', { name: `Select ${label(A)}` }).check()
        await p.getByRole('checkbox', { name: `Select ${label(B)}` }).check()
        await p.getByRole('link', { name: 'Print 2 slips' }).click()
        await p.getByRole('heading', { name: '2 packing slips' }).waitFor()
        assert.equal(await p.locator('article').count(), 2)
        await p.goto(CONSOLE + '/console/orders?tab=all')
        await p.getByRole('row').filter({ hasText: label(B) }).getByRole('cell').nth(2).click()
        await p.keyboard.press('p'); await p.waitForURL(new RegExp(`kind=slip&n=${B}$`))
        await p.getByRole('img', { name: `Barcode ${label(B)}` }).waitFor()
      })

      await t.step('cancelled after packing: the invoice is stamped CANCELLED with the same number; no slip is printed for it, and the page says why; p refuses', async () => {
        await p.goto(CONSOLE + `/console/orders/${A}`)
        await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: 'Cancel order…' }).click()
        const d = p.getByRole('dialog', { name: `Cancel ${label(A)}?` }); await d.waitFor()
        await d.getByLabel('Customer cancelled').check(); await d.getByRole('button', { name: 'Cancel order' }).click()
        await until(async () => (await db`select cancelled_at from orders where tenant_id = ${T} and number = ${A}`)[0].cancelled_at)
        await p.getByRole('button', { name: 'More' }).click()
        assert.equal(await p.getByRole('menuitem', { name: 'Print packing slip' }).count(), 0, 'no slip for a cancelled order')
        await p.getByRole('menuitem', { name: 'Print invoice' }).click()
        await p.getByText('CANCELLED', { exact: true }).waitFor(); await p.getByText(invA, { exact: true }).waitFor()
        assert.equal(await invoiceOf(A), invA)
        await p.goto(CONSOLE + `/console/orders/print?kind=slip&n=${A}`)
        // A typed link prints no slip for it, and says why (architecture review: the server decides, not the button).
        await p.getByText(new RegExp(`Not printed: ${label(A)} \\(cancelled\\)`)).waitFor()
        assert.equal(await p.getByText(/Prepaid — collect nothing|^Collect ₹/).count(), 0)
        await p.goto(CONSOLE + '/console/orders?tab=all')
        await p.getByRole('row').filter({ hasText: label(A) }).getByRole('cell').nth(2).click()
        await p.keyboard.press('p'); await p.locator('[data-toast]', { hasText: `${label(A)} has no packing slip` }).waitFor()
      })

      await t.step("another shop's number prints nothing", async () => {
        await p.goto(CONSOLE + `/console/orders/print?kind=slip&n=${top + 900}`)
        await p.getByText('Nothing to print').waitFor()
        assert.equal(await p.getByText('Someone Else').count(), 0)
      })

      await t.step('the slip at phone width: no sideways scroll', async () => {
        const phone = await signedIn(t.browser, 'owner', { viewport: { width: 390, height: 844 } })
        const q = await phone.newPage(); q.on('pageerror', (e) => t.errors.push(e.message))
        await q.goto(CONSOLE + `/console/orders/print?kind=slip&n=${B}`) // A is cancelled by now: it has no slip
        await q.getByRole('img', { name: `Barcode ${label(B)}` }).waitFor()
        const wide = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        await q.screenshot({ path: t.out('slip-phone'), fullPage: true })
        await phone.close()
        assert.ok(wide <= 1, `the page scrolls sideways by ${wide}px`)
      })
    } finally {
      await owner.close()
      await db`delete from orders where tenant_id = ${T} and number between ${A} and ${B}`
      await db`delete from orders where tenant_id = ${OTHER}`
      await db`delete from tenants where id = ${OTHER}`
    }
  },
}
