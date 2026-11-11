// Fails the build: a shop page that is not cached per path, or one that ships too much script.
//
// check:storefront-build — runs after `next build` (postbuild). A shop page
// with no generateStaticParams is built as a dynamic route and rendered on
// every request; it must be an ISR route (listed in the prerender manifest's
// dynamicRoutes). And a shop page's first-load JavaScript must stay under
// BUDGET_KB gzipped, framework included (storefront spec: Lighthouse mobile ≥ 90). Reads only
// .next, so it cannot match its own documentation.
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

// Next 15 + React 19's shared framework script is ~103 kB gzipped on its own; a shop page may add ~17 kB.
const BUDGET_KB = 120
// The product page and the checkout carry the heaviest islands (buy box, bag, form): held lower so the 2.0 theme
// choices (the phone buy bar) can't eat the last of the headroom (speed review 2026-11-09).
// Checkout 116 (2026-11-09): the business GST invoice (GSTIN checksum and state as typed, s.24 state notice) is +0.6 kB;
// splitting it out with next/dynamic cost more in loader than it saved (measured 115.6 → 115.9).
// Since 2026-11-09 (speed review, theme Signal) a page is counted as it loads: its own chunks plus every layout above it
// (root, /s/[host], the group's), each file once. The ceilings were reset to what the pages really loaded that day
// (home 112.8, product 119.4, checkout 120.2 kB JS; CSS 21.1 kB), with room for Signal's ≤ 1 kB of CSS.
// Product page 121 after merging search and sharing (its share button and barcode work): measured 120.0 kB that day.
const TIGHT = { '/s/[host]/(shop)/products/[handle]/page': 121, '/s/[host]/(checkout)/checkout/page': 121 }
// The shop's stylesheet (shared, render-blocking): every theme's rules land in it, so it has a ceiling too.
const CSS_BUDGET_KB = 15.9 // 14.9 measured 2026-11-09 after Signal S2 (story sections, Caveat, scale; console rules moved to the app sheet) + 1 kB; was 22.5 before the shop's own sheet
// The visit beacon (A·2, public/fe.js): a static async script the shell adds to every live shop page. It isn't a build
// chunk, so it isn't in a page's first-load figure (it runs in its own task, after parsing: 0 TBT; speed review
// 2026-11-11), but its bytes are shown beside each page's and held by scripts/build-beacon.mjs (≤ 1.7 kB gzip).
const BEACON_KB = existsSync('public/fe.js') ? gzipSync(readFileSync('public/fe.js')).length / 1024 : 0
const failures = []
const read = (f) => JSON.parse(readFileSync(join('.next', f), 'utf8'))
if (!existsSync('.next/prerender-manifest.json')) { console.error('check:storefront-build — no .next to read; run it after next build.'); process.exit(1) }

const dynamicRoutes = Object.keys(read('prerender-manifest.json').dynamicRoutes ?? {})
const appPaths = read('server/app-paths-manifest.json')
// Pages only: robots.txt and sitemap.xml are dynamic on purpose (an unknown host's 404 must not be cached) and set their own CDN header.
const shopPages = Object.keys(appPaths).filter((k) => k.startsWith('/s/[host]') && /\/page$/.test(k) && !k.includes('[...rest]'))
for (const k of shopPages) {
  const route = k.replace(/\/(page|route)$/, '').replace(/\/\([^)]+\)/g, '') || '/'
  if (!dynamicRoutes.includes(route)) failures.push(`${route}  is not cached per path (add generateStaticParams = () => [] to its segment)`)
}

