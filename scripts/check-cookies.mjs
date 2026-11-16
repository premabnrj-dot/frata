#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-cookies.mjs — `node scripts/check-cookies.mjs [file …]`
//
// Fails: a cookie the shop and secure host code sets or reads that is not host-only with a __Host- name — a
// Domain attribute, a name that is neither a __Host- literal nor cookieName(), a set without Secure and Path=/,
// a set without sameSite lax or strict, a delete (Next's sends no Secure, so a browser refuses it for a __Host- name), a getAll, a raw Cookie or
// Set-Cookie header, or a document.cookie or cookieStore write.
//
// GATE check:cookies (one-address plan P4a·1, spec § 6). Store hosts are siblings under frrata.shop: a cookie with
// Domain=frrata.shop set by one store reaches every other, and only __Host- names are guaranteed host-only, Secure
// and Path=/ (a sibling cannot plant one). Scope: src/app/s, src/app/secure, src/app/api/shop, src/app/api/secure,
// src/lib/ekcode and the rest of the shop request's server code (src/lib/http, requireShop, src/lib/analytics,
// src/beacon); and for writes from the browser (document.cookie, cookieStore) the shop's client code too:
// src/components/storefront, src/components/modules, src/components/ekcode. Named exceptions: the shop_in hint (until P3·7 removes it); cookieName() itself, which gives plain
// names on the local e2e stack only (plain http), and __Host- everywhere else. The console's Supabase cookies are
// out of scope. Tests and comment lines are skipped, so this header cannot fail its own check.
// =============================================================================
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const SCOPE = ['src/app/s', 'src/app/secure', 'src/app/api/shop', 'src/app/api/secure', 'src/lib/ekcode',
  // The rest of the server code a shop request runs through (security review MED-1).
  'src/lib/http', 'src/lib/auth/require-shop.ts', 'src/lib/auth/fetch-site.ts', 'src/lib/analytics', 'src/beacon']
/** The shop's browser code: only document.cookie and cookieStore writes are checked there. */
export const CLIENT_SCOPE = ['src/components/storefront', 'src/components/modules', 'src/components/ekcode']
/** Scope folders P3 creates; every other one missing fails (a rename would empty the gate). */
const NOT_YET = new Set(['src/app/secure', 'src/app/api/secure'])
/** Plain names allowed, each with the task that removes it. */
export const ALLOWED_PLAIN = { shop_in: 'P3·7 removes the hint' }
const HELPER = 'src/lib/ekcode/cookie-name.ts'

// Comment text blanked: // lines, and everything between /* and */ (a line opening with * outside one is code).
export function strip(text) {
  let inBlock = false
  return text.split('\n').map((l) => {
    const t = l.trim()
    if (inBlock) { if (t.includes('*/')) inBlock = false; return '' }
    if (t.startsWith('//')) return ''
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; return '' }
    return l
  }).join('\n')
}
const walk = (d) => !existsSync(d) ? [] : statSync(d).isFile() ? [d] : readdirSync(d).flatMap((n) => {
  const p = join(d, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? (n === '__tests__' ? [] : walk(p)) : /\.(ts|tsx|js|jsx|mjs)$/.test(n) && !/\.test\.[jt]sx?$/.test(n) ? [p] : []
})

// The text of a call from its opening paren to the matching close (strings are not parsed: cookie calls hold none
// with a paren in them; a miscount only widens what is read).
function callText(src, open) {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i)
  }
  return src.slice(open + 1)
}
const lineOf = (src, at) => src.slice(0, at).split('\n').length
const esc = (id) => id.replaceAll('$', '\\$')

