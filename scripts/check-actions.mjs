#!/usr/bin/env node
// Fails: a server action file or route handler that reaches no auth check, and is not an entry point named below with the credential it checks; a console page that does not call requireMember itself.
//
// ⚠️ WHY. A server action is a public POST endpoint whether or not any page
// imports it, and a page's sign-in check does not cover the actions on it
// (Next.js, "Data Security"). Every 'use server' file and every route.ts must
// either call one of the chokepoints below — which check who is calling — or
// be listed in ENTRY_POINTS with the credential it checks itself (a cron
// bearer, a webhook signature, a one-time token), which must appear in it.
// From Ekatan's performance and security baseline.
//
// Ownership (may THIS caller touch THIS row) is not something a grep can
// see; the design review asks it (ekatan3d-planning, "Security").

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Functions that establish who is calling, and refuse who may not. */
// shopRequest (src/lib/http/shop-api.ts) is requireShop plus a Zod body and a per-shop limit, for /api/shop/*.
const CHOKEPOINTS = ['requireMember', 'requireStaff', 'asMember', 'requireUser', 'requireShop', 'shopRequest']

/** Entry points that check their own credential: file → [what it is, a token that must appear in it]. */
const ENTRY_POINTS = {
  'src/app/login/actions.ts': ['sign-in: emails a link and code to the address given (rate limited); the code proves the inbox', 'verifyOtp('],
  'src/app/auth/callback/route.ts': ['sign-in: trades the one-time code for a session', 'exchangeCodeForSession('],
  'src/app/api/cron/outbox/route.ts': ['Vercel Cron', 'isCronRequest('],
  'src/app/api/webhooks/razorpay/[key]/route.ts': ['Razorpay webhook: HMAC of the raw body with the shop\'s own secret, found by our key', 'verifyRazorpaySignature('],
  // Public, read-only, cached per shop: the shop comes from the host the middleware wrote (shopFor checks its shape).
  'src/app/s/[host]/sitemap.xml/route.ts': ['a shop\'s sitemap: public, read-only', 'shopForRoute('],
  'src/app/s/[host]/robots.txt/route.ts': ['a shop\'s robots.txt: public, read-only', 'shopForRoute('],
}

const walk = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.includes('/__tests__/') ? [p] : []
})

const failures = []
const seen = new Set()
for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  const isAction = /^\s*['"]use server['"]/.test(text)
  const isRoute = /\/route\.ts$/.test(file) && file.startsWith('src/app/')
  if (!isAction && !isRoute) continue
  const entry = ENTRY_POINTS[file]
  if (entry) {
    seen.add(file)
    if (!text.includes(entry[1])) failures.push(`${file}  listed as "${entry[0]}" but no longer contains \`${entry[1]}\` — re-check how it is protected`)
    continue
  }
  if (!CHOKEPOINTS.some(c => new RegExp(`\\b${c}\\(`).test(text))) {
    failures.push(`${file}  ${isAction ? 'server actions' : 'route handler'} with no auth check — call ${CHOKEPOINTS.join(' / ')}, or list it in scripts/check-actions.mjs with the credential it checks`)
  }
}
// An Admin page is guarded by its own requireStaff (layouts guard nothing below).
for (const file of existsSync('src/app/(admin)') ? walk('src/app/(admin)') : []) {
  if (!file.endsWith('/page.tsx')) continue
  if (!/\brequireStaff\(/.test(readFileSync(file, 'utf8'))) {
    failures.push(`${file}  Admin page that does not call requireStaff( itself`)
  }
}
// Every console write goes through asMember, which audits support visits in the same transaction.
for (const file of walk('src/app/(console)')) {
  const text = readFileSync(file, 'utf8')
  if (/^\s*['"]use server['"]/m.test(text) && !/\basMember\(/.test(text)) {
    failures.push(`${file}  console server actions must use asMember( (support visits are audited there)`)
  }
}

// A console page is guarded by its OWN check: Next renders the layout and the
// page in parallel, so the layout's requireMember protects nothing below it.
for (const file of walk('src/app/(console)')) {
  if (!file.endsWith('/page.tsx')) continue
  if (!/\brequireMember\(/.test(readFileSync(file, 'utf8'))) {
    failures.push(`${file}  console page that does not call requireMember( itself — the layout's check does not cover it`)
  }
}

for (const file of Object.keys(ENTRY_POINTS)) {
  if (!seen.has(file)) failures.push(`scripts/check-actions.mjs  lists ${file}, which is gone or is no longer an entry point`)
}

if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:actions — ${failures.length} problem(s)`)
  process.exit(1)
}
console.log('check:actions — clean')
