// =============================================================================
// FLOW: theme Signal (docs/plans/2026-11-09-theme-signal.md S1). Once Admin releases it, Signal is in the gallery;
// tried in a draft, its preview draws the floating header, label pills, tabs by collection, the grey-tile cards, the
// swipe row's counter, the signal band and the photo footer, with the accessories samples for a shop that sells
// bags. Removes its draft, its release row and puts the shop's categories back.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const FRAME = 'iframe[title="Your shop with this look"]'

export default {
  name: 'signal',
  async run(t) {
    const { db } = t
    const [{ sells }] = await db`select sells from shop_settings where tenant_id = ${KESAR}`
    const [{ n: before }] = await db`select count(*)::int n from shop_theme_revisions where tenant_id = ${KESAR}`
    const cleanup = async () => {
      await db`update shop_settings set sells = ${sells} where tenant_id = ${KESAR}`
      await db.begin(async (x) => { await x`set local session_replication_role = replica`; await x`delete from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal'`; await x`delete from theme_versions where theme_key = 'signal'` })
    }
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    try {
      await t.step('Released by Admin: Signal is in the gallery; tried in a draft, the preview wears it', async () => {
        await db`insert into theme_versions (theme_key, version, released_at) values ('signal', '1.0.0', now()) on conflict (theme_key, version) do update set released_at = now(), recalled_at = null, withdrawn_at = null`
        await db`update shop_settings set sells = '{accessories}' where tenant_id = ${KESAR}`
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'Signal', exact: true }).click()
        const d = p.getByRole('dialog', { name: 'Signal' })
        await d.getByRole('button', { name: 'Try Signal in a draft' }).click()
        const ask = p.getByRole('dialog', { name: 'Try Signal?' })
        await Promise.race([ask.waitFor().then(() => ask.getByRole('button', { name: 'Try Signal' }).click()), p.waitForURL(/\/console\/look\/customize$/)])
        await p.waitForURL(/\/console\/look\/customize$/)
        const f = p.frameLocator(FRAME)
        await f.locator('[data-section]').first().waitFor()
        await f.locator('[data-header="float"]').waitFor({ state: 'attached' })
        await f.locator('.store-label', { hasText: 'Bestsellers' }).waitFor()
        await f.locator('.store-tab').first().waitFor()
        await f.locator('[data-card="tile"]').waitFor({ state: 'attached' })
        await p.waitForTimeout(500)
        await p.screenshot({ path: t.out('signal-customize') })
      })

      await t.step('The preview on its own, a computer and a phone: home and a sample bag', async () => {
        const [r] = await db`select id from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' order by updated_at desc limit 1`
        assert.ok(r, 'a Signal draft')
        for (const [vp, tag] of [[{ width: 1440, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']]) {
          await p.setViewportSize(vp)
          await p.goto(CONSOLE + `/console/theme-preview/${r.id}`)
          await p.locator('.store-tab').first().waitFor()
          await p.waitForTimeout(400)
          await p.screenshot({ path: t.out(`signal-home-${tag}`), fullPage: true })
          // A second tab shows its own pieces, with no script.
          await p.locator('.store-tab').nth(1).click()
          assert.equal(await p.locator('.store-tab-panel[data-tab="1"]').isVisible(), true)
          await p.goto(CONSOLE + `/console/theme-preview/${r.id}/products/sample-navy-backpack`)
          await p.getByRole('heading', { name: 'Roam backpack' }).waitFor()
          await p.screenshot({ path: t.out(`signal-product-${tag}`), fullPage: true })
        }
        const [{ n: after }] = await db`select count(*)::int n from shop_theme_revisions where tenant_id = ${KESAR}`
        assert.ok(after >= before)
      })
    } finally {
      await ctx.close()
      await cleanup()
    }
  },
}
