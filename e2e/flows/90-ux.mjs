// =============================================================================
// FLOW: ux — the UX net (spec U, plan U·0). Every Console and Admin page, on
// stress data (e2e/fixtures/ux-stress.sql), at 320, 390 and 1280 px and at
// 640 px standing for 1280 at 200 % zoom. Each failure is keyed
// "check · page · width" and the whole set is compared with e2e/ux-known.mjs:
// a new failure fails the flow, and so does a known one that no longer fails
// (delete its line when you fix it). Runs last and leaves its data (the next
// run drops the database).
// Checks: e2e/ux-measure.mjs. Prints first paint on /console/orders at 4× CPU
// and fast 4G as a number to watch (baseline 708 ms, 2026-11-07), not a gate.
// =============================================================================
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { CONSOLE, SHOP, USERS, signedIn, until } from '../lib.mjs'
import { FOCUS, LONGEST_MOTION, MEASURE, OVERLAP, TEXT_SPACING } from '../ux-measure.mjs'
import { KNOWN } from '../ux-known.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const M1 = 'eeeeeeee-0000-4000-8000-000000000001'
const WIDTHS = [[320, 640, '320'], [390, 844, '390'], [1280, 800, '1280'], [640, 400, 'zoom200']]

export default {
  name: 'ux',
  async run(t) {
    const { db } = t
    const failures = new Map()
    const fail = (check, page, width, detail, n = 1) => { const k = `${check} · ${page} · ${width}`; if (!failures.has(k)) failures.set(k, { detail, n }) }
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
        // The rest of what U·2b converted (impact review U·2b): every page measured, none only by hand.
        ['console-collections', 'owner', '/console/collections'],
        ['console-collection', 'owner', '/console/collections/kurtas'],
        ['console-activity', 'owner', '/console/activity'],
        ['console-settings-address', 'owner', '/console/settings/address'],
        ['console-settings-payments', 'owner', '/console/settings/online-payments'],
        ['console-product-new', 'owner', '/console/products/new'],
        ['admin-activity', 'frata', '/admin/activity'],
        ['admin-staff', 'frata', '/admin/staff'],
        ['admin-merchant-new', 'frata', '/admin/merchants/new'],
        ['admin-merchant-plan', 'frata', `/admin/merchants/${KESAR}/plan`],
        ['admin-merchant-support', 'frata', `/admin/merchants/${M1}/support`],
        ['admin-plan-edit', 'frata', '/admin/plans/launch'],
        // A merchant with a very long name: its header and its "Open … console" button (impact review U·2b).
        ['admin-merchant-long', 'frata', '/admin/merchants/eeeeeeee-0000-4000-8000-000000000005'],
      ]
      const measure = async (ctx, page, path, w, label, h = 800) => {
        const p = await ctx.newPage(); p.on('pageerror', (e) => t.errors.push(`${page} ${label}: ${e.message}`))
        await p.setViewportSize({ width: w, height: h })
        await p.goto(CONSOLE + path, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready)
        const m = await p.evaluate(MEASURE, { phone: w < 768 })
        if (m.overflow.length) fail('overflow', page, label, m.overflow.join('; '))
        if (m.tableScroll.length) fail('table-scroll', page, label, m.tableScroll.join('; '))
        if (m.targets.length) fail('target', page, label, `${m.targets.length}: ${m.targets.slice(0, 3).join('; ')}`, m.targets.length)
        if (m.contrast.length) fail('contrast', page, label, `${m.contrast.length}: ${m.contrast.slice(0, 3).join('; ')}`, m.contrast.length)
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
          const ctxs = { owner: await signedIn(t.browser, 'owner', { viewport: { width: w, height: h }, reducedMotion: 'reduce' }), frata: await signedIn(t.browser, 'frata', { viewport: { width: w, height: h }, reducedMotion: 'reduce' }) }
          for (const [page, who, path] of PAGES) await (await measure(ctxs[who], page, path, w, label, h)).close()
          for (const c of Object.values(ctxs)) await c.close()
        }
      })

      await t.step('a phone row is one target, and its other link still works (Open console over the row link)', async () => {
        const ctx = await signedIn(t.browser, 'frata', { viewport: { width: 390, height: 844 } })
        const p = await ctx.newPage(); await p.goto(CONSOLE + '/admin/merchants')
        const row = p.locator('tbody tr').first()
        await row.getByRole('link', { name: 'Open console' }).click()
        await p.waitForURL(/\/support$/)
        await p.goBack(); await p.waitForURL(/\/admin\/merchants$/)
        // A tap on the row's empty part opens the merchant.
        const box = await p.locator('tbody tr').first().boundingBox()
        await p.mouse.click(box.x + box.width / 2, box.y + box.height - 6)
        await p.waitForURL(/\/admin\/merchants\/[0-9a-f-]{36}$/)
        await ctx.close()
      })

      await t.step('keyboard: the first 15 Tab stops show a ring and are not hidden', async () => {
        // After each Tab, wait for the focused element's transitions (a link fades its ring in over 120 ms; a reading
        // taken mid-fade said 1.01:1), then a frame.
        const settle = (p) => p.evaluate(async () => {
          await Promise.all((document.activeElement?.getAnimations?.() ?? []).map((a) => a.finished.catch(() => {})))
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        })
        const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
        for (const [page, path] of [['console-orders', '/console/orders'], ['console-product', '/console/products/chanderi-kurta-set']]) {
          const p = await ctx.newPage(); await p.goto(CONSOLE + path)
          for (let i = 0; i < 15; i++) {
            await p.keyboard.press('Tab'); await settle(p)
            const f = await p.evaluate(FOCUS)
            if (!f.ok) { fail('focus', page, '1280', `stop ${i + 1}: ${f.what}${f.ring ? '' : ' no ring ≥ 2 px at 3:1'}${f.covered ? ' covered' : ''}`); break }
          }
          await p.close()
        }
        const fc = await signedIn(t.browser, 'frata', { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
        const p = await fc.newPage(); await p.goto(CONSOLE + '/admin/merchants')
        for (let i = 0; i < 15; i++) { await p.keyboard.press('Tab'); await settle(p); const f = await p.evaluate(FOCUS); if (!f.ok) { fail('focus', 'admin-merchants', '1280', `stop ${i + 1}: ${f.what}`); break } }
        await fc.close(); await ctx.close()
      })

      await t.step('text spacing (WCAG 1.4.12) causes no sideways scroll', async () => {
        const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 390, height: 844 } })
        for (const [page, path] of [['console-orders', '/console/orders'], ['console-settings', '/console/settings'], ['console-products', '/console/products']]) {
          const p = await ctx.newPage(); await p.goto(CONSOLE + path); await p.addStyleTag({ content: TEXT_SPACING })
          const wide = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
          if (wide) fail('text-spacing', page, '390', 'page scrolls sideways')
          const overlaps = await p.evaluate(OVERLAP)
          if (overlaps.length) fail('text-overlap', page, '390', overlaps.join('; '))
          await p.close()
        }
        await ctx.close()
      })

      await t.step('reduced motion: nothing on a page moves longer than 0.01 ms (U·3)', async () => {
        const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
        for (const [page, path] of [['console-home', '/console'], ['console-orders', '/console/orders'], ['console-product', '/console/products/chanderi-kurta-set']]) {
          const p = await ctx.newPage(); await p.goto(CONSOLE + path)
          const ms = await p.evaluate(LONGEST_MOTION)
          if (ms > 0.011) fail('reduced-motion', page, '390', `${ms} ms`)
          await p.close()
        }
        await ctx.close()
      })

      await t.step('support mode: the visited shop, its own count in the nav, and back to Kesar after End, expiry, and an end elsewhere (T4, T5)', async () => {
        const ctx = await signedIn(t.browser, 'frata', { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
        const p = await ctx.newPage(); p.on('pageerror', (e) => t.errors.push(e.message))
        const pill = async () => Number((await p.locator('nav[aria-label="Console"] a[href="/console/orders"]').filter({ visible: true }).first().innerText()).match(/\d+/)?.[0] ?? 0)
        const start = async (id) => { await p.goto(CONSOLE + `/admin/merchants/${id}/support`); await p.getByRole('button', { name: /^Open .+ console$/ }).click(); await p.locator('[data-support-banner]').waitFor() }
        await start(M1)
        const [{ name }] = await db`select name from tenants where id = ${M1}`
        assert.ok((await p.locator('[data-support-banner]').innerText()).includes(name), 'the banner names the visited shop')
        assert.equal(await pill(), 7, 'the pill counts merchant-1\'s orders to confirm, not Kesar\'s')
        for (const [page, path] of [['support-console-home', '/console'], ['support-console-orders', '/console/orders'], ['support-admin-merchant', `/admin/merchants/${M1}`]]) {
          for (const [w, h, label] of [[390, 844, '390'], [1280, 800, '1280']]) { const q = await measure(ctx, page, path, w, label, h); await q.close() }
        }
        await p.goto(CONSOLE + '/console')
        const bannerH = await p.evaluate(() => document.querySelector('[data-support-banner]')?.getBoundingClientRect().height ?? 0)
        if (bannerH > 64) fail('support-banner-height', 'support-console-home', '390', `${Math.round(bannerH)} px`)
        await p.getByRole('button', { name: 'End now' }).click()
        await p.waitForURL(/\/admin/)
        await p.goto(CONSOLE + '/console/orders')
        const kesar = Number((await p.locator('main p').first().innerText()).match(/([\d,]+) to confirm/)?.[1]?.replace(/,/g, '') ?? 0)
        assert.equal(await pill(), kesar, 'after End, the pill is Kesar\'s own count again')
        // Expiry: a visit that runs out while the page is open refreshes it (the kept layout must not show merchant-2).
        await start('eeeeeeee-0000-4000-8000-000000000002')
        await db`update support_sessions set expires_at = now() + interval '3 seconds' where staff_user_id = ${USERS.frata.id} and ended_at is null`
        await p.goto(CONSOLE + '/console/orders')
        assert.equal(await pill(), 3, 'merchant-2\'s count during its visit')
        await p.locator('[data-support-banner]').waitFor({ state: 'detached', timeout: 15_000 })
        await until(async () => (await pill()) === kesar, 10_000)
        // Ended elsewhere, then an in-app move: the kept layout must not show merchant-1 over Kesar's page (audit MEDIUM 1).
        await start(M1)
        await p.goto(CONSOLE + '/console')
        assert.equal(await pill(), 7)
        await db`update support_sessions set ended_at = now() where staff_user_id = ${USERS.frata.id} and ended_at is null`
        await p.locator('nav[aria-label="Console"] a[href="/console/products"]').filter({ visible: true }).first().click()
        await p.waitForURL(/\/console\/products/)
        await p.locator('[data-support-banner]').waitFor({ state: 'detached', timeout: 10_000 })
        await until(async () => (await pill()) === kesar, 10_000)
        await ctx.close()
      })

      await t.step('the shell: progress bar on a slow move, the More sheet keeps focus and gives it back, sign out ends a visit', async () => {
        // Progress bar: a 900 ms network makes the move slow enough to show it (it waits 150 ms).
        const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 800 } })
        const p = await ctx.newPage(); await p.goto(CONSOLE + '/console')
        const cdp = await ctx.newCDPSession(p)
        await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 900, downloadThroughput: 1e6, uploadThroughput: 1e6 })
        await p.locator('aside a[href="/console/products"]').click()
        await p.locator('.animate-nav-run').waitFor({ timeout: 3000 })
        await p.waitForURL(/\/console\/products/)
        await ctx.close()
        // The More sheet (phone): focus goes in, Tab stays in, Esc closes it and focus is back on More.
        const pc = await signedIn(t.browser, 'owner', { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
        const q = await pc.newPage(); await q.goto(CONSOLE + '/console')
        const more = q.locator('nav[aria-label="Console"] button', { hasText: 'More' })
        await more.click()
        const sheet = q.getByRole('dialog', { name: 'More' }); await sheet.waitFor()
        // A modal dialog may let Tab leave for the browser's own controls (activeElement is then body); it must never
        // land on the page behind it.
        for (let i = 0; i < 12; i++) {
          await q.keyboard.press('Tab')
          assert.ok(await q.evaluate(() => { const a = document.activeElement; return !a || a === document.body || !!a.closest('dialog[open]') }), `Tab ${i + 1} never reaches the page behind the sheet`)
        }
        await q.keyboard.press('Escape'); await sheet.waitFor({ state: 'hidden' })
        assert.equal(await q.evaluate(() => document.activeElement?.textContent?.trim()), 'More', 'focus returns to More')
        assert.notEqual(await q.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden', 'the page scrolls again')
        // Closing by the scrim (a tap outside the sheet) and by a link both close it too.
        await more.click(); await sheet.waitFor(); await q.mouse.click(195, 40); await sheet.waitFor({ state: 'hidden' })
        await more.click(); await sheet.waitFor(); await sheet.getByRole('link', { name: 'Settings' }).click(); await q.waitForURL(/\/console\/settings/); await sheet.waitFor({ state: 'hidden' })
        await pc.close()
        // Sign out during a support visit: the visit ends (audited as by sign-out) and the next page is sign-in.
        const fc = await signedIn(t.browser, 'frata', { viewport: { width: 1280, height: 800 } })
        const r = await fc.newPage(); await r.goto(CONSOLE + `/admin/merchants/${M1}/support`)
        await r.getByRole('button', { name: /^Open .+ console$/ }).click(); await r.locator('[data-support-banner]').waitFor()
        await r.locator('aside').getByRole('button', { name: 'Sign out' }).click()
        await r.waitForURL(/\/login/)
        const [{ open }] = await db`select count(*)::int open from support_sessions where staff_user_id = ${USERS.frata.id} and ended_at is null`
        assert.equal(open, 0, 'signing out ends the visit')
        const [audit] = await db`select detail from audit_events where action = 'support.end' order by at desc limit 1`
        assert.deepEqual(audit?.detail, { by: 'sign-out' })
        await fc.close()
        // A shop's tabs are the shop's: no "· Frata" on the bag or checkout (impact review U·2a).
        const sc = await t.browser.newContext(); const sp = await sc.newPage()
        for (const path of ['/bag', '/checkout']) { await sp.goto(SHOP + path); assert.ok(!/Frata/.test(await sp.title()), `${path} title: ${await sp.title()}`) }
        await sc.close()
      })

      await t.step('Indic fonts download only when a name needs them, and never on the shop (plan U · A4)', async () => {
        const fontsOn = async (who, url) => {
          const ctx = who ? await signedIn(t.browser, who) : await t.browser.newContext()
          const p = await ctx.newPage(); const got = new Set()
          p.on('response', (r) => { if (/\.woff2(\?|$)/.test(r.url())) got.add(new URL(r.url()).pathname) })
          await p.goto(url, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready)
          await ctx.close(); return got
        }
        // The Noto files themselves, from the shell's @font-face rules (next/font/local names the families after
        // the consts in src/components/shell/fonts.ts): exact URLs, not a count of whatever else loaded.
        const ctx = await signedIn(t.browser, 'owner'); const q = await ctx.newPage(); await q.goto(CONSOLE + '/console/settings')
        const notoFiles = await q.evaluate(() => [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules] } catch { return [] } })
          .filter((r) => r instanceof CSSFontFaceRule && /^['"]?(deva|beng|guru|taml)\b/.test(r.style.getPropertyValue('font-family')))
          .map((r) => new URL(r.style.getPropertyValue('src').match(/url\(["']?([^"')]+)/)[1], location.href).pathname))
        await ctx.close()
        assert.equal(notoFiles.length, 4, `four Noto faces declared in the shell: ${notoFiles.join(', ')}`)
        const latin = await fontsOn('owner', CONSOLE + '/console/settings')
        const indic = await fontsOn('owner', CONSOLE + '/console/orders') // Devanagari, Tamil, Gurmukhi and Bengali customer names
        const shop = await fontsOn(null, SHOP + '/')
        assert.deepEqual(notoFiles.filter((f) => latin.has(f)), [], 'a Latin-only page downloads no Noto file')
        assert.equal(notoFiles.filter((f) => indic.has(f)).length, 4, 'a page with all four scripts downloads each Noto file')
        assert.deepEqual(notoFiles.filter((f) => shop.has(f)), [], 'the storefront downloads no Noto file')
      })

      await t.step('speed baseline: /console/orders on a slow phone (printed, not asserted)', async () => {
        const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 390, height: 844 } })
        const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
        await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9 * 1024 * 1024 / 8, uploadThroughput: 1.5 * 1024 * 1024 / 8 })
        await p.goto(CONSOLE + '/console/orders', { waitUntil: 'load' })
        const m = await p.evaluate(MEASURE, { phone: true })
        console.log(`     ux › /console/orders at 390 px, CPU 4×, fast 4G: first paint ${m.fcp} ms, ${m.domNodes} DOM nodes (compare spec U § Stress test)`)
        await ctx.close()
      })

      await t.step('the failures are exactly the known ones (e2e/ux-known.mjs)', async () => {
        // A KNOWN line is "check · page · width", or "… ≤ N" for counted checks (targets, contrast): more than N is worse.
        const known = new Map(KNOWN.map((line) => { const [k, n] = line.split(' ≤ '); return [k, n ? Number(n) : 1] }))
        const unexpected = [...failures].filter(([k, f]) => !known.has(k) || f.n > known.get(k)).map(([k, f]) => `${k}${known.has(k) ? ` (worse: ${f.n} > ${known.get(k)})` : ''} — ${f.detail}`)
        const fixed = [...known.keys()].filter((k) => !failures.has(k))
        // The whole list, for a person (the runner prints only an error's first line).
        writeFileSync(t.out('failures').replace(/\.png$/, '.txt'), [...failures].map(([k, f]) => `${known.has(k) && f.n <= known.get(k) ? (f.n < known.get(k) ? 'LOWER' : 'known') : 'NEW  '} ${k}${f.n > 1 ? ` ≤ ${f.n}` : ''} — ${f.detail}`).concat(fixed.map((k) => `FIXED ${k}`)).join('\n') + '\n')
        assert.ok(!unexpected.length && !fixed.length,
          `${unexpected.length} new or worse, ${fixed.length} now passing (first: ${unexpected[0] ?? fixed[0]}); full list in e2e/.out/90-ux-failures.txt`)
      })
    } finally {
      // It runs last and LEAVES its data (60 shops, users, staff, support visits with their audit rows, which
      // ON DELETE restrict keeps): the next run drops and recreates the database. Only open visits are closed.
      await db`update support_sessions set ended_at = coalesce(ended_at, now()) where staff_user_id = ${USERS.frata.id}`.catch(() => {})
    }
  },
}
