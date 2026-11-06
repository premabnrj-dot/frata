#!/usr/bin/env node
// Fails: a `src/domains/**` file importing React, Next, Drizzle, postgres or the db; a page, layout or browser file importing the db; a bare `getSession(`.
//
// Two rules that were paragraphs in a skill until they became checks here.
//
//  1. THE LAYER RULE. Nothing in src/domains/** may import React,
//     Next, Drizzle, postgres or the database. The engines are pure so they can be
//     unit-tested without a renderer or a connection — and because importing
//     the db throws on a missing DATABASE_URL, one stray import takes the
//     whole suite down. 
//
//  3. A PAGE COMPOSES; IT DOES NOT QUERY (frata-architecture). No page.tsx,
//     layout.tsx or browser file (`'use client'`, `_components/`, `_hooks/`)
//     imports `@/lib/db` or the schema: reads live in src/lib/queries/, where
//     each is named, server-only and reusable. Ekatan had three pages break this.
//
//  2. getUser(), NEVER getSession(). getSession() reads the auth cookie
//     WITHOUT verifying it against the auth server, so a forged cookie
//     passes. That is a security difference, not a style one.
//
// Same two lessons as check-hex.mjs, because this script is the fifth in this
// repo that would otherwise have flagged its own documentation:
//   - paths normalised to forward slashes (a [\/] regex matches nothing on
//     Windows, silently killing every exemption)
//   - comment lines skipped
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Bare specifiers a pure engine must never reach for. */
const FORBIDDEN_IN_DOMAINS = [
  { re: /from\s+['"]react['"]/, what: 'react' },
  { re: /from\s+['"]react-dom(?:\/[^'"]*)?['"]/, what: 'react-dom' },
  { re: /from\s+['"]postgres['"]/, what: 'postgres' },
  { re: /from\s+['"]next(?:\/[^'"]*)?['"]/, what: 'next' },
  { re: /from\s+['"]drizzle-orm(?:\/[^'"]*)?['"]/, what: 'drizzle-orm' },
  { re: /from\s+['"]@supabase\/[^'"]+['"]/, what: '@supabase/*' },
  { re: /from\s+['"]sonner['"]/, what: 'sonner' },
  { re: /from\s+['"]@\/lib\/db(?:\/[^'"]*)?['"]/, what: '@/lib/db' },
  { re: /from\s+['"]@\/lib\/supabase(?:\/[^'"]*)?['"]/, what: '@/lib/supabase' },
  { re: /from\s+['"]@\/components(?:\/[^'"]*)?['"]/, what: '@/components' },
  { re: /from\s+['"]@\/app(?:\/[^'"]*)?['"]/, what: '@/app' },
]

/** No domain is exempt. */
const DOMAIN_EXEMPT = []

const SESSION = /\.?\bgetSession\s*\(/

function isComment(line) {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.tsx?$/.test(p)) acc.push(p)
  }
  return acc
}

let failures = 0
const fail = (rel, i, msg) => { console.error(`${rel}:${i + 1}  ${msg}`); failures++ }

const DB_IMPORT = /from\s+['"]@\/lib\/db(?:\/schema)?['"]/
const NOT_A_QUERY_PLACE = /(^|\/)(page|layout)\.tsx$|\/(_components|_hooks|components)\//

for (const file of walk('src')) {
  const rel = relative('.', file).replaceAll('\\', '/')
  const inDomains = rel.startsWith('src/domains/')
                    && !DOMAIN_EXEMPT.some(r => r.test(rel))
  const text = readFileSync(file, 'utf8')
  const composes = !rel.includes('/__tests__/')
                   && (NOT_A_QUERY_PLACE.test(rel) || /^\s*['"]use client['"]/.test(text))

  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (isComment(line)) continue

    if (composes && DB_IMPORT.test(line)) fail(rel, i, 'imports the db — a page or browser file composes; put the read in src/lib/queries/')

    if (inDomains) {
      for (const { re, what } of FORBIDDEN_IN_DOMAINS) {
        if (re.test(line)) fail(rel, i, `domain imports ${what} — engines are pure`)
      }
    }
    if (SESSION.test(line)) fail(rel, i, 'getSession() — use getUser(), it verifies')
  }
}

if (failures) {
  console.error(
    `\n${failures} layer violation(s).\n` +
    `  src/domains/** is pure: no React, three.js, Next, Drizzle or db. If a\n` +
    `  domain module needs I/O, the design is wrong — move the I/O to a caller.\n` +
    `  getSession() trusts an unverified cookie; requireAuth uses getUser().\n` +
    `  Pages, layouts and browser files read through src/lib/queries/.`,
  )
  process.exit(1)
}
console.log('check:layers — clean')
