#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-documents.mjs — `node scripts/check-documents.mjs [path]`
//
// Fails, in what makes a merchant's documents (src/lib/documents/**, src/domains/documents/**):
//   cost      a cost name (scripts/cost-sentinels.mjs): a document goes to a shopper or a CA (ADR-0003)
//   fetch     a fetch( call, an <Image> given a URL string, or a <Link>: a renderer is handed bytes and words,
//             fetches nothing and links to nothing a merchant typed (security review 2026-11-08)
// Comment lines are skipped, so this header never trips the gate.
// =============================================================================
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SENTINELS } from './cost-sentinels.mjs'

const ROOTS = process.argv[2] ? [process.argv[2]] : ['src/lib/documents', 'src/domains/documents']
const isComment = (l) => { const t = l.trim(); return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*') }
const walk = (p) => !existsSync(p) ? [] : statSync(p).isFile() ? [p] : readdirSync(p).flatMap((n) => walk(join(p, n).replaceAll('\\', '/')))
const COST = new RegExp(`\\b(${SENTINELS.join('|')})\\b`)
const FETCH = [/\bfetch\s*\(/, /<Image[^>]*src=\{?\s*['"`]https?:/, /<Link\b/, /\bfetchWithTimeout\b/]
const failures = []
for (const file of ROOTS.flatMap(walk).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('/__tests__/'))) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (isComment(line)) return
    const c = COST.exec(line)
    if (c) failures.push(`${file}:${i + 1}  cost name "${c[1]}" in a document`)
    if (file.includes('/pdf/') || file.endsWith('file.tsx')) for (const re of FETCH) if (re.test(line)) failures.push(`${file}:${i + 1}  a renderer fetches or links (${re.source})`)
  })
}
if (failures.length) {
  console.error(`check:documents — ${failures.length} problem(s):\n` + failures.map((f) => '  ' + f).join('\n'))
  process.exit(1)
}
console.log('check:documents: ok')
