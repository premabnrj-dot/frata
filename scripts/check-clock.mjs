#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-clock.mjs — `node scripts/check-clock.mjs`
//
// Fails: code that can render in the browser and reads the clock — Date.now(),
// an argument-less new Date(), or a `now = new Date()` default — outside a line
// marked `// clock-ok: <why>`. "Can render in the browser" is every file EXCEPT
// those that never reach it: page.tsx, layout.tsx, route.ts, actions.ts, and
// modules with `import 'server-only'`. So client components, shared components
// (a component without 'use client' still renders in the browser inside a
// client tree: StatusBadge, 2026-11-07) and src/domains all take `now` in.
//
// ⚠️ WHY. A client component renders on the server and again in the browser.
// Text derived from two different "now"s ("just now" / "1 min ago", "goes live
// in 3 h") differs when a minute turns in between, and React throws #418
// (Online payments and the product editor, 2026-11-07). Render reads the page's
// time from useNow() (src/components/time/now.tsx); only event handlers and
// timers may read the real clock, and they say so on the line.
// Comment lines are skipped, so this header never trips the gate.
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CLOCK = /\bDate\.now\(\)|\bnew Date\(\s*\)/
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.includes('/__tests__/') ? [p] : []
})

const failures = []
let files = 0
for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  const serverOnly = /\/(page|layout|default|not-found|error|global-error)\.tsx$|\/route\.ts$|\/actions\.ts$|-actions\.ts$|\/middleware\.ts$/.test(file)
    || /^import ['"]server-only['"]/m.test(text) || file.startsWith('src/lib/db/') || file.startsWith('src/lib/admin/')
  if (serverOnly && !/^\s*['"]use client['"]/.test(text)) continue
  files++
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return
    if (CLOCK.test(line) && !/\/\/\s*clock-ok:\s*\S/.test(line)) {
      failures.push(`${file}:${i + 1}  reads the clock in code that can render in the browser — take now in (useNow() in a component), or mark a handler/timer line "// clock-ok: <why>"`)
    }
  })
}
if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:clock — ${failures.length} clock read(s) that can differ between server and browser`)
  process.exit(1)
}
console.log(`check:clock — clean (${files} files that can reach the browser)`)
