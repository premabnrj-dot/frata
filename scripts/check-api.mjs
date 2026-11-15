#!/usr/bin/env node
// Fails: a Storefront API route that does not keep its tree (cached live routes never read the request; test routes
// never cache), an open output schema, a merchant cost named anywhere in the API, a route outside a released version.
//
// ⚠️ WHY (ADR-0018, ADR-0003; plan docs/plans/2026-11-15-v1-storefront-api.md § SA0·5). A live key's answers are cached
// copies shared by every caller: a header read there is a runtime error, and an echoed Origin or a draft would be served
// to everyone. A test key reads drafts: its answers must never be cached. And an answer leaves only as its schema's
// parse(): an open schema (unknown, record, any, passthrough, catchall, loose, a plain z.object that strips instead of
// refusing) would let a new column through unseen. The one door itself (apiRequest) is check:tenant § 9.
import { SENTINELS } from './cost-sentinels.mjs'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((n) => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.includes('/__tests__/') ? [p] : []
}) : [])
const code = (f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n')

const versions = [...readFileSync('src/domains/storefront-api/versions.ts', 'utf8').matchAll(/API_VERSIONS\s*=\s*\[([^\]]*)\]/g)]
  .flatMap((m) => [...m[1].matchAll(/'(\d{4}-\d{2})'/g)].map((x) => x[1]))
const failures = []
const ROUTES = 'src/app/api/storefront'
const KEYLESS = new Set(versions.map((v) => `${ROUTES}/${v}/openapi.json/route.ts`))

for (const file of walk(ROUTES)) {
  const text = code(file)
  const rel = file.slice(ROUTES.length + 1)
  const version = rel.split('/')[0]
  if (!versions.includes(version)) { failures.push(`${file}  is not under a released version folder (${versions.join(', ')}) — a literal folder per version`); continue }
  if (!file.endsWith('/route.ts')) continue
  if (KEYLESS.has(file)) {
    if (!/export const revalidate = 3600\b/.test(text)) failures.push(`${file}  the published schema is a cached copy: export const revalidate = 3600`)
    continue
  }
  const tree = rel.split('/')[1]
  const dynamicFile = /export const dynamic = 'force-dynamic'/.test(text)
  if (tree === 'k') {
    if (!/tree:\s*'live'/.test(text)) failures.push(`${file}  a k/ route serves live keys: tree: 'live'`)
    if (/mode:\s*'isr'/.test(text)) {
      if (!/export const revalidate = 3600\b/.test(text)) failures.push(`${file}  a cached live route: export const revalidate = 3600 (freshness comes from tag purges)`)
      if (dynamicFile) failures.push(`${file}  a cached live route marked force-dynamic`)
      if (/\b(req|request)\.|\bheaders\(|\bcookies\(|\bconnection\(|\bsearchParams\b/.test(text)) failures.push(`${file}  a cached live route reads the request — its answer is shared by every caller`)
      if (/\bpreview[A-Z]\w*\b/.test(text)) failures.push(`${file}  a cached live route reads a preview loader — drafts would enter the shared cache`)
      if (rel.includes('[') && !/export (const|function) generateStaticParams\b/.test(text)) failures.push(`${file}  a cached route with a dynamic segment needs generateStaticParams (empty) to be cached at all`)
    } else if (/mode:\s*'dynamic'/.test(text)) {
      if (!/\/search\/route\.ts$/.test(file)) failures.push(`${file}  only search may be a dynamic live route`)
      if (!dynamicFile || /export const revalidate\b/.test(text)) failures.push(`${file}  a dynamic live route: export const dynamic = 'force-dynamic' and no revalidate`)
    } else failures.push(`${file}  no mode: 'isr' or 'dynamic'`)
  } else if (tree === 't') {
    if (!/tree:\s*'test'/.test(text) || !/mode:\s*'dynamic'/.test(text)) failures.push(`${file}  a t/ route serves test keys: tree: 'test', mode: 'dynamic'`)
    if (!dynamicFile || /export const revalidate\b/.test(text)) failures.push(`${file}  a test route is never cached: export const dynamic = 'force-dynamic' and no revalidate`)
  } else failures.push(`${file}  is neither k/ (live keys) nor t/ (test keys)`)
}

// Output schemas: closed. Pure mappers and schemas live in src/domains/storefront-api/.
for (const file of walk('src/domains/storefront-api')) {
  const text = code(file)
  const open = text.match(/z\.(unknown|any|record|looseObject|object)\(|\.(passthrough|catchall|loose|nonstrict)\(/)
  if (open) failures.push(`${file}  an open schema (${open[0]}) — the API's answers use z.strictObject and named fields only`)
}

// No merchant cost anywhere in the API (ADR-0003): routes, the door, mappers, schemas.
for (const file of [...walk(ROUTES), ...walk('src/lib/storefront-api'), ...walk('src/domains/storefront-api')]) {
  const text = code(file)
  const named = SENTINELS.filter((x) => new RegExp(`\\b${x}\\b`).test(text))
  if (named.length) failures.push(`${file}  names a merchant cost (${named.join(', ')}) — the API serves what a shop's pages show`)
}

if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:api — ${failures.length} problem(s). See docs/decisions/0018-storefront-key-tenant-source.md.`)
  process.exit(1)
}
console.log(`check:api — clean (${versions.length} version${versions.length === 1 ? '' : 's'})`)