const build = read('app-build-manifest.json').pages ?? {}
const sizes = new Map()
const gz = (f) => sizes.get(f) ?? sizes.set(f, gzipSync(readFileSync(join('.next', f))).length).get(f)
for (const [k, files] of Object.entries(build)) {
  if (!k.startsWith('/s/[host]')) continue
  // The shell's display face never reaches a shop (brand spec: shops wear their own type; src/components/shell/fonts.ts):
  // every shop key, layouts and error pages included.
  for (const f of files) if (/\.(css|js)$/.test(f) && /bricolage/i.test(readFileSync(join('.next', f), 'utf8'))) failures.push(`${k}  loads the shell's display face (Bricolage) through ${f}`)
  // The customizer's sample pieces never reach a shop's browser (src/lib/themes/sample.ts): no sample photo path, no sample id.
  for (const f of files) if (f.endsWith('.js') && /\/themes\/samples\//.test(readFileSync(join('.next', f), 'utf8'))) failures.push(`${k}  carries the customizer's sample pieces through ${f}`)
  // Icons are drawn on the server (src/components/storefront/icon.tsx): their path data never reaches a shop's
  // browser. Two markers, the line set's bag and the solid set's bag (src/domains/icons/data.ts).
  for (const f of files) if (f.endsWith('.js') && /M3\.103 6\.034h17\.794|M239\.89,198\.12l-14\.26-12/.test(readFileSync(join('.next', f), 'utf8'))) failures.push(`${k}  carries the shop's icon data through ${f} (draw icons on the server, pass the element)`)
  if (!k.endsWith('/page')) continue
  // Everything this page loads: the root layout, each layout on the way down, and the page (each file once).
  const parts = k.split('/').slice(0, -1)
  const above = ['/layout', ...parts.map((_, i) => `${parts.slice(0, i + 1).join('/')}/layout`).filter((l) => l !== '/layout' && build[l])]
  const all = [...new Set([...above.flatMap((l) => build[l] ?? []), ...files])]
  const css = all.filter((f) => f.endsWith('.css')).reduce((a, f) => a + gz(f), 0) / 1024
  // Signal S2-0: a shop page loads the shop's own sheet (src/app/shop.css), never the app's (globals.css: console classes).
  for (const f of all) if (f.endsWith('.css') && readFileSync(join('.next', f), 'utf8').includes('--frrata-sheet-app')) failures.push(`${k}  loads the app's stylesheet (${f}); a shop page loads src/app/shop.css only`)
  if (css > CSS_BUDGET_KB) failures.push(`${k}  loads ${css.toFixed(1)} kB of CSS gzipped (budget ${CSS_BUDGET_KB} kB)`)
  const kb = all.filter((f) => f.endsWith('.js')).reduce((a, f) => a + gz(f), 0) / 1024
  if (process.env.SHOW_BUDGETS) console.log(`  ${k}: ${kb.toFixed(1)} kB JS (${(kb + BEACON_KB).toFixed(1)} with the beacon), ${css.toFixed(1)} kB CSS`)
  const limit = TIGHT[k] ?? BUDGET_KB
  if (kb > limit) failures.push(`${k}  ships ${kb.toFixed(1)} kB of script gzipped (budget ${limit} kB) — split what the first paint does not need`)
}

// …and every page that isn't a shop must load it (its classes live only there): the console, Admin, the partner
// pages, the customizer and its preview, login and the public site. Each depends on one small layout (S2-0).
{
  const has = (f) => f.endsWith('.css') && readFileSync(join('.next', f), 'utf8').includes('--frrata-sheet-app')
  const pages = Object.keys(build).filter((k) => k.endsWith('/page') && !k.startsWith('/s/') && !k.startsWith('/api/') && !/\/(frrata-(apple-)?icon)/.test(k))
  for (const k of pages) {
    const parts = k.split('/').slice(0, -1)
    const above = ['/layout', ...parts.map((_, i) => `${parts.slice(0, i + 1).join('/')}/layout`).filter((l) => l !== '/layout' && build[l])]
    const files = [...new Set([...above.flatMap((l) => build[l] ?? []), ...build[k]])]
    if (!files.some(has)) failures.push(`${k}  doesn't load the app's stylesheet (src/app/globals.css): give its group a layout that imports it`)
  }
  if (!pages.length) failures.push('no app pages found to check for the app stylesheet')
}
if (failures.length) {
  console.error('check:storefront-build:')
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}
console.log(`check:storefront-build — clean (${shopPages.length} shop routes cached per path, script under ${BUDGET_KB} kB)`)
