// =============================================================================
// FLOW: shop addresses D·1 (docs/plans/2026-11-08-shop-addresses.md) — an open shop renames itself twice; its old
// address leads to the new one on the same path with its query (Instagram tags survive for Analytics); order pages stay
// on the host that issued them; a third rename is refused; a retired name is "Taken" for everyone. Restores the seed.
// Guards: a renamed shop losing its links; another shop taking an old name; the rename limit.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, expectToast, signedIn } from '../lib.mjs'
import { SHOP_DOMAIN, USERS } from '../constants.mjs'

const at = (name) => `http://${name}.${SHOP_DOMAIN}`

export default {
  name: 'addresses',
  async run(t) {
    const { db } = t
    const [{ id: T, first_opened_at: opened }] = await db`select id, first_opened_at from tenants where slug = 'kesar-studio'`
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const rename = async (p, to) => {
      await p.goto(CONSOLE + '/console/settings/address')
      await p.fill('#slug', to)
      await p.getByText('Available', { exact: true }).waitFor()
      // Live payments (the seed's keys are live): the new name is added beside the current one, ticked as approved by
      // Razorpay, then made main (D1·9).
      await p.getByRole('button', { name: `Add ${to}` }).click()
      const dlg = p.getByRole('dialog', { name: `Add ${to}.${SHOP_DOMAIN}?` }); await dlg.waitFor()
      await dlg.getByRole('button', { name: `Add ${to}` }).click()
      await p.getByRole('status').filter({ hasText: `Added ${to}.${SHOP_DOMAIN}` }).waitFor()
      const row = p.getByRole('listitem').filter({ hasText: `${to}.${SHOP_DOMAIN}` })
      await row.getByText('Razorpay not approved').waitFor()
      assert.equal(await p.locator('#slug').isDisabled(), true, 'one added name at a time')
      assert.equal(await row.getByRole('button', { name: 'Make main' }).count(), 0, 'Make main waits for Razorpay')
      await row.getByRole('button', { name: 'Razorpay approved it' }).click()
      await row.getByRole('button', { name: 'Make main' }).click()
      const c = p.getByRole('dialog', { name: `Make ${to}.${SHOP_DOMAIN} your main address?` })
      await c.getByText(/Uses (1 of 2 changes left|your last change)\. Bags in progress start empty\./).waitFor()
      await c.getByRole('button', { name: 'Make it main' }).click()
      const popup = p.getByRole('status').filter({ hasText: `${to}.${SHOP_DOMAIN} is your main address` })
      await popup.getByRole('link', { name: 'View your shop' }).waitFor()
      assert.equal(await popup.getByRole('button', { name: 'Undo' }).count(), 0, 'a rename has no Undo (going back is another change)')
      await popup.getByRole('button', { name: 'Close' }).click()
      await p.waitForFunction((v) => document.querySelector('#slug')?.value === v, to)
    }
    try {
      const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
      await t.step('an open shop renames itself; the page shows the changes left and the old name', async () => {
        await p.goto(CONSOLE + '/console/settings/address')
        await p.getByText('2 changes left').waitFor()
        await rename(p, 'kesar-two')
        await p.getByText('1 change left').waitFor()
        assert.match(await p.locator('main').innerText(), /Old: kesar-studio\.frata\.test/)
      })
      await t.step('the old address leads to the new one: same path, same query; orders stay put', async () => {
        const s = await t.browser.newContext(); const q = await s.newPage(); q.setDefaultTimeout(15_000)
        await q.goto(at('kesar-studio') + '/products/chanderi-kurta-set?utm_source=instagram&utm_medium=bio')
        await q.waitForURL(at('kesar-two') + '/products/chanderi-kurta-set?utm_source=instagram&utm_medium=bio')
        await q.goto(at('kesar-studio') + '/orders#t=abc')
        await q.waitForTimeout(800)
        assert.equal(new URL(q.url()).hostname, `kesar-studio.${SHOP_DOMAIN}`, 'an order page must not leave its host')
        await s.close()
      })
      await t.step('a retired name is "Taken" for everyone; a second rename uses the last change; a third is refused', async () => {
        await p.goto(CONSOLE + '/console/settings/address')
        await p.fill('#slug', 'kesar-studio-x'); await p.getByText('Available', { exact: true }).waitFor()
        await rename(p, 'kesar-studio-x')
        await p.getByText('No changes left').waitFor()
        assert.equal(await p.locator('#slug').isDisabled(), true)
        const [{ r }] = await db`select app_name_check('kesar-two') as r`
        assert.equal(r, 'taken')
      })
      await t.step('the shop can take back one of its own old names (here: the seed\'s, for the flows after this one)', async () => {
        // Through the app, so every host's lookup is refreshed; the change count is lifted for this step only.
        await db`update tenants set first_opened_at = null where id = ${T}`
        await p.goto(CONSOLE + '/console/settings/address')
        await p.fill('#slug', 'kesar-studio'); await p.getByText('Available', { exact: true }).waitFor()
        await p.getByRole('button', { name: 'Change to kesar-studio' }).click()
        await p.getByRole('status').filter({ hasText: `Moved to kesar-studio.${SHOP_DOMAIN}` }).waitFor()
      })
      await t.step('Frrata renames the shop: the old address serves nothing; Admin › Names releases it; the shop takes it back', async () => {
        const F = USERS.frata
        await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do nothing`
        const [{ name }] = await db`select name from tenants where id = ${T}`
        const staff = await signedIn(t.browser, 'frata', { viewport: { width: 1280, height: 900 } })
        try {
          const a = await staff.newPage(); a.setDefaultTimeout(10_000); a.on('pageerror', (e) => t.errors.push(e.message))
          await a.goto(CONSOLE + `/admin/merchants/${T}/addresses`)
          await a.locator('input[name="slug"]').fill('kesar-frrata')
          await a.locator('form').filter({ has: a.locator('input[name="slug"]') }).locator('input[name="reason"]').fill('Copies another brand')
          await a.getByRole('button', { name: `Rename ${name}'s address` }).click()
          await expectToast(a, `Renamed to kesar-frrata.${SHOP_DOMAIN}`, 'ok')
          await a.getByText('Old · no redirect').waitFor()
          const s = await t.browser.newContext(); const q = await s.newPage()
          const res = await q.goto(at('kesar-studio') + '/?utm_source=instagram')
          await q.waitForTimeout(800)
          assert.equal(res?.status(), 404, 'a name Frrata retired must serve nothing')
          assert.equal(new URL(q.url()).hostname, `kesar-studio.${SHOP_DOMAIN}`, 'a name Frrata retired must not redirect')
          const now = await q.goto(at('kesar-frrata') + '/')
          assert.equal(now?.status(), 200, 'the new name serves the shop')
          // An older name of the shop's own (from its renames above) now leads to the new one (refreshHosts over all names).
          await q.goto(at('kesar-two') + '/?utm_source=instagram')
          await q.waitForURL(at('kesar-frrata') + '/?utm_source=instagram')
          await s.close()
          await a.goto(CONSOLE + '/admin/names')
          await a.getByLabel('Why release kesar-studio').fill('Trademark cleared')
          await a.getByRole('button', { name: 'Release kesar-studio' }).click()
          await expectToast(a, 'kesar-studio released.', 'ok')
        } finally { await staff.close() }
        // Not opened (the step before lifted it), so the change needs no confirm.
        await p.goto(CONSOLE + '/console/settings/address')
        await p.fill('#slug', 'kesar-studio'); await p.getByText('Available', { exact: true }).waitFor()
        await p.getByRole('button', { name: 'Change to kesar-studio' }).click()
        await p.getByRole('status').filter({ hasText: `Moved to kesar-studio.${SHOP_DOMAIN}` }).waitFor()
      })
    } finally {
      await owner.close()
      // Whatever happened above, the seed is whole again: its one name, no history, its first opening, no renames used.
      // (The last step restored it through the app, which refreshed every host's lookup; this is the backstop.)
      await db`delete from shop_names where tenant_id = ${T} and name <> 'kesar-studio'`
      await db`insert into shop_names (name, tenant_id) values ('kesar-studio', ${T}) on conflict (name) do update set retired_at = null, retired_by_frrata = false, added_at = null`
      await db`update shop_names set razorpay_ok_at = coalesce(razorpay_ok_at, now()), razorpay_ok_by = coalesce(razorpay_ok_by, 'cccccccc-0000-0000-0000-000000000001') where name = 'kesar-studio'`
      await db`update tenants set slug = 'kesar-studio', renames_used = 0, first_opened_at = ${opened} where id = ${T}`
    }
  },
}
