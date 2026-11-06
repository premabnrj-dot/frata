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
// The database connection is made in src/lib/db/index.ts only; a Supabase
// client in src/lib/supabase/ only. Platform flags any file may read are in
// PLATFORM. It reads code, not prose: a comment is skipped.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Set by the platform, not by us — read wherever they are needed. */
const PLATFORM = new Set(['NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'NEXT_RUNTIME'])

/** A constructor and the only place it may be called. */
const OWNED_CALLS = [
  ['postgres()', /(^|[^.\w])postgres\(/, f => f === 'src/lib/db/index.ts', 'src/lib/db/index.ts'],
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

if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:config — ${failures.length} problem(s)`)
  process.exit(1)
}
console.log(`check:config — clean (${readers.size} settings, one reader each)`)
