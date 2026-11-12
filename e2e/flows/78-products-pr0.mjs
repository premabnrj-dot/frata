// =============================================================================
// FLOW: products rework PR·0 (docs/specs/2026-11-13-products-rework.md) — the bugs the stress test found, fixed:
// - a new product takes its type from its name: "Girls' cotton kurta" gets kids' sizes and NOT the women's chart;
// - a draft saves while sizes are unpriced;
// - renaming a size keeps its price and stock;
// - the list finds it by name and says "No price"/"1 without a price".
// Guards: the shop's first type going to every new product; a rename wiping a row; a draft that cannot be saved.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const TITLE = "Girls' cotton kurta PR0"

export default {
  name: 'products-pr0',
  async run(t) {
    const { db } = t
    const cleanup = async () => {
      await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        await x`delete from variants where tenant_id = ${KESAR} and product_id in (select id from products where tenant_id = ${KESAR} and title like ${'%PR0'})`
        await x`delete from product_handle_history where tenant_id = ${KESAR} and product_id in (select id from products where tenant_id = ${KESAR} and title like ${'%PR0'})`.catch(() => {})
        await x`delete from products where tenant_id = ${KESAR} and title like ${'%PR0'}`
      })
    }
    await cleanup()
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    const save = async () => {
      await p.getByRole('button', { name: 'Discard' }).waitFor()
      await p.getByRole('button', { name: 'Save', exact: true }).click()
      await p.getByText('Unsaved changes').waitFor({ state: 'detached', timeout: 8_000 }).catch(async (e) => {
        await p.screenshot({ path: 'e2e/.out/78-save.png' })
        throw new Error(`Save stayed: ${(await p.locator('[role=alert],[role=status],[aria-invalid=true]').allInnerTexts()).join(' | ')} ${e.message}`)
      })
    }
    const product = async () => (await db`select id, type_id, option_values from products where tenant_id = ${KESAR} and title = ${TITLE}`)[0]
    const rows = async (id) => db`select option_values, price::int as price, stock from variants where tenant_id = ${KESAR} and product_id = ${id} and archived_at is null order by position`
    try {
      await t.step('Add "Girls\' cotton kurta": kids\' sizes, no type (the shop has no Kids type), never the women\'s chart', async () => {
        await p.goto(CONSOLE + '/console/products/new')
        await p.getByLabel('Name').fill(TITLE)
        // PR·2: the kind follows the name until one is picked.
        assert.equal(await p.getByRole('radio', { name: /^Kids/ }).isChecked(), true, 'the name says kids')
        await p.getByRole('button', { name: 'Create draft' }).click()
        await p.waitForURL(/\/console\/products\/girls-cotton-kurta-pr0/)
        const r = await product()
        assert.equal(r.type_id, null, 'no type: the women\'s kurta chart is the shop\'s first type and must not be taken')
        assert.deepEqual(r.option_values, [['2–3 Y', '3–4 Y', '4–5 Y']])
      })

      await t.step('A draft saves with one size priced and two not', async () => {
        await p.getByLabel('Price for 2–3 Y').fill('899')
        await p.getByLabel('Stock for 2–3 Y').fill('4')
        await save()
        const vs = await rows((await product()).id)
        assert.deepEqual(vs.map((v) => [v.price, v.stock]), [[89900, 4], [0, 0], [0, 0]])
      })

      await t.step('Renaming 2–3 Y to 2–3 Yrs keeps its price and stock', async () => {
        await p.getByRole('button', { name: 'Rename 2–3 Y' }).click()
        await p.getByLabel('Rename 2–3 Y').fill('2–3 Yrs')
        await p.getByLabel('Rename 2–3 Y').press('Enter')
        await save()
        const vs = await rows((await product()).id)
        assert.deepEqual(vs[0].option_values, ['2–3 Yrs']); assert.deepEqual([vs[0].price, vs[0].stock], [89900, 4])
      })

      await t.step('PR·2: Ctrl+S saves; an empty Details section is one line until opened', async () => {
        await p.locator('#desc').fill('Soft cotton, hand block printed.')
        // Ctrl+S presses Save; while the last save is still finishing the button is off, and so is the key.
        await p.waitForFunction(() => document.querySelector('button[aria-keyshortcuts]')?.disabled === false)
        await p.keyboard.press('Control+s')
        await p.getByText('Unsaved changes').waitFor({ state: 'detached', timeout: 8_000 })
        const [r] = await db`select description from products where tenant_id = ${KESAR} and title = ${TITLE}`
        assert.equal(r.description, 'Soft cotton, hand block printed.')
        const fold = p.getByRole('button', { name: /^Details/ })
        assert.equal(await fold.getAttribute('aria-expanded'), 'false')
        await fold.click()
        assert.equal(await fold.getAttribute('aria-expanded'), 'true')
      })

      await t.step('The list finds it by name and says one size has no price', async () => {
        await p.goto(CONSOLE + '/console/products?q=' + encodeURIComponent('cotton kurta PR0'))
        const row = p.getByRole('row').filter({ hasText: TITLE })
        await row.waitFor()
        await row.getByText('2 without a price').waitFor()
        await p.goto(CONSOLE + '/console/products?q=nothing-matches-this')
        await p.getByText('No product matches “nothing-matches-this”').waitFor()
      })
    } finally {
      await ctx.close()
      await cleanup()
    }
  },
}
