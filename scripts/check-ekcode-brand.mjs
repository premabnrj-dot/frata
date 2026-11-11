#!/usr/bin/env node
// Fails: a shopper-facing EkCode file that names the platform behind it ("Frrata", "Frata", "frrata.") in code or copy.
//
// EkCode is its own brand (owner, 2026-11-09; frata-design-language § EkCode): its pages, its words, its checkout
// button and strip never name Frrata. Comment lines are skipped, so this header never trips the gate; run it on this
// file's own sentence once (CLAUDE.md: a gate must not match its own documentation).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src/app/ek', 'src/components/ekcode', 'src/components/modules/ekcode']
const FILES = ['src/domains/ekcode-core/brand.ts', 'src/domains/ekcode-core/notice.ts']
const BAD = /\bfr+ata\b/i

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n).replaceAll('\\', '/'); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [] })
const files = [...ROOTS.flatMap((r) => { try { return walk(r) } catch { return [] } }), ...FILES]
const failures = []
for (const f of files) {
  readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
    if (BAD.test(line)) failures.push(`${f}:${i + 1}  names the platform on an EkCode surface — EkCode is its own brand`)
  })
}
if (failures.length) { for (const x of failures) console.error(x); console.error(`check:ekcode-brand — ${failures.length} problem(s)`); process.exit(1) }
console.log(`check:ekcode-brand — clean (${files.length} files)`)
