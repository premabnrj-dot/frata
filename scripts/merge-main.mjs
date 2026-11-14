#!/usr/bin/env node
// =============================================================================
// FILE: scripts/merge-main.mjs --check — before or after merging origin/main, finds what collides (release-agent): a
// migration number main already uses (drizzle/NNNN_*.sql), a journal whose idx or `when` is out of order, and an e2e flow
// number used twice. Prints each with the fix; exits 1 when something must be renumbered. It changes nothing.
// Fix for a migration: delete the branch's .sql and snapshot, take main's journal and snapshots, `npm run db:generate`
// again (it numbers after main's last), and if the old file was applied to production, update its drizzle row's created_at
// to the new `when` (scripts/prod-migrate.mjs prints the row).
// =============================================================================
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'

const sh = (c) => execSync(c, { encoding: 'utf8' })
let bad = 0
const say = (m) => { bad++; console.log('✗ ' + m) }
try { sh('git fetch -q origin main') } catch { console.log('(offline: comparing with the last fetched origin/main)') }
const mainFiles = new Set(sh('git ls-tree --name-only origin/main drizzle/').split('\n').map((p) => p.replace('drizzle/', '')).filter((f) => /^\d{4}_.*\.sql$/.test(f)))
const here = readdirSync('drizzle').filter((f) => /^\d{4}_.*\.sql$/.test(f))
const byNum = new Map()
for (const f of here) { const n = f.slice(0, 4); byNum.set(n, [...(byNum.get(n) ?? []), f]) }
for (const [n, fs] of byNum) if (fs.length > 1) say(`migration ${n} is used twice: ${fs.join(', ')}`)
for (const f of here) if (!mainFiles.has(f) && [...mainFiles].some((m) => m.slice(0, 4) === f.slice(0, 4))) say(`${f}: main already has a ${f.slice(0, 4)} migration — renumber this one after main's last`)
const j = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')).entries
j.forEach((e, i) => {
  if (e.idx !== i) say(`journal entry ${e.tag} has idx ${e.idx}, expected ${i}`)
  // Out-of-order `when` is a warning: a fresh database runs the journal in order; production only needs every applied
  // file to have its row. It matters when a migration is NOT yet applied and its when is below the newest row's.
  if (i && e.when <= j[i - 1].when) console.log(`· journal entry ${e.tag}: when ${e.when} is not after ${j[i - 1].tag} — if ${e.tag} isn't applied in production yet, give it a later when`)
  if (!here.includes(`${e.tag}.sql`)) say(`journal names ${e.tag} but drizzle/${e.tag}.sql is missing`)
})
const flowNums = new Map()
for (const f of readdirSync('e2e/flows').filter((x) => /^\d+-/.test(x))) { const n = f.split('-')[0]; flowNums.set(n, [...(flowNums.get(n) ?? []), f]) }
for (const [n, fs] of flowNums) if (fs.length > 1) console.log(`· e2e flow number ${n} is shared: ${fs.join(', ')} (fine if intended, else renumber the branch's)`)
console.log(bad ? `\n${bad} thing(s) to fix before pushing.` : 'merge-main: no migration collisions; journal in order.')
process.exit(bad ? 1 : 0)
