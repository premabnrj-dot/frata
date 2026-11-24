#!/usr/bin/env node
// Fails (--journal): a journal entry out of idx or `when` order, or a migration file and its journal entry not matching.
//
// =============================================================================
// FILE: scripts/merge-main.mjs --check — before or after merging origin/main, finds what collides (release-agent): a
//
// migration number main already uses (drizzle/NNNN_*.sql), a journal whose idx or `when` is out of order, and an e2e flow
// number used twice. Prints each with the fix; exits 1 when something must be renumbered. It changes nothing.
// Fix for a migration: delete the branch's .sql and snapshot, take main's journal and snapshots, `npm run db:generate`
// again (it numbers after main's last), and if the old file was applied to production, update its drizzle row's created_at
// to the new `when` (scripts/prod-migrate.mjs prints the row).
// `--journal` (check:migrations, in npm test): the journal alone (scripts/lib/journal.mjs), no network, no git.
// Every run of --check also names each after-live migration (scripts/lib/after-live.mjs); `--after-live` prints only that.
// A skill or agent changed on both sides with main's metadata.version ahead: take the higher version, bump its patch.
// =============================================================================
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { journalProblems } from './lib/journal.mjs'
import { afterLiveMigrations } from './lib/after-live.mjs'

const migrationFiles = () => readdirSync('drizzle').filter((f) => /^\d{4}_.*\.sql$/.test(f))
const journal = () => JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')).entries
if (process.argv.includes('--journal')) {
  const problems = journalProblems(journal(), migrationFiles())
  for (const p of problems) console.error(p)
  console.log(problems.length ? `check:migrations — ${problems.length} problem(s)` : `check:migrations — clean (${journal().length} migrations in order)`)
  process.exit(problems.length ? 1 : 0)
}

// Contract migrations wait for the new build: each is named, so the release applies it after the deploy, not before.
// `--after-live` prints only this line (no git, no network).
function afterLiveLine() {
  const later = afterLiveMigrations()
  return later.length ? `· after-live migrations (apply only once the new build serves, with node scripts/prod-migrate.mjs --after-live): ${later.join(', ')}` : '· no after-live migrations'
}
if (process.argv.includes('--after-live')) { console.log(afterLiveLine()); process.exit(0) }

const sh = (c) => execSync(c, { encoding: 'utf8' })
let bad = 0
const say = (m) => { bad++; console.log('✗ ' + m) }
try { sh('git fetch -q origin main') } catch { console.log('(offline: comparing with the last fetched origin/main)') }
const mainFiles = new Set(sh('git ls-tree --name-only origin/main drizzle/').split('\n').map((p) => p.replace('drizzle/', '')).filter((f) => /^\d{4}_.*\.sql$/.test(f)))
const here = migrationFiles()
const byNum = new Map()
for (const f of here) { const n = f.slice(0, 4); byNum.set(n, [...(byNum.get(n) ?? []), f]) }
for (const [n, fs] of byNum) if (fs.length > 1) say(`migration ${n} is used twice: ${fs.join(', ')}`)
for (const f of here) if (!mainFiles.has(f) && [...mainFiles].some((m) => m.slice(0, 4) === f.slice(0, 4))) say(`${f}: main already has a ${f.slice(0, 4)} migration — renumber this one after main's last`)
for (const p of journalProblems(journal(), here)) say(p)
// A skill or agent both sides changed: its metadata.version line conflicts, or main's bump is lost. On the merge, take
// the higher version and bump its patch, so check:skills sees this branch's change as a new version.
try {
  const base = sh('git merge-base HEAD origin/main').trim()
  const touched = (range) => new Set(sh(`git diff --name-only ${range} -- .claude/skills .claude/agents`).split('\n').filter((f) => /(SKILL|agents\/[^/]+)\.md$/.test(f)))
  const theirs = touched(`${base} origin/main`)
  for (const f of touched(`${base} HEAD`)) if (theirs.has(f)) console.log(`· ${f} changed on main and here — on the merge take the higher metadata.version and bump its patch`)
} catch { console.log('(no merge base with origin/main: skill versions not compared)') }
const flowNums = new Map()
for (const f of readdirSync('e2e/flows').filter((x) => /^\d+-/.test(x))) { const n = f.split('-')[0]; flowNums.set(n, [...(flowNums.get(n) ?? []), f]) }
for (const [n, fs] of flowNums) if (fs.length > 1) console.log(`· e2e flow number ${n} is shared: ${fs.join(', ')} (fine if intended, else renumber the branch's)`)
console.log(afterLiveLine())
console.log(bad ? `\n${bad} thing(s) to fix before pushing.` : 'merge-main: no migration collisions; journal in order.')
process.exit(bad ? 1 : 0)
