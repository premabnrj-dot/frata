#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-credits.mjs — `node scripts/check-credits.mjs` (check:credits)
//
// Fails: a theme sample file (public/themes/samples/*.webp|mp4|jpg) with no entry in that folder's CREDITS.json
// (source, licence, date: theme Signal plan S0-2), an entry missing one of those, or a file over its size budget
// (speed review 2026-11-09: 25 kB at 400 w, 60 kB at 800 w, 180 kB at 1600 w; 10 MB in all).
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.argv[2] ?? 'public/themes/samples'
const credits = JSON.parse(readFileSync(join(DIR, 'CREDITS.json'), 'utf8'))
const byName = new Map((credits.entries ?? []).map((e) => [e.name, e]))
const failures = []
for (const e of byName.values()) for (const k of ['source', 'licence', 'date']) if (!e[k]) failures.push(`CREDITS.json  ${e.name} has no ${k}`)
const LIMIT = { 400: 25, 800: 60, 1600: 180 }
let total = 0
for (const f of readdirSync(DIR)) {
  if (!/\.(webp|jpe?g|png|mp4)$/.test(f)) continue
  const size = statSync(join(DIR, f)).size
  total += size
  const m = /^(.*?)(?:-b|-d)?-(400|800|1600)\.(?:webp|jpe?g|png)$/.exec(f)
  const name = m ? m[1] : f.replace(/\.[a-z0-9]+$/, '')
  if (!byName.has(name)) failures.push(`${DIR}/${f}  has no credit in CREDITS.json (source, licence, date)`)
  if (m && size / 1024 > LIMIT[m[2]]) failures.push(`${DIR}/${f}  is ${(size / 1024).toFixed(0)} kB (budget ${LIMIT[m[2]]} kB at ${m[2]} w)`)
}
if (total > 10 * 1024 * 1024) failures.push(`${DIR}  holds ${(total / 1048576).toFixed(1)} MB of samples (budget 10 MB)`)
if (failures.length) { for (const f of failures) console.error(f); console.error(`check:credits — ${failures.length} problem(s)`); process.exit(1) }
console.log(`check:credits — clean (${byName.size} credited names, ${(total / 1024).toFixed(0)} kB)`)
