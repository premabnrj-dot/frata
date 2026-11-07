#!/usr/bin/env node
// Fails: an off-token colour in app code.
//
// Blocks off-token colour in app code, the way Ekatan's check:hex does.
//
// Two lessons are baked in, both learned by this script being wrong:
//
//  1. PATHS ARE NORMALISED to forward slashes before testing exemptions.
//     Regexes written as /^src[\/]domains/ silently match nothing on Windows,
//     so every exemption was dead and the gate flagged files it was told to
//     skip.
//  2. COMMENTS ARE SKIPPED. A gate that trips on the line documenting the
//     rule proves nothing and trains people to ignore it. This one flagged
//     the comment explaining why the rule exists.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// `node scripts/check-hex.mjs [path]`: a path checks that file or folder alone (how a gate is run against its own fixtures).
const ROOT = process.argv[2] ?? 'src'

const EXEMPT = [
  // Where the tokens are DEFINED.
  /^src\/app\/globals\.css$/,
]

const BAD =
  /(?:text|bg|border|fill|stroke|ring|from|via|to)-(?:\[#[0-9a-fA-F]{3,8}\]|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})|(?<![a-zA-Z-])(?:rgba?|hsla?|oklch|oklab|lch|lab)\(/g
// The second half (2026-11-07, plan U·1b): a colour function outside globals.css is a colour the tokens never see.

/** Comment-only lines, in both TS and CSS. */
function isComment(line) {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

function walk(dir, acc = []) {
  if (!statSync(dir).isDirectory()) return [dir]
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(tsx?|css)$/.test(p)) acc.push(p)
  }
  return acc
}

let failures = 0
for (const file of walk(ROOT)) {
  const rel = relative('.', file).split('\\').join('/')
  if (EXEMPT.some(r => r.test(rel))) continue

  for (const [i, line] of readFileSync(file, 'utf8').split(/\r?\n/).entries()) {
    if (isComment(line)) continue
    const hits = line.match(BAD)
    if (hits) {
      console.error(`${rel}:${i + 1}  ${hits.join(', ')}`)
      failures += hits.length
    }
  }
}

if (failures) {
  console.error(
    `\n${failures} off-token colour use(s). Use token utilities: text-foreground, ` +
    `text-muted-foreground, bg-card, border-border, text-primary, text-destructive, ` +
    `bg-ok/text-ok-text, bg-warn/text-warn-text, bg-danger/text-danger-text.`,
  )
  process.exit(1)
}
console.log('check:hex — clean')
