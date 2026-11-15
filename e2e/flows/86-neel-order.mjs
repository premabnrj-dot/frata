// =============================================================================
// FLOW: neel-order (Neel N2b·1) — the order page as drawn: the top line in money with the COD risk chip, What you keep
// for the owner (never for staff), the couriers this store used with their came-back counts (picking one fills the
// courier), one Activity timeline with a note, the phone, axe. Seeds its own orders and removes them.
// =============================================================================
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { todayAgo, CONSOLE, signedIn, USERS } from '../lib.mjs'

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  return p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
}

export default {
  name: 'neel-order',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const N = top + 1, D1 = top + 2, D2 = top + 3
    const days = (n) => new Date(Date.now() - n * 86_400_000)
    // The order to look at: packed Pay on delivery (shipping is chosen once it is packed), its goods' cost known.
    await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, packed_at, invoice_number, customer_name, phone, address_line, city, pincode, state, subtotal, total, gst_total, merchandise_net, cogs)
      values (${T}, ${N}, 'cod', ${todayAgo(30)}, ${todayAgo(20)}, ${todayAgo(10)}, ${'NEEL-' + N}, 'Neel Ananya', '9833300001', '14, Boring Road', 'Patna', '800001', 'Bihar', 249000, 249000, 11857, 237143, 99000)`
    // Two older orders shipped with Delhivery: one delivered, one came back.
    await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, packed_at, invoice_number, shipped_at, delivered_at, rto_initiated_at, customer_name, phone, address_line, city, pincode, state, subtotal, total)
      values (${T}, ${D1}, 'cod', ${days(20)}, ${days(20)}, ${days(19)}, ${'NEEL-' + D1}, ${days(19)}, ${days(15)}, null, 'Neel Old', '9833300002', 'X', 'Patna', '800001', 'Bihar', 100000, 100000),
             (${T}, ${D2}, 'cod', ${days(20)}, ${days(20)}, ${days(19)}, ${'NEEL-' + D2}, ${days(19)}, null, ${days(14)}, 'Neel Old', '9833300003', 'X', 'Patna', '800001', 'Bihar', 100000, 100000)`
    for (const n of [D1, D2]) {
      const [{ id }] = await db`select id from orders where tenant_id = ${T} and number = ${n}`
      await db`insert into shipments (tenant_id, order_id, provider, courier_name, tracking_number) values (${T}, ${id}, 'self', 'Delhivery', ${'AWB' + n})`
    }
    await db`insert into members (tenant_id, user_id, role) values (${T}, ${USERS.staff.id}, 'staff') on conflict do nothing`
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('the top line says what to do in money, with the COD risk', async () => {
        await p.goto(`${CONSOLE}/console/orders/${N}`)
        const top = p.getByRole('region', { name: 'What to do' })
        await top.getByText(/^Collect ₹2,490 on delivery$/).waitFor()
        await top.getByText(/^COD risk: (low|medium|high)$/).waitFor()
      })
      await t.step('What you keep for the owner, in true words', async () => {
        const keep = p.getByRole('region', { name: 'What you keep' })
        await keep.getByText('If delivered').waitFor()
        await keep.getByText(/ads and packaging\./).waitFor()
        await keep.getByText(/Set your shipping costs to see what a return costs\.|^Courier both ways\./).waitFor()
      })
      await t.step('the couriers this store used, with their came-back counts; picking one fills the courier', async () => {
        const ship = p.getByRole('region', { name: 'Shipping' })
        await ship.getByText('1 of 2 of your orders came back').waitFor()
        await ship.getByRole('radio', { name: /Delhivery/ }).check()
        assert.equal(await ship.getByLabel('Courier', { exact: true }).inputValue(), 'Delhivery')
      })
      await t.step('one Activity timeline: a note shows there with its text', async () => {
        const act = p.getByRole('region', { name: 'Activity' })
        await act.getByLabel(/note/i).fill('Call after 6 pm, N2b')
        await act.getByRole('button', { name: 'Add note' }).click()
        await act.getByRole('listitem').filter({ hasText: 'Call after 6 pm, N2b' }).waitFor()
        await p.screenshot({ path: 'e2e/.out/86-order-1280.png', fullPage: true })
        const v = await audit(p); assert.deepEqual(v, [], `axe: ${v.join('; ')}`)
      })
      await t.step('the phone: one column, nothing scrolls sideways', async () => {
        await p.setViewportSize({ width: 390, height: 844 }); await p.reload()
        await p.getByRole('region', { name: 'What to do' }).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 391), 'nothing scrolls sideways')
        await p.screenshot({ path: 'e2e/.out/86-order-390.png', fullPage: true })
      })
      await owner.close()
      await t.step('staff see the page without What you keep', async () => {
        const staff = await signedIn(t.browser, 'staff', { viewport: { width: 1280, height: 900 } })
        const s = await staff.newPage(); await s.goto(`${CONSOLE}/console/orders/${N}`)
        await s.getByRole('region', { name: 'What to do' }).waitFor()
        assert.equal(await s.getByRole('region', { name: 'What you keep' }).count(), 0)
        await staff.close()
      })
    } finally {
      await db`delete from shipments where tenant_id = ${T} and order_id in (select id from orders where tenant_id = ${T} and number between ${N} and ${D2})`
      await db`delete from order_notes where tenant_id = ${T} and order_id in (select id from orders where tenant_id = ${T} and number between ${N} and ${D2})`
      await db`delete from order_events where tenant_id = ${T} and order_id in (select id from orders where tenant_id = ${T} and number between ${N} and ${D2})`
      await db`delete from orders where tenant_id = ${T} and number between ${N} and ${D2}`
    }
  },
}
