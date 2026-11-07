#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-scale.mjs — `node scripts/check-scale.mjs [path]`
//
// Fails: a size off the type scale, or a hand-written card frame, or a field
// that stays 36 px tall on a phone, in Console and Admin code
// (frata-design-language § Type scale and § UX foundation rules 14, 19):
//   text-px     a pixel font size in brackets (use text-xs … text-2xl, or text-section)
//   card-frame  the inline card frame (use <Section>)
//   field-h9    an input, select or textarea with a bare 36 px height class (use h-10 md:h-9)
// Today's debts are listed in scripts/check-scale.allow as "count path · rule"
// and must only shrink: more than allowed fails; fewer fails until the line is
// lowered or deleted (U·2b empties it). Comment lines are skipped, so the rule
// written in a comment never trips the gate.
// =============================================================================
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIRS = ['src/app/(console)', 'src/app/(admin)', 'src/components/shell', 'src/components/data', 'src/components/layout', 'src/components/nav', 'src/components/ui']
export { DIRS }
export const RULES = {
  'text-px': /\btext-\[\d+(?:\.\d+)?px\]/g,
  'card-frame': /\brounded-(?:md|lg) border border-border bg-card p-\d/g,
  // field-h9 is found per JSX element (fieldTags), not per line: a className on the next line, or an `=>` in an
  // onChange, hid every case from a line pattern (impact review U·1).
}
const FIELD_OPEN = /<(?:input|select|textarea)\b/g
/** The text of each <input>/<select>/<textarea> opening tag in a file, read up to the `>` outside braces and quotes. */
export function fieldTags(text) {
  const tags = []
  for (const m of text.matchAll(FIELD_OPEN)) {
    let depth = 0, quote = null, i = m.index + 1
    for (; i < text.length; i++) {
      const c = text[i]
      if (quote) { if (c === quote && text[i - 1] !== '\\') quote = null; continue }
      if (c === '"' || c === "'" || c === '`') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    tags.push(text.slice(m.index, i + 1))
  }
  return tags
}
const isComment = (l) => { const t = l.trim(); return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*') }

function walk(p, acc = []) {
  if (!existsSync(p)) return acc
  if (!statSync(p).isDirectory()) { if (/\.(tsx?|css)$/.test(p)) acc.push(p); return acc }
  for (const e of readdirSync(p)) walk(join(p, e), acc)
  return acc
}

/** { "path · rule": count } for the given files. */
export function scan(files) {
  const found = {}
  for (const file of files) {
    const rel = relative('.', file).split('\\').join('/')
    const text = readFileSync(file, 'utf8')
    const h9 = fieldTags(text.split(/\r?\n/).filter((l) => !isComment(l)).join('\n')).filter((t) => /\bh-9\b/.test(t) && !/\bh-10\b/.test(t)).length
    if (h9) found[`${rel} · field-h9`] = h9
    for (const line of text.split(/\r?\n/)) {
      if (isComment(line)) continue
      for (const [rule, re] of Object.entries(RULES)) {
        // The primitives (src/components/**) are where a frame is defined once; pages must use them.
        if (rule === 'card-frame' && rel.startsWith('src/components/')) continue
        const n = (line.match(re) ?? []).length
        if (n) found[`${rel} · ${rule}`] = (found[`${rel} · ${rule}`] ?? 0) + n
      }
    }
  }
  return found
}

export function compare(found, allowText) {
  const allow = {}
  for (const l of allowText.split(/\r?\n/)) { const m = l.match(/^(\d+) (.+)$/); if (m && !l.startsWith('#')) allow[m[2]] = Number(m[1]) }
  const problems = []
  for (const [k, n] of Object.entries(found)) if (n > (allow[k] ?? 0)) problems.push(`${k}: ${n} (allowed ${allow[k] ?? 0})`)
  for (const [k, n] of Object.entries(allow)) if ((found[k] ?? 0) < n) problems.push(`${k}: now ${found[k] ?? 0}, lower its line in scripts/check-scale.allow to ${found[k] ?? 0} (or delete it)`)
  return problems
}

export const walkAll = (paths) => paths.flatMap((d) => walk(d))

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2]
  if (target && !existsSync(target)) { console.error(`check:scale — no such path: ${target}`); process.exit(2) }
  const found = scan(walkAll(target ? [target] : DIRS))
  const problems = compare(found, target ? '' : readFileSync('scripts/check-scale.allow', 'utf8'))
  if (problems.length) { console.error(`check:scale — off the scale (frata-design-language § Type scale, § UX foundation 14, 19):\n  ${problems.join('\n  ')}`); process.exit(1) }
  console.log(`check:scale — clean (${Object.values(found).reduce((a, b) => a + b, 0)} allowed debts left)`)
}
