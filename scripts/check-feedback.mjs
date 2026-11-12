#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-feedback.mjs — `node scripts/check-feedback.mjs [--write] [path]`
//
// frata-design-language § Feedback (owner 2026-11-12): a failure after a button is a toast (toast.error), a field
// mistake is <FieldError> at the field, a failure inside a popup is the Dialog's error slot. This gate refuses a
// hand-written error line anywhere else in src/app and src/components:
//   notice      the <Notice> page-top line
//   url-error   a message read from or written into the URL (searchParams.error, sp.error, "error=")
//   alert-line  role="alert" on a <p> or <span>
//   danger-line a <p> coloured text-danger-text
// A RATCHET: scripts/feedback-allow.json holds each file's count when this gate arrived; a count may only go down
// (a file at zero leaves the list). Sites a rule pins in place (§ Feedback 5) are listed with "pinned" and a why.
// `--write` rewrites the counts from the code (only ever to record a decrease or a newly pinned site).
// Comment lines are skipped, so this header never trips the gate.
// =============================================================================
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const ALLOW = join(ROOT, 'scripts/feedback-allow.json')
const DIRS = ['src/app', 'src/components']
/** The primitives themselves draw these lines. */
const PRIMITIVES = new Set(['src/components/ui/toast.tsx', 'src/components/ui/field-error.tsx', 'src/components/ui/dialog.tsx', 'src/components/ui/notice.tsx'])
const RULES = [
  ['notice', new RegExp('<' + 'Notice\\b')], // built from parts, so this source line does not match itself
  ['url-error', /\b(searchParams|sp|params)\??\.error\b|[?&]error=/],
  ['alert-line', /<(p|span)\b[^>]*role=["']alert["']/],
  ['danger-line', /<p\b[^>]*\btext-danger-text\b/],
]

const args = process.argv.slice(2)
const write = args.includes('--write')
const only = args.find((a) => !a.startsWith('--'))

function walk(dir, out = []) {
  let names
  try { names = readdirSync(dir) } catch { return out }
  for (const n of names) {
    const p = join(dir, n)
    const st = statSync(p)
    if (st.isDirectory()) { if (n !== '__tests__' && n !== 'node_modules') walk(p, out) }
    else if (/\.(tsx?|mts)$/.test(n) && !/\.test\./.test(n)) out.push(p)
  }
  return out
}

/** { file: { count, hits: ["line: rule"] } } for the code as it is. */
export function scan(files) {
  const found = {}
  for (const f of files) {
    const rel = relative(ROOT, f)
    if (PRIMITIVES.has(rel)) continue
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const t = line.trim()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')) return
      for (const [name, re] of RULES) if (re.test(line)) { (found[rel] ??= { count: 0, hits: [] }).count++; found[rel].hits.push(`${i + 1}: ${name}`) }
    })
  }
  return found
}

const files = only ? (statSync(only).isDirectory() ? walk(only) : [only]) : DIRS.flatMap((d) => walk(join(ROOT, d)))
const found = scan(files)
let allow = {}
try { allow = JSON.parse(readFileSync(ALLOW, 'utf8')) } catch { allow = {} }

if (write) {
  const next = {}
  for (const [f, v] of Object.entries(found).sort()) next[f] = allow[f]?.pinned ? { count: v.count, pinned: allow[f].pinned } : { count: v.count }
  writeFileSync(ALLOW, JSON.stringify(next, null, 2) + '\n')
  console.log(`check:feedback — wrote ${Object.keys(next).length} files to scripts/feedback-allow.json`)
  process.exit(0)
}

const problems = []
for (const [f, v] of Object.entries(found)) {
  const max = allow[f]?.count ?? 0
  if (v.count > max) problems.push(`${f}: ${v.count} hand-written error line(s), ${max} allowed — use toast.error, <FieldError> or the Dialog's error slot (§ Feedback)\n    ${v.hits.join('\n    ')}`)
}
if (!only) for (const [f, v] of Object.entries(allow)) {
  const now = found[f]?.count ?? 0
  if (now < v.count && !v.pinned) problems.push(`${f}: down to ${now} from ${v.count} — record it: node scripts/check-feedback.mjs --write`)
}
if (problems.length) { console.error('check:feedback —\n  ' + problems.join('\n  ')); process.exit(1) }
const left = Object.values(allow).filter((v) => !v.pinned).reduce((s, v) => s + v.count, 0)
console.log(`check:feedback — clean (${files.length} files; ${left} lines left to move, ${Object.values(allow).filter((v) => v.pinned).length} pinned files)`)
