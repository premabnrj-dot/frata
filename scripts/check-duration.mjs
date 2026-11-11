#!/usr/bin/env node
// Fails: a route handler (src/app/**/route.ts|tsx) or the root layout without an `export const maxDuration` of 1–60,
// written as a plain integer.
//
// ⚠️ WHY. Vercel lets a function run 300 s by default on Pro, and Fluid compute bills memory for the whole time a request
// waits (cost guardrails plan, docs/plans/2026-11-11-guardrails-infra-a2.md § G·1). The root layout's limit reaches every
// page and its Server Actions; a route handler inherits nothing (Next 15.5 build/entries.js: "inherit from layout files
// only if it's a page route"), so each declares its own. 60 s covers an action plus drainSoon's 20 s after the response.
// Next only reads a literal integer (its schema is z.number().int()), so an expression would be ignored silently.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const MAX = 60
const LITERAL = /^export const maxDuration = (\d+)\s*$/m

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (/^route\.tsx?$/.test(name)) yield full
  }
}

const files = ['src/app/layout.tsx', ...walk('src/app')]
let failures = 0
for (const file of files) {
  const rel = relative('.', file).split('\\').join('/')
  // Comment lines never count (a gate must not match its own documentation).
  const code = readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  const m = code.match(LITERAL)
  if (!m) { console.error(`${rel}  no \`export const maxDuration = <1–${MAX}>\` (a plain integer)`); failures++; continue }
  const n = Number(m[1])
  if (n < 1 || n > MAX) { console.error(`${rel}  maxDuration ${n}: must be 1–${MAX}`); failures++ }
}
if (failures) { console.error(`check:duration — ${failures} problem(s). See docs/plans/2026-11-11-guardrails-infra-a2.md § G·1.`); process.exit(1) }
console.log(`check:duration — clean (${files.length} files, each ≤ ${MAX} s)`)
