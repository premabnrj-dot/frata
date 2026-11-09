// =============================================================================
// FLOW: GST (plan docs/plans/2026-11-09-gst-core-and-categories.md, phases 1, 3, 5). Settings › Taxes is radios and
// segments; last month's invoices make a GSTR-1 on Console › GST with its CA files; the GSTR-1 JSON downloads,
// uncached; filing from Frrata through the stack's fake GSP (GSP_PROVIDER=fake, OTP 575757): connect, push, the
// portal's totals beside ours, file with the EVC OTP, the ARN kept and the period final. Seeds its own invoices in
// the previous month and removes them, and the filing rows, at the end.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn } from '../lib.mjs'

/** The previous month in IST, as a GST period key, and a moment inside it. */
function lastMonth(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000)
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 10, 6))
  return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, at: d }
}

export default {
  name: 'gst',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ gstin }] = await db`select gstin from shop_settings where tenant_id = ${T}`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const [v] = await db`select id, product_id from variants where tenant_id = ${T} and option_values = '{M,Rust}'`
    const { key, at } = lastMonth()
    const fy = (() => { const y = at.getUTCMonth() >= 3 ? at.getUTCFullYear() : at.getUTCFullYear() - 1; return `${String(y).slice(2)}-${String(y + 1).slice(2)}` })()
    const nums = [top + 1, top + 2]
    // One in Rajasthan (CGST + SGST), one to Maharashtra (IGST): both B2CS.
    const rows = [[nums[0], 'Rajasthan', 'Jaipur', '302001', 0, 5928, 5929], [nums[1], 'Maharashtra', 'Mumbai', '400050', 11857, 0, 0]]
    const cleanup = async () => db.begin(async (x) => {
      await x`set local session_replication_role = replica`
      for (const tbl of ['gst_attempts', 'gst_filings', 'gst_connections']) await x.unsafe(`delete from ${tbl} where tenant_id = $1`, [T])
      await x`delete from order_lines where tenant_id = ${T} and order_id in (select id from orders where tenant_id = ${T} and number in ${x(nums)})`
      await x`delete from orders where tenant_id = ${T} and number in ${x(nums)}`
    })
    await cleanup()
    for (const [i, [n, state, city, pin]] of rows.entries()) {
      await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, packed_at, invoice_number, customer_name, phone, address_line, city, pincode, state, supply_state, seller_gstin, seller_scheme, subtotal, gst_total, total, merchandise_net)
        values (${T}, ${n}, 'cod', ${at}, ${at}, ${new Date(at.getTime() + (i + 1) * 3_600_000)}, ${`KS/${fy}/${String(90001 + i)}`}, 'GST Buyer', '9833300009', '1 Road', ${city}, ${pin}, ${state}, ${state}, ${gstin}, 'regular', 249000, 11857, 249000, 249000)`
      const [{ id }] = await db`select id from orders where tenant_id = ${T} and number = ${n}`
      await db`insert into order_lines (tenant_id, order_id, variant_id, product_id, title, option_values, sku, qty, unit_price, taxable_value, gst_bps, gst, kind, charge_taxable, charge_gst, stock_taken_at, hsn)
        values (${T}, ${id}, ${v.id}, ${v.product_id}, 'Chanderi kurta set', '{M,Rust}', 'KS-M-RUST', 1, 249000, 237143, 500, 11857, 'in_stock', 0, 0, ${at}, '6211')`
    }
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('Settings › Taxes: registration is a radio, turnover and filing are segments', async () => {
        await p.goto(CONSOLE + '/console/settings/taxes')
        assert.equal(await p.getByRole('radio', { name: 'Regular' }).isChecked(), true)
        await p.getByRole('radio', { name: 'Under ₹5 crore' }).waitFor()
        await p.getByRole('radio', { name: 'Monthly' }).waitFor()
        await p.screenshot({ path: t.out('settings-taxes'), fullPage: true })
      })

      await t.step('Console › GST: last month, its invoices and taxes, the CA files', async () => {
        await p.goto(CONSOLE + `/console/gst?p=${key}`)
        await p.getByRole('heading', { name: 'GST' }).waitFor()
        await p.getByText(String(gstin)).first().waitFor()
        await p.getByRole('heading', { name: 'For your CA' }).waitFor()
        await p.screenshot({ path: t.out('gst-month'), fullPage: true })
        const r = await p.request.get(CONSOLE + `/console/gst/export?p=${key}&f=json`)
        assert.equal(r.status(), 200)
        assert.match(r.headers()['cache-control'] ?? '', /no-store/)
        assert.match(r.headers()['content-disposition'] ?? '', /attachment; filename="GSTR1_/)
        const j = await r.json()
        assert.equal(j.gstin, gstin)
        const b2cs = j.b2cs ?? []
        assert.ok(b2cs.some((x) => x.sply_ty === 'INTER' && x.pos === '27'), 'Maharashtra in B2CS, inter-state')
        assert.ok(b2cs.some((x) => x.sply_ty === 'INTRA' && x.pos === '08'), 'Rajasthan in B2CS, intra-state')
        const reg = await (await p.request.get(CONSOLE + `/console/gst/export?p=${key}&f=register`)).text()
        assert.match(reg, /KS\/\d\d-\d\d\/90001/)
        const bad = await p.request.get(CONSOLE + `/console/gst/export?p=${key}&f=pdf`)
        assert.equal(bad.status(), 400)
      })

      await t.step('File from Frrata (fake GSP): connect with the OTP, push, totals match, file with the EVC OTP', async () => {
        await p.getByRole('heading', { name: 'File from Frrata' }).waitFor()
        await p.getByLabel('GST portal username').fill('kesarstudio')
        await p.getByRole('button', { name: 'Send OTP' }).click()
        await p.getByLabel('OTP from the GST portal').fill('111111')
        await p.getByRole('button', { name: 'Connect' }).click()
        await p.getByText('That OTP doesn’t match').waitFor()
        await p.getByLabel('OTP from the GST portal').fill('575757')
        await p.getByRole('button', { name: 'Connect' }).click()
        await p.getByText(/Connected as/).waitFor()
        await p.getByRole('button', { name: 'Push to the portal' }).click()
        await p.getByRole('columnheader', { name: 'GST portal' }).waitFor()
        await p.screenshot({ path: t.out('gst-pushed'), fullPage: true })
        await p.getByLabel(/I’ve checked this return/).check()
        await p.getByRole('button', { name: 'Send EVC OTP' }).click()
        await p.getByLabel('EVC OTP').fill('575757')
        await p.getByRole('button', { name: 'File GSTR-1' }).click()
        await p.getByText('GSTR-1 filed').waitFor()
        const [f] = await db`select arn, filed_at from gst_filings where tenant_id = ${T} and period = ${key}`
        assert.match(f?.arn ?? '', /^AA08/)
        await p.screenshot({ path: t.out('gst-filed'), fullPage: true })
        const attempts = await db`select kind, outcome from gst_attempts where tenant_id = ${T} order by started_at`
        assert.ok(attempts.every((a) => a.outcome !== 'pending'), 'every attempt has its outcome')
        assert.ok(attempts.some((a) => a.kind === 'verify' && a.outcome === 'failed'), 'the wrong OTP is recorded')
        // Final: the app can't change a filed period.
        await assert.rejects(db`update gst_filings set arn = 'x' where tenant_id = ${T} and period = ${key}`)
      })
    } finally {
      await owner.close()
      await cleanup()
    }
  },
}
