#!/usr/bin/env node
// Fails: a setting read in a second file, a client made outside its owner, or a setting the code reads that .env.example does not list.
//
// ⚠️ WHY. One setting, one owner ("derive, never duplicate"). Ekatan found its
// Supabase address read in eight files, each with its own idea of what unset
// means. A setting is read in the module that owns it; everyone imports that:
//
//   - server secrets → src/lib/env.ts
//   - public values (NEXT_PUBLIC_*) → src/lib/public-env.ts
//   - CRON_SECRET → src/lib/auth/cron.ts (isCronRequest)
//
// The database connections are made in src/lib/db/index.ts (frata_app) and
// src/lib/db/admin.ts (frata_admin) and src/lib/db/analytics.ts (A·2's database) only; a Supabase
// client in src/lib/supabase/ only. Platform flags any file may read are in
// PLATFORM. It reads code, not prose: a comment is skipped.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Set by the platform, not by us — read wherever they are needed. */
const PLATFORM = new Set(['NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'NEXT_RUNTIME'])

/** A constructor and the only place it may be called. */
const OWNED_CALLS = [
  ['postgres()', /(^|[^.\w])postgres\(/, f => f === 'src/lib/db/index.ts' || f === 'src/lib/db/admin.ts' || f === 'src/lib/db/analytics.ts', 'src/lib/db/index.ts (frata_app), src/lib/db/admin.ts (frata_admin) or src/lib/db/analytics.ts (the analytics database)'],
  ['a Supabase client', /\bcreate(Server|Browser)Client\(/, f => f.startsWith('src/lib/supabase/'), 'src/lib/supabase/'],
]

const walk = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.includes('/__tests__/') ? [p] : []
})

const failures = []
const readers = new Map()
for (const file of walk('src')) {
  const code = readFileSync(file, 'utf8').split(/\r?\n/)
    .map(l => l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/\/\*.*?\*\//g, '')).join('\n')
  for (const [, name] of code.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    if (PLATFORM.has(name)) continue
    if (!readers.has(name)) readers.set(name, new Set())
    readers.get(name).add(file)
  }
  for (const [what, re, allowed, owner] of OWNED_CALLS) {
    if (re.test(code) && !allowed(file)) failures.push(`${file}  makes ${what} — that connection is made in ${owner} only; import it`)
  }
}

const listed = new Set(readFileSync('.env.example', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=/)?.[1]).filter(Boolean))
for (const [name, files] of readers) {
  if (files.size > 1) failures.push(`${name}  read in ${files.size} files (${[...files].join(', ')}) — read it in one module and import that`)
  if (!listed.has(name)) failures.push(`${name}  read in ${[...files][0]} but not listed in .env.example — add the name, with where its value comes from`)
}

// Previews off production (spec 2026-11-12): in src/lib/env.ts every variable is read through secret() unless it is
// plain configuration listed here; CRON_SECRET only beside SECRETS_ALLOWED. Adding a name here says "this is not a
// secret" — a reviewer checks that claim.
const PLAIN = new Set(['VERCEL', 'VERCEL_ENV', 'RAZORPAY_API_BASE', 'META_GRAPH_BASE', 'FRRATA_WA_SIGNUP_TEMPLATE', 'FRRATA_WA_TEMPLATE_LANG',
  'EKCODE_WA_AUTH_TEMPLATE', 'EKCODE_WA_TEMPLATE_LANG', 'FRRATA_GSTIN', 'FRRATA_LEGAL_NAME', 'FRRATA_ADDRESS', 'FRRATA_SAC', 'E2E_FIXTURES',
  'GSP_PROVIDER', 'VERCEL_PROJECT_ID', 'VERCEL_TEAM_ID', 'VERCEL_API_BASE', 'DOH_BASE', 'DOMAIN_CAPACITY', 'MUX_ENVIRONMENT_ID', 'MUX_API_BASE',
  'MUX_STREAM_BASE', 'MUX_IMAGE_BASE', 'SES_ACCOUNT_ID', 'SES_CONFIG_SHOPS', 'SES_CONFIG_NOTICES', 'SES_SNS_TOPIC_ARN', 'EMAIL_SHOP_DOMAIN',
  'EMAIL_NOTICES_FROM', 'SES_API_BASE'])
{
  const env = readFileSync('src/lib/env.ts', 'utf8').split(/\r?\n/).map(l => l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/\/\*.*?\*\//g, '')).join('\n')
  for (const m of env.matchAll(/(secret\()?process\.env\.([A-Z0-9_]+)/g)) {
    if (!m[1] && !PLAIN.has(m[2])) failures.push(`${m[2]}  read in src/lib/env.ts without secret() — wrap it (previews off production), or list it in PLAIN if it is not a secret`)
  }
  const cron = readFileSync('src/lib/auth/cron.ts', 'utf8')
  if (!/SECRETS_ALLOWED \? process\.env\.CRON_SECRET/.test(cron)) failures.push('CRON_SECRET  read in src/lib/auth/cron.ts without SECRETS_ALLOWED — Production only on Vercel')
}

if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:config — ${failures.length} problem(s)`)
  process.exit(1)
}
console.log(`check:config — clean (${readers.size} settings, one reader each)`)
