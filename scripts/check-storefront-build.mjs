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
import { appBudgetProblems, appBudgetRows, appShellProblems, closest, marginProblems, VERCEL_MARGIN_KB, zodProblems } from './lib/app-budget.mjs'

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
// TS1a: a page (About, FAQ) has no island of its own: held at the shell's weight (speed review LOW 7).
// Checkout 121.3 (PI·2 release, 2026-11-12): 248fa64 measured 120.73 kB here and passed on Vercel, whose build adds about
// 0.2 kB to the shared chunk; webpack's runtime lists every route's chunks, so each new console page costs every shop page
// a few bytes, and PI·2's pages tipped it to 121.0x there. Splitting the checkout form is the fix, not another raise.
// Split 2026-11-16 (no raise): the bag drawer's lines (bag-contents.tsx) load when the browser is idle or the bag opens,
// the attribution capture after the page runs (capture-attribution.ts), checkout's offers and code line on its mount
// (checkout-offers.tsx); bag-store and the modules it shares with every island ship once (next.config.ts, shop-shared).
// Measured here: checkout 121.08 → 119.46, About/FAQ 112.84 → 109.03, product 120.54 → 117.24 kB. The ceilings came down
// to about that + 0.5 (impact and speed reviews, 2026-11-16) so the room can't silently fill again: checkout back on the
// 120 budget, the product page too; About/FAQ 109.5.
// 109.8 (2026-11-23, release of credits and Studio's agent; the owner told the same day): the page's own script did not
// change (0.16 kB), but webpack's runtime, which every page ships, lists every lazy chunk in the app (2.52 kB gzipped
// now), and that day's console and partner pages took it from 109.3 here to 109.5x on Vercel. The fix is fewer, larger
// lazy chunks app-wide (or a runtime per surface), not a split of this page: it has nothing left to split.
// Checkout 120.5 (2026-11-23, the owner told the same day; lane F, docs/plans/2026-11-23-page-weight.md, brings both back
// down): 119.75 kB here measured 120.0x on Vercel on a6b1a90b after passing on the two builds before it. A build that
// fails by chance also blocks the redeploy that switches Studio off, so the half kB is room for Vercel's variance, not for
// code: check the three closest pages before adding any.
// Back on the 120 budget the same day (lane F, page weight): the checkout's offer rows read one rule (says-online.ts)
// instead of every offer sentence, 119.8 → 118.7 kB here.
const TIGHT = { '/s/[host]/(shop)/pages/[handle]/page': 109.8 }
// The shop's stylesheet (shared, render-blocking): every theme's rules land in it, so it has a ceiling too.
const CSS_BUDGET_KB = 15.9 // 14.9 measured 2026-11-09 after Signal S2 (story sections, Caveat, scale; console rules moved to the app sheet) + 1 kB; was 22.5 before the shop's own sheet
// Theme Studio TS0b: a design's block rules (.store-b-*, src/app/base.css) have their own ceiling inside the sheet.
const BLOCK_CSS_KB = 1.0
// One-address P2·3: a code-site store's checkout, bag-link, order and policy pages draw the brand record's faces
// (Mukta, Tiro Devanagari Hindi: src/components/shop-preview/brand-fonts.ts), so those routes carry their @font-face
// rules (0.35 kB gzipped, measured 2026-11-22; the faces themselves download only where a record uses them). They have
// their own ceiling here, outside the sheet's: the shop's shared sheet keeps its 15.9 kB for every theme shop.
const BRAND_FONTS_CSS_KB = 0.45
const isBrandFonts = (f) => readFileSync(join('.next', f), 'utf8').includes('--font-store-mukta')
/** The whole of a page's CSS stays under the two ceilings together (architecture review 2026-11-22). */
const css_total_over = (files) => files.filter((f) => f.endsWith('.css')).reduce((a, f) => a + gz(f), 0) / 1024 > CSS_BUDGET_KB + BRAND_FONTS_CSS_KB
// The visit beacon (A·2, public/fe.js): a static async script the shell adds to every live shop page. It isn't a build
// chunk, so it isn't in a page's first-load figure (it runs in its own task, after parsing: 0 TBT; speed review
// 2026-11-11), but its bytes are shown beside each page's and held by scripts/build-beacon.mjs (≤ 1.7 kB gzip).
const BEACON_KB = existsSync('public/fe.js') ? gzipSync(readFileSync('public/fe.js')).length / 1024 : 0
const failures = []
// Every budgeted page's first-load script and its limit: the margin check and the success line read them (below).
const rows = []
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
  // The console's icon set (src/components/icons/icon.tsx) never reaches a shop's browser: the shop draws its own
  // marks (close-mark.tsx; the console set cost every shop page about 2 kB, 2026-11-11). Marker: its `home` path.
  for (const f of files) if (f.endsWith('.js') && readFileSync(join('.next', f), 'utf8').includes('M4 10.5 12 4l8 6.5V20H4z')) failures.push(`${k}  carries the console's icon set through ${f} (draw the mark in src/components/storefront)`)
  if (!k.endsWith('/page')) continue
  // Everything this page loads: the root layout, each layout on the way down, and the page (each file once).
  const parts = k.split('/').slice(0, -1)
  const above = ['/layout', ...parts.map((_, i) => `${parts.slice(0, i + 1).join('/')}/layout`).filter((l) => l !== '/layout' && build[l])]
  const all = [...new Set([...above.flatMap((l) => build[l] ?? []), ...files])]
  const fonts = all.filter((f) => f.endsWith('.css') && isBrandFonts(f)).reduce((a, f) => a + gz(f), 0) / 1024
  if (css_total_over(all)) failures.push(`${k}  loads more than ${CSS_BUDGET_KB + BRAND_FONTS_CSS_KB} kB of CSS gzipped in all (the sheet and the brand faces)`)
  if (fonts > BRAND_FONTS_CSS_KB) failures.push(`${k}  loads ${fonts.toFixed(2)} kB of the brand faces' rules gzipped (budget ${BRAND_FONTS_CSS_KB} kB)`)
  const css = all.filter((f) => f.endsWith('.css') && !isBrandFonts(f)).reduce((a, f) => a + gz(f), 0) / 1024
  // Signal S2-0: a shop page loads the shop's own sheet (src/app/shop.css), never the app's (globals.css: console classes).
  for (const f of all) if (f.endsWith('.css') && readFileSync(join('.next', f), 'utf8').includes('--frrata-sheet-app')) failures.push(`${k}  loads the app's stylesheet (${f}); a shop page loads src/app/shop.css only`)
  if (css > CSS_BUDGET_KB) failures.push(`${k}  loads ${css.toFixed(1)} kB of CSS gzipped (budget ${CSS_BUDGET_KB} kB)`)
  const kb = all.filter((f) => f.endsWith('.js')).reduce((a, f) => a + gz(f), 0) / 1024
  if (process.env.SHOW_BUDGETS) console.log(`  ${k}: ${kb.toFixed(1)} kB JS (${(kb + BEACON_KB).toFixed(1)} with the beacon), ${css.toFixed(1)} kB CSS`)
  const limit = TIGHT[k] ?? BUDGET_KB
  rows.push({ page: k, kb, limit })
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

