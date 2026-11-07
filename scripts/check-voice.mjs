#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-voice.mjs — `node scripts/check-voice.mjs`
//
// Fails: a filler word in any string or JSX text a person reads (src/**/*.ts,
// src/**/*.tsx). Frata's voice (frata-design-language § Voice) is plain, short
// and direct; these words add length and promise nothing a person can check.
// What a grep cannot see (a passage where an (i) tip belongs, a long label)
// stays a review question. Comment lines (//, /*, *) are skipped, so the rule
// written in a comment never trips the gate; scripts/ and .claude/ are not read,
// so this file and the skill that lists the words never match themselves.
// Exceptions go in scripts/check-voice.allow as "path · word · why".
// =============================================================================
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const WORDS = ['simply', 'easily', 'seamless', 'seamlessly', 'effortless', 'effortlessly', 'powerful', 'unlock', 'unleash',
  'leverage', 'robust', 'world-class', 'cutting-edge', 'hassle-free', 'revolutionary', 'game-changer', 'supercharge',
  'best-in-class', 'oops', 'whoops', 'kindly', 'please note']
const RE = new RegExp(`(?<![\\w-])(${WORDS.map((w) => w.replace(/[-]/g, '\\-')).join('|')})(?![\\w-])`, 'gi')

const allow = existsSync('scripts/check-voice.allow')
  ? readFileSync('scripts/check-voice.allow', 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split(' · ').slice(0, 2).join(' · ').toLowerCase())
  : []
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.includes('/__tests__/') ? [p] : []
})

const failures = []
for (const file of walk('src')) {
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return
    // Only what a person reads: quoted strings, template text and JSX text between tags.
    const readable = [...line.matchAll(/'([^'\\]|\\.)*'|"([^"\\]|\\.)*"|`[^`]*`|>([^<>{}]+)</g)].map((m) => m[0]).join(' ')
    for (const m of readable.matchAll(RE)) {
      const word = m[1].toLowerCase()
      if (allow.includes(`${file} · ${word}`.toLowerCase())) continue
      failures.push(`${file}:${i + 1}  "${m[1]}" — say what it does instead (frata-design-language § Voice)`)
    }
  })
}
if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:voice — ${failures.length} filler word(s)`)
  process.exit(1)
}
console.log(`check:voice — clean (${WORDS.length} words)`)
