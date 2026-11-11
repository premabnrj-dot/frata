#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-fonts.mjs — `node scripts/check-fonts.mjs` (check:fonts)
//
// Fails: any source file importing Google's font loader. It fetched Google during every build and a bad answer
// failed production deploys at random (Vercel, 2026-11-11); faces are self-hosted in src/components/fonts/ (OFL)
// and loaded with next/font/local. Comment lines are skipped (a gate must not match its own documentation).
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BANNED = ['next/font/', 'google'].join('')
const bad = []
let files = 0
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) { walk(p); continue }
    if (!/\.(tsx?|mjs|js)$/.test(f)) continue
    files++
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
      if (line.includes(`'${BANNED}'`) || line.includes(`"${BANNED}"`)) bad.push(`${p}:${i + 1}  imports Google's font loader: self-host the face in src/components/fonts/ and use next/font/local`)
    })
  }
}
walk('src')
if (bad.length) { for (const b of bad) console.error(b); console.error(`check:fonts — ${bad.length} problem(s)`); process.exit(1) }
console.log(`check:fonts — clean (${files} files)`)
