// =============================================================================
// FLOW: products PR·1 — the list (docs/plans/2026-11-13-products-pr1.md):
// - a tag finds its products;
// - Low stock shows a product with 1–3 left;
// - two selected → Archive → Undo puts both back;
// - Duplicate makes a draft copy;
// - Delete a never-live draft (asked first) → gone;
// - Delete a live one → offered Archive instead.
// Guards: a delete that takes a live or ordered product; an Undo that loses a status; selection that outlives its filter.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const T = 'PR1 '

export default {
  name: 'products-list',
  async run(t) {
    const { db } = t
    const cleanup = async () => {
      await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        await x`delete from variants where tenant_id = ${KESAR} and product_id in (select id from products where tenant_id = ${KESAR} and title like ${T + '%'})`
        await x`delete from product_handle_history where tenant_id = ${KESAR} and product_id in (select id from products where tenant_id = ${KESAR} and title like ${T + '%'})`
        await x`delete from products where tenant_id = ${KESAR} and title like ${T + '%'}`
      })
    }
    const make = async (title, o = {}) => {
      const [p] = await db`insert into products (tenant_id, handle, title, status, published_at, tags) values (${KESAR}, ${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}, ${title}, ${o.status ?? 'draft'}, ${o.status === 'active' ? new Date() : null}, ${o.tags ?? []}) returning id`
      await db`insert into variants (tenant_id, product_id, option_values, price, stock) values (${KESAR}, ${p.id}, ${[]}, ${o.price ?? 0}, ${o.stock ?? 0})`
      return p.id
    }
    const statusOf = async (title) => (await db`select status from products where tenant_id = ${KESAR} and title = ${title}`)[0]?.status
    await cleanup()
    await make(T + 'Tagged dupatta', { tags: ['diwali-drop'] })
    await make(T + 'Last few jhumkas', { stock: 2 })
    await make(T + 'Old draft A'); await make(T + 'Old draft B')
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    const row = (title) => p.getByRole('row').filter({ hasText: title })
    try {
      await t.step('A whole tag finds its product; Low stock shows the one with 2 left', async () => {
        await p.goto(CONSOLE + '/console/products?q=diwali-drop')
        await row(T + 'Tagged dupatta').waitFor()
        assert.equal(await p.getByRole('row').count(), 2, 'header + the tagged one')
        await p.goto(CONSOLE + '/console/products?status=low')
        await row(T + 'Last few jhumkas').waitFor()
        await p.getByRole('link', { name: /^Low stock/ }).and(p.locator('[aria-current=page]')).waitFor()
      })

      await t.step('Select two drafts → Archive → Undo: both back as drafts', async () => {
        await p.goto(CONSOLE + '/console/products?q=Old%20draft')
        await p.getByRole('checkbox', { name: `Select ${T}Old draft A` }).first().check()
        await p.getByRole('checkbox', { name: `Select ${T}Old draft B` }).first().check()
        await p.getByRole('region', { name: 'Selected products' }).getByText('2 selected').waitFor()
        await p.getByRole('button', { name: 'Archive' }).click()
        await p.getByText('Archived: 2 products.').first().waitFor()
        assert.equal(await statusOf(T + 'Old draft A'), 'archived')
        await p.getByRole('button', { name: 'Undo' }).click()
        for (let i = 0; i < 20 && (await statusOf(T + 'Old draft A')) !== 'draft'; i++) await p.waitForTimeout(250)
        assert.equal(await statusOf(T + 'Old draft A'), 'draft'); assert.equal(await statusOf(T + 'Old draft B'), 'draft')
      })

      await t.step('Duplicate one: a draft copy appears', async () => {
        await p.goto(CONSOLE + '/console/products?q=Tagged%20dupatta')
        await p.getByRole('checkbox', { name: `Select ${T}Tagged dupatta` }).first().check()
        await p.getByRole('button', { name: 'Duplicate' }).click()
        await p.getByText('Duplicated as a draft.').first().waitFor()
        assert.equal(await statusOf(T + 'Tagged dupatta copy'), 'draft')
      })

      await t.step('Delete a never-live draft: asked first, then gone', async () => {
        await p.goto(CONSOLE + '/console/products?q=Old%20draft%20A')
        await p.getByRole('checkbox', { name: `Select ${T}Old draft A` }).first().check()
        await p.getByRole('region', { name: 'Selected products' }).getByRole('button', { name: 'Delete' }).click()
        const d = p.getByRole('dialog', { name: 'Delete 1 product?' })
        await d.waitFor()
        await d.getByRole('button', { name: 'Delete 1 product' }).click()
        await p.getByText('Deleted 1 product.').first().waitFor()
        assert.equal(await statusOf(T + 'Old draft A'), undefined)
      })

      await t.step('Delete a live product: it stays, and Archive is offered instead', async () => {
        await make(T + 'Live saree', { status: 'active', price: 499000, stock: 5 })
        await p.goto(CONSOLE + '/console/products?q=Live%20saree')
        await p.getByRole('checkbox', { name: `Select ${T}Live saree` }).first().check()
        await p.getByRole('region', { name: 'Selected products' }).getByRole('button', { name: 'Delete' }).click()
        await p.getByRole('dialog', { name: 'Delete 1 product?' }).getByRole('button', { name: 'Delete 1 product' }).click()
        const kept = p.getByRole('dialog', { name: '1 product can’t be deleted' })
        await kept.waitFor()
        await kept.getByRole('button', { name: 'Archive 1 product' }).click()
        await p.getByText('Archived: 1 product.').first().waitFor()
        assert.equal(await statusOf(T + 'Live saree'), 'archived')
      })
    } finally {
      await ctx.close()
      await cleanup()
    }
  },
}
