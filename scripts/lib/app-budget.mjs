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
// → 176.0, Orders 159.0 → 146.7).
export const APP_PINNED = {
  '/(console)/console/content/page': 157.8,
  '/(console)/console/products/[handle]/page': 178,
  '/(console)/console/settings/[section]/page': 151.7,
  '/(console)/console/orders/page': 148.7,
  '/(console)/console/offers/[id]/page': 144.5,
  '/(console)/console/collections/[handle]/page': 146.9,
  '/(console)/console/collections/new/page': 145.6,
  '/(console)/console/offers/new/page': 141.6,
  '/(console)/console/preview/[[...path]]/page': 150.5,
  // The Studio workbench (plan 2026-11-22 WB·3, speed review M: at most 150): what the shell loaded on 2026-11-22
  // (131.4 kB) + 2, so growth is a finding. Code, Checks and Versions load with next/dynamic; no diff or highlight library.
  '/(partner)/partner/fixtures/studio/page': 133.4,
  // The live Studio screen (V3a R7): the same shell, at the fixture's pin (plan docs/plans/2026-11-22-v3a-runtime.md).
  '/(partner)/partner/studio/page': 133.4,
}

// Vercel's build weighs a page about 0.2–0.3 kB more than a local one, and two builds of one commit differ by a few
// bytes (five production builds failed that way on 2026-11-23, each a fraction of a kB over). Off Vercel, a page within
// this much of its limit fails, so a local build or CI meets the limit before a deploy does. On Vercel only the limit
// itself counts: there the margin is already spent.
export const VERCEL_MARGIN_KB = 0.5

/** The layouts above a page, then the page: every file it loads first, each once. */
export const firstLoad = (build, k) => {
  const parts = k.split('/').slice(0, -1)
  const above = ['/layout', ...parts.map((_, i) => `${parts.slice(0, i + 1).join('/')}/layout`).filter((l) => l !== '/layout' && build[l])]
  return [...new Set([...above.flatMap((l) => build[l] ?? []), ...(build[k] ?? [])])]
}

/** A Console, Admin or partner page's first-load script and its limit, one row a page.
 * @param {Record<string, number>} [pinned]
 * @returns {{ page: string, kb: number, limit: number }[]} */
export function appBudgetRows(build, gz, budget = APP_BUDGET_KB, pinned = /** @type {Record<string, number>} */ (APP_PINNED)) {
  const rows = []
  for (const k of Object.keys(build)) {
    if (!/^\/\((console|admin|partner)\)\//.test(k) || !k.endsWith('/page')) continue
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
    if (kb > limit) out.push(`${page}  ships ${kb.toFixed(1)} kB of script gzipped (budget ${limit} kB) — load what the first paint does not need with next/dynamic`)
  }
  for (const k of Object.keys(pinned)) if (!build[k]) out.push(`${k}  is pinned in APP_PINNED but no longer built — remove its pin`)
  return out
}

/** Pages under their limit by less than `margin` (a page over it fails on its own line).
 * @param {{ page: string, kb: number, limit: number }[]} rows */
export function marginProblems(rows, margin = VERCEL_MARGIN_KB) {
  return rows.filter((r) => r.kb <= r.limit && r.limit - r.kb < margin).map((r) =>
    `${r.page}  ships ${r.kb.toFixed(2)} kB of script gzipped, within ${margin} kB of its limit (${r.limit} kB): Vercel's build weighs about 0.3 kB more, so take weight off — never raise the number. ` +
    (r.page.startsWith('/s/')
      // A shop page is mostly framework, and webpack's runtime (every page ships it) lists every lazy chunk in the app,
      // about 16 bytes each: a next/dynamic added in the console can tip a shop page nobody touched.
      ? 'A shop page: if its own files did not change, a new lazy chunk elsewhere grew the runtime (docs/plans/2026-11-23-page-weight.md § Point 3); load that form with the page instead, or take weight off the shop'
      : 'A lighter import (a *-facts.ts half), or next/dynamic for what the first paint does not need')
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
    if (hit) out.push(`${k}  loads zod in its first load (${hit}): import the zod-free *-facts.ts half, or load the form with next/dynamic`)
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
