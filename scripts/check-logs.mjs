#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-logs.mjs — `node scripts/check-logs.mjs [path]`
//
// Fails: a console call in server code handed a raw error — an argument that is
// a bare err / e / error / cause / ex, or reads .message or .stack. A drizzle
// error carries its query's parameters, so the raw error puts shoppers' and
// owners' details in Vercel's logs (security review S10, 2026-11-08). Log
// errName(err) from src/lib/log.ts. Browser files and tests are skipped; comment
// lines are skipped, so this header cannot fail its own check.
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.argv[2] ?? 'src'
const BROWSER_PATH = /(^|\/)(components|_components|_hooks)\/|\/use-[^/]+\.tsx?$|__tests__\//
const CALL = /console\.(?:error|warn|log|info)\(([^\n]*)\)/
const RAW = /(?:^|,)\s*(?:err|e|error|cause|ex)\s*(?:,|$)|\.(?:message|stack)\b/
const isComment = (l) => { const t = l.trim(); return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') }
const walk = (dir) => statSync(dir).isFile() ? [dir] : readdirSync(dir).flatMap((n) => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs)$/.test(p) ? [p] : []
})
const failures = []
for (const file of walk(ROOT)) {
  if (BROWSER_PATH.test(file) || file.endsWith('src/lib/log.ts')) continue
  const text = readFileSync(file, 'utf8')
  if (/^\s*['"]use client['"]/.test(text)) continue
  text.split('\n').forEach((line, i) => {
    if (isComment(line)) return
    const m = CALL.exec(line)
    if (m && RAW.test(m[1])) failures.push(`${file}:${i + 1}  ${line.trim().slice(0, 140)}`)
  })
}
if (failures.length) {
  console.error(`check:logs — ${failures.length} console call(s) log a raw error (use errName from src/lib/log.ts):\n` + failures.map((f) => '  ' + f).join('\n'))
  process.exit(1)
}
console.log('check:logs: ok')
