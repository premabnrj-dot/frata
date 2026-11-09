#!/usr/bin/env node
// Fails: a server action file or route handler that reaches no auth check (per exported action, comments ignored), and is not an entry point named below with the credential it checks; a console, look-editor or look-preview page that does not call requireMember itself.
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
// moduleGate (src/lib/auth/as-module.ts) is requireMember plus the module's on/off check, for reads and non-writing actions.
const CHOKEPOINTS = ['requireMember', 'requireStaff', 'asMember', 'requireUser', 'requirePartner', 'asModule', 'moduleGate', 'requireShop', 'shopRequest']

/** Entry points that check their own credential: file → [what it is, a token that must appear in it]. */
const ENTRY_POINTS = {
  'src/app/login/actions.ts': ['sign-in: emails a link and code to the address given (rate limited); the code proves the inbox', 'verifyOtp('],
  'src/app/auth/callback/route.ts': ['sign-in: trades the one-time code for a session', 'exchangeCodeForSession('],
  'src/app/api/cron/outbox/route.ts': ['Vercel Cron', 'isCronRequest('],
  'src/app/api/cron/domains/route.ts': ['Vercel Cron', 'isCronRequest('],
  'src/app/api/webhooks/whatsapp/route.ts': ['Meta webhook: HMAC of the raw body with Frrata\'s app secret; each item routed by its own id through a definer', 'verifyMetaSignature('],
  'src/app/api/webhooks/razorpay/[key]/route.ts': ['Razorpay webhook: HMAC of the raw body with the shop\'s own secret, found by our key', 'verifyRazorpaySignature('],
  'src/app/api/webhooks/mux/route.ts': ['Mux webhook: HMAC of `t.body` with Frrata\'s webhook secret (current or previous), 5-minute window; each event routed by our video id and its upload id through a definer', 'verifyMuxSignature('],
  'src/app/api/webhooks/billing/route.ts': ['Frrata\'s own billing webhook: HMAC of the raw body with Frrata\'s billing secret (current or previous)', 'webhookSigned('],
  // Public, read-only, cached per shop: the shop comes from the host the middleware wrote (shopFor checks its shape).
  'src/app/s/[host]/sitemap.xml/route.ts': ['a shop\'s sitemap: public, read-only', 'shopForRoute('],
  'src/app/s/[host]/robots.txt/route.ts': ['a shop\'s robots.txt: public, read-only', 'shopForRoute('],
  'src/app/s/[host]/og/[...card]/route.ts': ['a shop\'s share card: public, read-only, canonical ids looked up inside the host\'s shop', 'shopForRoute('],
}

const walk = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.includes('/__tests__/') ? [p] : []
})

/** The file without its comments, so a chokepoint named only in a comment guards nothing (security review S7). */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/.*$/, ''))).join('\n')
const guards = (body) => CHOKEPOINTS.some(c => new RegExp(`\\b${c}\\(`).test(body))
/** Each top-level function in a file: name → body (to the next top-level declaration). */
function functionsOf(src) {
  const out = new Map()
  const re = /^(export\s+)?(?:async\s+)?function\s+(\w+)|^(export\s+)?const\s+(\w+)\s*=\s*(?:cache\()?async/gm
  const hits = [...src.matchAll(re)]
  hits.forEach((m, i) => out.set(m[2] ?? m[4], { exported: !!(m[1] ?? m[3]), body: src.slice(m.index, hits[i + 1]?.index ?? src.length) }))
  return out
}
/**
 * An exported action is guarded when its body calls a chokepoint, or calls a function in the same file that is
 * guarded (followed through the file: a bulk action calls the single one, which calls the shared runner).
 */
function unguardedExports(src) {
  const fns = functionsOf(src)
  const ok = new Set([...fns].filter(([, f]) => guards(f.body)).map(([n]) => n))
  for (let grew = true; grew;) {
    grew = false
    for (const [n, f] of fns) if (!ok.has(n) && [...ok].some((h) => new RegExp(`\\b${h}\\(`).test(f.body))) { ok.add(n); grew = true }
  }
  return [...fns].filter(([n, f]) => f.exported && !ok.has(n)).map(([n]) => n)
}

const failures = []
const seen = new Set()
for (const file of walk('src')) {
  const raw = readFileSync(file, 'utf8')
  const isAction = /^\s*['"]use server['"]/.test(raw)
  const text = code(raw)
  const isRoute = /\/route\.ts$/.test(file) && file.startsWith('src/app/')
  if (!isAction && !isRoute) continue
  const entry = ENTRY_POINTS[file]
  if (entry) {
    seen.add(file)
    if (!text.includes(entry[1])) failures.push(`${file}  listed as "${entry[0]}" but no longer contains \`${entry[1]}\` — re-check how it is protected`)
    continue
  }
  if (!guards(text)) {
    failures.push(`${file}  ${isAction ? 'server actions' : 'route handler'} with no auth check — call ${CHOKEPOINTS.join(' / ')}, or list it in scripts/check-actions.mjs with the credential it checks`)
  } else if (isAction) {
    // Per export: one guarded action does not cover its unguarded siblings (security review S7).
    for (const name of unguardedExports(text)) failures.push(`${file}  exported action ${name}() reaches no auth check of its own`)
  }
}
// An Admin page is guarded by its own requireStaff (layouts guard nothing below).
for (const file of existsSync('src/app/(admin)') ? walk('src/app/(admin)') : []) {
  if (!file.endsWith('/page.tsx')) continue
  if (!/\brequireStaff\(/.test(readFileSync(file, 'utf8'))) {
    failures.push(`${file}  Admin page that does not call requireStaff( itself`)
  }
}
// A partner workspace page is guarded by its own requirePartner (the layout guards nothing below).
for (const file of existsSync('src/app/(partner)') ? walk('src/app/(partner)') : []) {
  if (!file.endsWith('/page.tsx')) continue
  if (!/\brequirePartner\(/.test(readFileSync(file, 'utf8'))) {
    failures.push(`${file}  partner page that does not call requirePartner( itself`)
  }
}
// Every console write goes through asMember, which audits support visits in the same transaction.
for (const file of walk('src/app/(console)')) {
  const text = readFileSync(file, 'utf8')
  if (/^\s*['"]use server['"]/m.test(text) && !/\b(asMember|asModule)\(/.test(text)) {
    failures.push(`${file}  console server actions must use asMember( or asModule( (support visits are audited there)`)
  }
}

// A console page is guarded by its OWN check: Next renders the layout and the
// page in parallel, so the layout's requireMember protects nothing below it.
for (const file of ['src/app/(console)', 'src/app/(lookeditor)', 'src/app/(lookpreview)'].flatMap((d) => (existsSync(d) ? walk(d) : []))) {
  if (!file.endsWith('/page.tsx')) continue
  if (!/\brequireMember\(/.test(code(readFileSync(file, 'utf8')))) {
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
