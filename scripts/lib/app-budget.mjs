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
export const APP_PINNED = {
  '/(console)/console/content/page': 227.2,
  '/(console)/console/products/[handle]/page': 209.1,
  '/(console)/console/settings/[section]/page': 187.0,
  '/(console)/console/orders/page': 160.2,
  '/(console)/console/offers/[id]/page': 154.1,
  '/(console)/console/collections/[handle]/page': 152.9,
  '/(console)/console/collections/new/page': 151.6,
  '/(console)/console/offers/new/page': 151.3,
  '/(console)/console/preview/[[...path]]/page': 150.6,
}
// build: app-build-manifest's pages; gz: (file) => gzipped bytes. Pure, so a test can hand it a manifest.
/** @param {Record<string, number>} [pinned] */
export function appBudgetProblems(build, gz, show = () => {}, budget = APP_BUDGET_KB, pinned = /** @type {Record<string, number>} */ (APP_PINNED)) {
  const out = []
  for (const [k, files] of Object.entries(build)) {
    if (!/^\/\((console|admin|partner)\)\//.test(k) || !k.endsWith('/page')) continue
    const parts = k.split('/').slice(0, -1)
    const above = ['/layout', ...parts.map((_, i) => `${parts.slice(0, i + 1).join('/')}/layout`).filter((l) => l !== '/layout' && build[l])]
    const kb = [...new Set([...above.flatMap((l) => build[l] ?? []), ...files])].filter((f) => f.endsWith('.js')).reduce((a, f) => a + gz(f), 0) / 1024
    show(`  ${k}: ${kb.toFixed(1)} kB JS`)
    const limit = pinned[k] ?? budget
    if (kb > limit) out.push(`${k}  ships ${kb.toFixed(1)} kB of script gzipped (budget ${limit} kB) — load what the first paint does not need with next/dynamic`)
  }
  for (const k of Object.keys(pinned)) if (!build[k]) out.push(`${k}  is pinned in APP_PINNED but no longer built — remove its pin`)
  return out
}
