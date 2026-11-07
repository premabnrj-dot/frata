// =============================================================================
// FLOW: cleaner screens (1D·6) — explanation lives behind an (i) that opens on
// click and closes on Esc; the passages that used to sit under fields are
// gone; limits and money stay visible as one line; an open shop cannot save
// its grievance officer empty (and the database keeps the old one).
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn } from '../lib.mjs'

export default {
  name: 'cleaner',
  async run(t) {
    const { db } = t
    const [{ id: T }] = await db`select id from tenants where slug = 'kesar-studio'`
    const [before] = await db`select grievance_name, published_at from shop_settings where tenant_id = ${T}`
    assert.ok(before.published_at, 'the seed shop is open')
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('the product editor: (i) tips, not passages; a tip opens on click and closes on Esc', async () => {
        await p.goto(CONSOLE + '/console/products/chanderi-kurta-set')
        await p.getByRole('heading', { name: 'Sizes, colours and stock' }).waitFor()
        for (const gone of ['Photos are resized on your phone', 'Price, stock and SKU live here', 'An empty SKU is made for you when you save (shown in grey); type', 'From the standard list Google and Meta read. It decides'])
          // Visible text only: a passage that moved into an (i) is still in the page, hidden until opened.
          assert.equal(await p.getByText(gone).filter({ visible: true }).count(), 0, `"${gone}" is still on the page`)
        const tip = p.getByRole('button', { name: 'About sizes, colours and stock' })
        await tip.click()
        await p.getByText('Your cost is never shown to shoppers').waitFor()
        await p.keyboard.press('Escape')
        await p.getByText('Your cost is never shown to shoppers').waitFor({ state: 'hidden' })
        await p.screenshot({ path: t.out('product-editor'), fullPage: true })
      })

      await t.step('Settings → Pay on delivery: money and limits stay one visible line; the why is behind (i)', async () => {
        await p.goto(CONSOLE + '/console/settings/payments')
        await p.getByText('0 for none.').waitFor()
        assert.equal(await p.getByText('never added later').isVisible(), false)
        await p.getByRole('button', { name: 'About pay on delivery fee, ₹' }).click()
        await p.getByText('Shown as its own line before the shopper orders, never added later.').waitFor()
        await p.screenshot({ path: t.out('settings-payments'), fullPage: true })
      })

      await t.step('an open shop cannot empty its grievance officer: said beside the field, nothing saved', async () => {
        await p.goto(CONSOLE + '/console/settings/contact')
        await p.locator('#f-grievanceName').fill('')
        await p.getByRole('button', { name: /^Save/ }).first().click()
        await p.getByText('Your shop is open: keep the grievance officer’s name.').waitFor()
        const [after] = await db`select grievance_name from shop_settings where tenant_id = ${T}`
        assert.equal(after.grievance_name, before.grievance_name)
      })
    } finally {
      await owner.close()
    }
  },
}