// Zod never loads with a page (page weight 2026-11-23: 26 kB gzipped in Console › Content's, the product editor's and
// the customizer's first load, through files their forms read for a cap or a list). Every action validates on the
// server; a browser that wants a cheap check reads the zod-free half of a domain module (its *-facts.ts). A form that
// truly needs zod loads it with next/dynamic. And every Console page loads the shell's one chunk (next.config appShell).
for (const p of zodProblems(build, (f) => readFileSync(join('.next', f), 'utf8'))) failures.push(p)
for (const p of appShellProblems(build)) failures.push(p)

// The Look customizer's first-load script (Theme Studio spec § Guardrails, the Console gate; TS0b): 207.4 kB measured
// 2026-11-11 after Menus and Site settings moved behind next/dynamic, with the designs added. It only comes down: the
// studio (TS2) has its own ceiling. A new form loads when opened (next/dynamic), as the story and design forms do.
// 2026-11-23: 171.4 kB once the upload client (@vercel/blob/client, 33 kB with its token library) loads at the first
// upload; the ceiling came down from 208. A section's form is back in the first load (175.0 kB): its lazy chunk cost every
// shop page a few bytes of runtime, and checkout crossed 120 on Vercel that day.
// 147.7 kB the same day once zod left (its forms read their caps from sections-facts.ts and site-facts.ts) and the shell
// loads once (lane F, page weight): the ceiling came down from 177 to that + 2.
const CUSTOMIZER_KB = 149.7
{
  const k = Object.keys(build).find((x) => /\/console\/look\/customize\/page$/.test(x))
  if (!k) failures.push('the Look customizer page is missing from the build manifest')
  else {
    const parts = k.split('/').slice(0, -1)
    const above = ['/layout', ...parts.map((_, i) => `${parts.slice(0, i + 1).join('/')}/layout`).filter((l) => l !== '/layout' && build[l])]
    const kb = [...new Set([...above.flatMap((l) => build[l] ?? []), ...build[k]])].filter((f) => f.endsWith('.js')).reduce((a, f) => a + gz(f), 0) / 1024
    if (process.env.SHOW_BUDGETS) console.log(`  ${k}: ${kb.toFixed(1)} kB JS`)
    rows.push({ page: k, kb, limit: CUSTOMIZER_KB })
    if (kb > CUSTOMIZER_KB) failures.push(`${k}  ships ${kb.toFixed(1)} kB of script gzipped (budget ${CUSTOMIZER_KB} kB) — load a form when it opens (next/dynamic)`)
  }
}

