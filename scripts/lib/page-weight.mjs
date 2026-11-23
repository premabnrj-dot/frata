// =============================================================================
// FILE: scripts/lib/page-weight.mjs — what one page loads first, file by file, and which browser components bring each
// file (page weight, 2026-11-23). Read by `npm run weight -- <page>` (scripts/page-weight.mjs), which every budget failure
// in check:storefront-build names. Pure: a test hands it a manifest.
// =============================================================================

import { firstLoad, ZOD_MARK } from './app-budget.mjs'

/** The app-build-manifest key for what a person typed: the key itself, or a URL path ("/console/brand"), or a page's
 * folder ("console/brand"). Route groups and dynamic segments match as they are written in the key.
 * @param {Record<string, string[]>} build @param {string} asked */
export function pageKey(build, asked) {
  if (build[asked]) return asked
  const want = '/' + asked.replace(/^\/+|\/+$/g, '').replace(/\/page$/, '')
  const path = (k) => k.replace(/\/page$/, '').replace(/\/\([^)]+\)/g, '') || '/'
  const hits = Object.keys(build).filter((k) => k.endsWith('/page') && (path(k) === want || path(k) === want.replace(/^\/s\/[^/]+/, '/s/[host]')))
  return hits.length === 1 ? hits[0] : hits
}

/** Libraries worth knowing about when they ride in a first load, each by a string its minified code keeps (checked on
 * the 2026-11-23 build). zod never may (check:storefront-build); the others are a hint for where weight comes from. */
export const LIBRARY_MARKS = [
  ['zod', ZOD_MARK],
  ['tailwind-merge (cn)', '"mix-blend":[{"mix-blend"'],
  ['lucide-react icons', 'lucide'],
  ['passkeys (@simplewebauthn)', 'navigator.credentials'],
]
/** The LIBRARY_MARKS a file's text holds. */
export const librariesIn = (text) => LIBRARY_MARKS.filter(([, mark]) => text.includes(mark)).map(([name]) => name)

/** The page's first-load files, heaviest first, each with its kind and the client components that need it.
 * @param {Record<string, string[]>} build app-build-manifest pages
 * @param {Set<string>} rootMain build-manifest rootMainFiles (webpack's runtime, React, Next's router)
 * @param {(f: string) => number} gz gzipped bytes of a file
 * @param {Record<string, { chunks: string[] }>} clientModules the page's client reference manifest (source path → chunks)
 * @param {string} page an app-build-manifest key
 * @param {((f: string) => string) | null} read a file's text, to name the libraries in it */
export function weighPage(build, rootMain, gz, clientModules, page, cwd = '', read = null) {
  const files = firstLoad(build, page).filter((f) => f.endsWith('.js'))
  // The manifest names every client component in the app; one this page can render needs all its files loaded here.
  const here = new Set(files)
  const by = new Map()
  for (const [src, m] of Object.entries(clientModules)) {
    if (!src.includes('/src/') || /\.css$/.test(src)) continue
    const needs = (m.chunks ?? []).filter((f) => typeof f === 'string' && f.endsWith('.js'))
    if (!needs.length || !needs.every((f) => here.has(f))) continue
    const short = src.startsWith(cwd) ? src.slice(cwd.length).replace(/^\//, '') : src
    for (const f of needs) (by.get(f) ?? by.set(f, new Set()).get(f)).add(short)
  }
  const kind = (f) => rootMain.has(f) ? 'framework' : /(^|\/)app-shell-[0-9a-f]+\.js$/.test(f) ? 'shell' : /(^|\/)shop-shared-[0-9a-f]+\.js$/.test(f) ? 'shop-shared'
    : /(^|\/)app\/.*\/layout-[0-9a-f]+\.js$/.test(f) ? 'layout' : /(^|\/)app\/.*\/page-[0-9a-f]+\.js$/.test(f) ? 'page' : 'shared'
  const rows = files.map((f) => ({ file: f, kb: gz(f) / 1024, kind: kind(f), brought: [...(by.get(f) ?? [])].sort(), libs: read ? librariesIn(read(f)) : [] }))
    .sort((a, b) => b.kb - a.kb)
  const total = rows.reduce((a, r) => a + r.kb, 0)
  const own = rows.filter((r) => r.kind !== 'framework').reduce((a, r) => a + r.kb, 0)
  return { page, total, own, rows }
}

/** The report a person reads.
 * @param {ReturnType<typeof weighPage>} w */
export function weightReport(w, show = 4) {
  const lines = [`${w.page}: ${w.total.toFixed(1)} kB of script gzipped on first load (${w.own.toFixed(2)} kB beside React, Next's router and webpack's runtime)`]
  for (const r of w.rows) {
    const who = r.kind === 'framework' ? 'React, Next and webpack: every page' : r.brought.length ? r.brought.slice(0, show).join(', ') + (r.brought.length > show ? ` and ${r.brought.length - show} more` : '') : 'no client component names it (a module several of them share)'
    lines.push(`  ${r.kb.toFixed(2).padStart(6)} kB  ${r.kind.padEnd(11)} ${r.file.replace(/^static\/chunks\//, '')}${r.libs?.length ? ` [holds ${r.libs.join(', ')}]` : ''}  ← ${who}`)
  }
  lines.push('What to do: a component listed against a heavy file brings it. Load what the first paint does not need with',
    'next/dynamic; import a constant from a zod-free *-facts.ts half rather than a file that builds schemas; never raise a',
    'limit (frata-architecture § Speed). A layout or shell file is paid by every page under it.')
  return lines.join('\n')
}
