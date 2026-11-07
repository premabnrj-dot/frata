// =============================================================================
// FLOW: ux — the UX net (spec U, plan U·0). Every Console and Admin page, on
// stress data (e2e/fixtures/ux-stress.sql), at 320, 390 and 1280 px and at
// 640 px standing for 1280 at 200 % zoom. Each failure is keyed
// "check · page · width" and the whole set is compared with e2e/ux-known.mjs:
// a new failure fails the flow, and so does a known one that no longer fails
// (delete its line when you fix it). Runs last; removes its data in a finally.
// Checks: e2e/ux-measure.mjs. Prints first paint on /console/orders at 4× CPU
// and fast 4G as a number to watch (baseline 708 ms, 2026-11-07), not a gate.
// =============================================================================
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { CONSOLE, USERS, signedIn } from '../lib.mjs'
import { FOCUS, MEASURE, TEXT_SPACING } from '../ux-measure.mjs'
import { KNOWN } from '../ux-known.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const M1 = 'eeeeeeee-0000-4000-8000-000000000001'
const WIDTHS = [[320, 640, '320'], [390, 844, '390'], [1280, 800, '1280'], [640, 400, 'zoom200']]

export default {
  name: 'ux',
  async run(t) {
    const { db } = t
    const failures = new Map()
    const fail = (check, page, width, detail) => { const k = `${check} · ${page} · ${width}`; if (!failures.has(k)) failures.set(k, detail) }
    await db.unsafe(readFileSync(new URL('../fixtures/ux-stress.sql', import.meta.url), 'utf8'))
    const longHandle = 'stress-product-3'
    try {
      const PAGES = [
        ['console-home', 'owner', '/console'],
        ['console-orders', 'owner', '/console/orders'],
        ['console-products', 'owner', '/console/products'],
        ['console-product', 'owner', '/console/products/chanderi-kurta-set'],
        ['console-product-long', 'owner', `/console/products/${longHandle}`],
        ['console-settings', 'owner', '/console/settings'],
        ['console-settings-store', 'owner', '/console/settings/store'],
        ['admin-merchants', 'frata', '/admin/merchants'],
        ['admin-merchants-nomatch', 'frata', '/admin/merchants?q=nomatchzz'],
        ['admin-merchant', 'frata', `/admin/merchants/${KESAR}`],
        ['admin-plans', 'frata', '/admin/plans'],
      ]
      const measure = async (ctx, page, path, w, label) => {
        const p = await ctx.newPage(); p.on('pageerror', (e) => t.errors.push(`${page} ${label}: ${e.message}`))
        await p.goto(CONSOLE + path, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready)
        const m = await p.evaluate(MEASURE, { phone: w < 768 })
        if (m.overflow.length) fail('overflow', page, label, m.overflow.join('; '))
        if (m.tableScroll.length) fail('table-scroll', page, label, m.tableScroll.join('; '))
        if (m.targets.length) fail('target', page, label, `${m.targets.length}: ${m.targets.slice(0, 3).join('; ')}`)
        if (m.contrast.length) fail('contrast', page, label, `${m.contrast.length}: ${m.contrast.slice(0, 3).join('; ')}`)
        if (m.current !== 1) fail('nav-current', page, label, `${m.current} marked`)
        if (!m.skip) fail('skip-link', page, label, 'first focusable is not "Skip to content"')
        if (label === '1280') {
          if (!/ · /.test(m.title) || /^Product · Frata$/.test(m.title)) fail('title', page, label, `"${m.title}"`)
          if (m.shadowEdge.length) fail('shadow-edge', page, label, m.shadowEdge.join('; '))
        }
        await p.screenshot({ path: t.out(`${page}-${label}`), fullPage: false })
        return p
      }

      await t.step('every page × width measured (failures collected)', async () => {
        for (const [w, h, label] of WIDTHS) {
          const ctxs = { owner: await signedIn(t.browser, 'owner', { viewport: { width: w, height: h } }), frata: await signedIn(t.browser, 'frata', { viewport: { width: w, height: h } }) }
          for (const [page, who, path] of PAGES) await (await measure(ctxs[who], page, path, w, label)).close()
          for (const c of Object.values(ctxs)) await c.close()
        }
      })

      await t.step('keyboard: the first 15 Tab stops show a ring and are not hidden', async () => {
        const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 800 } })
        for (const [page, path] of [['console-orders', '/console/orders'], ['console-product', '/console/products/chanderi-kurta-set']]) {
          const p = await ctx.newPage(); await p.goto(CONSOLE + path)
          for (let i = 0; i < 15; i++) {
            await p.keyboard.press('Tab')
            const f = await p.evaluate(FOCUS)
            if (!f.ok) { fail('focus', page, '1280', `stop ${i + 1}: ${f.what}${f.ring ? '' : ' no ring ≥ 2px'}${f.covered ? ' covered' : ''}`); break }
          }
          await p.close()
        }
        const fc = await signedIn(t.browser, 'frata', { viewport: { width: 1280, height: 800 } })
        const p = await fc.newPage(); await p.goto(CONSOLE + '/admin/merchants')
        for (let i = 0; i < 15; i++) { await p.keyboard.press('Tab'); const f = await p.evaluate(FOCUS); if (!f.ok) { fail('focus', 'admin-merchants', '1280', `stop ${i + 1}: ${f.what}`); break } }
        await fc.close(); await ctx.close()
      })

      await t.step('text spacing (WCAG 1.4.12) causes no sideways scroll', async () => {
        const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 390, height: 844 } })
        for (const [page, path] of [['console-orders', '/console/orders'], ['console-settings', '/console/settings']]) {
          const p = await ctx.newPage(); await p.goto(CONSOLE + path); await p.addStyleTag({ content: TEXT_SPACING })
          const wide = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
          if (wide) fail('text-spacing', page, '390', 'page scrolls sideways')
          await p.close()
        }
        await ctx.close()
      })

      await t.step('support mode: a visit to merchant-1 shows that shop, and ending it returns to Kesar', async () => {
        const ctx = await signedIn(t.browser, 'frata', { viewport: { width: 390, height: 844 } })
        const p = await ctx.newPage(); p.on('pageerror', (e) => t.errors.push(e.message))
        await p.goto(CONSOLE + `/admin/merchants/${M1}/support`)
        await p.getByRole('button', { name: /^Open .+ console$/ }).click()
        await p.getByText(/Frata support in .+ console/).waitFor()
        const [{ name }] = await db`select name from tenants where id = ${M1}`
        assert.ok((await p.locator('body').innerText()).includes(name), 'the visited shop is named')
        for (const [page, path] of [['support-console-home', '/console'], ['support-console-orders', '/console/orders'], ['support-admin-merchant', `/admin/merchants/${M1}`]]) {
          for (const [w, h, label] of [[390, 844, '390'], [1280, 800, '1280']]) {
            await p.setViewportSize({ width: w, height: h })
            const q = await measure(ctx, page, path, w, label); await q.close()
          }
        }
        await p.setViewportSize({ width: 390, height: 844 })
        const bannerH = await p.evaluate(() => document.querySelector('[role="status"]')?.getBoundingClientRect().height ?? 0)
        if (bannerH > 64) fail('support-banner-height', 'support-console-home', '390', `${Math.round(bannerH)} px`)
        await p.goto(CONSOLE + '/console'); await p.getByRole('button', { name: 'End now' }).click()
        await p.waitForURL(/\/admin/)
        await p.goto(CONSOLE + '/console')
        await p.getByText('Kesar Studio Handwoven', { exact: false }).first().waitFor()
        await ctx.close()
      })

      await t.step('speed baseline: /console/orders on a slow phone (printed, not asserted)', async () => {
        const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 390, height: 844 } })
        const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
        await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9 * 1024 * 1024 / 8, uploadThroughput: 1.5 * 1024 * 1024 / 8 })
        await p.goto(CONSOLE + '/console/orders', { waitUntil: 'load' })
        const m = await p.evaluate(MEASURE, { phone: true })
        console.log(`     ux › /console/orders at 390 px, CPU 4×, fast 4G: first paint ${m.fcp} ms, ${m.domNodes} DOM nodes (baseline 708 ms, 1,160 nodes)`)
        await ctx.close()
      })

      await t.step('the failures are exactly the known ones (e2e/ux-known.mjs)', async () => {
        const known = new Set(KNOWN)
        const unexpected = [...failures].filter(([k]) => !known.has(k)).map(([k, d]) => `${k} — ${d}`)
        const fixed = KNOWN.filter((k) => !failures.has(k))
        // The whole list, for a person (the runner prints only an error's first line).
        writeFileSync(t.out('failures').replace(/\.png$/, '.txt'), [...failures].map(([k, d]) => `${known.has(k) ? 'known' : 'NEW  '} ${k} — ${d}`).concat(fixed.map((k) => `FIXED ${k}`)).join('\n') + '\n')
        assert.deepEqual({ unexpected, fixed }, { unexpected: [], fixed: [] },
          `new failures must be fixed; fixed ones must be deleted from e2e/ux-known.mjs\n  NEW:\n    ${unexpected.join('\n    ')}\n  NOW PASSING:\n    ${fixed.join('\n    ')}`)
      })
    } finally {
      // Leave the database as the seed made it (any later flow, or a re-run with --no-build).
      await db.unsafe(`
        update support_sessions set ended_at = coalesce(ended_at, now()) where staff_user_id = '${USERS.frata.id}';
        delete from order_lines where order_id in (select id from orders where tenant_id::text like 'eeeeeeee%' or (tenant_id = '${KESAR}' and number between 5001 and 5300));
        delete from orders where tenant_id::text like 'eeeeeeee%' or (tenant_id = '${KESAR}' and number between 5001 and 5300);
        delete from variants where product_id in (select id from products where handle like 'stress-product-%');
        delete from products where handle like 'stress-product-%';
        update tenants set name = 'Kesar Studio' where id = '${KESAR}';
      `).catch((e) => console.log(`     ux › cleanup left data behind: ${e.message} (the next run drops the database)`))
    }
  },
}
