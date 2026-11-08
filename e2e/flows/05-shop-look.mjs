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
const SIZES = [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]
const DATES = /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/

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
}

async function shoot(page, url) {
  if (url.startsWith(SHOP)) await warm(url)
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  return page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide', mask: [page.getByText(DATES)], maskColor: '#FF00FF' })
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
      const p = await ctx.newPage()
      written += compare('console-preview-desktop', await shoot(p, CONSOLE + '/console/preview'), t).written ? 1 : 0
      await ctx.close()
    })
    if (written) console.log(`     shop-look: ${written} baseline(s) written to e2e/baselines/`)
  },
}
