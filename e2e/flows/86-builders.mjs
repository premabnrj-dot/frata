// =============================================================================
// FLOW: builders — T1c (ADR-0015; plan docs/plans/2026-11-15-t1c-builders.md; approved mockup 2026-11-15). The partner's
// owner invites a Builder to Kesar Studio (Role: Builder); the Builder joins and sees Clients and Passkeys only, opens the
// store and lands on Products: view only, rows open the store preview, no cost on any page it reaches. THE SWEEP: every
// console page and route handler not in scripts/builder-doors.json, read from the folders (never a hand list), refuses
// the Builder and carries none of the store's private words. The owner makes the Builder a Lead (the console opens) and
// a Builder again; the brand sees "Partner · Builder"; removing the Builder ends access. Phone and desktop.
// Guards: a Builder reaching orders, settings, money or a cost column; a Builder page reading as frata_app; the store's
// switch stranding a Builder; a role change that leaves the store rows behind.
// =============================================================================
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CONSOLE, USERS, expectToast, partnerOn, seedPartnerStepup, signedIn } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const ROOT = new URL('../../', import.meta.url).pathname
const DOORS = JSON.parse(readFileSync(join(ROOT, 'scripts/builder-doors.json'), 'utf8')).routes
/** Words that must never reach a Builder: a cost (seed unit_cost 4242421 paise), the owner's address, a page's money words. */
const PRIVATE = ['42,424.21', '4242421', 'riya@kesarstudio.in', 'Cost of goods', '₹ kept']
const FIX = { handle: 'chanderi-kurta-set', number: 'KS-1001', id: '00000000-0000-4000-8000-000000000001', section: 'brand', app: 'gst', kind: 'order_confirmed', revision: '00000000-0000-4000-8000-000000000001', source: 'instagram' }

/** Every page and route under the console's route groups, as an address with fixture params. */
function addresses() {
  const out = []
  const walk = (dir, url) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (!statSync(p).isDirectory()) {
        if (name === 'page.tsx' || name === 'route.ts') out.push({ url: url || '/', kind: name === 'page.tsx' ? 'page' : 'route', file: p.slice(ROOT.length) })
        continue
      }
      if (name.startsWith('_') || name === '__tests__') continue
      const seg = name.startsWith('(') ? '' : name.startsWith('[[') ? '' : name.startsWith('[...') ? '/a' : name.startsWith('[') ? `/${FIX[name.slice(1, -1)] ?? 'x1'}` : `/${name}`
      walk(p, url + seg)
    }
  }
  for (const g of ['(console)', '(lookeditor)', '(lookpreview)']) walk(join(ROOT, 'src/app', g), '')
  walk(join(ROOT, 'src/app/api/console'), '/api/console')
  return out.filter((a) => a.url.startsWith('/console') || a.url.startsWith('/api/console'))
}

