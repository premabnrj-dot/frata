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
//   9. THE STOREFRONT API (ADR-0018): a key is the third source of a tenant id, resolved ONLY inside apiRequest. In
//      src/app/api/storefront/**, src/lib/storefront-api/** and src/lib/modules/*/api.ts: every exported route method is
//      apiRequest(…) (openapi.json, which has no key, is the one named entry point); no shop or tenant id from a host,
//      a session, a header, a cookie, params or a body; storefrontKeyFor only in request.ts, storefrontKeyRow only in
//      src/lib/queries/storefront-keys.ts (and platform.ts, its definition), app_storefront_key only in platform.ts and migrations.
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
/** Storefront API routes with no key, and why (rule 9). */
const API_ENTRY_POINTS = new Set([
  'src/app/api/storefront/2026-12/openapi.json/route.ts', // the published schema: generated from the closed output schemas, no shop data
])
/** App files that may open withTenant themselves, with why. */
const TENANT_IN_APP = {
  'src/app/api/shop/orders/view/route.ts': 'the shopper\'s order page: tenant from the host, order from a signed token',
}
const DATA_MODULE = /(?:from\s+|import\(\s*)['"]@\/lib\/(?:queries|db|admin|auth)(?:\/[^'"]*)?['"]/
/** App files outside Admin that may import src/lib/admin, with why (each checks its own credential). */
const ADMIN_LIB_IN_APP = {
  'src/app/api/cron/drain/route.ts': 'The 5-minute drain sends the staff security emails through frata_admin (CRON_SECRET via isCronRequest; staff passkeys, security re-review F2)',
  'src/app/api/cron/outbox/route.ts': 'The daily run issues this month\'s bills on the 1st to 3rd through frata_admin, issueMonthAuto only (CRON_SECRET via isCronRequest; billing rework R2, owner decision 3)',
  'src/lib/studio/with-studio.ts': 'Studio\'s entry states (owner 2026-11-23): gateState for the signed-in staff member\'s OWN staff passkeys only, from their requireStaff identity, after both staff and partner checks name the same user',
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
  // Studio credits' SYSTEM definers (ids only: apply a payment, settle, refund, renew; C1, architecture B2) are called
  // only by the code that measured or fetched what they record: src/lib/studio/** (the billing webhook reaches them
  // through app_apply_billing_event). A whole-module import or a re-export would carry `system` past this rule, and a
  // definer named anywhere but the one TS layer would skip it (tenancy audit 2026-11-23).
  const CREDITS_DB = `['"]@\\/lib\\/db\\/partner-credits['"]`
  if ((new RegExp(`import\\s*\\{[^}]*\\bsystem\\b[^}]*\\}\\s*from\\s*${CREDITS_DB}`).test(text) || new RegExp(`import\\s*\\*\\s*as\\s+\\w+\\s+from\\s*${CREDITS_DB}`).test(text))
      && !file.startsWith('src/lib/studio/')) {
    failures.push(`${file}  imports Studio credits' system definers — only src/lib/studio/** may (C1)`)
  }
  if (new RegExp(`export\\s*(\\*|\\{[^}]*\\})\\s*from\\s*${CREDITS_DB}`).test(text)) failures.push(`${file}  re-exports src/lib/db/partner-credits — import what you need where you need it (C1)`)
  if (/\bapp_pc_\w+/.test(text) && file !== 'src/lib/db/partner-credits.ts') failures.push(`${file}  names a Studio credits definer (app_pc_*) — only src/lib/db/partner-credits.ts calls them (C1)`)
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
  const shopperRead = /^src\/lib\/(queries\/(storefront|checkout)|storefront\/|storefront-api\/)|^src\/domains\/storefront-api\//.test(file) // lib/storefront: the shop's cached reads' helpers (showcase)
  const shopper = file.startsWith('src/app/s/') || shopperRead || file.startsWith('src/components/shop-preview/')
    || file.startsWith('src/components/storefront/') || file.startsWith('src/app/(console)/console/preview/') || file.startsWith('src/app/api/shop/') || file === 'src/lib/http/shop-api.ts' || file.startsWith('src/app/api/storefront/')
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
  if (/\bunstable_cache\b/.test(text) && !/^src\/lib\/queries\/storefront(-keys)?\.ts$/.test(file)) {
    failures.push(`${file}  unstable_cache outside src/lib/queries/storefront.ts (or the key lookup, storefront-keys.ts) — use shopCached (tenant in key and tags)`)
  }
  // 9. The Storefront API's one door (ADR-0018 § Gates and proof).
  const apiFile = file.startsWith('src/app/api/storefront/') || file.startsWith('src/lib/storefront-api/') || /^src\/lib\/modules\/[^/]+\/api\.ts$/.test(file)
  if (apiFile) {
    if (file.startsWith('src/app/api/storefront/') && !API_ENTRY_POINTS.has(file)) {
      for (const m of text.matchAll(/export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b([^\n]*)/g)) {
        if (!/^\s*=\s*apiRequest\(/.test(m[2])) failures.push(`${file}  ${m[1]} is not apiRequest(…) — every Storefront API handler goes through the one door (ADR-0018)`)
      }
      if (/export\s+default\b/.test(text)) failures.push(`${file}  a default export in an API route — export GET = apiRequest(…)`)
    }
    const banned = [
      [/\b(shopIdForHost|shopMovedTo|tenantForHost|requireMember|requireShop|asMember|asModule)\b/, 'a host or session tenant source'],
      [/\bcookies\(|\bheaders\(\)|from\s+['"]next\/headers['"]/, 'cookies() or headers()'],
      [/params\??\.(tenant|shop)\w*/i, 'a tenant or shop id from params'],
      [/searchParams[^\n]*\.get\(\s*['"](shop|tenant)/, 'a tenant or shop id from the query'],
      [/\b(raw|search|p|parsed|params)\??\.?\[?\s*['"]?(?:get\(\s*['"])?(shop|tenant)\w*/i, 'a tenant or shop id from params or the query'],
      [/\.json\(\)|\.formData\(\)/, 'a request body'],
    ]
    for (const [re, what] of banned) if (re.test(text)) failures.push(`${file}  ${what} in Storefront API code — the shop comes only from the key, through apiRequest (ADR-0018)`)
    if (/\[(shop|tenant)[^\]]*\]/i.test(file)) failures.push(`${file}  a route segment named for a shop or tenant — the shop comes only from the key (ADR-0018)`)
    if (file !== 'src/lib/storefront-api/request.ts' && /headers\.get\(/.test(text)) failures.push(`${file}  reads a request header — only request.ts reads the network and the Origin`)
  }
  if (/\bstorefrontKey(For|Now)\b/.test(text) && !['src/lib/storefront-api/request.ts', 'src/lib/queries/storefront-keys.ts'].includes(file)) failures.push(`${file}  calls storefrontKeyFor or storefrontKeyNow — only apiRequest resolves a key (ADR-0018)`)
  if (/\bstorefrontKeyRow\b/.test(text) && !['src/lib/queries/storefront-keys.ts', 'src/lib/db/platform.ts'].includes(file)) failures.push(`${file}  calls storefrontKeyRow — only the cached storefrontKeyFor does (ADR-0018)`)
  if (/\bapp_storefront_key\b/.test(text) && file !== 'src/lib/db/platform.ts') failures.push(`${file}  names app_storefront_key — only src/lib/db/platform.ts calls the definer (ADR-0018)`)
  if (file.startsWith('src/lib/queries/')) {
    if (!/import\s+['"]server-only['"]/.test(text)) failures.push(`${file}  query file without import 'server-only'`)
    // A Builder's reads (T1c) open their transaction through withActor (frata_builder, src/lib/db/actor.ts); Studio's
    // through withStudio (withTenant plus the database's partner bind, src/lib/studio/with-studio.ts). The one
    // pre-tenant query file: which shop a storefront key names (ADR-0018), through the definer, cached.
    if (!/\bwith(Analytics)?Tenant\(|\bwithActor\(|\bwithStudio\(/.test(text) && file !== 'src/lib/queries/storefront-keys.ts') failures.push(`${file}  query file that never calls withTenant(, withAnalyticsTenant(, withActor( or withStudio(`)
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
for (const m of sql.matchAll(/(create|alter|drop) policy\s+(?:if exists\s+)?(\w+)\s+on\s+(?:"?public"?\.)?"?([a-z_]+)"?([\s\S]*?);/g)) {
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
// Partner passkeys (T1b, drizzle/0129): no table grant to any role; the app_partner_pk_* definers are the only door. A
// proof-only helper (schema `proof`, scripts/verify/tenancy.sql) never appears in a migration.
for (const m of sql.matchAll(/grant\s+(?:select|insert|update|delete|all|references|trigger|truncate)[^;]*?\bon\s+(?:table\s+)?"?(partner_(?:passkeys|passkey_requests|webauthn_challenges|stepups|passkey_tries))\b/g)) {
  failures.push(`grant on ${m[1]}  — partner passkey tables have no table grants; the app_partner_pk_* definers are the only door (T1b)`)
}
// P2 Clients (drizzle/0147): a partner's own bills reach no Frrata role at all, not even frata_admin (owner, 2026-11-15);
// the app_partner_bill* / app_partner_client* definers are the only door, and Admin counts through admin_partner_bill_stats.
for (const m of sql.matchAll(/grant\s+(?:select|insert|update|delete|all|references|trigger|truncate)[^;]*?\bon\s+(?:table\s+)?[^;]*?\b(partner_(?:client_bills|client_deals|bill_tries))\b[^;]*?\bto\b/g)) {
  failures.push(`grant on ${m[1]}  — a partner's own bills have no table grants; the partner definers are the only door (P2)`)
}
// Studio's agent (V3a, drizzle/*_studio_access.sql): a turn's person and step-ups and every spend row are platform scope;
// no role holds a grant; the app_studio_* definers and app_turn_actor are the only door (ADR-0020 § 5 as amended).
for (const m of sql.matchAll(/grant\s+(?:select|insert|update|delete|all|references|trigger|truncate)[^;]*?\bon\s+(?:table\s+)?[^;]*?\b(studio_(?:turn_keys|binds|spend_[a-z]+))\b[^;]*?\bto\b/g)) {
  failures.push(`grant on ${m[1]}  — Studio's turn keys and spend rows have no table grants; the app_studio_* definers are the only door (V3a)`)
}
// Studio credits (C1, drizzle/0163–0164; plan docs/plans/2026-11-22-c1-credits.md): no table grant to ANY role; the
// person definers (app_partner_credit*, app_partner_set_*, app_partner_invoice, app_partner_seat_change) and the system
// ones (app_pc_*) are the only door, and Admin reads only admin_partner_gst_rows (tenancy audit
// low finding: a rule naming every table, since partner_billing and partner_invoices share no prefix with the rest).
for (const m of sql.matchAll(/grant\s+(?:select|insert|update|delete|all|references|trigger|truncate)[^;]*?\bon\s+(?:table\s+)?[^;]*?\b(partner_(?:billing|seats|credit_purchases|invoices|credit_uses|credit_entries|client_budgets|credit_notices|credit_tries|mandate_cancels)|fx_rates)\b[^;]*?\bto\b/g)) {
  failures.push(`grant on ${m[1]}  — Studio credit tables have no table grants; the app_partner_credit* / app_pc_* definers are the only door (C1)`)
}
// 10. ADMIN-ONLY PLATFORM TABLES (Admin › Costs drizzle/0172; tenancy review 2026-11-23 and its re-audit; Cashflow plan task 1).
// Each family is a few platform tables only frata_admin touches, named once here with the grants it may have and the only two files
// that may name them. A grant on one to any other role or beyond its list, a policy that is not exactly "for all to frata_admin
// using …", an `alter policy`, an owner change or RLS turned off, a view, function, RULE, TRIGGER or PUBLICATION that reads, copies or
// publishes one, a `begin atomic` body (its dependencies hide from this text), a role membership or a blanket grant, fails. The
// database cannot tell a master admin from support staff (one connection), so the file fence is the second lock: every export of
// the lib file re-checks ADMIN_ONLY, and another module reads these tables only through those exports. tenancy.sql proves the same
// on a real Postgres, including the catalog (pg_rewrite, pg_trigger, pg_depend, pg_publication_tables).
const ADMIN_ONLY_FAMILIES = [
  { name: 'Costs', schema: 'schema-costs', files: ['src/lib/db/schema-costs.ts', 'src/lib/admin/costs.ts'], grants: { cost_items: 'select, insert, update', cost_payments: 'select, insert, delete' } },
]
const FAMILY_OF = Object.fromEntries(ADMIN_ONLY_FAMILIES.flatMap(f => Object.keys(f.grants).map(t => [t, f])))
const FAMILY_GRANTS = Object.assign({}, ...ADMIN_ONLY_FAMILIES.map(f => f.grants))
const tableRe = (names) => new RegExp(`\\b(?:${names.join('|')})\\b`)
const PROTECTED = tableRe(Object.keys(FAMILY_GRANTS))
for (const m of sql.matchAll(/grant\s+([^;]*?)\bon\s+(?:table\s+)?([^;]*?)\bto\s+([^;]*);/g)) {
  for (const t of Object.keys(FAMILY_GRANTS)) {
    if (!new RegExp(`\\b${t}\\b`).test(m[2])) continue
    if (m[1].trim().replace(/\s+/g, ' ') !== FAMILY_GRANTS[t] || m[2].trim() !== t || m[3].trim() !== 'frata_admin') {
      failures.push(`grant on ${t}  — only "grant ${FAMILY_GRANTS[t]} on ${t} to frata_admin" is allowed (${FAMILY_OF[t].name}, check:tenant § 10)`)
    }
  }
}
for (const { name, table, body } of finalPolicies.values()) {
  if (FAMILY_GRANTS[table] && !/^\s*for all to frata_admin\s+using\b/.test(body)) failures.push(`policy ${name} on ${table}  must be "for all to frata_admin using …" and nothing else (${FAMILY_OF[table].name})`)
}
for (const m of sql.matchAll(/alter policy\s+\w+\s+on\s+(?:"?public"?\.)?"?([a-z_]+)"?/g)) if (FAMILY_GRANTS[m[1]]) failures.push(`alter policy on ${m[1]}  — drop and create it, so the gate reads its whole body (${FAMILY_OF[m[1]].name})`)
for (const m of sql.matchAll(/alter table\s+(?:only\s+)?(?:"?public"?\.)?"?([a-z_]+)"?\s+(?:owner to|disable row level security|no force row level security)/g)) if (FAMILY_GRANTS[m[1]]) failures.push(`${m[1]}  changes owner or turns row level security off (${FAMILY_OF[m[1]].name})`)
for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\b[^;]*;/g)) if (PROTECTED.test(m[0])) failures.push('a view reads an Admin-only table  — only that family\'s lib file reads them (check:tenant § 10)')
for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\b[\s\S]*?\$(\w*)\$([\s\S]*?)\$\1\$/g)) if (PROTECTED.test(m[2])) failures.push('a function reads an Admin-only table  — only that family\'s lib file reads them (check:tenant § 10)')
for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?rule\b[^;]*;/g)) if (PROTECTED.test(m[0])) failures.push('a RULE on an Admin-only table  — it could copy a row out of it (check:tenant § 10)')
for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\b[^;]*;/g)) if (PROTECTED.test(m[0])) failures.push('a TRIGGER on an Admin-only table  — its function could copy a row out of it (check:tenant § 10)')
for (const m of sql.matchAll(/(?:alter|create)\s+publication\b[^;]*;/g)) if (PROTECTED.test(m[0])) failures.push('a publication holds an Admin-only table  — replication would carry its rows (check:tenant § 10)')
if (/\bbegin\s+atomic\b/.test(sql)) failures.push('a `begin atomic` function body  — this gate cannot read what it depends on; write the body as a string (check:tenant § 10)')
// A role handed another role's powers, or a blanket grant, reaches the tables without naming them.
for (const m of sql.matchAll(/\bgrant\s+(frata_\w+)\s+to\s+([^;]*);/g)) failures.push(`grant ${m[1]} to ${m[2].trim()}  — a role membership hands over every grant of ${m[1]} (the proofs in § 82 and § 102 name none)`)
for (const m of sql.matchAll(/\bgrant\s+[^;]*\bon\s+all\s+(?:tables|functions)\s+in\s+schema\b[^;]*;/g)) failures.push('a blanket grant on all tables or functions in a schema  — grant each object by name (check:tenant § 10)')
for (const m of sql.matchAll(/\balter\s+default\s+privileges\b[^;]*\bgrant\b[^;]*;/g)) failures.push('alter default privileges … grant  — grant each object by name (check:tenant § 10)')
// The file fence, per family: a file outside its two names no table of it and imports no schema of it.
for (const f of walk('src')) {
  const c = code(f)
  for (const fam of ADMIN_ONLY_FAMILIES) {
    if (fam.files.includes(f)) continue
    if (new RegExp(`${fam.schema}(?:\\.[jt]sx?)?['"]`).test(c)) failures.push(`${f}  imports the ${fam.name} tables — only ${fam.files.filter(x => !x.includes('/db/')).join(' and ')} may (check:tenant § 10)`)
    else if (tableRe(Object.keys(fam.grants)).test(c)) failures.push(`${f}  names a ${fam.name} table — only ${fam.files.join(' and ')} may (check:tenant § 10)`)
  }
}
if (/\bcreate\s+schema\s+proof\b|\bproof\.(?:key|check|sess|h)\s*\(/i.test(sql)) failures.push('a proof-only helper (schema proof) in a migration  — it belongs in scripts/verify/tenancy.sql only')
for (const m of sql.matchAll(/grant\s+((?:select|insert|update|delete|all|references|trigger|truncate)[^;]*?)\bon\s+(?:table\s+)?"?(partner_(?:members|assignments))\b([^;]*);/g)) {
  if (!/^select\s+$/.test(m[1]) || !/\bto\s+frata_admin\s*$/.test(m[3].replace(/,\s*partner_(?:members|assignments)/, ''))) failures.push(`grant on ${m[2]}  — partner team tables: only "grant select … to frata_admin"; the app_partner_* definers are the only door`)
}
// 7b. Builders (T1c, ADR-0015, drizzle/*_builders_access.sql): frata_builder's whole reach is named once. A grant to it
// anywhere else, a privilege but SELECT on a table or EXECUTE on a function outside its two, or a policy for it but
// builder_rows / builder_only fails. (scripts/verify/tenancy.sql § 82 proves the same on a real Postgres.)
const BUILDER_COLUMNS = {
  products: 'id tenant_id title handle status publish_at published_at updated_at type_id options option_values tags taxonomy_category',
  product_types: 'id tenant_id name',
  variants: 'id tenant_id product_id archived_at stock price when_out ships_by lead_min_days lead_max_days preorder_cap sku',
  product_colours: 'tenant_id product_id hex value family',
  product_images: 'tenant_id product_id base widths position',
  collections: 'id tenant_id title handle kind rules match_all',
  collection_products: 'tenant_id collection_id product_id',
  product_attributes: 'tenant_id product_id attribute values',
  // One brand record (one-address P1·2, drizzle/*_brand_record.sql): the live record a Builder previews, and the store's
  // logo beside it. Never `previous`, `updated_by`, a proposal or a season.
  brand_tokens: 'tenant_id logo_mark_url logo_stacked_url logo_reversed_url color_bg color_panel color_text color_muted color_accent color_on color_edge color_line color_good color_warn color_bad font_display font_body radius density',
  // Checkout design (one-address P2·1, drizzle/*_checkout_design.sql): the live design a Builder previews beside the
  // record. Never `previous` or `updated_by`.
  checkout_design: 'tenant_id header back_link policy_rows trust heading thanks',
  // + one-address P2·6: the public delivery, returns and Pay on delivery facts a checkout preview's trust blocks name.
  shop_settings: 'tenant_id logo_url dispatch_days metro_days rest_days return_kind return_days cod_on cod_max',
}
const builderSelectOk = (what) => {
  const m = what.match(/^select \(([a-z_, \n]+)\) on ([a-z_]+)$/)
  const allowed = m && BUILDER_COLUMNS[m[2]]?.split(' ')
  return !!allowed && m[1].split(',').map((c) => c.trim()).every((c) => allowed.includes(c))
}
for (const f of readdirSync('drizzle').filter(f => f.endsWith('.sql'))) {
  const body = readFileSync(join('drizzle', f), 'utf8').split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n').toLowerCase()
  for (const m of body.matchAll(/grant\s+([^;]*?)\bto\s+([^;]*\bfrata_builder\b[^;]*);/g)) {
    const what = m[1].trim()
    const ok = /_builders_access\.sql$|_brand_record\.sql$|_checkout_design\.sql$/.test(f) && (
      /^usage on schema public$/.test(what)
      || /^execute on function (app_member_role\(\)|app_current_tenant\(\))$/.test(what)
      || builderSelectOk(what))
    if (!ok) failures.push(`${f}  grant ${what.replace(/\s+/g, ' ').slice(0, 80)} to frata_builder — its reach is the T1c allow-list only (ADR-0015)`)
  }
  for (const m of body.matchAll(/create policy\s+(\w+)[^;]*?\bto\s+frata_builder\b/g)) {
    if (!['builder_rows', 'builder_only'].includes(m[1])) failures.push(`${f}  policy ${m[1]} for frata_builder — only builder_rows and builder_only (ADR-0015)`)
  }
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
