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
//   3. EVERY TABLE in src/lib/db/schema*.ts has RLS enabled and at least one
//      policy in a drizzle/*.sql migration. A new table without them is
//      readable by nobody (fine) or — if someone grants it later — by everyone.
//   4. ADMIN IS FENCED (ADR-0007): the frata_admin connection (@/lib/db/admin)
//      only from src/lib/admin/**; src/lib/admin only from src/app/(admin)/**;
//      no 'use server' inside src/lib/admin (it would be a public endpoint);
//      Admin never calls withTenant (a route param must never become a tenant).
//   7. READS STAY IN src/lib/queries (plan U · T1, T2, 2026-11-07): src/app/**
//      imports @/lib/db/tenant only from TENANT_IN_APP; the shell
//      (src/components/shell/**) imports no data module — it is handed values,
//      so it can never read a shop's rows under Admin; from src/app it may
//      import only SHELL_ACTIONS (sign-out lives under Admin because it ends
//      a support visit). Relative imports are resolved to @/ before matching.
// Whether a policy is RIGHT is what scripts/verify/tenancy.sh proves on a real Postgres.
import { SENTINELS } from './cost-sentinels.mjs'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

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
const TENANT_HELPER = /from\s+['"]@\/lib\/db\/tenant['"]/
/** App files that may open withTenant themselves, with why. */
const TENANT_IN_APP = {
  'src/app/api/shop/orders/view/route.ts': 'the shopper\'s order page: tenant from the host, order from a signed token',
}
const DATA_MODULE = /(?:from\s+|import\(\s*)['"]@\/lib\/(?:queries|db|admin|auth)(?:\/[^'"]*)?['"]/
/** Actions the shell may import from src/app (they are endpoints, not reads), with why. */
const SHELL_ACTIONS = {
  '@/app/(admin)/admin/sign-out/actions': 'Sign out: ends a live support visit (needs src/lib/admin, so it lives under Admin)',
  '@/app/choose/actions': 'Switch store (F3): sets frata_tenant only to a store app_access_for returned',
}
/**
 * The file's code (comment lines skipped, as code() does) with every relative import written as its @/ path, so
 * '../../lib/db/tenant' cannot slip past a rule written for '@/lib/db/tenant' (tenancy audit of U·2a).
 */
function source(file) {
  return code(file).replace(/(from\s+|import\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (m, pre, q, rel) =>
    `${pre}${q}@/${relative('src', resolve(dirname(file), rel)).split('\\').join('/')}${q}`)
}

for (const file of walk('src')) {
  const text = source(file)
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
  if (file.startsWith('src/app/') && TENANT_HELPER.test(text) && !(file in TENANT_IN_APP)) {
    failures.push(`${file}  imports withTenant in app code — read through src/lib/queries (or list it in TENANT_IN_APP with why)`)
  }
  if (file.startsWith('src/components/shell/') && DATA_MODULE.test(text)) {
    failures.push(`${file}  the shell imports a data module — hand it values from the layout (plan U · T2)`)
  }
  if (file.startsWith('src/components/shell/')) {
    for (const m of text.matchAll(/(?:from\s+|import\(\s*)['"](@\/app\/[^'"]+)['"]/g)) if (!(m[1] in SHELL_ACTIONS)) failures.push(`${file}  the shell imports ${m[1]} — only the actions in SHELL_ACTIONS (plan U · T2)`)
  }
  if (file.startsWith('src/app/(admin)/') && /\bwithTenant\(/.test(text)) {
    failures.push(`${file}  Admin calls withTenant — staff reach a store only through a support session (ADR-0007)`)
  }
  // 6. A MERCHANT'S COST NEVER REACHES A SHOPPER (ADR-0003): storefront code never names it.
  // Shopper-facing code: pages, views, shop API routes and their reads (checkout review 2026-11-07 adds the API and checkout reads).
  const shopperRead = /^src\/lib\/queries\/(storefront|checkout)/.test(file)
  const shopper = file.startsWith('src/app/s/') || shopperRead || file.startsWith('src/components/shop-preview/')
    || file.startsWith('src/components/storefront/') || file.startsWith('src/app/(console)/console/preview/') || file.startsWith('src/app/api/shop/') || file === 'src/lib/http/shop-api.ts'
  if (shopper) {
    // The team's side of an order (1D) never reaches a shopper: why it was cancelled, notes, who did what.
    const named = [...SENTINELS, 'keySecret', 'webhookSecret', 'key_secret', 'webhook_secret', 'cancelReason', 'cancel_reason', 'cancelNote', 'cancel_note', 'orderNotes', 'order_notes', 'orderEvents', 'order_events'].filter((x) => text.includes(x))
    if (named.length) failures.push(`${file}  shopper code names a merchant cost or secret (${named.join(', ')}) — select only what a shopper sees`)
  }
  // 6b. Shopper reads name their columns: a bare select() or returning() would carry unit_cost along (storefront review 2026-11-07).
  if ((shopperRead || file.startsWith('src/app/api/shop/')) && (/\.select\(\s*\)/.test(text) || /\.selectDistinct\(\s*\)/.test(text) || /\.returning\(\s*\)/.test(text) || /getTableColumns/.test(text))) {
    failures.push(`${file}  shopper read with a bare select() or returning() — name the columns a shopper sees`)
  }
  // 6c. Shop pages are static and shared: nothing per-request, and no preview switch (drafts would enter the shared cache).
  if (file.startsWith('src/app/s/') && /\bpreview|searchParams|\bcookies\(|\bheaders\(|draftMode/.test(text)) {
    failures.push(`${file}  shop page reads the request or a preview switch — pages are cached for every shopper; preview lives under /console/preview`)
  }
  // 6d. One cache helper: shopCached in src/lib/queries/storefront.ts puts the tenant in every key and tag.
  if (/\bunstable_cache\b/.test(text) && !/^src\/lib\/queries\/storefront\.ts$/.test(file)) {
    failures.push(`${file}  unstable_cache outside src/lib/queries/storefront.ts — use shopCached (tenant in key and tags)`)
  }
  if (file.startsWith('src/lib/queries/')) {
    if (!/import\s+['"]server-only['"]/.test(text)) failures.push(`${file}  query file without import 'server-only'`)
    if (!/\bwithTenant\(/.test(text)) failures.push(`${file}  query file that never calls withTenant(`)
  }
}

const schema = readdirSync('src/lib/db').filter(f => /^schema.*\.ts$/.test(f)).map(f => code(join('src/lib/db', f))).join('\n')
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

// 5. EVERY frata_app POLICY IS TENANT-BOUND. A `using (true)` passes the RLS
// check above yet guards nothing (tenancy-auditor, 2026-11-06). Only tables with
// no merchant rows may have one, each with its reason. Admin policies
// (to frata_admin) are fenced by ADR-0007 instead.
const OPEN_FOR_APP = {
  outbox: 'the cross-tenant sweep reads and marks due rows; inserts are tenant-checked',
  webhook_events: 'a signed webhook arrives before its tenant is known',
  pincodes: 'India Post reference data, the same for every shop, read-only',
  rate_limits: 'hashed abuse counters, no tenant data',
  plans: 'the public price list',
  plan_versions: 'the public price list',
}
// `alter policy` bodies count too (0018), and `app_current_tenant() is null or …` — the shape that lets a
// query with no tenant set read every shop — is allowed only on OPEN_FOR_APP tables (tenancy audit 2026-11-07).
for (const m of sql.matchAll(/(create|alter) policy\s+(\w+)\s+on\s+"?([a-z_]+)"?([\s\S]*?);/g)) {
  const [, verb, name, table, body] = m
  if (verb === 'create' && !/\bto\s+[^;]*\bfrata_app\b/.test(body)) continue
  if (verb === 'alter' && !/\b(using|with check|to)\b/.test(body)) continue
  if (OPEN_FOR_APP[table]) continue
  if (verb === 'alter' && /\bto\s+[^;]*\bfrata_app\b/.test(body) && !/\busing\b/.test(body)) { failures.push(`policy ${name} on ${table}  is handed to frata_app by alter policy without its body — drop and create it, so this gate can read it`); continue }
  if (!/app_current_tenant\(\)/.test(body)) failures.push(`policy ${name} on ${table}  lets frata_app past without app_current_tenant() — bind it to the tenant, or add the table to OPEN_FOR_APP with why`)
  else if (/app_current_tenant\(\)\s+is\s+null/.test(body)) failures.push(`policy ${name} on ${table}  opens every shop when no tenant is set (app_current_tenant() is null) — only OPEN_FOR_APP tables may`)
}

if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:tenant — ${failures.length} problem(s). See .claude/skills/frata-architecture/SKILL.md § Tenancy.`)
  process.exit(1)
}
console.log(`check:tenant — clean (${tables.length} tables guarded)`)
