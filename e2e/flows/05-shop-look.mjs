// =============================================================================
// FLOW: shop-look — THE VISUAL GATE for storefront changes (themes plan T0·4, architecture review 2026-11-08).
// Every shop page at a phone and a desktop width, compared pixel by pixel with the baselines in e2e/baselines/.
// A storefront refactor (T0) must show 0 differing pixels; an intended change regenerates the baselines in the
// same commit: UPDATE_BASELINES=1 npm run e2e -- --only shop-look. Baselines are made in this same image (the
// Chromium in /opt/pw-browsers), so fonts and anti-aliasing match. Dates are masked (they move every day).
// Runs first (05): later flows add orders and change the shop.
// =============================================================================
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import http from 'node:http'
import { CONSOLE, PORTS, SHOP, signedIn } from '../lib.mjs'

const DIR = new URL('../baselines/', import.meta.url).pathname
const UPDATE = process.env.UPDATE_BASELINES === '1'
const PAGES = [
  ['home', SHOP + '/'],
  ['product', SHOP + '/products/chanderi-kurta-set'],
  ['collection', SHOP + '/collections/festive-edit'],
  ['all', SHOP + '/products'],
  ['policy', SHOP + '/policies/shipping'],
  ['bag', SHOP + '/bag'],
]
const CONSOLE_PAGES = [['home', '/console'], ['orders', '/console/orders'], ['products', '/console/products'], ['look', '/console/look'], ['settings', '/console/settings']]
const PUBLIC_PAGES = [['site', '/'], ['login', '/login']]
const SIZES = [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]
const DATES = /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/
/** The console also says relative times and weekdays (they move): masked there only. */
const MOVING = /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)day\b|\b(just now|\d+ (min|mins|hours?|days?) ago|yesterday|today)\b/i

// A cached shop page may be stale on its first visit (built against an older database; regenerated in the
// background). Fetch it until two answers agree, so the screenshot is of today's data, not of the build's.
const get = (url, host) => new Promise((resolve, reject) => {
  http.get(url, { headers: { host } }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(b)) }).on('error', reject)
})
async function warm(url) {
  let last = ''
  for (let i = 0; i < 20; i++) {
    const u = new URL(url)
    const html = (await get(`http://localhost:${PORTS.app}${u.pathname}`, u.host)).replace(/<script[\s\S]*?<\/script>/g, '')
    if (html === last) return
    last = html; await new Promise((r) => setTimeout(r, 600))
  }
  throw new Error(`${url} never settled: its HTML kept changing for 12 s`)
}

async function shoot(page, url, moving = DATES) {
  if (url.startsWith(SHOP)) await warm(url)
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  // Lazy images below the fold: scroll through once so every image has loaded (or failed) before the capture.
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)) } window.scrollTo(0, 0) })
  await page.waitForLoadState('networkidle')
  return page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide', mask: [page.getByText(moving)], maskColor: '#FF00FF' })
}

function compare(name, buf, t) {
  const file = `${DIR}${name}.png`
  if (UPDATE || !existsSync(file)) { mkdirSync(DIR, { recursive: true }); writeFileSync(file, buf); return { written: true } }
  const a = PNG.sync.read(readFileSync(file)), b = PNG.sync.read(buf)
  if (a.width !== b.width || a.height !== b.height) {
    writeFileSync(t.out(`${name}-actual`), buf)
    assert.fail(`${name}: size ${b.width}×${b.height}, baseline ${a.width}×${a.height}`)
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 })
  if (n > 0) {
    writeFileSync(t.out(`${name}-actual`), buf); writeFileSync(t.out(`${name}-diff`), PNG.sync.write(diff))
    assert.fail(`${name}: ${n} pixels differ from e2e/baselines/${name}.png (see the -diff screenshot)`)
  }
  return { written: false }
}

export default {
  name: 'shop-look',
  async run(t) {
    let written = 0
    for (const [size, viewport] of SIZES) {
      await t.step(`every shop page at ${size} width matches its baseline`, async () => {
        const ctx = await t.browser.newContext({ viewport, deviceScaleFactor: 1 })
        const p = await ctx.newPage(); p.on('pageerror', (e) => t.errors.push(e.message))
        for (const [name, url] of PAGES) written += compare(`shop-${name}-${size}`, await shoot(p, url), t).written ? 1 : 0
        await ctx.close()
      })
    }
    await t.step('the console preview of the shop matches its baseline', async () => {
      const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
      const p = await ctx.newPage(); p.on('pageerror', (e) => t.errors.push(e.message))
      written += compare('console-preview-desktop', await shoot(p, CONSOLE + '/console/preview'), t).written ? 1 : 0
      await ctx.close()
    })
    // The console's own pages (Signal S2-0, the stylesheet split): the split must change no pixel here either.
    await t.step('the console and the public pages match their baselines', async () => {
      const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
      const p = await ctx.newPage(); p.on('pageerror', (e) => t.errors.push(e.message))
      for (const [name, path] of CONSOLE_PAGES) written += compare(`console-${name}-desktop`, await shoot(p, CONSOLE + path, MOVING), t).written ? 1 : 0
      await ctx.close()
      const anon = await t.browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
      const q = await anon.newPage(); q.on('pageerror', (e) => t.errors.push(e.message))
      for (const [name, path] of PUBLIC_PAGES) written += compare(`public-${name}-desktop`, await shoot(q, CONSOLE + path, MOVING), t).written ? 1 : 0
      await anon.close()
    })
    if (written) console.log(`     shop-look: ${written} baseline(s) written to e2e/baselines/`)
  },
}
