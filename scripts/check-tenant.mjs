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
//   8. THE ANALYTICS DATABASE (A·2) holds to the same: every table in src/lib/db/analytics-schema.ts or created in
//      drizzle-analytics/*.sql has RLS and a policy there, every frata_app policy is bound to app_current_tenant(),
//      nothing is granted on the partitions' schema `ev`, and its connection (@/lib/db/analytics) is imported only by
//      src/lib/queries/** (which then call withAnalyticsTenant) and the files in ANALYTICS_IN_APP.
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
const ANALYTICS_DB = /(?:from\s+|import\(\s*)['"]@\/lib\/db\/analytics['"]/
/** Files outside src/lib/queries that may use the analytics connection, with why. */
const ANALYTICS_IN_APP = {
  'src/lib/analytics/ingest.ts': 'the visit beacon\'s ingest (A·2): one ingestBatch per beacon, the shop from requireShop (the host), never the body',
}
/** App files that may open withTenant themselves, with why. */
const TENANT_IN_APP = {
  'src/app/api/shop/orders/view/route.ts': 'the shopper\'s order page: tenant from the host, order from a signed token',
}
const DATA_MODULE = /(?:from\s+|import\(\s*)['"]@\/lib\/(?:queries|db|admin|auth)(?:\/[^'"]*)?['"]/
/** App files outside Admin that may import src/lib/admin, with why (each checks its own credential). */
const ADMIN_LIB_IN_APP = {
  'src/app/api/cron/drain/route.ts': 'The 5-minute drain sends the staff security emails through frata_admin (CRON_SECRET via isCronRequest; staff passkeys, security re-review F2)',
  'src/app/api/cron/infra/route.ts': 'Admin › Infrastructure\'s hourly pull of vendor usage (CRON_SECRET via isCronRequest; writes platform rows only, plan 2026-11-11 I·1)',
}
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
  if (ADMIN_LIB.test(text) && !file.startsWith('src/app/(admin)/') && !file.startsWith('src/lib/admin/') && !ADMIN_LIB_IN_APP[file]) {
    failures.push(`${file}  imports src/lib/admin — only Admin pages and actions may (ADR-0007)`)
  }
  if (file.startsWith('src/lib/admin/')) {
    if (!/import\s+['"]server-only['"]/.test(text)) failures.push(`${file}  admin module without import 'server-only'`)
    if (/^\s*['"]use server['"]/m.test(text)) failures.push(`${file}  'use server' in src/lib/admin turns it into a public endpoint — put actions under src/app/(admin)`)
  }
  if (ANALYTICS_DB.test(text) && !file.startsWith('src/lib/db/') && !file.startsWith('src/lib/queries/') && !(file in ANALYTICS_IN_APP)) {
    // Type-only passes only when every import of the module is `import type { … }` (a namespace import or import()
    // matches no brace form, so it counts as a value import: impact review 2026-11-11).
    const all = [...text.matchAll(/(?:from\s+|import\(\s*)['"]@\/lib\/db\/analytics['"]/g)].length
    const typeOnly = [...text.matchAll(/import\s+type\s+\{[^}]*\}\s+from\s+['"]@\/lib\/db\/analytics['"]/g)].length
    if (!(all > 0 && typeOnly === all)) failures.push(`${file}  imports the analytics connection — read through src/lib/queries (withAnalyticsTenant), or list it in ANALYTICS_IN_APP with why`)
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
  const shopperRead = /^src\/lib\/(queries\/(storefront|checkout)|storefront\/)/.test(file) // lib/storefront: the shop's cached reads' helpers (showcase)
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
  if (file.startsWith('src/app/s/') && /(?<!max-image-)\bpreview|searchParams|\bcookies\(|\bheaders\(|draftMode/.test(text)) {
    failures.push(`${file}  shop page reads the request or a preview switch — pages are cached for every shopper; preview lives under /console/preview`)
  }
  // 6e. A design's blocks never read data (Theme Studio spec § 2): the section passes what the page already read, so a
  // block can't add a statement or reach another shop's rows (TS0b; the per-source loaders arrive in TS1).
  if (file.startsWith('src/components/storefront/blocks/') && (/from\s+['"](@\/lib\/(queries|db|themes|outbox)\b|\.\.?\/[^'"]*\b(queries|db)\b)/.test(text) || /import\s+['"]server-only['"]/.test(text))) {
    failures.push(`${file}  a design block imports a loader or the db — blocks render what their section passes them`)
  }
  // 6d. One cache helper: shopCached in src/lib/queries/storefront.ts puts the tenant in every key and tag.
  if (/\bunstable_cache\b/.test(text) && !/^src\/lib\/queries\/storefront\.ts$/.test(file)) {
    failures.push(`${file}  unstable_cache outside src/lib/queries/storefront.ts — use shopCached (tenant in key and tags)`)
  }
  if (file.startsWith('src/lib/queries/')) {
    if (!/import\s+['"]server-only['"]/.test(text)) failures.push(`${file}  query file without import 'server-only'`)
    if (!/\bwith(Analytics)?Tenant\(/.test(text)) failures.push(`${file}  query file that never calls withTenant( or withAnalyticsTenant(`)
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
  pincodes: 'India Post reference data, the same for every shop, read-only',
  rate_limits: 'hashed abuse counters, no tenant data',
  plans: 'the public price list',
  plan_versions: 'the public price list',
  addon_prices: 'the public add-on price list (modules foundation)',
  module_pauses: 'Frrata pausing a module for every shop: platform-wide, no tenant data',
  theme_versions: 'which theme versions Frrata released, recalled or withdrew: platform-wide, no tenant data (themes T3)',
  trial_settings: 'the trial terms for new sign-ups (length, days to go live): platform-wide, no tenant data; who and why are not granted (trials TR0)',
}
// `alter policy` bodies count too (0018), and `app_current_tenant() is null or …` — the shape that lets a
// query with no tenant set read every shop — is allowed only on OPEN_FOR_APP tables (tenancy audit 2026-11-07).
// Each policy as the migrations LEAVE it: a later alter replaces an earlier body, a drop removes it (so a branch a
// later migration took away is not reported, and one it adds is).
const finalPolicies = new Map()
for (const m of sql.matchAll(/(create|alter|drop) policy\s+(?:if exists\s+)?(\w+)\s+on\s+"?([a-z_]+)"?([\s\S]*?);/g)) {
  const [, verb, name, table, body] = m
  const key = `${table}.${name}`
  if (verb === 'drop') { finalPolicies.delete(key); continue }
  const toApp = /\bto\s+[^;]*\bfrata_app\b/.test(body)
  if (verb === 'alter' && toApp && !/\busing\b/.test(body) && !OPEN_FOR_APP[table]) failures.push(`policy ${name} on ${table}  is handed to frata_app by alter policy without its body — drop and create it, so this gate can read it`)
  if (verb === 'alter' && !/\b(using|with check)\b/.test(body)) { if (toApp && finalPolicies.has(key)) finalPolicies.get(key).forApp = true; continue }
  const forApp = verb === 'create' ? toApp : (finalPolicies.get(key)?.forApp ?? false) || toApp
  finalPolicies.set(key, { name, table, body, forApp })
}
for (const { name, table, body, forApp } of finalPolicies.values()) {
  if (!forApp || OPEN_FOR_APP[table]) continue
  if (!/app_current_tenant\(\)/.test(body)) failures.push(`policy ${name} on ${table}  lets frata_app past without app_current_tenant() — bind it to the tenant, or add the table to OPEN_FOR_APP with why`)
  else if (/app_current_tenant\(\)\s+is\s+null/.test(body)) failures.push(`policy ${name} on ${table}  opens every shop when no tenant is set (app_current_tenant() is null) — only OPEN_FOR_APP tables may`)
}

// EkCode's vault (ADR-0009, drizzle/0088): no app role is ever granted a table; definers are the only door.
for (const m of sql.matchAll(/grant\s+(?:select|insert|update|delete|all|references|trigger|truncate)[^;]*?\bon\s+(?:table\s+)?"?(ekcode_[a-z_]+)/g)) {
  failures.push(`grant on ${m[1]}  — the EkCode vault has no table grants; add a definer instead (ADR-0009)`)
}
// Staff passkeys (ADR-0007 amended 2026-11-12, drizzle/0109): the same — no app role, not even frata_admin, holds a grant.
for (const m of sql.matchAll(/grant\s+(?:select|insert|update|delete|all|references|trigger|truncate)[^;]*?\bon\s+(?:table\s+)?"?(staff_(?:passkeys|enrolment_requests|webauthn_challenges|stepups|passkey_tries))\b/g)) {
  failures.push(`grant on ${m[1]}  — staff passkey tables have no table grants; the app_staff_* definers are the only door (ADR-0007)`)
}
// Partner teams (T1a, drizzle/0124): definers are the only door for the app; frata_admin may only read.
for (const m of sql.matchAll(/grant\s+((?:select|insert|update|delete|all|references|trigger|truncate)[^;]*?)\bon\s+(?:table\s+)?"?(partner_(?:members|assignments))\b([^;]*);/g)) {
  if (!/^select\s+$/.test(m[1]) || !/\bto\s+frata_admin\s*$/.test(m[3].replace(/,\s*partner_(?:members|assignments)/, ''))) failures.push(`grant on ${m[2]}  — partner team tables: only "grant select … to frata_admin"; the app_partner_* definers are the only door`)
}
// 8. The analytics database (A·2): its own folder, the same rules, and no open tables at all.
const aSql = readdirSync('drizzle-analytics').filter(f => f.endsWith('.sql'))
  .map(f => readFileSync(join('drizzle-analytics', f), 'utf8').split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n'))
  .join('\n').toLowerCase()
const aTables = [...new Set([
  ...[...code('src/lib/db/analytics-schema.ts').matchAll(/pgTable\(\s*'([a-z_]+)'/g)].map(m => m[1]),
  ...[...aSql.matchAll(/create table\s+(?:if not exists\s+)?(?:"?[a-z_0-9]+"?\.)?"?([a-z_0-9]+)"?\s*\(/g)].map(m => m[1]),
])]
for (const t of aTables) {
  if (!new RegExp(`alter table\\s+(?:"?[a-z_0-9]+"?\\.)?"?${t}"?\\s+enable row level security`).test(aSql)) failures.push(`analytics table ${t}  has no "enable row level security" in drizzle-analytics/*.sql`)
  if (!new RegExp(`create policy\\s+\\w+\\s+on\\s+"?${t}"?\\b`).test(aSql)) failures.push(`analytics table ${t}  has no policy in drizzle-analytics/*.sql`)
}
// Every policy but a restrictive false one names its role and binds the shop (a policy with no TO is everyone's).
for (const m of aSql.matchAll(/create policy\s+(\w+)\s+on\s+"?([a-z_.]+)"?([\s\S]*?);/g)) {
  const [, name, table, body] = m
  if (/\bas restrictive\b/.test(body) && /using\s*\(\s*false\s*\)/.test(body)) continue
  if (!/\bto\s+(frata_app|frata_admin)\b/.test(body) || !/app_current_tenant\(\)/.test(body) || /app_current_tenant\(\)\s+is\s+null/.test(body)) {
    failures.push(`analytics policy ${name} on ${table}  must name frata_app (or frata_admin) and bind app_current_tenant(), or be restrictive false`)
  }
}
if (/\balter policy\b/.test(aSql)) failures.push('drizzle-analytics alters a policy — drop and create it, so this gate can read its whole body')
if (/disable row level security|no force row level security/.test(aSql)) failures.push('drizzle-analytics turns row level security off somewhere (A·2)')
if (/grant\s+[^;]*\b(truncate|all|references|trigger)\b[^;]*\bon\b/.test(aSql)) failures.push('drizzle-analytics grants TRUNCATE, ALL, REFERENCES or TRIGGER (TRUNCATE ignores RLS) — grant the exact privilege')
if (/default privileges[^;]*\bgrant\b/.test(aSql)) failures.push('drizzle-analytics grants by default privileges — grant each object by name')
if (/grant\s[^;]*\bon\s+schema\s+ev\b|grant\s[^;]*\bon\s+(?:table\s+|all tables in schema\s+)?ev\b/.test(aSql)) {
  failures.push('drizzle-analytics grants on the schema ev — raw partitions are read only through the parent\'s policy (A·2)')
}

if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:tenant — ${failures.length} problem(s). See .claude/skills/frata-architecture/SKILL.md § Tenancy.`)
  process.exit(1)
}
console.log(`check:tenant — clean (${tables.length} tables guarded, ${aTables.length} in analytics)`)
