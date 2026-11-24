// =============================================================================
// FILE: scripts/lib/app-budget.mjs — the first-load script budget of Console, Admin and partner pages, read by
// check:storefront-build after next build (practices plan, task 7). Pure: a test hands it a manifest.
// =============================================================================

// Console, Admin and the partner workspace: 150 kB gz of first-load script a page, counted as a shop page is (the
// layouts above it + the page; frata-architecture § Speed). PINNED: pages at or over 148 kB on 2026-11-16 (practices
// plan, task 7), each at what it loaded that day + 2 kB (Vercel's build adds ~0.2 kB, and every new route grows
// webpack's runtime a little). A pin only comes down; over budget → load what the first paint does not need with
// next/dynamic, never raise a number. The customizer (/(lookeditor)) has its own ceiling in check-storefront-build.mjs.
export const APP_BUDGET_KB = 150
// 2026-11-23 (page weight, docs/plans/2026-11-23-page-weight.md): the shell loads once (next.config's appShell) and zod,
// the GST rate table and the discount maths left these pages' first load; each pin came down to what it measured + 2.
// Several now sit under the 150 budget: they hold what was won (before → after: Content 194.4 → 155.8, a product 208.3
// → 176.0, Orders 159.0 → 146.7). Lowered again the same day after the 8-character hashes and the theme faces'
// stylesheet (each page 0.2–0.4 kB lighter): measured + 2.
export const APP_PINNED = {
  '/(console)/console/content/page': 157.6,
  '/(console)/console/products/[handle]/page': 177.7,
  '/(console)/console/settings/[section]/page': 150.9,
  '/(console)/console/orders/page': 148.5,
  '/(console)/console/offers/[id]/page': 144.3,
  '/(console)/console/collections/[handle]/page': 146.8,
  '/(console)/console/collections/new/page': 145.5,
  '/(console)/console/offers/new/page': 141.5,
  '/(console)/console/preview/[[...path]]/page': 150.1,
  // The Studio workbench (plan 2026-11-22 WB·3, speed review M: at most 150): what the shell loaded on 2026-11-22
  // (131.4 kB) + 2, so growth is a finding. Code, Checks and Versions load with next/dynamic; no diff or highlight library.
  '/(partner)/partner/fixtures/studio/page': 133.4,
  // Sign-up (O1·8, plan 2026-11-23-o1-signup): never more than it loaded on main before O1 (128.5 kB, 2026-11-23); the
  // popup, the WhatsApp step and the email step load with next/dynamic.
  '/start/page': 128.5,
  // Home (O2a·7, plan 2026-11-23-o2a-setup-card § Performance): before the setup card 140.7 kB, after 142.0 kB (the
  // card's island; its popups, the uploader and the moment load with next/dynamic) + 2, so growth is a finding.
  '/(console)/console/page': 144.0,
  // The live Studio screen (V3a R7): the same shell, at the fixture's pin (plan docs/plans/2026-11-22-v3a-runtime.md).
  '/(partner)/partner/studio/page': 133.4,
}
/** Pages outside Console, Admin and the partner workspace held to their pin (their own surface, the same count). */
const ALSO = ['/start/page']

// Vercel's build weighs a page about 0.2–0.3 kB more than a local one, and two builds of one commit differ by a few
// bytes (five production builds failed that way on 2026-11-23, each a fraction of a kB over). Off Vercel, a page within
// this much of its limit fails, so a local build or CI meets the limit before a deploy does. On Vercel only the limit
// itself counts: there the margin is already spent.
export const VERCEL_MARGIN_KB = 0.5

/** What a failure tells a developer to run first: the page's files, heaviest first, and the components that bring each. */
export const weighIt = (page) => `npm run weight -- '${page}'`

/** The layouts above a page, then the page: every file it loads first, each once. */
export const firstLoad = (build, k) => {
  const parts = k.split('/').slice(0, -1)
  const above = ['/layout', ...parts.map((_, i) => `${parts.slice(0, i + 1).join('/')}/layout`).filter((l) => l !== '/layout' && build[l])]
  return [...new Set([...above.flatMap((l) => build[l] ?? []), ...(build[k] ?? [])])]
}

/** A Console, Admin or partner page's (or an ALSO page's) first-load script and its limit, one row a page.
 * @param {Record<string, number>} [pinned]
 * @returns {{ page: string, kb: number, limit: number }[]} */
