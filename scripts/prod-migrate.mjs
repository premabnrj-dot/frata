#!/usr/bin/env node
// =============================================================================
// FILE: scripts/prod-migrate.mjs — prints (never runs) what applying one migration to production takes from a cloud
// session (CLAUDE.md § Deploying): the file's SQL, then the drizzle row (sha256 of the file, the journal's `when`), then
// a check. The caller runs these through the Supabase API. Usage: node scripts/prod-migrate.mjs drizzle/0122_x.sql
// A migration whose first line is `-- apply: after-live` (a contract: it drops what the old build calls) is refused
// unless named with --after-live, which says the new build serves (docs/setup.md § Migrations after live).
// =============================================================================
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import { isAfterLive } from './lib/after-live.mjs'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) { console.error('usage: node scripts/prod-migrate.mjs [--after-live] drizzle/NNNN_name.sql'); process.exit(2) }
const sql = readFileSync(file, 'utf8')
const tag = basename(file, '.sql')
if (isAfterLive(sql) && !args.includes('--after-live')) {
  console.error(`${tag} is an after-live migration: apply it only once the build that no longer needs what it drops is live`)
  console.error(`and the old functions have run out. Then: node scripts/prod-migrate.mjs --after-live ${file}`)
  process.exit(1)
}
const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'))
const entry = journal.entries.find((e) => e.tag === tag)
if (!entry) { console.error(`${tag} is not in drizzle/meta/_journal.json`); process.exit(1) }
const hash = createHash('sha256').update(sql).digest('hex')
console.log(`-- 1. Apply ${tag} (Supabase project from CLAUDE.md § Deploying):\n${sql.trim()}\n`)
console.log(`-- 2. Record it, so drizzle-kit skips it later:\ninsert into drizzle.__drizzle_migrations (hash, created_at) values ('${hash}', ${entry.when});\n`)
console.log(`-- 3. Check (the newest row must be this one):\nselect id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 3;`)