export default {
  name: 'builders',
  async run(t) {
    const { db } = t
    const P = USERS.partner, B = USERS.builder
    await db`insert into auth.users (id, email, email_confirmed_at) values (${P.id}, ${P.email}, now()), (${B.id}, ${B.email}, now()) on conflict (id) do nothing`
    await partnerOn(db, KESAR, P)
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message)); return p }
    const pia = await open('partner', { viewport: { width: 1280, height: 900 } })

    await t.step('the owner invites a Builder; the dialog says what the role reaches', async () => {
      await pia.goto(CONSOLE + '/partner/team')
      await pia.getByRole('button', { name: 'Invite' }).click()
      const dialog = pia.getByRole('dialog', { name: 'Invite to your team' })
      await dialog.getByText('Orders, products, look and settings').waitFor()
      await dialog.getByRole('radio', { name: 'Builder' }).click()
      await dialog.getByText('Products and the store preview').waitFor()
      await dialog.getByText('No orders, shoppers, costs or settings').waitFor()
      await dialog.getByLabel('Work email').fill(B.email)
      await dialog.getByLabel('Kesar Studio').check()
      await pia.screenshot({ path: t.out('invite-builder') })
      await dialog.getByRole('button', { name: 'Send invite' }).click()
      await expectToast(pia, `Invited ${B.email}`, 'ok')
      await pia.getByText(/^Builder · invited · \d+ days? left$/).first().waitFor()
      await pia.getByRole('table').filter({ hasText: 'Orders and shoppers' }).waitFor()
      const [r] = await db`select role from partner_members where email = ${B.email} and removed_at is null`
      assert.equal(r.role, 'builder')
    })

    const bc = await signedIn(t.browser, 'builder', { viewport: { width: 1280, height: 900 } })
    const bp = await bc.newPage(); bp.setDefaultTimeout(10_000); bp.on('pageerror', (e) => t.errors.push(e.message))
    await t.step('the Builder joins as a Builder; its store row is a builder\'s', async () => {
      await bp.goto(CONSOLE + '/join')
      await bp.getByRole('heading', { name: /as a Builder$/ }).waitFor()
      await bp.getByRole('button', { name: 'Accept invite' }).click()
      await expectToast(bp, 'Joined the team.', 'ok')
      await seedPartnerStepup(bc, 'builder')
      const [m] = await db`select role from members where user_id = ${B.id} and tenant_id = ${KESAR}`
      assert.equal(m.role, 'builder')
    })

    await t.step('workspace: Clients and Passkeys only; no owner email, plan or New client store', async () => {
      await bp.goto(CONSOLE + '/partner')
      await bp.getByRole('heading', { name: 'Clients' }).waitFor()
      assert.equal(await bp.getByRole('link', { name: 'New client store' }).count(), 0)
      assert.equal(await bp.getByRole('link', { name: 'Team' }).count(), 0)
      const html = await bp.content()
      for (const w of PRIVATE) assert.ok(!html.includes(w), `the Builder's Clients shows "${w}"`)
      await bp.screenshot({ path: t.out('builder-clients') })
    })

    await t.step('the console: Products view only, opening the preview; Home sends it to Products', async () => {
      await bp.getByRole('button', { name: 'Open store' }).first().click()
      await bp.waitForURL(/\/console\/products$/)
      for (const l of ['Products', 'Collections', 'Preview store', 'Partner workspace']) await bp.getByRole('link', { name: l, exact: true }).first().waitFor()
      for (const l of ['Home', 'Orders', 'Settings', 'Analytics', 'Offers', 'Look', 'Apps', 'Notices']) assert.equal(await bp.getByRole('link', { name: l, exact: true }).count(), 0, `the shell shows ${l}`)
      await bp.getByRole('heading', { name: 'Products' }).waitFor()
      assert.equal(await bp.locator('main input[type=checkbox]').count(), 0, 'no selection')
      assert.equal(await bp.getByRole('link', { name: 'Add product' }).count(), 0)
      const href = await bp.getByRole('link', { name: 'Open Chanderi kurta set in preview' }).getAttribute('href')
      assert.equal(href, '/console/preview/products/chanderi-kurta-set')
      const html = await bp.content()
      for (const w of PRIVATE) assert.ok(!html.includes(w), `Products shows "${w}"`)
      await bp.screenshot({ path: t.out('builder-products') })
      await bp.goto(CONSOLE + '/console/collections')
      await bp.getByRole('heading', { name: 'Collections' }).waitFor()
      await bp.goto(CONSOLE + '/console/preview/products/chanderi-kurta-set')
      await bp.getByText('Chanderi kurta set').first().waitFor()
      const pv = await bp.content()
      for (const w of PRIVATE) assert.ok(!pv.includes(w), `the preview shows "${w}"`)
    })

    await t.step('THE SWEEP: every other console page and route refuses the Builder and says nothing private', async () => {
      const all = addresses()
      assert.ok(all.length > 40, `the sweep found only ${all.length} addresses`)
      const missed = []
      for (const a of all) {
        const door = DOORS.some((d) => a.url === d || (d === '/console/preview' && a.url.startsWith('/console/preview')))
        if (door) continue
        if (a.kind === 'page') {
          const r = await bp.goto(CONSOLE + a.url)
          const status = r?.status() ?? 0
          const html = await bp.content()
          const refused = html.includes('Builders can’t see this page') || status === 404
          for (const w of PRIVATE) if (html.includes(w)) missed.push(`${a.url} shows "${w}"`)
          if (!refused) missed.push(`${a.url} (${a.file}) answered ${status} without the Builder's refusal`)
        } else {
          const r = await bc.request.get(CONSOLE + a.url, { maxRedirects: 0, failOnStatusCode: false })
          const body = await r.text()
          for (const w of PRIVATE) if (body.includes(w)) missed.push(`${a.url} returns "${w}"`)
          // A route refuses (401/403/404/405, or a redirect to sign in); the tenant check answers who you are, nothing more.
          if (r.status() === 200 && !a.url.startsWith('/api/console/tenant')) missed.push(`${a.url} (${a.file}) answered 200`)
        }
      }
      assert.deepEqual(missed, [])
      await bp.goto(CONSOLE + '/console/orders')
      await bp.getByRole('heading', { name: 'Builders can’t see this page' }).waitFor()
      await bp.getByRole('link', { name: 'Open products' }).waitFor()
      await bp.screenshot({ path: t.out('builder-refused') })
    })

    await t.step('phone: the bottom bar is Products, Collections, Preview', async () => {
      const ph = await bc.newPage({ viewport: { width: 390, height: 844 } })
      await ph.goto(CONSOLE + '/console/products')
      await ph.getByRole('heading', { name: 'Products' }).waitFor()
      await ph.screenshot({ path: t.out('builder-products-phone') })
      await ph.goto(CONSOLE + '/console/orders')
      await ph.getByRole('heading', { name: 'Builders can’t see this page' }).waitFor()
      await ph.screenshot({ path: t.out('builder-refused-phone') })
      await ph.close()
    })

    await t.step('the brand sees Partner · Builder', async () => {
      const riya = await open('owner', { viewport: { width: 1280, height: 900 } })
      await riya.goto(CONSOLE + '/console/settings/people')
      await riya.getByText('Partner · Builder').waitFor()
      await riya.screenshot({ path: t.out('people-builder') })
      await riya.context().close()
    })

    await t.step('Builder → Lead opens the console; back to Builder closes it again', async () => {
      const row = pia.getByRole('listitem').filter({ hasText: B.email })
      await pia.goto(CONSOLE + '/partner/team')
      await row.getByLabel(`Role for ${B.email}`).selectOption('lead')
      await expectToast(pia, `${B.email} is now a Lead.`, 'ok')
      const [m] = await db`select role from members where user_id = ${B.id} and tenant_id = ${KESAR}`
      assert.equal(m.role, 'partner')
      await bp.goto(CONSOLE + '/console/orders')
      await bp.getByRole('heading', { name: 'Orders' }).first().waitFor()
      await pia.goto(CONSOLE + '/partner/team')
      await row.getByLabel(`Role for ${B.email}`).selectOption('builder')
      await expectToast(pia, `${B.email} is now a Builder.`, 'ok')
      await bp.goto(CONSOLE + '/console/orders')
      await bp.getByRole('heading', { name: 'Builders can’t see this page' }).waitFor()
    })

    await t.step('removing the Builder ends access', async () => {
      await pia.goto(CONSOLE + '/partner/team')
      await pia.getByRole('listitem').filter({ hasText: B.email }).getByRole('button', { name: 'Remove' }).click()
      await pia.getByRole('dialog').getByRole('button', { name: `Remove ${B.email}` }).click()
      await expectToast(pia, `${B.email} removed.`, 'ok')
      const [n] = await db`select count(*)::int as n from members where user_id = ${B.id}`
      assert.equal(n.n, 0)
      await bp.goto(CONSOLE + '/console/products')
      assert.ok(!(await bp.content()).includes('Chanderi kurta set'))
    })
  },
}
