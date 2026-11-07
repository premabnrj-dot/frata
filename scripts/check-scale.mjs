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
//   button-h    a height class handed to <Button> or button() (use its size variant: twMerge
//               drops the caller's h-* but keeps md:h-9 — impact review U·1)
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
  // The card frame with or without its padding (a flush list card is a frame too; impact review U·2b).
  'card-frame': /\brounded-(?:md|lg) border border-border bg-card\b/,
  // field-h9 is found per JSX element (fieldTags), not per line: a className on the next line, or an `=>` in an
  // onChange, hid every case from a line pattern (impact review U·1).
}
const FIELD_OPEN = /<(?:input|select|textarea)\b/g
// Any height a caller could add: h-11, h-auto, h-full, h-fit, h-[44px]. twMerge drops the variant's h-10 against each
// and keeps md:h-9 (final check of U·2b). A long label wants size: 'wrap', not a height.
const HEIGHT = /(?<![\w-])(?:[\w-]+:)?h-(?:\d|auto|full|fit|\[)/
/** The text of each <input>/<select>/<textarea> opening tag in a file, read up to the `>` outside braces and quotes. */
export function fieldTags(text, open = FIELD_OPEN) {
  const tags = []
  for (const m of text.matchAll(open)) {
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

/**
 * Every className value in a file, with the tag it sits on: the quoted string, or the whole {…} expression (braces
 * balanced, quotes and template strings respected). A rule tests the element's own classes, never the line it is on
 * (impact review U·2b: a per-line skip let a real card through when the line also held `absolute`).
 */
export function classValues(text) {
  const out = []
  for (const m of text.matchAll(/\bclassName=/g)) {
    let i = m.index + m[0].length, value
    if (text[i] === '"' || text[i] === "'") { const q = text[i]; const end = text.indexOf(q, i + 1); value = text.slice(i + 1, end) }
    else if (text[i] === '{') {
      let depth = 0, quote = null, j = i
      for (; j < text.length; j++) {
        const c = text[j]
        if (quote) { if (c === quote && text[j - 1] !== '\\') quote = null; continue }
        if (c === '"' || c === "'" || c === '`') quote = c
        else if (c === '{') depth++
        else if (c === '}' && --depth === 0) break
      }
      value = text.slice(i + 1, j)
    } else continue
    // The tag this className is on: the last `<name` followed by white space (so `n < 1` or `X<Y>` in a handler
    // is not taken for a tag).
    const before = text.slice(0, m.index)
    const tags = [...before.matchAll(/<([A-Za-z][\w.]*)(?=\s)/g)]
    out.push({ value, tag: tags.length ? tags[tags.length - 1][1] : '' })
  }
  return out
}

/** The expression without its button(…) calls (parens balanced): what is left is what the caller added. */
export function withoutButtonCalls(expr) {
  let out = '', i = 0
  for (const m of expr.matchAll(/\bbutton\(/g)) {
    if (m.index < i) continue
    out += expr.slice(i, m.index)
    let depth = 0, j = m.index + m[0].length - 1
    for (; j < expr.length; j++) { if (expr[j] === '(') depth++; else if (expr[j] === ')' && --depth === 0) break }
    i = j + 1
  }
  return out + expr.slice(i)
}

/** { "path · rule": count } for the given files. */
export function scan(files) {
  const found = {}
  for (const file of files) {
    const rel = relative('.', file).split('\\').join('/')
    const text = readFileSync(file, 'utf8')
    const h9 = fieldTags(text.split(/\r?\n/).filter((l) => !isComment(l)).join('\n')).filter((t) => /\bh-9\b/.test(t) && !/\bh-10\b/.test(t)).length
    if (h9) found[`${rel} · field-h9`] = h9
    const code = text.split(/\r?\n/).filter((l) => !isComment(l)).join('\n')
    const values = classValues(code)
    // button-h: a height on a <Button>'s className, or beside button(…) in any className expression
    // (`${button()} h-11`, cn(button(), 'h-11')).
    // …and a className handed INTO button({ className: 'h-8' }), which twMerge mixes the same way.
    const intoCall = (v) => [...v.matchAll(/\bclassName:\s*(['"`])([^'"`]*)\1/g)].some((m) => HEIGHT.test(m[2]))
    const buttonH = values.filter((v) => v.tag === 'Button' ? HEIGHT.test(v.value)
      : /\bbutton\(/.test(v.value) && (HEIGHT.test(withoutButtonCalls(v.value)) || intoCall(v.value))).length
    if (buttonH) found[`${rel} · button-h`] = buttonH
    // card-frame, per element: not in the primitives (where the frame is defined once), and not a floating list
    // (absolute, shadow), a table's sideways scroller, or a disclosure (<details>).
    const frames = rel.startsWith('src/components/') ? 0 : values.filter((v) => RULES['card-frame'].test(v.value) && (RULES['card-frame'].lastIndex = 0, true)
      && !/\b(?:absolute|shadow-\w+|overflow-x-auto)\b/.test(v.value) && v.tag !== 'details').length
    if (frames) found[`${rel} · card-frame`] = frames
    for (const line of code.split('\n')) {
      const n = (line.match(RULES['text-px']) ?? []).length
      if (n) found[`${rel} · text-px`] = (found[`${rel} · text-px`] ?? 0) + n
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
