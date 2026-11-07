// =============================================================================
// FILE: scripts/check-mockup.mjs — node scripts/check-mockup.mjs <mockup.html>
//
// Run before publishing a mockup for the owner (frata-planning step 4). Opens
// the file at phone (390) and desktop (1280) width; for every view linked as
// `nav a[href^="#"]` (or the page alone if there are none) it fails on
// sideways scroll or any console/page error, and writes screenshots beside
// the file as check-<width>-<view>.png for a person to look at.
// =============================================================================
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const file = process.argv[2]
if (!file) { console.error('usage: node scripts/check-mockup.mjs <mockup.html>'); process.exit(2) }
const { chromium } = createRequire(import.meta.url)('playwright')
const path = resolve(file), dir = dirname(path)
const browser = await chromium.launch()
const problems = []
for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  page.on('pageerror', (e) => problems.push(`${width}px: page error ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && problems.push(`${width}px: console error ${m.text()}`))
  await page.goto('file://' + path)
  const views = await page.$$eval('nav a[href^="#"]', (as) => as.map((a) => a.getAttribute('href')))
  for (const view of views.length ? views : ['']) {
    if (view) { await page.goto('file://' + path + view); await page.waitForTimeout(150) }
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth)
    if (scroll > width) problems.push(`${width}px ${view || 'page'}: scrolls sideways (${scroll}px wide)`)
    await page.screenshot({ path: `${dir}/check-${width}-${(view || '#page').slice(1)}.png` })
  }
  await page.close()
}
await browser.close()
if (problems.length) { console.error('check-mockup FAILED\n  ' + problems.join('\n  ')); process.exit(1) }
console.log(`check-mockup: ok (390 and 1280 px, no sideways scroll, no errors). Screenshots: ${dir}/check-*.png`)
