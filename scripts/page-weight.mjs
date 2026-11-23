#!/usr/bin/env node
// `npm run weight -- <page>` — what one page loads first, file by file, and the browser components that bring each file
// (page weight, 2026-11-23). <page> is a URL path (/console/brand, /s/x/checkout) or an app-build-manifest key
// ('/(console)/console/brand/page'). Reads .next after a build (`npm run e2e -- --only <flow>` builds with the test
// stack). The logic is scripts/lib/page-weight.mjs.
import { existsSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { pageKey, weighPage, weightReport } from './lib/page-weight.mjs'

const asked = process.argv[2]
if (!asked) { console.error('usage: npm run weight -- <page>   e.g. /console/brand, /s/shop/checkout, \'/(console)/console/brand/page\''); process.exit(2) }
if (!existsSync('.next/app-build-manifest.json')) { console.error('no .next to read: build first (npm run e2e -- --only <flow>, or npm run build)'); process.exit(1) }
const read = (f) => JSON.parse(readFileSync(join('.next', f), 'utf8'))
const build = read('app-build-manifest.json').pages ?? {}
const key = pageKey(build, asked)
if (typeof key !== 'string') {
  console.error(key.length ? `${asked} matches ${key.length} pages; name one:\n  ${key.join('\n  ')}` : `${asked} matches no page in the build`)
  process.exit(1)
}
const rootMain = new Set(read('build-manifest.json').rootMainFiles ?? [])
const route = key.replace(/^\//, '')
const ref = join('.next/server/app', `${route}_client-reference-manifest.js`)
globalThis.__RSC_MANIFEST = {}
let clientModules = {}
if (existsSync(ref)) {
  // Next writes it as a script that sets globalThis.__RSC_MANIFEST[route]; run it as one, nothing else in it.
  new Function(readFileSync(ref, 'utf8'))()
  clientModules = Object.values(globalThis.__RSC_MANIFEST)[0]?.clientModules ?? {}
}
const sizes = new Map()
const gz = (f) => sizes.get(f) ?? sizes.set(f, gzipSync(readFileSync(join('.next', f))).length).get(f)
console.log(weightReport(weighPage(build, rootMain, gz, clientModules, key, process.cwd(), (f) => readFileSync(join('.next', f), 'utf8'))))
