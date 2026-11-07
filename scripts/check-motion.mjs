#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-motion.mjs — `node scripts/check-motion.mjs [path]`
//
// Fails: motion that breaks frata-design-language § UX foundation rules 22–25
// in Console, Admin and the sign-in pages (the shop has its own motion):
//   layout      a transition of width, height, top/left/right/bottom, inset,
//               margin or padding (it reflows the page; animate opacity and
//               transform only), or transition-all (it would include them)
//   arbitrary   duration-[…], ease-[…] or animate-[…] (use the tokens)
//   keyframes   an @keyframes in globals.css that animates anything but
//               opacity, transform, scale, translate or rotate, apart from the
//               named exceptions below
//   too-long    an animation over 400 ms in globals.css, apart from the named
//               exceptions below
// Comment lines are skipped, so this header never trips the gate.
// =============================================================================
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIRS = ['src/app/(console)', 'src/app/(admin)', 'src/app/login', 'src/app/start', 'src/app/choose', 'src/components/shell', 'src/components/data', 'src/components/layout', 'src/components/nav', 'src/components/ui', 'src/app/globals.css']
const MOVING = ['opacity', 'transform', 'scale', 'translate', 'rotate']
/** Keyframes allowed to animate something else, and animations allowed past 400 ms — each with why. */
export const EXCEPTIONS = {
  'value-flash': 'a changed value flashes its background once, 800 ms (Phase 1 motion rule): colour, no layout',
  draw: 'the one brand moment, a check drawn once (rule 26): stroke-dashoffset is paint only',
  'nav-run': 'the progress bar creeping while a move is on its way (1400 ms); it is interrupted when the page lands',
  'undo-window': 'the 8 s Undo window, shown as a shrinking bar (1D, § Work queues 4)',
}
const LAYOUT_PROPS = /\b(?:width|height|max-width|max-height|min-width|min-height|top|left|right|bottom|inset|margin(?:-\w+)?|padding(?:-\w+)?)\b/
const isComment = (l) => { const t = l.trim(); return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*') }

function walk(p, acc = []) {
  if (!existsSync(p)) return acc
  if (!statSync(p).isDirectory()) { if (/\.(tsx?|css)$/.test(p)) acc.push(p); return acc }
  for (const e of readdirSync(p)) walk(join(p, e), acc)
  return acc
}

/** Problems in one file's text, as "rule: what". */
export function check(text, isCss) {
  const problems = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (isComment(line)) continue
    for (const m of line.matchAll(/\btransition-\[([^\]]+)\]/g)) if (LAYOUT_PROPS.test(m[1].replace(/_/g, ' '))) problems.push(`layout: transition-[${m[1]}]`)
    if (/\btransition-all\b/.test(line)) problems.push('layout: transition-all')
    for (const m of line.matchAll(/\b(duration|ease|animate)-\[[^\]]*\]/g)) problems.push(`arbitrary: ${m[0]}`)
    if (isCss) for (const m of line.matchAll(/transition(?:-property)?\s*:\s*([^;]+);/g)) if (LAYOUT_PROPS.test(m[1].replace(/var\([^)]*\)/g, '')) && !/^\s*none\b/.test(m[1])) problems.push(`layout: transition: ${m[1].trim().slice(0, 60)}`)
  }
  if (isCss) {
    const code = lines.filter((l) => !isComment(l)).join('\n')
    for (const m of code.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
      const [, name, body] = m
      if (name in EXCEPTIONS) continue
      for (const prop of new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((d) => d[1]))) if (!MOVING.includes(prop)) problems.push(`keyframes: ${name} animates ${prop}`)
    }
    for (const m of code.matchAll(/animation\s*:\s*([\w-]+)\s+([\d.]+)(ms|s)\b/g)) {
      const ms = Number(m[2]) * (m[3] === 's' ? 1000 : 1)
      if (ms > 400 && !(m[1] in EXCEPTIONS)) problems.push(`too-long: ${m[1]} ${m[2]}${m[3]} (nothing over 400 ms)`)
    }
  }
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2]
  if (target && !existsSync(target)) { console.error(`check:motion — no such path: ${target}`); process.exit(2) }
  const files = (target ? [target] : DIRS).flatMap((d) => walk(d))
  const problems = files.flatMap((f) => check(readFileSync(f, 'utf8'), f.endsWith('.css')).map((p) => `${relative('.', f)}  ${p}`))
  if (problems.length) { console.error(`check:motion — frata-design-language § UX foundation 22–25:\n  ${problems.join('\n  ')}`); process.exit(1) }
  console.log(`check:motion — clean (${files.length} files)`)
}
