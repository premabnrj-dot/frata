#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-feedback.mjs — `node scripts/check-feedback.mjs [--write] [path]`
//
// frata-design-language § Feedback (owner 2026-11-12): a failure after a button is a toast (toast.error), a field
// mistake is <FieldError> at the field, a failure inside a popup is the Dialog's error slot. This gate refuses a
// hand-written error line anywhere else in src/app and src/components:
//   notice      the <Notice> page-top line;  message  the <Message> banner (ui/unsaved)
//   url-result  a result read from or written into the URL (searchParams.error/.ok, sp.error, "error=", "ok=")
//   alert-line  role="alert" (or role={… 'alert' …}) on a <p>, <span> or <div>
//   danger-line a <p> coloured text-danger-text or the shop's text-store-bad
// JSX that spans lines is read as one. A RATCHET: scripts/feedback-allow.json holds each file's count when this gate
// arrived; a count may only go down (a file at zero leaves the list). A site a rule pins in place (§ Feedback 5)
// carries `feedback-ok: <why>` on its line or the line above and is not counted.
// `--write` rewrites the counts from the code (only ever to record a decrease or a newly pinned site).
// Comment lines are skipped, so this header never trips the gate.
// =============================================================================
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const ALLOW = join(ROOT, 'scripts/feedback-allow.json')
const DIRS = ['src/app', 'src/components']
/** The primitives themselves draw these lines. */
const PRIMITIVES = new Set(['src/components/ui/toast.tsx', 'src/components/ui/field-error.tsx', 'src/components/ui/dialog.tsx',
  'src/components/ui/unsaved.tsx', 'src/components/ui/action-form.tsx'])
/** Each rule runs on the whole file (JSX spans lines); a hit is reported at the line where it starts. */
const RULES = [
  ['notice', new RegExp('<' + 'Notice\\b', 'g')], // built from parts, so this source line does not match itself
  ['message', new RegExp('<' + 'Message\\b', 'g')],
  ['url-result', /\b(searchParams|sp|params|query)\??\.(error|ok)\b|[`'"?&](error|ok)=|\[['"](error|ok)['"]\]|\{[^}]*\b(error|ok)\b[^}]*\}\s*=\s*(await\s+)?(searchParams|props\.searchParams)|searchParams[^;\n]*\b(error|ok)\??:\s*string/g],
  ['alert-line', /<(p|span|div)\b[^>]*?\brole=(["']alert["']|\{[^}]*['"]alert['"][^}]*\})/g],
  ['danger-line', /<p\b[^>]*?\btext-(danger-text|store-bad)\b/g],
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

/** { file: { count, hits: ["line: rule"] } } for the code as it is. A line (or the line above) carrying
 *  `feedback-ok: <why>` is a site a rule pins in place (§ Feedback 5) and is not counted. */
export function scan(files) {
  const found = {}
  for (const f of files) {
    const rel = relative(ROOT, f)
    if (PRIMITIVES.has(rel)) continue
    const text = readFileSync(f, 'utf8')
    const lines = text.split('\n')
    const starts = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
    const lineOf = (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= idx) lo = m; else hi = m - 1 } return lo }
    for (const [name, re] of RULES) {
      re.lastIndex = 0
      for (let m; (m = re.exec(text)); ) {
        const i = lineOf(m.index), t = lines[i].trim()
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')) continue
        // A pinned site names its reason: `feedback-ok: <why>` (a bare marker does not count).
        if (/feedback-ok:\s*\S.{2,}/.test(lines[i]) || /feedback-ok:\s*\S.{2,}/.test(lines[i - 1] ?? '')) continue
        ;(found[rel] ??= { count: 0, hits: [] }).count++
        found[rel].hits.push(`${i + 1}: ${name}`)
      }
    }
  }
  return found
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

function main() {
  const files = only ? (statSync(only).isDirectory() ? walk(only) : [only]) : DIRS.flatMap((d) => walk(join(ROOT, d)))
  const found = scan(files)
  let allow = {}
  try { allow = JSON.parse(readFileSync(ALLOW, 'utf8')) } catch { allow = {} }

  if (write) {
    // Only ever lower a count (the ratchet): a file above its allowance stays at it and fails below; a new file is
    // never added. With a path, the files outside it keep their entries.
    const next = only ? { ...allow } : {}
    for (const [f, v] of Object.entries(found)) if (allow[f]) next[f] = { count: Math.min(v.count, allow[f].count) }
    for (const f of Object.keys(next)) if (!found[f] && (!only || files.some((x) => relative(ROOT, x) === f))) delete next[f]
    const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)))
    writeFileSync(ALLOW, JSON.stringify(sorted, null, 2) + '\n')
    console.log(`check:feedback — wrote ${Object.keys(sorted).length} files to scripts/feedback-allow.json`)
    return
  }

  const problems = []
  for (const [f, v] of Object.entries(found)) {
    const max = allow[f]?.count ?? 0
    if (v.count > max) problems.push(`${f}: ${v.count} hand-written error line(s), ${max} allowed — use toast.error, <FieldError> or the Dialog's error slot (§ Feedback)\n    ${v.hits.join('\n    ')}`)
  }
  if (!only) for (const [f, v] of Object.entries(allow)) {
    const now = found[f]?.count ?? 0
    if (now < v.count) problems.push(`${f}: down to ${now} from ${v.count} — record it: node scripts/check-feedback.mjs --write`)
  }
  if (problems.length) { console.error('check:feedback —\n  ' + problems.join('\n  ')); process.exitCode = 1; return }
  const left = Object.values(allow).reduce((s, v) => s + v.count, 0)
  console.log(`check:feedback — clean (${files.length} files; ${left} lines left to move)`)
}
