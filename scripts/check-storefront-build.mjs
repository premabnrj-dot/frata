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
const TIGHT = { '/s/[host]/(shop)/products/[handle]/page': 115, '/s/[host]/(checkout)/checkout/page': 115 }
// The shop's stylesheet (shared, render-blocking): every theme's rules land in it, so it has a ceiling too.
const CSS_BUDGET_KB = 20
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
  const css = files.filter((f) => f.endsWith('.css')).reduce((a, f) => a + gz(f), 0) / 1024
  if (css > CSS_BUDGET_KB) failures.push(`${k}  loads ${css.toFixed(1)} kB of CSS gzipped (budget ${CSS_BUDGET_KB} kB)`)
  if (!k.endsWith('/page')) continue
  const kb = files.filter((f) => f.endsWith('.js')).reduce((a, f) => a + gz(f), 0) / 1024
  const limit = TIGHT[k] ?? BUDGET_KB
  if (kb > limit) failures.push(`${k}  ships ${kb.toFixed(1)} kB of script gzipped (budget ${limit} kB) — split what the first paint does not need`)
}

if (failures.length) {
  console.error('check:storefront-build:')
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}
console.log(`check:storefront-build — clean (${shopPages.length} shop routes cached per path, script under ${BUDGET_KB} kB)`)
