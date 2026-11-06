#!/usr/bin/env node
// Fails: a bare fetch() in server code, which has no deadline — use fetchWithTimeout (src/lib/http/timeout.ts).
//
// ⚠️ WHY. Requests ran to Vercel's 300-second limit eleven times in a month on
// pages that called other services with no limit (spec
// 2026-10-26-performance-security-baseline, P0.1). A call that never answers
// holds the function until the platform kills it.
//
// Server code only: a browser's fetch cannot hold a function. A file is
// browser code when it starts with 'use client', or lives where only browser
// code lives (components, _components, _hooks, a use-*.ts hook). Tests are
// skipped. A call through a client library takes its fetch from
// supabaseFetch() in the same file.
//
// It reads code, not prose: a fetch( inside a comment is skipped, so this
// header cannot fail its own check.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src'
const ALLOWED = new Set(['src/lib/http/timeout.ts'])
const BROWSER_PATH = /(^|\/)(components|_components|_hooks)\/|\/use-[^/]+\.tsx?$|__tests__\//

const walk = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs)$/.test(p) ? [p] : []
})

const failures = []
for (const file of walk(ROOT)) {
  if (ALLOWED.has(file) || BROWSER_PATH.test(file)) continue
  const text = readFileSync(file, 'utf8')
  if (/^\s*['"]use client['"]/.test(text)) continue
  text.split(/\r?\n/).forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
    if (/(^|[^.\w])fetch\(/.test(code)) failures.push(`${file}:${i + 1}  bare fetch() — use fetchWithTimeout from @/lib/http/timeout`)
  })
}

if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:fetch — ${failures.length} call(s) with no deadline`)
  process.exit(1)
}
console.log('check:fetch — clean')