for (const p of appBudgetProblems(build, gz, process.env.SHOW_BUDGETS ? console.log : () => {})) failures.push(p)
rows.push(...appBudgetRows(build, gz))
// Off Vercel, a page within VERCEL_MARGIN_KB of its limit fails here, before a deploy meets it (scripts/lib/app-budget.mjs).
if (!process.env.VERCEL) for (const p of marginProblems(rows)) failures.push(p)

// TS0b: the block rules alone, gzipped (speed review 7): every .store-b- rule in the shop's sheets, @media included.
{
  // The shop's own sheet (src/app/shop.css) is the root layout's: every built sheet without the app's marker.
  const sheets = [...new Set(Object.values(build).flat().filter((f) => f.endsWith('.css') && !readFileSync(join('.next', f), 'utf8').includes('--frrata-sheet-app')))]
  const rules = sheets.flatMap((f) => readFileSync(join('.next', f), 'utf8').match(/[^{}]*\.store-b-[^{}]*\{[^{}]*\}/g) ?? [])
  const kb = gzipSync(Buffer.from([...new Set(rules)].join(''))).length / 1024
  if (process.env.SHOW_BUDGETS) console.log(`  block rules: ${kb.toFixed(2)} kB CSS`)
  if (kb > BLOCK_CSS_KB) failures.push(`the design blocks' rules (.store-b-) are ${kb.toFixed(2)} kB gzipped (budget ${BLOCK_CSS_KB} kB)`)
}

if (failures.length) {
  console.error('check:storefront-build:')
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}
console.log(`check:storefront-build — clean (${shopPages.length} shop routes cached per path, script under ${BUDGET_KB} kB${process.env.VERCEL ? '' : `, every page at least ${VERCEL_MARGIN_KB} kB under its limit`})`)
console.log(`  closest to their limits: ${closest(rows)}`)
