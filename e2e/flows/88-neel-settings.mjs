// =============================================================================
// FLOW: neel-settings (Neel N2b·3, owner 2026-11-15) — Settings in five groups: pick a group, its pages appear; a page
// names its group and shows the group's tabs; old addresses redirect. Pay on delivery as drawn: PIN codes as chips, the
// one PIN code its returns suggest (taken, then recorded on the save), the At checkout card, the save bar's count and
// Ctrl+S. The phone: groups first, then the group's pages. Seeds its own orders and puts everything back.
// =============================================================================
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { CONSOLE, expectToast, signedIn } from '../lib.mjs'

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  return p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
}

export default {
  name: 'neel-settings',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [{ cod_blocked_pincodes: before }] = await db`select cod_blocked_pincodes from shop_settings where tenant_id = ${T}`
    await db`update shop_settings set cod_blocked_pincodes = '{}' where tenant_id = ${T}`
    const [{ top }] = await db`select coalesce(max(number), 1000)::int top from orders where tenant_id = ${T}`
    const days = (n) => new Date(Date.now() - n * 86_400_000)
    // Twelve orders to 302012 that reached an outcome, eight of them came back: far above the store's own share.
    // And twenty delivered elsewhere: the store's own share (8 of 32) is what the PIN code is measured against.
    const nums = Array.from({ length: 32 }, (_, i) => top + 1 + i)
    for (const [i, n] of nums.entries()) {
      const back = i < 8, jaipur = i < 12
      await db`insert into orders (tenant_id, number, payment_method, placed_at, confirmed_at, packed_at, invoice_number, shipped_at, delivered_at, rto_initiated_at, customer_name, phone, address_line, city, pincode, state, subtotal, total)
        values (${T}, ${n}, 'cod', ${days(40)}, ${days(40)}, ${days(39)}, ${'SET-' + n}, ${days(39)}, ${back ? null : days(35)}, ${back ? days(34) : null}, 'Settings Shopper', ${'98333' + String(n).padStart(5, '0').slice(-5)}, 'X',
          ${jaipur ? 'Jaipur' : 'Indore'}, ${jaipur ? '302012' : '452018'}, ${jaipur ? 'Rajasthan' : 'Madhya Pradesh'}, 100000, 100000)`
    }
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('pick a group, its pages appear; a page names its group and shows its tabs', async () => {
        await p.goto(`${CONSOLE}/console/settings`)
        const groups = p.getByRole('navigation', { name: 'Settings groups' })
        for (const g of ['Store', 'Checkout', 'Business and tax', 'Messages', 'Team and plan']) await groups.getByRole('link', { name: new RegExp(`^${g}`) }).waitFor()
        await groups.getByRole('link', { name: /^Checkout/ }).click()
        await p.waitForURL(/group=checkout/)
        const pages = p.getByRole('navigation', { name: 'Checkout' })
        for (const pg of ['Online payments', 'Pay on delivery', 'Shipping and delivery']) await pages.getByRole('link', { name: new RegExp(`^${pg}`) }).waitFor()
        await p.screenshot({ path: 'e2e/.out/88-settings-1280.png', fullPage: true })
        const v = await audit(p); assert.deepEqual(v, [], `axe: ${v.join('; ')}`)
        await pages.getByRole('link', { name: /^Pay on delivery/ }).click()
        await p.getByRole('heading', { level: 1, name: 'Pay on delivery' }).waitFor()
        await p.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Checkout' }).waitFor()
        assert.equal(await p.getByRole('navigation', { name: 'Checkout' }).getByRole('link', { name: 'Pay on delivery' }).getAttribute('aria-current'), 'page')
      })

      await t.step('Pay on delivery as drawn: chips, the suggestion taken and recorded, At checkout, the save bar', async () => {
        await p.getByRole('heading', { name: 'At checkout' }).waitFor()
        await p.getByText('Cash or UPI to the courier', { exact: true }).waitFor()
        const box = p.getByRole('textbox', { name: 'PIN codes without Pay on delivery' })
        await box.fill('800001'); await box.press('Enter')
        await p.getByRole('button', { name: 'Remove 800001' }).waitFor()
        await p.getByText(/\(8 of 12 came back\)/).waitFor()
        await p.getByRole('button', { name: 'add 302012' }).click()
        await p.getByRole('button', { name: 'Remove 302012' }).waitFor()
        assert.equal(await p.getByRole('button', { name: 'add 302012' }).count(), 0, 'a PIN code listed is not suggested again')
        assert.equal(await p.locator('[role="region"][aria-label="Unsaved changes"] b').textContent(), '1 unsaved change')
        await p.screenshot({ path: 'e2e/.out/88-cod-1280.png', fullPage: true })
        const v = await audit(p); assert.deepEqual(v, [], `axe: ${v.join('; ')}`)
        await p.locator('body').click({ position: { x: 5, y: 5 } })
        await p.keyboard.press('Control+s')
        await expectToast(p, 'Saved. Your store shows it now.', 'ok')
        const [{ cod_blocked_pincodes: now }] = await db`select cod_blocked_pincodes from shop_settings where tenant_id = ${T}`
        assert.deepEqual([...now].sort(), ['302012', '800001'])
        const [ev] = await db`select detail from audit_events where tenant_id = ${T} and action = 'settings.payments' order by at desc limit 1`
        assert.equal(ev.detail.suggestedPin, '302012', 'the suggestion taken is recorded')
      })

      await t.step('old addresses go to the page that holds their fields now', async () => {
        for (const [old, now] of [['taxes', 'business'], ['brand', 'store'], ['documents', 'invoices'], ['address', 'web-address']]) {
          await p.goto(`${CONSOLE}/console/settings/${old}`)
          await p.waitForURL(new RegExp(`/console/settings/${now}$`))
        }
      })

      await t.step('the phone: the groups, then one group\'s pages; nothing scrolls sideways', async () => {
        await p.setViewportSize({ width: 390, height: 844 })
        await p.goto(`${CONSOLE}/console/settings`)
        const groups = p.getByRole('navigation', { name: 'Settings groups' })
        await groups.getByRole('link', { name: /^Checkout/ }).waitFor()
        assert.equal(await p.getByRole('navigation', { name: 'Checkout' }).isVisible(), false, 'no group open before one is picked')
        await p.screenshot({ path: 'e2e/.out/88-settings-390.png', fullPage: true })
        await groups.getByRole('link', { name: /^Checkout/ }).click()
        await p.getByRole('navigation', { name: 'Checkout' }).getByRole('link', { name: /^Pay on delivery/ }).waitFor()
        assert.equal(await groups.isVisible(), false, 'the groups step aside')
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 391), 'nothing scrolls sideways')
        await p.screenshot({ path: 'e2e/.out/88-group-390.png', fullPage: true })
        await p.goto(`${CONSOLE}/console/settings/payments`)
        await p.getByRole('heading', { level: 1, name: 'Pay on delivery' }).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 391), 'nothing scrolls sideways')
        await p.screenshot({ path: 'e2e/.out/88-cod-390.png', fullPage: true })
      })
    } finally {
      await owner.close()
      await db`update shop_settings set cod_blocked_pincodes = ${before} where tenant_id = ${T}`
      await db`delete from orders where tenant_id = ${T} and number = any(${nums})`
    }
  },
}