// What a name argument is: a __Host- literal, an allowed plain literal, cookieName(…), or a constant in the same file
// that is one of those. Anything else cannot be told and fails.
function nameOk(arg, src, seen = new Set()) {
  const a = arg.trim()
  const lit = a.match(/^(['"`])([^'"`]*)\1$/)
  if (lit) return lit[2].startsWith('__Host-') || Object.hasOwn(ALLOWED_PLAIN, lit[2])
  if (/^cookieName\(/.test(a)) return true
  const id = a.match(/^([A-Za-z_$][\w$]*)(\(\))?$/)
  if (!id || seen.has(id[1])) return false
  seen.add(id[1])
  const decl = src.match(new RegExp(`(?:const|let)\\s+${esc(id[1])}\\s*=\\s*([^\\n]+)`))
  if (!decl) return false
  const rhs = decl[1].trim().replace(/^\(\)\s*=>\s*/, '')
  return nameOk(rhs.replace(/\s*(\/\/.*)?$/, ''), src, seen)
}

/** Writes from the browser: document.cookie and the Cookie Store API. */
function clientWrites(src, add) {
  for (const m of src.matchAll(/document\.cookie\s*=(?!=)/g)) add(m.index, 'document.cookie written — the server sets cookies, host-only')
  for (const m of src.matchAll(/\bcookieStore\.(set|delete)\(/g)) add(m.index, `cookieStore.${m[1]} — the server sets cookies, host-only`)
}

/** Problems in one file's source (comment lines ignored). `client`: browser code, writes only. */
export function checkSource(file, text, { client = false } = {}) {
  const src = strip(text)
  const out = []
  const add = (at, why) => out.push(`${file}:${lineOf(src, at)}  ${why}`)
  clientWrites(src, add)
  // A Domain attribute in a cookie string (anywhere: `a=1; Domain=…` is nothing else).
  for (const m of src.matchAll(/;\s*domain\s*=/gi)) add(m.index, 'a cookie Domain attribute (store hosts are siblings: host-only, no Domain)')
  if (client) return out
  // Cookie jars: cookies() itself, `jar`, x.cookies, and any name assigned from (await) cookies().
  const jars = ['jar', ...[...src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(?\s*(?:await\s+)?cookies\(\)/g)].map((m) => m[1])]
  const CALL = new RegExp(`(?:\\bcookies\\(\\)\\)?|(?<![\\w$.])(?:${[...new Set(jars)].map(esc).join('|')})|\\.cookies)\\.(set|get|getAll|delete|has)\\(`, 'g')
  for (const m of src.matchAll(CALL)) {
    const args = callText(src, m.index + m[0].length - 1)
    if (m[1] === 'getAll') { add(m.index, 'cookies.getAll — read one __Host- name, never every cookie (a sibling store can plant plain ones)'); continue }
    if (m[1] === 'delete') { add(m.index, "cookies.delete — sends no Secure, so a __Host- cookie is never cleared: set(name, '', { secure, path: '/', maxAge: 0 })"); continue }
    const first = args.split(',')[0]
    if (/^\s*\{/.test(first)) { add(m.index, `cookies.${m[1]}({…}) — pass the name first, so the gate can read it`); continue }
    if (!nameOk(first, src)) add(m.index, `cookie name ${first.trim()} — a __Host- name or cookieName(…), never a plain name`)
    if (m[1] === 'set') {
      const opts = args.slice(first.length)
      if (/\bdomain\b\s*[:,}]/i.test(opts)) add(m.index, 'a cookie Domain attribute (store hosts are siblings: host-only, no Domain)')
      if (!/\bsecure\s*:\s*(true|cookieSecure\(\))/.test(opts)) add(m.index, 'cookies.set without secure: true or cookieSecure()')
      if (!/\bpath\s*:\s*['"]\/['"]/.test(opts)) add(m.index, "cookies.set without path: '/'")
      if (!/\bsameSite\s*:\s*['"](lax|strict)['"]/.test(opts)) add(m.index, "cookies.set without sameSite: 'lax' or 'strict' (a 'none' cookie rides on every site's requests)")
    }
  }
  for (const m of src.matchAll(/['"]set-cookie['"]/gi)) add(m.index, 'a raw Set-Cookie header — set cookies through cookies().set')
  for (const m of src.matchAll(/headers(?:\(\)\))?\.get\(\s*['"]cookie['"]\s*\)/gi)) add(m.index, 'the raw Cookie header read — read a __Host- name through cookies().get')
  return out
}

/** cookieName gives __Host- off the local e2e stack, and the local switch needs VERCEL_ENV empty. */
export function checkHelper(text) {
  const src = strip(text)
  const out = []
  if (!/`__Host-\$\{base\}`/.test(src)) out.push(`${HELPER}  cookieName no longer gives \`__Host-\${base}\``)
  if (!/VERCEL_ENV\s*===\s*''/.test(src)) out.push(`${HELPER}  plain names no longer need VERCEL_ENV empty (the local e2e stack only)`)
  return out
}

function main() {
  const named = process.argv.slice(2)
  const failures = []
  let count = 0
  if (named.length) {
    for (const f of named) { count++; failures.push(...checkSource(f, readFileSync(f, 'utf8'))) }
  } else {
    for (const d of [...SCOPE, ...CLIENT_SCOPE]) if (!NOT_YET.has(d) && !existsSync(d)) failures.push(`${d}  missing: a scope folder moved or renamed (update SCOPE)`)
    for (const f of SCOPE.flatMap(walk)) { count++; failures.push(...checkSource(f, readFileSync(f, 'utf8'))) }
    for (const f of CLIENT_SCOPE.flatMap(walk)) { count++; failures.push(...checkSource(f, readFileSync(f, 'utf8'), { client: true })) }
    failures.push(...checkHelper(readFileSync(HELPER, 'utf8')))
  }
  if (failures.length) {
    console.error(`check:cookies — ${failures.length} cookie(s) not host-only __Host- (one-address spec § 6):\n` + failures.map((f) => '  ' + f).join('\n'))
    process.exit(1)
  }
  console.log(`check:cookies — clean (${count} files)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
