#!/usr/bin/env node
// Fails: raw database access outside the platform modules; a query file that does not go through withTenant; a table with no row-level security or no policy in drizzle/.
//
// ⚠️ WHY. One merchant seeing another's orders ends the company (ADR-0002).
// Isolation is two locks: the row policy in Postgres, and withTenant() in code,
// which sets the tenant for one transaction. This gate holds the parts a grep
// can hold:
//   1. RAW db() ONLY IN PLATFORM CODE. Everything else reads merchant rows
//      through src/lib/queries/, which goes through withTenant.
//   2. EVERY QUERY FILE is server-only and calls withTenant.
//   3. EVERY TABLE in src/lib/db/schema.ts has RLS enabled and at least one
//      policy in a drizzle/*.sql migration. A new table without them is
//      readable by nobody (fine) or — if someone grants it later — by everyone.
//   4. ADMIN IS FENCED (ADR-0007): the frata_admin connection (@/lib/db/admin)
//      only from src/lib/admin/**; src/lib/admin only from src/app/(admin)/**;
//      no 'use server' inside src/lib/admin (it would be a public endpoint);
//      Admin never calls withTenant (a route param must never become a tenant).
// Whether a policy is RIGHT is what scripts/verify/tenancy.sh proves on a real Postgres.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Files that may use the raw connection, and why. */
const PLATFORM_SCOPE = [
  [/^src\/lib\/db\//, 'the connection, the tenant transaction and the two pre-tenant lookups'],
  [/^src\/lib\/outbox\//, 'the cross-tenant sweep; inserts go through a tenant transaction'],
  [/^src\/app\/api\/webhooks\//, 'signed webhooks arrive before a tenant is known'],
]

const walk = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.includes('/__tests__/') ? [p] : []
})
const code = f => readFileSync(f, 'utf8').split(/\r?\n/)
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

const failures = []
const RAW_DB = /from\s+['"]@\/lib\/db['"]/
const ADMIN_DB = /from\s+['"]@\/lib\/db\/admin['"]/
const ADMIN_LIB = /from\s+['"]@\/lib\/admin(\/[^'"]*)?['"]/

for (const file of walk('src')) {
  const text = code(file)
  if (RAW_DB.test(text) && !PLATFORM_SCOPE.some(([re]) => re.test(file))) {
    // A type-only import cannot touch a row.
    const onlyTypes = [...text.matchAll(/import\s+(type\s+)?\{[^}]*\}\s+from\s+['"]@\/lib\/db['"]/g)].every(m => m[1])
    if (!onlyTypes) failures.push(`${file}  imports the raw db — read merchant rows through src/lib/queries/ (withTenant)`)
  }
  if (ADMIN_DB.test(text) && !file.startsWith('src/lib/admin/') && file !== 'src/lib/db/admin.ts') {
    failures.push(`${file}  imports the admin connection — only src/lib/admin/** may (ADR-0007)`)
  }
  if (ADMIN_LIB.test(text) && !file.startsWith('src/app/(admin)/') && !file.startsWith('src/lib/admin/')) {
    failures.push(`${file}  imports src/lib/admin — only Admin pages and actions may (ADR-0007)`)
  }
  if (file.startsWith('src/lib/admin/')) {
    if (!/import\s+['"]server-only['"]/.test(text)) failures.push(`${file}  admin module without import 'server-only'`)
    if (/^\s*['"]use server['"]/m.test(text)) failures.push(`${file}  'use server' in src/lib/admin turns it into a public endpoint — put actions under src/app/(admin)`)
  }
  if (file.startsWith('src/app/(admin)/') && /\bwithTenant\(/.test(text)) {
    failures.push(`${file}  Admin calls withTenant — staff reach a store only through a support session (ADR-0007)`)
  }
  if (file.startsWith('src/lib/queries/')) {
    if (!/import\s+['"]server-only['"]/.test(text)) failures.push(`${file}  query file without import 'server-only'`)
    if (!/\bwithTenant\(/.test(text)) failures.push(`${file}  query file that never calls withTenant(`)
  }
}

const schema = code('src/lib/db/schema.ts')
const tables = [...schema.matchAll(/pgTable\(\s*'([a-z_]+)'/g)].map(m => m[1])
const sql = readdirSync('drizzle').filter(f => f.endsWith('.sql'))
  .map(f => readFileSync(join('drizzle', f), 'utf8').split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n'))
  .join('\n').toLowerCase()
for (const t of tables) {
  if (!new RegExp(`alter table\\s+"?${t}"?\\s+enable row level security`).test(sql)) {
    failures.push(`table ${t}  has no "enable row level security" in drizzle/*.sql`)
  }
  if (!new RegExp(`create policy\\s+\\w+\\s+on\\s+"?${t}"?\\b`).test(sql)) {
    failures.push(`table ${t}  has no policy in drizzle/*.sql — add one for frata_app`)
  }
}

if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:tenant — ${failures.length} problem(s). See .claude/skills/frata-architecture/SKILL.md § Tenancy.`)
  process.exit(1)
}
console.log(`check:tenant — clean (${tables.length} tables guarded)`)
