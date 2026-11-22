#!/usr/bin/env node
// Fails: a Storefront API route that does not keep its tree (cached live routes never read the request; test and
// header-tree routes never cache), an open output schema, a merchant cost named anywhere in the API, a route outside a released version.
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
  // A preview route (SA1b D·4; ADR-0018 § 12): a token-bound draft, in either tree, only under preview/, never cached;
  // and nothing outside preview/ may be one.
  const previewPath = /\/preview\//.test(rel)
  if (previewPath || /mode:\s*'preview'/.test(text)) {
    if (!previewPath || !/mode:\s*'preview'/.test(text)) failures.push(`${file}  a preview route lives under preview/ with mode: 'preview', and only there`)
    if (!dynamicFile || /export const revalidate\b/.test(text)) failures.push(`${file}  a preview is never cached: export const dynamic = 'force-dynamic' and no revalidate`)
    if (!/\bentry:/.test(text)) failures.push(`${file}  a preview route names the entry its token must open (entry:)`)
    if (!/tree:\s*'(live|test)'/.test(text) || (tree === 'k') !== /tree:\s*'live'/.test(text)) failures.push(`${file}  a preview route keeps its folder's tree`)
    continue
  }
  if (tree === 'k') {
    if (!/tree:\s*'live'/.test(text)) failures.push(`${file}  a k/ route serves live keys: tree: 'live'`)
    if (/mode:\s*'isr'/.test(text)) {
      if (!/export const revalidate = 3600\b/.test(text)) failures.push(`${file}  a cached live route: export const revalidate = 3600 (freshness comes from tag purges)`)
      if (dynamicFile) failures.push(`${file}  a cached live route marked force-dynamic`)
      if (/\b(req|request)\.|\bheaders\(|\bcookies\(|\bconnection\(|\bsearchParams\b/.test(text)) failures.push(`${file}  a cached live route reads the request — its answer is shared by every caller`)
      if (/\bpreview[A-Z]\w*\b/.test(text)) failures.push(`${file}  a cached live route reads a preview loader — drafts would enter the shared cache`)
      if (rel.includes('[') && !/export (const|function) generateStaticParams\b/.test(text)) failures.push(`${file}  a cached route with a dynamic segment needs generateStaticParams (empty) to be cached at all`)
    } else if (/mode:\s*'dynamic'/.test(text)) {
      if (!/\/(search|filter\/page\/\[n\])\/route\.ts$/.test(file)) failures.push(`${file}  only search and filter may be dynamic live routes`)
      if (!dynamicFile || /export const revalidate\b/.test(text)) failures.push(`${file}  a dynamic live route: export const dynamic = 'force-dynamic' and no revalidate`)
    } else failures.push(`${file}  no mode: 'isr' or 'dynamic'`)
  } else if (tree === 't') {
    if (!/tree:\s*'test'/.test(text) || !/mode:\s*'dynamic'/.test(text)) failures.push(`${file}  a t/ route serves test keys: tree: 'test', mode: 'dynamic'`)
    if (!dynamicFile || /export const revalidate\b/.test(text)) failures.push(`${file}  a test route is never cached: export const dynamic = 'force-dynamic' and no revalidate`)
  } else if (tree === 'h') {
    // The header tree (G·2; ADR-0018's build-key amendment): build keys in the Frrata-Key header, drafts included, read
    // from a server only. Never cached, in any way a route file can ask for.
    if (!/tree:\s*'header'/.test(text) || !/mode:\s*'dynamic'/.test(text)) failures.push(`${file}  an h/ route serves build keys: tree: 'header', mode: 'dynamic'`)
    if (!dynamicFile || /export const revalidate\b/.test(text)) failures.push(`${file}  a header-tree route is never cached: export const dynamic = 'force-dynamic' and no revalidate`)
    if (/\bgenerateStaticParams\b/.test(text)) failures.push(`${file}  a header-tree route never pre-renders (no generateStaticParams)`)
    if (/\[key\]/.test(rel)) failures.push(`${file}  a header-tree route takes its key from the header, never the path`)
  } else failures.push(`${file}  is neither k/ (live keys), t/ (test keys) nor h/ (build keys, in the header)`)
  if (tree !== 'h' && /tree:\s*'header'/.test(text)) failures.push(`${file}  tree: 'header' outside h/`)
}

// Output schemas: closed. Pure mappers and schemas live in src/domains/storefront-api/.
for (const file of [...walk('src/domains/storefront-api'), ...walk(ROUTES), ...walk('src/lib/storefront-api')]) {
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