export function appBudgetRows(build, gz, budget = APP_BUDGET_KB, pinned = /** @type {Record<string, number>} */ (APP_PINNED)) {
  const rows = []
  for (const k of Object.keys(build)) {
    if ((!/^\/\((console|admin|partner)\)\//.test(k) || !k.endsWith('/page')) && !ALSO.includes(k)) continue
    const kb = firstLoad(build, k).filter((f) => f.endsWith('.js')).reduce((a, f) => a + gz(f), 0) / 1024
    rows.push({ page: k, kb, limit: pinned[k] ?? budget })
  }
  return rows
}

// build: app-build-manifest's pages; gz: (file) => gzipped bytes. Pure, so a test can hand it a manifest.
/** @param {Record<string, number>} [pinned] */
export function appBudgetProblems(build, gz, show = () => {}, budget = APP_BUDGET_KB, pinned = /** @type {Record<string, number>} */ (APP_PINNED)) {
  const out = []
  for (const { page, kb, limit } of appBudgetRows(build, gz, budget, pinned)) {
    show(`  ${page}: ${kb.toFixed(1)} kB JS`)
    if (kb > limit) out.push(`${page}  ships ${kb.toFixed(1)} kB of script gzipped (budget ${limit} kB). Run ${weighIt(page)} to see which files and components it loads; load what the first paint does not need with next/dynamic, or import a constant from a *-facts.ts half instead of a file that brings a library. Never raise the number`)
  }
  for (const k of Object.keys(pinned)) if (!build[k]) out.push(`${k}  is pinned in APP_PINNED but no longer built — remove its pin`)
  return out
}

/** Pages under their limit by less than `margin` (a page over it fails on its own line). The whole page only: a shop
 * page's own-files ceiling (`own`) has no margin, since Vercel's extra weight lands in the framework files it leaves out
 * (a NEXT_DEPLOYMENT_ID build, 2026-11-23); that ceiling's 0.5 kB above measured is its own tripwire.
 * @param {{ page: string, kb: number, limit: number }[]} rows */
export function marginProblems(rows, margin = VERCEL_MARGIN_KB) {
  return rows.filter((r) => r.kb <= r.limit && r.limit - r.kb < margin).map((r) =>
    `${r.page}  ships ${r.kb.toFixed(2)} kB of script gzipped, within ${margin} kB of its limit (${r.limit} kB): Vercel's build weighs about 0.3 kB more, so take weight off — never raise the number. ` +
    (r.page.startsWith('/s/')
      // A shop page is mostly framework, and webpack's runtime (every page ships it) lists every lazy chunk in the app,
      // about 16 bytes each: a next/dynamic added in the console can tip a shop page nobody touched.
      ? `A shop page: ${weighIt(r.page)} shows its own files beside the framework; if they did not change, React, Next or webpack's runtime grew (a Next upgrade, or many new lazy chunks elsewhere), which is the owner's call, not this page's`
      : `Run ${weighIt(r.page)}: a lighter import (a *-facts.ts half), or next/dynamic for what the first paint does not need`)
  )
}

/** What the name zod gives its errors leaves in a minified chunk: `"ZodError"` (zod) and `"$ZodError"` (zod/mini, core). */
export const ZOD_MARK = 'ZodError"'
/** Pages whose first-load script holds zod. read: (file) => its text.
 * @returns {string[]} */
export function zodProblems(build, read) {
  const out = []
  for (const k of Object.keys(build).filter((x) => x.endsWith('/page'))) {
    const hit = firstLoad(build, k).find((f) => f.endsWith('.js') && read(f).includes(ZOD_MARK))
    if (hit) out.push(`${k}  loads zod in its first load (${hit}). Run ${weighIt(k)}: the components listed against that file bring it. Import their constants from the zod-free *-facts.ts half of the domain file (check:layers keeps those zod-free), or load the form with next/dynamic. Validation stays in the server action`)
  }
  return out
}

/** A Console page that doesn't load the shell's one chunk (next.config's appShell group): its shell modules are loaded
 * twice again, 4.6–7.1 kB gzipped (page weight 2026-11-23). */
export function appShellProblems(build) {
  const pages = Object.keys(build).filter((k) => /^\/\(console\)\/console\//.test(k) && k.endsWith('/page'))
  const without = pages.filter((k) => !firstLoad(build, k).some((f) => /(^|\/)app-shell-[0-9a-f]+\.js$/.test(f)))
  if (!pages.length) return ['no Console pages found to check for the shell chunk (app-shell-*.js)']
  return without.length ? [`${without.length} Console page(s) load no app-shell-*.js, e.g. ${without[0]}: next.config's appShell group matched nothing (were the entries renamed?), so the shell is loaded twice`] : []
}

/** The `n` pages with the least room under their limits, least first, as one line for the success message. A shop page
 * with an own-files ceiling (`own`, check-storefront-build's SHOP_OWN) shows both numbers and counts its smaller room.
 * @param {{ page: string, kb: number, limit: number, own?: { kb: number, limit: number } }[]} rows */
export function closest(rows, n = 3) {
  const room = (r) => Math.min(r.limit - r.kb, r.own ? r.own.limit - r.own.kb : Infinity)
  return [...rows].sort((a, b) => room(a) - room(b)).slice(0, n)
    .map((r) => `${r.page} ${r.kb.toFixed(1)}/${r.limit} kB (${(r.limit - r.kb).toFixed(1)} kB room)` +
      (r.own ? `, own files ${r.own.kb.toFixed(2)}/${r.own.limit} kB (${(r.own.limit - r.own.kb).toFixed(2)} kB room)` : '')).join('; ')
}

// The owner's option E (2026-11-23): a shop page's OWN files are its first load minus build-manifest's rootMainFiles
// (webpack's runtime, React, Next's router, main-app). They still include the next/link chunk (Next's app-dir link.js,
// about 3.3 kB of About/FAQ's 8.1), so a Next upgrade can move this number too.
/** kB gzipped of a page's first-load script that isn't in `rootMain`. */
export function ownKb(files, rootMain, gz) {
  return files.filter((f) => f.endsWith('.js') && !rootMain.has(f)).reduce((a, f) => a + gz(f), 0) / 1024
}

/** Shop pages over their own-files ceiling, and ceilings (whole or own) naming a page the build no longer has.
 * @param {{ page: string, own?: { kb: number, limit: number } }[]} rows
 * @param {string[]} ceilingKeys every page named in check-storefront-build's TIGHT and SHOP_OWN */
export function ownProblems(rows, ceilingKeys) {
  const out = rows.filter((r) => r.own && r.own.kb > r.own.limit).map((r) =>
    `${r.page}  ships ${r.own.kb.toFixed(2)} kB of its own script gzipped (React, Next's router and webpack's runtime aside; ceiling ${r.own.limit} kB): the shop's own code only comes down. Run ${weighIt(r.page)} to see which shop components bring which file, and load what the first paint does not need with next/dynamic. If no shop file changed, a Next upgrade may have grown next/link's chunk (app-dir/link)`)
  const built = new Set(rows.map((r) => r.page))
  for (const k of new Set(ceilingKeys)) if (!built.has(k)) out.push(`${k}  has a shop ceiling (TIGHT or SHOP_OWN) but no longer builds: move its ceiling to the page's new name`)
  return out
}

/** Option A (next.config.ts): webpack's runtime lists each lazy chunk by an 8-character hash. Fails a runtime that lists
 * a longer one (Next's chunkFilename changed and the override no longer applies), or that lists none of 8 while the app
 * has lazy chunks (the runtime's format changed and this check could no longer see either). Calibrated on Next 15.5's
 * runtime, `{504:"15cac9d4",…}`.
 * @param {string} runtimeText @param {number} lazyFiles how many files react-loadable-manifest.json lists */
export function runtimeHashProblems(runtimeText, lazyFiles, name = 'the webpack runtime') {
  if (/\d+:"[0-9a-f]{9,}"/.test(runtimeText)) return [`${name}  lists lazy chunks by hashes longer than 8 characters: next.config.ts's chunkFilename override (option A) no longer applies — Next's default name pattern probably changed`]
  if (lazyFiles > 0 && !/\d+:"[0-9a-f]{8}"/.test(runtimeText)) return [`${name}  lists no lazy chunk by an 8-character hash although the app has ${lazyFiles} lazy files: the runtime's format changed, so this check no longer sees the hashes`]
  return []
}
